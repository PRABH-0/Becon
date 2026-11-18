import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { UserMenu } from "@/components/UserMenu";
import { HeaderActions } from "@/components/HeaderActions";
import { resolveUserIdentity } from "@/lib/identity";

vi.mock("next/link", () => ({
  default: ({
    href,
    children,
    ...props
  }: {
    href: string;
    children: React.ReactNode;
    [key: string]: unknown;
  }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

vi.mock("@/context/ThemeContext", () => ({
  useTheme: () => ({
    theme: "light",
    isDarkMode: false,
    toggleTheme: vi.fn(),
  }),
}));

describe("UserMenu (Task 1.10)", () => {
  const signedInIdentity = resolveUserIdentity({
    me: {
      id: 1,
      email: "ada.lovelace@example.com",
      name: "Ada Lovelace",
      picture_url: "https://lh3.googleusercontent.com/a/ada-photo",
      is_anonymous: false,
      profession: null,
      timezone: "UTC",
      delivery_time: "07:00",
      email_digest_enabled: true,
      has_completed_setup: true,
    },
    user: {
      email: "ada.lovelace@example.com",
      is_anonymous: false,
      user_metadata: {
        full_name: "Ada Lovelace",
        avatar_url: "https://lh3.googleusercontent.com/a/ada-photo",
      },
    },
  });

  const guestIdentity = resolveUserIdentity({
    isAnonymous: true,
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("opens and closes on trigger click with proper ARIA attributes", () => {
    const onSignOut = vi.fn();
    render(
      <UserMenu
        identity={signedInIdentity}
        email="ada.lovelace@example.com"
        currentPage="home"
        onSignOut={onSignOut}
      />
    );

    const trigger = screen.getByRole("button", { name: /Profile Menu/i });
    expect(trigger).toHaveAttribute("aria-haspopup", "menu");
    expect(trigger).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("menu")).toBeNull();

    // Open
    fireEvent.click(trigger);
    expect(trigger).toHaveAttribute("aria-expanded", "true");
    const menu = screen.getByRole("menu");
    expect(menu).toBeInTheDocument();
    expect(trigger).toHaveAttribute("aria-controls", menu.id);

    const menuItems = screen.getAllByRole("menuitem");
    expect(menuItems.length).toBeGreaterThanOrEqual(3);

    // Close on second click
    fireEvent.click(trigger);
    expect(trigger).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("menu")).toBeNull();
  });

  it("closes on Escape and returns focus to the trigger button", () => {
    const onSignOut = vi.fn();
    render(
      <UserMenu
        identity={signedInIdentity}
        email="ada.lovelace@example.com"
        currentPage="home"
        onSignOut={onSignOut}
      />
    );

    const trigger = screen.getByRole("button", { name: /Profile Menu/i });
    fireEvent.click(trigger);
    const menu = screen.getByRole("menu");
    const items = screen.getAllByRole("menuitem");
    items[0].focus();
    expect(document.activeElement).toBe(items[0]);

    fireEvent.keyDown(menu, { key: "Escape" });

    expect(screen.queryByRole("menu")).toBeNull();
    expect(trigger).toHaveAttribute("aria-expanded", "false");
    expect(document.activeElement).toBe(trigger);
  });

  it("supports arrow-key navigation between menuitems and closes on Tab", () => {
    const onSignOut = vi.fn();
    render(
      <UserMenu
        identity={signedInIdentity}
        email="ada.lovelace@example.com"
        currentPage="home"
        onSignOut={onSignOut}
      />
    );

    const trigger = screen.getByRole("button", { name: /Profile Menu/i });
    fireEvent.click(trigger);
    const menu = screen.getByRole("menu");
    const items = screen.getAllByRole("menuitem");

    fireEvent.keyDown(menu, { key: "ArrowDown" });
    expect(document.activeElement).toBe(items[0]);

    fireEvent.keyDown(menu, { key: "ArrowDown" });
    expect(document.activeElement).toBe(items[1]);

    fireEvent.keyDown(menu, { key: "ArrowUp" });
    expect(document.activeElement).toBe(items[0]);

    fireEvent.keyDown(menu, { key: "End" });
    expect(document.activeElement).toBe(items[items.length - 1]);

    fireEvent.keyDown(menu, { key: "Home" });
    expect(document.activeElement).toBe(items[0]);

    fireEvent.keyDown(menu, { key: "Tab" });
    expect(screen.queryByRole("menu")).toBeNull();
  });

  it("closes on click-outside (mousedown outside container)", () => {
    const onSignOut = vi.fn();
    render(
      <div>
        <div data-testid="outside-area">Outside</div>
        <UserMenu
          identity={signedInIdentity}
          email="ada.lovelace@example.com"
          currentPage="home"
          onSignOut={onSignOut}
        />
      </div>
    );

    const trigger = screen.getByRole("button", { name: /Profile Menu/i });
    fireEvent.click(trigger);
    expect(screen.getByRole("menu")).toBeInTheDocument();

    fireEvent.mouseDown(screen.getByTestId("outside-area"));
    expect(screen.queryByRole("menu")).toBeNull();
    expect(trigger).toHaveAttribute("aria-expanded", "false");
  });

  it("calls the existing sign-out handler when Sign out is clicked", () => {
    const onSignOut = vi.fn();
    render(
      <UserMenu
        identity={signedInIdentity}
        email="ada.lovelace@example.com"
        currentPage="home"
        onSignOut={onSignOut}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: /Profile Menu/i }));
    const signOutItem = screen.getByRole("menuitem", { name: /Sign out/i });
    fireEvent.click(signOutItem);

    expect(onSignOut).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("menu")).toBeNull();
  });

  it("renders guest variant with Guest trigger, Create account -> /register?upgrade=1 instead of email row, and Sign out", () => {
    const onSignOut = vi.fn();
    render(
      <UserMenu
        identity={guestIdentity}
        email="should-not-appear@example.com"
        currentPage="home"
        onSignOut={onSignOut}
      />
    );

    const trigger = screen.getByRole("button", { name: /Profile Menu/i });
    expect(trigger).toHaveTextContent("Guest");
    expect(trigger.querySelector("img")).toBeNull();

    fireEvent.click(trigger);
    const createAccount = screen.getByRole("menuitem", { name: /Create account/i });
    expect(createAccount).toHaveAttribute("href", "/register?upgrade=1");
    expect(screen.queryByText("should-not-appear@example.com")).toBeNull();
    expect(screen.getByRole("menuitem", { name: /Sign out/i })).toBeInTheDocument();
  });

  it("truncates long email with min-w-0 truncate and exposes full email via title attribute inside max-w-[280px] menu", () => {
    const longEmail = "very.long.enterprise.executive.email.address@global-subsidiary.example.com";
    render(
      <UserMenu
        identity={signedInIdentity}
        email={longEmail}
        currentPage="profile"
        onSignOut={vi.fn()}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: /Profile Menu/i }));

    const menu = screen.getByRole("menu");
    expect(menu.className).toContain("max-w-[280px]");

    const emailEl = screen.getByText(longEmail);
    expect(emailEl.className).toContain("truncate");
    expect(emailEl.className).toContain("min-w-0");
    expect(emailEl).toHaveAttribute("title", longEmail);

    // Active currentPage marking
    const profileLink = screen.getByRole("menuitem", { name: /Profile & Settings/i });
    expect(profileLink).toHaveAttribute("aria-current", "page");
  });

  it("renders real name and https photo from resolveUserIdentity in trigger and menu", () => {
    render(
      <UserMenu
        identity={signedInIdentity}
        email="ada.lovelace@example.com"
        currentPage="home"
        onSignOut={vi.fn()}
      />
    );

    const trigger = screen.getByRole("button", { name: /Profile Menu/i });
    expect(trigger).toHaveTextContent("Ada");
    const triggerImg = trigger.querySelector("img");
    expect(triggerImg).not.toBeNull();
    expect(triggerImg?.getAttribute("src")).toBe("https://lh3.googleusercontent.com/a/ada-photo");

    fireEvent.click(trigger);
    expect(screen.getByText("Ada Lovelace")).toBeInTheDocument();
    expect(screen.getByText("ada.lovelace@example.com")).toBeInTheDocument();
  });
});

describe("HeaderActions (Task 1.10)", () => {
  const identity = resolveUserIdentity({
    me: {
      id: 2,
      email: "grace@example.com",
      name: "Grace Hopper",
      picture_url: "https://lh3.googleusercontent.com/a/grace",
      is_anonymous: false,
      profession: null,
      timezone: "UTC",
      delivery_time: "07:00",
      email_digest_enabled: true,
      has_completed_setup: true,
    },
  });

  it("renders shared [backLink] [ThemeToggle] [UserMenu] cluster with aria-label on mobile back link", () => {
    render(
      <HeaderActions
        backLink={{
          href: "/",
          label: "Gazette",
          ariaLabel: "Return to Daily Gazette",
        }}
        identity={identity}
        email="grace@example.com"
        currentPage="profile"
        onSignOut={vi.fn()}
      />
    );

    const backLink = screen.getByRole("link", { name: "Return to Daily Gazette" });
    expect(backLink).toHaveAttribute("href", "/");
    expect(backLink).toHaveAttribute("aria-label", "Return to Daily Gazette");
    expect(backLink.className).toContain("h-9");

    // Text label hidden on mobile (< sm) so arrow icon remains accessible via aria-label
    const labelSpan = screen.getByText("Gazette");
    expect(labelSpan.className).toContain("hidden");
    expect(labelSpan.className).toContain("sm:inline");

    // ThemeToggle & UserMenu both present with h-9 alignment
    expect(screen.getByRole("switch")).toBeInTheDocument();
    const profileBtn = screen.getByRole("button", { name: /Profile Menu/i });
    expect(profileBtn.className).toContain("h-9");
    expect(profileBtn).toHaveTextContent("Grace");
    expect(profileBtn.querySelector("img")?.getAttribute("src")).toBe(
      "https://lh3.googleusercontent.com/a/grace"
    );
  });
});

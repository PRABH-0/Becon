import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import Home from "@/app/page";
import { ThemeProvider } from "@/context/ThemeContext";
import * as apiModule from "@/lib/api";

const stableLoader = { showLoader: vi.fn(), hideLoader: vi.fn() };
const stableRouter = { push: vi.fn(), replace: vi.fn() };

const mockAuthState = {
  isAnonymous: false,
  signOut: vi.fn(),
  user: {
    id: "sub-theme-test",
    email: "ada@example.com",
    is_anonymous: false,
    user_metadata: {
      full_name: "Ada Lovelace",
    },
  },
  me: {
    id: 1,
    email: "ada@example.com",
    name: "Ada Lovelace",
    picture_url: null,
    is_anonymous: false,
    profession: null,
    timezone: "UTC",
    delivery_time: "07:00",
    email_digest_enabled: true,
    has_completed_setup: true,
  },
};

vi.mock("@/context/AuthContext", () => ({
  useAuth: () => mockAuthState,
}));

vi.mock("@/context/LoadingContext", () => ({
  useLoader: () => stableLoader,
}));

vi.mock("next/navigation", () => ({
  useRouter: () => stableRouter,
}));

vi.mock("@/components/RequireAuth", () => ({
  RequireAuth: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock("@/components/GuestBanner", () => ({
  GuestBanner: () => null,
}));

describe("Home (/) single header ThemeToggle & coverage ribbon layout (Task 1.10b)", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
    document.documentElement.classList.remove("dark");

    Object.defineProperty(window, "matchMedia", {
      writable: true,
      value: vi.fn().mockImplementation((query: string) => ({
        matches: false,
        media: query,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })),
    });

    vi.spyOn(apiModule, "apiFetch").mockImplementation(async (path: string) => {
      if (path === "/api/profile") {
        return {
          name: "Ada Lovelace",
          email: "ada@example.com",
          role: "Engineer",
          interests: "Python, Rust",
          picture_url: null,
        };
      }
      return [];
    });
  });

  it("renders exactly one theme switch on / and places it inside the top header", async () => {
    const { container } = render(
      <ThemeProvider>
        <Home />
      </ThemeProvider>
    );

    const switches = await screen.findAllByRole("switch");
    expect(switches).toHaveLength(1);

    const header = container.querySelector("header");
    expect(header).not.toBeNull();
    expect(header!.contains(switches[0])).toBe(true);

    // Coverage ribbon keeps right-aligned Prev/Next buttons grouped outside <header>
    const prevBtn = screen.getByRole("button", { name: "Previous topics" });
    const nextBtn = screen.getByRole("button", { name: "Next topics" });
    expect(header!.contains(prevBtn)).toBe(false);
    expect(header!.contains(nextBtn)).toBe(false);
    expect(prevBtn.parentElement).toBe(nextBtn.parentElement);
    expect(prevBtn.parentElement?.className).toContain("shrink-0");
  });

  it("flips dark/light mode and persists becon_theme in localStorage when toggled in the header", async () => {
    render(
      <ThemeProvider>
        <Home />
      </ThemeProvider>
    );

    const themeSwitch = await screen.findByRole("switch");
    expect(themeSwitch).toHaveAttribute("aria-checked", "false");
    expect(document.documentElement.classList.contains("dark")).toBe(false);

    // Toggle to dark
    fireEvent.click(themeSwitch);
    expect(themeSwitch).toHaveAttribute("aria-checked", "true");
    expect(document.documentElement.classList.contains("dark")).toBe(true);
    expect(localStorage.getItem("becon_theme")).toBe("dark");

    // Toggle back to light
    fireEvent.click(themeSwitch);
    expect(themeSwitch).toHaveAttribute("aria-checked", "false");
    expect(document.documentElement.classList.contains("dark")).toBe(false);
    expect(localStorage.getItem("becon_theme")).toBe("light");
  });
});

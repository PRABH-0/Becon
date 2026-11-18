import React from "react";
import { describe, it, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { UserAvatar, UserChip } from "@/components/UserAvatar";
import { resolveUserIdentity, sanitizeHttpsUrl } from "@/lib/identity";

describe("UserAvatar, UserChip & identity resolver (Task 1.9)", () => {
  it("renders https photo with referrerPolicy='no-referrer' and shows name + subtitle for Google user", () => {
    const identity = resolveUserIdentity({
      user: {
        email: "ada@gmail.com",
        is_anonymous: false,
        user_metadata: {
          full_name: "Ada Lovelace",
          avatar_url: "https://lh3.googleusercontent.com/a/ada",
        },
      },
    });

    expect(identity.displayName).toBe("Ada Lovelace");
    expect(identity.subtitle).toBe("ada@gmail.com");
    expect(identity.avatarUrl).toBe("https://lh3.googleusercontent.com/a/ada");

    render(
      <UserChip
        name={identity.displayName}
        subtitle={identity.subtitle}
        avatarUrl={identity.avatarUrl}
        isGuest={identity.isGuest}
      />
    );

    const img = screen.getByRole("img", { name: "Ada Lovelace" }) as HTMLImageElement;
    expect(img).toBeInTheDocument();
    expect(img.getAttribute("src")).toBe("https://lh3.googleusercontent.com/a/ada");
    expect(img.getAttribute("referrerpolicy")).toBe("no-referrer");
    expect(screen.getByText("Ada Lovelace")).toBeInTheDocument();
    expect(screen.getByText("ada@gmail.com")).toBeInTheDocument();
  });

  it("falls back to initial via React state on image error without DOM mutation", () => {
    render(<UserAvatar src="https://lh3.googleusercontent.com/broken" name="Grace Hopper" />);

    const img = screen.getByRole("img", { name: "Grace Hopper" });
    fireEvent.error(img);

    expect(screen.queryByRole("img")).toBeNull();
    expect(screen.getByText("G")).toBeInTheDocument();
  });

  it("rejects non-https avatar URLs (http, javascript, data) and falls back to initial", () => {
    expect(sanitizeHttpsUrl("http://insecure.example.com/a.png")).toBeNull();
    expect(sanitizeHttpsUrl("javascript:alert(1)")).toBeNull();
    expect(sanitizeHttpsUrl("data:image/png;base64,abc")).toBeNull();
    expect(sanitizeHttpsUrl("https://lh3.googleusercontent.com/ok")).toBe(
      "https://lh3.googleusercontent.com/ok"
    );

    render(<UserAvatar src="http://insecure.example.com/a.png" name="Linus Torvalds" />);
    expect(screen.queryByRole("img")).toBeNull();
    expect(screen.getByText("L")).toBeInTheDocument();
  });

  it("renders Guest Reader, Exploring as guest, and generic icon (no image) for guests", () => {
    const identity = resolveUserIdentity({
      isAnonymous: true,
      user: {
        email: "",
        is_anonymous: true,
        user_metadata: {
          full_name: "Ignored Guest",
          avatar_url: "https://lh3.googleusercontent.com/should-not-render",
        },
      },
    });

    expect(identity.displayName).toBe("Guest Reader");
    expect(identity.subtitle).toBe("Exploring as guest");
    expect(identity.avatarUrl).toBeNull();

    render(
      <UserChip
        name={identity.displayName}
        subtitle={identity.subtitle}
        avatarUrl={identity.avatarUrl}
        isGuest={identity.isGuest}
        showGuestBadge
      />
    );

    expect(screen.queryByRole("img")).toBeNull();
    expect(screen.getByText("Guest Reader")).toBeInTheDocument();
    expect(screen.getByText("Exploring as guest")).toBeInTheDocument();
  });

  it("prefers saved profile name and profession over Supabase metadata", () => {
    const identity = resolveUserIdentity({
      profile: {
        name: "Custom Saved Name",
        role: "Staff Backend Engineer",
        email: "saved@company.com",
      },
      user: {
        email: "google@gmail.com",
        is_anonymous: false,
        user_metadata: {
          full_name: "Google Name",
          avatar_url: "https://lh3.googleusercontent.com/a/photo",
        },
      },
    });

    expect(identity.displayName).toBe("Custom Saved Name");
    expect(identity.subtitle).toBe("Staff Backend Engineer");
    expect(identity.avatarUrl).toBe("https://lh3.googleusercontent.com/a/photo");
  });
});

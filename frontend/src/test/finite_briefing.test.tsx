import { describe, it, expect, vi, beforeEach } from "vitest";
import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import Home, { BRIEFING_MAX_CARDS } from "@/app/page";
import * as apiModule from "@/lib/api";

vi.mock("@/context/AuthContext", () => ({
  useAuth: () => ({
    user: { id: "test-user-123", email: "test@becon.dev" },
    me: { id: "test-user-123", email: "test@becon.dev", role: "Software Engineer", interests: ["TypeScript", "PostgreSQL"] },
    isAnonymous: false,
    signOut: vi.fn(),
  }),
}));

vi.mock("@/context/ThemeContext", () => ({
  useTheme: () => ({
    isDarkMode: false,
    toggleTheme: vi.fn(),
  }),
}));

vi.mock("@/context/LoadingContext", () => ({
  useLoader: () => ({
    showLoader: vi.fn(),
    hideLoader: vi.fn(),
  }),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: vi.fn(),
  }),
}));

vi.mock("@/components/RequireAuth", () => ({
  RequireAuth: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock("@/components/GuestBanner", () => ({
  GuestBanner: () => null,
}));

describe("Finite Briefing & End State (Decision D12)", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
  });

  it("exports BRIEFING_MAX_CARDS capped at 10", () => {
    expect(BRIEFING_MAX_CARDS).toBe(10);
  });

  it("renders 'You're all caught up for today' end panel with reading stats", async () => {
    const mockBriefings = Array.from({ length: 10 }, (_, i) => ({
      id: `card-${i + 1}`,
      rank: i + 1,
      title: `Update Number ${i + 1} For Engineering Lead`,
      source_url: `https://example.com/update-${i + 1}`,
      target_role: "Staff Engineer",
      target_stack: ["#TypeScript"],
      priority: i === 0 ? ("lead" as const) : i < 5 ? ("brief" as const) : ("major" as const),
      card_content: {
        what_happened: ["Critical architecture modernization milestone."],
        why_it_matters: "Lowers operational overhead across all cluster worker nodes.",
        how_it_affects_you: "Requires zero downtime deployment verification.",
        what_to_do_next: {
          action_type: "apply" as const,
          guidance: "Deploy updated staging configurations.",
        },
      },
    }));

    vi.spyOn(apiModule, "apiFetch").mockImplementation(async (path: string) => {
      if (path.includes("scope=top")) {
        return mockBriefings.slice(0, 5);
      }
      if (path.includes("scope=remaining")) {
        return mockBriefings.slice(5, 10);
      }
      return [];
    });

    render(<Home />);

    // Wait for the end-of-briefing panel to render
    const endPanel = await screen.findByTestId("all-caught-up-panel");
    expect(endPanel).toBeInTheDocument();

    // Verify calm end-state message
    expect(screen.getByText(/You're all caught up for today/i)).toBeInTheDocument();
    expect(screen.getByText(/Next daily edition arrives tomorrow/i)).toBeInTheDocument();

    // Verify reading stats pill
    expect(screen.getByText(/updates completed/i)).toBeInTheDocument();
    expect(screen.getAllByText(/~[0-9]+ min read/i).length).toBeGreaterThan(0);

    // Verify link to adjust preferences
    const profileLink = screen.getByRole("link", { name: /Adjust your topics & preferences/i });
    expect(profileLink).toHaveAttribute("href", "/profile");

    // Verify NO infinite scroll pull prompt or load more button exists
    expect(screen.queryByText(/Scroll Down Or Click To Load More Updates/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/DISPATCHING NEXT GAZETTE EDITION/i)).not.toBeInTheDocument();
  });

  it("does not attach wheel or touchmove listeners to trigger infinite scroll", async () => {
    const addEventListenerSpy = vi.spyOn(window, "addEventListener");

    render(<Home />);

    await waitFor(() => {
      // Confirm window has NO 'wheel', 'touchstart', or 'touchmove' event listeners registered
      const registeredEvents = addEventListenerSpy.mock.calls.map((call) => call[0]);
      expect(registeredEvents).not.toContain("wheel");
      expect(registeredEvents).not.toContain("touchstart");
      expect(registeredEvents).not.toContain("touchmove");
    });
  });
});

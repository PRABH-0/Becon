import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import Home from "@/app/page";
import * as apiModule from "@/lib/api";

const mockRouterPush = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: mockRouterPush,
    replace: vi.fn(),
  }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => "/",
}));

vi.mock("@/context/AuthContext", () => ({
  useAuth: () => ({
    user: { id: "test-user-1", email: "developer@example.com" },
    me: {
      id: 1,
      email: "developer@example.com",
      role: "Software Developer",
      interests: ["TypeScript"],
      has_completed_setup: true,
    },
    isAnonymous: false,
    signOut: vi.fn(),
    session: { access_token: "mock-token" },
    isLoading: false,
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

vi.mock("@/components/RequireAuth", () => ({
  RequireAuth: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock("@/components/GuestBanner", () => ({
  GuestBanner: () => null,
}));

const sampleCard1 = {
  id: "card-1",
  rank: 1,
  title: "Critical Security Patch Released",
  source_url: "https://example.com/story-1",
  target_role: "Software Developer",
  target_stack: ["#TypeScript"],
  priority: "lead" as const,
  card_content: {
    what_happened: ["Critical vulnerability patched."],
    why_it_matters: "Prevents remote execution.",
    how_it_affects_you: "Requires updating dependencies.",
    what_to_do_next: {
      action_type: "apply" as const,
      guidance: "Run npm update.",
    },
  },
};

const sampleCard2 = {
  id: "card-2",
  rank: 2,
  title: "Secondary Framework Update",
  source_url: "https://example.com/story-2",
  target_role: "Software Developer",
  target_stack: ["#TypeScript"],
  priority: "brief" as const,
  card_content: {
    what_happened: ["Performance improvements released."],
    why_it_matters: "Lowers memory footprint.",
    how_it_affects_you: "Faster build times.",
    what_to_do_next: {
      action_type: "learn" as const,
      guidance: "Review release notes.",
    },
  },
};

const sampleCard3 = {
  id: "card-3",
  rank: 3,
  title: "Third Framework Advisory",
  source_url: "https://example.com/story-3",
  target_role: "Software Developer",
  target_stack: ["#TypeScript"],
  priority: "brief" as const,
  card_content: {
    what_happened: ["API deprecation scheduled."],
    why_it_matters: "Requires migration before v3.",
    how_it_affects_you: "Inspect deprecated endpoints.",
    what_to_do_next: {
      action_type: "prepare" as const,
      guidance: "Prepare migration branch.",
    },
  },
};

describe("Gazette Briefing Loading States & Robustness", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
    mockRouterPush.mockReset();
  });

  it("loading: renders skeleton and header does NOT say '0 UPDATES'", async () => {
    // Hang the /api/briefings request to verify in-flight loading state
    vi.spyOn(apiModule, "apiFetch").mockImplementation((path: string) => {
      if (path === "/api/profile") {
        return Promise.resolve({ name: "Dev User", role: "Developer", interests: "TypeScript" });
      }
      if (path.startsWith("/api/briefings")) {
        return new Promise(() => {}); // never resolves to keep in loading state
      }
      return Promise.resolve([]);
    });

    render(<Home />);

    // In-flight skeleton should be rendered
    expect(screen.getByText(/Synthesizing Lead Intelligence/i)).toBeInTheDocument();

    // Header must NOT say "0 updates" while loading
    expect(screen.queryByText(/0 updates/i)).toBeNull();
    expect(screen.getByText(/SYNTHESIZING DISPATCH\.\.\./i)).toBeInTheDocument();
  });

  it("success: renders briefing cards and header shows correct update count", async () => {
    vi.spyOn(apiModule, "apiFetch").mockImplementation(async (path: string) => {
      if (path === "/api/profile") {
        return { name: "Dev User", role: "Developer", interests: "TypeScript" };
      }
      if (path.startsWith("/api/briefings")) {
        return [sampleCard1, sampleCard2, sampleCard3];
      }
      return [];
    });

    render(<Home />);

    await waitFor(() => {
      expect(screen.getByText("Critical Security Patch Released")).toBeInTheDocument();
      expect(screen.getByText("Secondary Framework Update")).toBeInTheDocument();
    });

    // Skeletons must NOT be rendered
    expect(screen.queryByText(/Synthesizing Lead Intelligence/i)).toBeNull();

    // Header shows real update count
    expect(screen.getAllByText(/3 updates/i).length).toBeGreaterThanOrEqual(1);
  });

  it("empty (0 cards): renders calm empty state, not a skeleton", async () => {
    vi.spyOn(apiModule, "apiFetch").mockImplementation(async (path: string) => {
      if (path === "/api/profile") {
        return { name: "Dev User", role: "Developer", interests: "TypeScript" };
      }
      if (path.startsWith("/api/briefings")) {
        return []; // 0 cards returned (both personalized and cold-start fallback)
      }
      return [];
    });

    render(<Home />);

    await waitFor(() => {
      expect(screen.getByTestId("empty-briefing-state")).toBeInTheDocument();
      expect(screen.getByText("No updates in your stack yet")).toBeInTheDocument();
    });

    // Must never show skeletons once loading resolves
    expect(screen.queryByText(/Synthesizing Lead Intelligence/i)).toBeNull();
  });

  it("fewer than 3 cards: renders calm 'limited today' state with banner and cards, not a skeleton", async () => {
    vi.spyOn(apiModule, "apiFetch").mockImplementation(async (path: string) => {
      if (path === "/api/profile") {
        return { name: "Dev User", role: "Developer", interests: "TypeScript" };
      }
      if (path.startsWith("/api/briefings")) {
        return [sampleCard1, sampleCard2]; // 2 cards returned (< 3 cards)
      }
      return [];
    });

    render(<Home />);

    await waitFor(() => {
      expect(screen.getByTestId("limited-briefing-banner")).toBeInTheDocument();
      expect(screen.getByText(/Today's intelligence dispatch is lighter than usual/i)).toBeInTheDocument();
      expect(screen.getByText("Critical Security Patch Released")).toBeInTheDocument();
    });

    // Must NOT stay on skeletons
    expect(screen.queryByText(/Synthesizing Lead Intelligence/i)).toBeNull();
  });

  it("error: renders error card with Retry button on API failure", async () => {
    vi.spyOn(apiModule, "apiFetch").mockImplementation(async (path: string) => {
      if (path === "/api/profile") {
        return { name: "Dev User", role: "Developer", interests: "TypeScript" };
      }
      if (path.startsWith("/api/briefings")) {
        throw new Error("Internal Server Error (500)");
      }
      return [];
    });

    render(<Home />);

    await waitFor(() => {
      expect(screen.getByTestId("briefing-error-state")).toBeInTheDocument();
      expect(screen.getByText(/Unable to load today's Gazette/i)).toBeInTheDocument();
      expect(screen.getByText(/Internal Server Error \(500\)/i)).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /Try Again/i })).toBeInTheDocument();
    });

    // Skeletons are hidden on error
    expect(screen.queryByText(/Synthesizing Lead Intelligence/i)).toBeNull();
  });

  it("timeout: renders error card when request times out with Retry button", async () => {
    vi.spyOn(apiModule, "apiFetch").mockImplementation(async (path: string) => {
      if (path === "/api/profile") {
        return { name: "Dev User", role: "Developer", interests: "TypeScript" };
      }
      if (path.startsWith("/api/briefings")) {
        throw new Error("Request timed out after 15000ms");
      }
      return [];
    });

    render(<Home />);

    await waitFor(() => {
      expect(screen.getByTestId("briefing-error-state")).toBeInTheDocument();
      expect(screen.getByText(/Request timed out after 15000ms/i)).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /Try Again/i })).toBeInTheDocument();
    });

    // Clicking Retry attempts fetch again
    const fetchSpy = vi.spyOn(apiModule, "apiFetch");
    const retryBtn = screen.getByRole("button", { name: /Try Again/i });
    fireEvent.click(retryBtn);

    expect(fetchSpy).toHaveBeenCalled();
  });
});

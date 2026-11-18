import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import Home from "@/app/page";
import ProfilePage from "@/app/profile/page";
import * as apiModule from "@/lib/api";

const mockSignOut = vi.fn();
const mockToggleTheme = vi.fn();
const mockShowLoader = vi.fn();
const mockHideLoader = vi.fn();
const mockPush = vi.fn();
const mockReplace = vi.fn();

const stableAuthValue = {
  user: { id: "test-user-search", email: "search@becon.dev" },
  me: { id: 1, email: "search@becon.dev", name: "Search Tester", is_anonymous: false },
  isAnonymous: false,
  signOut: mockSignOut,
};

const stableThemeValue = {
  isDarkMode: false,
  toggleTheme: mockToggleTheme,
};

const stableLoaderValue = {
  showLoader: mockShowLoader,
  hideLoader: mockHideLoader,
};

const stableRouterValue = {
  push: mockPush,
  replace: mockReplace,
};

vi.mock("@/context/AuthContext", () => ({
  useAuth: () => stableAuthValue,
}));

vi.mock("@/context/ThemeContext", () => ({
  useTheme: () => stableThemeValue,
}));

vi.mock("@/context/LoadingContext", () => ({
  useLoader: () => stableLoaderValue,
}));

vi.mock("next/navigation", () => ({
  useRouter: () => stableRouterValue,
}));

vi.mock("@/components/RequireAuth", () => ({
  RequireAuth: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock("@/components/GuestBanner", () => ({
  GuestBanner: () => null,
}));

vi.mock("@/lib/supabaseClient", () => ({
  supabase: {
    auth: {
      signOut: vi.fn().mockResolvedValue({}),
      getSession: vi.fn().mockResolvedValue({ data: { session: null }, error: null }),
    },
  },
}));

describe("Frontend search callers (Task 1.7 contract)", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
  });

  it("Home search calls /api/briefings/search with q, limit, offset and renders returned cards", async () => {
    const mockSearchCard = {
      id: "search-card-1",
      rank: 1,
      title: "Kubernetes 1.32 Gateway API Stabilization",
      source_url: "https://kubernetes.io/blog/test",
      target_role: "Software Engineer",
      target_stack: ["Kubernetes"],
      priority: "major" as const,
      card_content: {
        what_happened: ["Gateway API v1.2 graduated to GA."],
        why_it_matters: "Standardizes ingress routing across clusters.",
        how_it_affects_you: "Enables migrating off legacy Ingress annotations.",
        what_to_do_next: {
          action_type: "apply" as const,
          guidance: "Adopt HTTPRoute specs in staging.",
        },
      },
    };

    const apiSpy = vi.spyOn(apiModule, "apiFetch").mockImplementation(async (path: string) => {
      if (path.startsWith("/api/profile")) {
        return { name: "Search Tester", role: "Software Engineer", interests: "Kubernetes" };
      }
      if (path.startsWith("/api/briefings/search")) {
        return { query: "Kubernetes", matches: ["Kubernetes"], cards: [mockSearchCard] };
      }
      if (path.startsWith("/api/briefings")) {
        return [];
      }
      return [];
    });

    render(<Home />);

    const searchInput = await screen.findByPlaceholderText(/Search topic/i);
    fireEvent.change(searchInput, { target: { value: "Kubernetes" } });
    fireEvent.submit(searchInput.closest("form")!);

    await waitFor(() => {
      const searchCalls = apiSpy.mock.calls.filter(([p]) => String(p).startsWith("/api/briefings/search"));
      expect(searchCalls.length).toBeGreaterThanOrEqual(1);
      expect(String(searchCalls[0][0])).toContain("q=Kubernetes");
      expect(String(searchCalls[0][0])).toContain("limit=10");
      expect(String(searchCalls[0][0])).toContain("offset=0");
    });

    expect(await screen.findByText(/Kubernetes 1\.32 Gateway API Stabilization/i)).toBeInTheDocument();
  });

  it("ProfilePage topic autocomplete calls /api/topics/search via apiFetch and shows matches", async () => {
    const apiSpy = vi.spyOn(apiModule, "apiFetch").mockImplementation(async (path: string) => {
      if (path.startsWith("/api/profile")) {
        return {
          name: "Search Tester",
          role: "Software Engineer",
          email: "search@becon.dev",
          experience: "Senior (5+ Years)",
          interests: "Python",
          customPrompt: "",
          aiTone: "Practical & Actionable",
        };
      }
      if (path.startsWith("/api/topics/search")) {
        return { query: "k8s", matches: ["Kubernetes"] };
      }
      return {};
    });

    render(<ProfilePage />);

    const topicInput = await screen.findByPlaceholderText(/Type to search or complete topics/i);
    fireEvent.change(topicInput, { target: { value: "k8s" } });

    await waitFor(
      () => {
        const topicCalls = apiSpy.mock.calls.filter(([p]) => String(p).startsWith("/api/topics/search"));
        expect(topicCalls.length).toBeGreaterThanOrEqual(1);
        expect(String(topicCalls[0][0])).toContain("q=k8s");
      },
      { timeout: 1500 }
    );

    expect(await screen.findByText("Kubernetes")).toBeInTheDocument();
  });
});

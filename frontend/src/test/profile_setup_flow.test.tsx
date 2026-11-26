import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import Home from "@/app/page";
import ProfilePage from "@/app/profile/page";
import * as apiModule from "@/lib/api";

const mockRouterPush = vi.fn();
const mockRouterReplace = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: mockRouterPush,
    replace: mockRouterReplace,
  }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => "/",
}));

const mockRefreshMe = vi.fn().mockResolvedValue({
  id: 1,
  email: "developer@example.com",
  name: "Prabhjot Singh",
  has_completed_setup: true,
  role: "Software Developer",
  interests: "Python, Next.js",
});

const mockAuthState: {
  isAnonymous: boolean;
  signOut: ReturnType<typeof vi.fn>;
  user: { id: string; email: string; is_anonymous: boolean } | null;
  me: apiModule.UserMe | null;
  session: { access_token: string } | null;
  isLoading: boolean;
  refreshMe: ReturnType<typeof vi.fn>;
} = {
  isAnonymous: false,
  signOut: vi.fn(),
  user: { id: "user-1", email: "developer@example.com", is_anonymous: false },
  me: null,
  session: { access_token: "mock-token" },
  isLoading: false,
  refreshMe: mockRefreshMe,
};

vi.mock("@/context/AuthContext", () => ({
  useAuth: () => mockAuthState,
}));

const stableLoader = { showLoader: vi.fn(), hideLoader: vi.fn() };
vi.mock("@/context/LoadingContext", () => ({
  useLoader: () => stableLoader,
}));

vi.mock("@/context/ThemeContext", () => ({
  useTheme: () => ({ isDarkMode: false, toggleTheme: vi.fn() }),
}));

vi.mock("@/components/RequireAuth", () => ({
  RequireAuth: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock("@/components/GuestBanner", () => ({
  GuestBanner: () => null,
}));

const sampleBriefingCards = [
  {
    id: "card-1",
    rank: 1,
    title: "Cold-Start Gazette Lead Story: Open Source Release",
    source_url: "https://example.com/story-1",
    target_role: "Software Developer",
    target_stack: ["#Python"],
    priority: "lead" as const,
    card_content: {
      what_happened: ["Major open-source breakthrough announced."],
      why_it_matters: "Accelerates daily development pipelines.",
      how_it_affects_you: "Streamlines code reviews.",
      what_to_do_next: {
        action_type: "apply" as const,
        guidance: "Review release documentation.",
      },
    },
  },
];

describe("Profile Setup & Gazette Navigation Flow", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    mockRouterPush.mockReset();
    mockRouterReplace.mockReset();
    mockRefreshMe.mockReset();
    localStorage.clear();

    mockAuthState.user = { id: "user-1", email: "developer@example.com", is_anonymous: false };
    mockAuthState.session = { access_token: "mock-token" };
    mockAuthState.isLoading = false;
    mockAuthState.isAnonymous = false;
    mockAuthState.refreshMe = mockRefreshMe;
  });

  it("incomplete profile: shows cold-start default briefing on '/' without bouncing to /profile?setup=true", async () => {
    // User has incomplete setup in me
    mockAuthState.me = {
      id: 1,
      email: "developer@example.com",
      name: "Prabhjot Singh",
      picture_url: null,
      is_anonymous: false,
      profession: null,
      timezone: "UTC",
      delivery_time: "07:00",
      email_digest_enabled: true,
      has_completed_setup: false,
    };

    // Backend returns empty profile (no role, no interests)
    vi.spyOn(apiModule, "apiFetch").mockImplementation(async (path: string) => {
      if (path === "/api/profile") {
        return { name: "Prabhjot Singh", role: "", interests: "" };
      }
      if (path.startsWith("/api/briefings")) {
        return sampleBriefingCards;
      }
      return [];
    });

    render(<Home />);

    // Gazette should render cold-start cards without redirecting to /profile?setup=true
    await waitFor(() => {
      expect(screen.getByText("Cold-Start Gazette Lead Story: Open Source Release")).toBeInTheDocument();
    });

    expect(mockRouterPush).not.toHaveBeenCalledWith("/profile?setup=true");
    expect(mockRouterReplace).not.toHaveBeenCalledWith("/profile?setup=true");
  });

  it("complete profile: loads personalized briefing on '/'", async () => {
    mockAuthState.me = {
      id: 1,
      email: "developer@example.com",
      name: "Prabhjot Singh",
      picture_url: null,
      is_anonymous: false,
      profession: "Software Developer",
      timezone: "UTC",
      delivery_time: "07:00",
      email_digest_enabled: true,
      has_completed_setup: true,
    };

    vi.spyOn(apiModule, "apiFetch").mockImplementation(async (path: string) => {
      if (path === "/api/profile") {
        return {
          name: "Prabhjot Singh",
          role: "Software Developer",
          interests: "Python, Next.js",
        };
      }
      if (path.startsWith("/api/briefings")) {
        return sampleBriefingCards;
      }
      return [];
    });

    render(<Home />);

    await waitFor(() => {
      expect(screen.getByText("Cold-Start Gazette Lead Story: Open Source Release")).toBeInTheDocument();
    });

    expect(mockRouterPush).not.toHaveBeenCalledWith("/profile?setup=true");
  });

  it("API failure: when POST /api/profile fails on save, shows error banner and does not redirect", async () => {
    vi.spyOn(apiModule, "apiFetch").mockImplementation(async (path: string, options?: RequestInit) => {
      if (path === "/api/profile" && options?.method === "POST") {
        throw new Error("500 Server Error");
      }
      if (path === "/api/profile") {
        return { name: "Prabhjot Singh", role: "Developer", interests: "Python" };
      }
      return [];
    });

    render(<ProfilePage />);

    // Click Save Preferences / Save Profile
    const saveBtn = await screen.findByRole("button", { name: /Save Preferences/i });
    fireEvent.click(saveBtn);

    await waitFor(() => {
      expect(screen.getByText(/Failed to save profile\. Please check your connection and try again\./i)).toBeInTheDocument();
    });

    expect(mockRouterPush).not.toHaveBeenCalledWith("/");
  });

  it("Gazette link click: '← Gazette' link points to '/' and allows leaving setup page", async () => {
    vi.spyOn(apiModule, "apiFetch").mockImplementation(async (path: string) => {
      if (path === "/api/profile") {
        return { name: "Prabhjot Singh", role: "", interests: "" };
      }
      return [];
    });

    render(<ProfilePage />);

    const gazetteLink = await screen.findByRole("link", { name: /Return to Daily Gazette/i });
    expect(gazetteLink).toBeInTheDocument();
    expect(gazetteLink).toHaveAttribute("href", "/");
  });

  it("Save then redirect: saving profile calls POST /api/profile, calls refreshMe, and redirects to '/'", async () => {
    let profileSaved = false;

    vi.spyOn(apiModule, "apiFetch").mockImplementation(async (path: string, options?: RequestInit) => {
      if (path === "/api/profile" && options?.method === "POST") {
        profileSaved = true;
        return { success: true };
      }
      if (path === "/api/profile") {
        return {
          name: "Prabhjot Singh",
          role: "Software Developer",
          interests: "Python, Next.js",
        };
      }
      if (path.startsWith("/api/briefings")) {
        return sampleBriefingCards;
      }
      return [];
    });

    render(<ProfilePage />);

    const saveBtn = await screen.findByRole("button", { name: /Save Preferences/i });
    fireEvent.click(saveBtn);

    await waitFor(() => {
      expect(profileSaved).toBe(true);
      expect(mockRefreshMe).toHaveBeenCalledTimes(1);
      expect(mockRouterPush).toHaveBeenCalledWith("/");
    });
  });
});

import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, act } from "@testing-library/react";
import ProfilePage from "@/app/profile/page";
import { AuthProvider, useAuth } from "@/context/AuthContext";
import * as apiModule from "@/lib/api";

const mockSignInWithOAuth = vi.fn().mockResolvedValue({ error: null });
const mockGetSession = vi.fn().mockResolvedValue({ data: { session: null }, error: null });
const mockOnAuthStateChange = vi.fn().mockReturnValue({
  data: { subscription: { unsubscribe: vi.fn() } },
});

vi.mock("@/lib/supabaseClient", () => ({
  supabase: {
    auth: {
      signInWithOAuth: (...args: unknown[]) => mockSignInWithOAuth(...args),
      getSession: (...args: unknown[]) => mockGetSession(...args),
      onAuthStateChange: (...args: unknown[]) => mockOnAuthStateChange(...args),
      signOut: vi.fn().mockResolvedValue({}),
    },
  },
}));

const mockAuthState: {
  isAnonymous: boolean;
  signOut: ReturnType<typeof vi.fn>;
  user: Record<string, unknown> | null;
  me: apiModule.UserMe | null;
} = {
  isAnonymous: false,
  signOut: vi.fn(),
  user: null,
  me: null,
};

vi.mock("@/context/AuthContext", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/context/AuthContext")>();
  return {
    ...actual,
    useAuth: () => mockAuthState,
  };
});

const stableLoader = { showLoader: vi.fn(), hideLoader: vi.fn() };
const stableTheme = { isDarkMode: false, toggleTheme: vi.fn() };
const stableRouter = { push: vi.fn(), replace: vi.fn() };

vi.mock("@/context/LoadingContext", () => ({
  useLoader: () => stableLoader,
}));

vi.mock("@/context/ThemeContext", () => ({
  useTheme: () => stableTheme,
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

describe("Profile identity prefill & Google OAuth prompt (Task 1.9)", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    mockSignInWithOAuth.mockReset().mockResolvedValue({ error: null });
    mockGetSession.mockReset().mockResolvedValue({ data: { session: null }, error: null });
    mockOnAuthStateChange.mockReset().mockReturnValue({
      data: { subscription: { unsubscribe: vi.fn() } },
    });
    mockAuthState.isAnonymous = false;
    mockAuthState.user = null;
    mockAuthState.me = null;
  });

  it("prefills empty name and email for Google user without auto-saving", async () => {
    mockAuthState.isAnonymous = false;
    mockAuthState.me = null;
    mockAuthState.user = {
      id: "google-sub-1",
      email: "ada@gmail.com",
      is_anonymous: false,
      user_metadata: {
        full_name: "Ada Lovelace",
        avatar_url: "https://lh3.googleusercontent.com/ada",
      },
    };

    const apiSpy = vi.spyOn(apiModule, "apiFetch").mockImplementation(async (path: string) => {
      if (path === "/api/profile") {
        return { name: "", email: "", role: "", interests: "" };
      }
      if (path === "/api/me") {
        return {
          id: 10,
          email: "ada@gmail.com",
          name: "Ada Lovelace",
          picture_url: "https://lh3.googleusercontent.com/ada",
          is_anonymous: false,
          profession: null,
          timezone: "UTC",
          delivery_time: "07:00",
          email_digest_enabled: true,
          has_completed_setup: false,
        };
      }
      return {};
    });

    render(<ProfilePage />);

    const nameInput = (await screen.findByPlaceholderText("Enter your name")) as HTMLInputElement;
    const emailInput = (await screen.findByPlaceholderText("you@example.com")) as HTMLInputElement;

    await waitFor(() => {
      expect(nameInput.value).toBe("Ada Lovelace");
      expect(emailInput.value).toBe("ada@gmail.com");
    });

    // Must NOT auto-save via POST /api/profile
    const postCalls = apiSpy.mock.calls.filter(
      ([p, opts]) => p === "/api/profile" && (opts as RequestInit | undefined)?.method === "POST"
    );
    expect(postCalls).toHaveLength(0);
  });

  it("saved profile values always win over Supabase identity metadata", async () => {
    mockAuthState.isAnonymous = false;
    mockAuthState.me = {
      id: 11,
      email: "identity@gmail.com",
      name: "Identity Name",
      picture_url: null,
      is_anonymous: false,
      profession: null,
      timezone: "UTC",
      delivery_time: "07:00",
      email_digest_enabled: true,
      has_completed_setup: true,
    };
    mockAuthState.user = {
      id: "google-sub-2",
      email: "identity@gmail.com",
      is_anonymous: false,
      user_metadata: { full_name: "Google Metadata Name" },
    };

    vi.spyOn(apiModule, "apiFetch").mockImplementation(async (path: string) => {
      if (path === "/api/profile") {
        return {
          name: "Saved Custom Name",
          email: "saved@company.com",
          role: "Staff Engineer",
          interests: "Python",
        };
      }
      return {};
    });

    render(<ProfilePage />);

    const nameInput = (await screen.findByPlaceholderText("Enter your name")) as HTMLInputElement;
    const emailInput = (await screen.findByPlaceholderText("you@example.com")) as HTMLInputElement;

    await waitFor(() => {
      expect(nameInput.value).toBe("Saved Custom Name");
      expect(emailInput.value).toBe("saved@company.com");
    });
  });

  it("does NOT prefill name or email for anonymous guest users", async () => {
    mockAuthState.isAnonymous = true;
    mockAuthState.me = {
      id: 12,
      email: null,
      name: "Guest Reader",
      picture_url: null,
      is_anonymous: true,
      profession: null,
      timezone: "UTC",
      delivery_time: "07:00",
      email_digest_enabled: false,
      has_completed_setup: false,
    };
    mockAuthState.user = {
      id: "anon-sub-1",
      email: "",
      is_anonymous: true,
      user_metadata: { full_name: "Should Not Prefill" },
    };

    vi.spyOn(apiModule, "apiFetch").mockImplementation(async (path: string) => {
      if (path === "/api/profile") {
        return { name: "Guest Reader", email: null, role: "", interests: "" };
      }
      return {};
    });

    render(<ProfilePage />);

    const nameInput = (await screen.findByPlaceholderText("Enter your name")) as HTMLInputElement;
    const emailInput = (await screen.findByPlaceholderText("you@example.com")) as HTMLInputElement;

    await waitFor(() => {
      expect(nameInput.value).toBe("");
      expect(emailInput.value).toBe("");
    });
  });

  it("passes queryParams: { prompt: 'select_account' } on Google OAuth sign-in", async () => {
    // Use real AuthContext hook inside AuthProvider
    const { useAuth: realUseAuth } = await vi.importActual<typeof import("@/context/AuthContext")>(
      "@/context/AuthContext"
    );

    let triggerGoogle: (() => Promise<{ error: Error | null }>) | null = null;
    function Consumer() {
      const ctx = realUseAuth();
      triggerGoogle = ctx.signInWithGoogle;
      return null;
    }

    render(
      <AuthProvider>
        <Consumer />
      </AuthProvider>
    );

    await waitFor(() => {
      expect(triggerGoogle).not.toBeNull();
    });

    await act(async () => {
      await triggerGoogle!();
    });

    expect(mockSignInWithOAuth).toHaveBeenCalledTimes(1);
    const callArg = mockSignInWithOAuth.mock.calls[0][0];
    expect(callArg.provider).toBe("google");
    expect(callArg.options.queryParams).toEqual({ prompt: "select_account" });
  });
});

// Keep imported useAuth referenced to avoid unused-import lint warnings
void useAuth;

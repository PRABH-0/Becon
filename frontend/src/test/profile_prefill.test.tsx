import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, act, fireEvent } from "@testing-library/react";
import Home from "@/app/page";
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

  it("Home header button and profile dropdown display Google user's real name and photo (not Reader/Professional/P)", async () => {
    mockAuthState.isAnonymous = false;
    mockAuthState.me = {
      id: 20,
      email: "ada@gmail.com",
      name: "Ada Lovelace",
      picture_url: "https://lh3.googleusercontent.com/a/ada",
      is_anonymous: false,
      profession: null,
      timezone: "UTC",
      delivery_time: "07:00",
      email_digest_enabled: true,
      has_completed_setup: true,
    };
    mockAuthState.user = {
      id: "google-sub-home",
      email: "ada@gmail.com",
      is_anonymous: false,
      user_metadata: {
        full_name: "Ada Lovelace",
        avatar_url: "https://lh3.googleusercontent.com/a/ada",
      },
    };

    vi.spyOn(apiModule, "apiFetch").mockImplementation(async (path: string) => {
      if (path === "/api/profile") {
        return {
          name: "",
          email: "ada@gmail.com",
          role: "Staff Engineer",
          interests: "Python",
          picture_url: null,
        };
      }
      return [];
    });

    render(<Home />);

    const profileBtn = await screen.findByRole("button", { name: /Profile Menu/i });
    expect(profileBtn).toHaveTextContent("Ada");
    expect(profileBtn.querySelector("img")?.getAttribute("src")).toBe(
      "https://lh3.googleusercontent.com/a/ada"
    );

    fireEvent.click(profileBtn);
    expect(await screen.findByText("Ada Lovelace")).toBeInTheDocument();
    expect(screen.getByText("ada@gmail.com")).toBeInTheDocument();
    expect(screen.queryByText("Reader")).toBeNull();
  });
});

describe("Profile UI Polish (Task 6.8)", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    mockAuthState.isAnonymous = false;
    mockAuthState.user = {
      id: "test-user-1",
      email: "user@example.com",
      is_anonymous: false,
    };
    mockAuthState.me = null;
  });

  it("renders accessible tone radiogroup with keyboard arrow navigation (Item 9)", async () => {
    vi.spyOn(apiModule, "apiFetch").mockImplementation(async (path: string) => {
      if (path === "/api/profile") {
        return { name: "Test User", email: "user@example.com", role: "Software Engineer", interests: "Python" };
      }
      return [];
    });

    render(<ProfilePage />);

    const radioGroup = await screen.findByRole("radiogroup", { name: /Action Card Tone & Depth Density/i });
    expect(radioGroup).toBeInTheDocument();

    const radios = screen.getAllByRole("radio");
    expect(radios.length).toBe(3);

    // Initial tone is "Practical & Actionable" (default or first matching)
    const secondRadio = radios[1];
    fireEvent.click(secondRadio);
    expect(secondRadio).toHaveAttribute("aria-checked", "true");

    // ArrowRight moves to third radio
    fireEvent.keyDown(secondRadio, { key: "ArrowRight" });
    expect(radios[2]).toHaveAttribute("aria-checked", "true");

    // ArrowRight wraps around to first radio
    fireEvent.keyDown(radios[2], { key: "ArrowRight" });
    expect(radios[0]).toHaveAttribute("aria-checked", "true");
  });

  it("renders custom prompt textarea with normal styling, live character counter, and 500-char validation (Item 10)", async () => {
    vi.spyOn(apiModule, "apiFetch").mockImplementation(async (path: string) => {
      if (path === "/api/profile") {
        return { name: "Test User", email: "user@example.com", role: "Software Engineer", interests: "Python" };
      }
      return [];
    });

    render(<ProfilePage />);

    const counter = await screen.findByTestId("prompt-char-counter");
    expect(counter).toBeInTheDocument();
    expect(counter).toHaveTextContent("/ 500");

    const textarea = screen.getByPlaceholderText(/Highlight practical takeaways/i);
    expect(textarea.className).not.toContain("text-emerald-300");

    // Over-500 character test
    const longPrompt = "A".repeat(505);
    fireEvent.change(textarea, { target: { value: longPrompt } });
    expect(counter).toHaveTextContent("505 / 500");

    // Attempt save with overlong prompt triggers validation error
    const saveBtn = screen.getByRole("button", { name: /Save Preferences/i });
    fireEvent.click(saveBtn);

    expect(await screen.findByText(/cannot exceed 500 characters/i)).toBeInTheDocument();
  });

  it("shortens profession placeholder, updates email label and privacy copy, and uses primary accent on save button (Items 7, 8, 11, 12)", async () => {
    vi.spyOn(apiModule, "apiFetch").mockImplementation(async (path: string) => {
      if (path === "/api/profile") {
        return { name: "Test User", email: "user@example.com", role: "", interests: "Python" };
      }
      return [];
    });

    render(<ProfilePage />);

    // Item 7: Shortened placeholder
    const roleInput = await screen.findByPlaceholderText("e.g. Software Engineer, Tech Lead");
    expect(roleInput).toBeInTheDocument();

    // Item 8: Save button does NOT use rose-600
    const saveBtn = screen.getByRole("button", { name: /Save Preferences/i });
    expect(saveBtn.className).not.toContain("bg-rose-600");
    expect(saveBtn.className).toContain("bg-slate-950");

    // Item 11: Accurate privacy copy
    expect(
      screen.getByText(/Your profile is stored in your Becon account.*Google Gemini/i)
    ).toBeInTheDocument();
    expect(screen.queryByText(/kept locally in your browser storage/i)).toBeNull();

    // Item 12: Account email label
    expect(screen.getByText("Email Address (Used for your account)")).toBeInTheDocument();
    expect(screen.queryByText(/For Daily Gazette Digest/i)).toBeNull();
  });
});

// Keep imported useAuth referenced to avoid unused-import lint warnings
void useAuth;

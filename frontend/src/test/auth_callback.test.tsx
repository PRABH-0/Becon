import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, fireEvent, act } from "@testing-library/react";
import type { Session, User } from "@supabase/supabase-js";
import AuthCallbackPage, { resetCodeExchangeLock } from "@/app/auth/callback/page";
import { supabase } from "@/lib/supabaseClient";
import * as apiModule from "@/lib/api";

const mockReplace = vi.fn();
let mockSearchParams = new URLSearchParams();

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    replace: mockReplace,
    push: vi.fn(),
  }),
  useSearchParams: () => mockSearchParams,
}));

vi.mock("@/lib/supabaseClient", () => ({
  supabase: {
    auth: {
      exchangeCodeForSession: vi.fn(),
      getSession: vi.fn(),
    },
  },
}));

function createMockSession(token: string, userId = "user-1"): Session {
  return {
    access_token: token,
    refresh_token: "mock-refresh",
    expires_in: 3600,
    token_type: "bearer",
    user: {
      id: userId,
      app_metadata: {},
      user_metadata: {},
      aud: "authenticated",
      created_at: new Date().toISOString(),
    } as unknown as User,
  } as unknown as Session;
}

function createMockUser(userId = "user-1"): User {
  return {
    id: userId,
    app_metadata: {},
    user_metadata: {},
    aud: "authenticated",
    created_at: new Date().toISOString(),
  } as unknown as User;
}

describe("AuthCallbackPage (/auth/callback)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetCodeExchangeLock();
    mockSearchParams = new URLSearchParams();
    if (typeof window !== "undefined") {
      window.location.hash = "";
    }
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("URL '/auth/callback#' with an existing session redirects immediately", async () => {
    // Simulates detectSessionInUrl having already consumed URL parameters to '#'
    mockSearchParams = new URLSearchParams("");
    window.location.hash = "#";

    vi.mocked(supabase.auth.getSession).mockResolvedValue({
      data: { session: createMockSession("existing-token", "u-existing") },
      error: null,
    });
    vi.spyOn(apiModule, "getMe").mockResolvedValueOnce({
      id: 10,
      email: "oauth@example.com",
      name: "OAuth User",
      picture_url: null,
      is_anonymous: false,
      profession: "Software Engineer",
      timezone: "UTC",
      delivery_time: "08:00",
      email_digest_enabled: true,
      has_completed_setup: true,
    });

    render(<AuthCallbackPage />);

    await waitFor(() => {
      expect(mockReplace).toHaveBeenCalledWith("/");
    });

    // Code exchange was not needed because session was already established
    expect(supabase.auth.exchangeCodeForSession).not.toHaveBeenCalled();
  });

  it("URL '/auth/callback#' with no session shows the error card after the timeout", async () => {
    vi.useFakeTimers();
    mockSearchParams = new URLSearchParams("");
    window.location.hash = "#";

    vi.mocked(supabase.auth.getSession).mockResolvedValue({
      data: { session: null },
      error: null,
    });

    render(<AuthCallbackPage />);

    expect(screen.getByText("Confirming Authentication")).toBeInTheDocument();

    // Fast-forward 10 seconds past safety timeout
    act(() => {
      vi.advanceTimersByTime(10000);
    });

    expect(screen.getByText("Authentication Error")).toBeInTheDocument();
    expect(
      screen.getByText(/Authentication verification timed out after 10 seconds/)
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /back to login/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /try again/i })).toBeInTheDocument();
  });

  it("success path: exchanges PKCE code, fetches profile setup, and redirects to home", async () => {
    mockSearchParams = new URLSearchParams("code=valid-pkce-code");

    // Initial immediate getSession returns null before exchange
    vi.mocked(supabase.auth.getSession).mockResolvedValueOnce({
      data: { session: null },
      error: null,
    });

    vi.mocked(supabase.auth.exchangeCodeForSession).mockResolvedValueOnce({
      data: { session: createMockSession("mock-token", "u1"), user: createMockUser("u1") },
      error: null,
    });
    vi.mocked(supabase.auth.getSession).mockResolvedValue({
      data: { session: createMockSession("mock-token", "u1") },
      error: null,
    });
    vi.spyOn(apiModule, "getMe").mockResolvedValueOnce({
      id: 1,
      email: "user@example.com",
      name: "Test User",
      picture_url: null,
      is_anonymous: false,
      profession: "Software Engineer",
      timezone: "UTC",
      delivery_time: "08:00",
      email_digest_enabled: true,
      has_completed_setup: true,
    });

    render(<AuthCallbackPage />);

    expect(screen.getByText("Confirming Authentication")).toBeInTheDocument();

    await waitFor(() => {
      expect(supabase.auth.exchangeCodeForSession).toHaveBeenCalledWith("valid-pkce-code");
      expect(mockReplace).toHaveBeenCalledWith("/");
    });
  });

  it("success path: redirects to /profile?setup=true when user has completed setup false", async () => {
    mockSearchParams = new URLSearchParams("code=new-user-code");

    vi.mocked(supabase.auth.getSession).mockResolvedValueOnce({
      data: { session: null },
      error: null,
    });
    vi.mocked(supabase.auth.exchangeCodeForSession).mockResolvedValueOnce({
      data: { session: createMockSession("mock-token", "u2"), user: createMockUser("u2") },
      error: null,
    });
    vi.mocked(supabase.auth.getSession).mockResolvedValue({
      data: { session: createMockSession("mock-token", "u2") },
      error: null,
    });
    vi.spyOn(apiModule, "getMe").mockResolvedValueOnce({
      id: 2,
      email: "new@example.com",
      name: "New User",
      picture_url: null,
      is_anonymous: false,
      profession: null,
      timezone: "UTC",
      delivery_time: "07:00",
      email_digest_enabled: true,
      has_completed_setup: false,
    });

    render(<AuthCallbackPage />);

    await waitFor(() => {
      expect(mockReplace).toHaveBeenCalledWith("/profile?setup=true");
    });
  });

  it("error param: handles ?error and ?error_description in query params with Back to login and Try again buttons", async () => {
    mockSearchParams = new URLSearchParams(
      "error=access_denied&error_description=User%20denied%20email%20verification"
    );

    render(<AuthCallbackPage />);

    await waitFor(() => {
      expect(screen.getByText("Authentication Error")).toBeInTheDocument();
      expect(screen.getByText("User denied email verification")).toBeInTheDocument();
      expect(screen.getByRole("link", { name: /back to login/i })).toHaveAttribute("href", "/login");
      expect(screen.getByRole("button", { name: /try again/i })).toBeInTheDocument();
    });

    expect(supabase.auth.exchangeCodeForSession).not.toHaveBeenCalled();
  });

  it("error param: handles #error and #error_description in hash fragment", async () => {
    mockSearchParams = new URLSearchParams();
    window.location.hash = "#error=unauthorized_client&error_description=The%20client%20is%20not%20authorized";

    render(<AuthCallbackPage />);

    await waitFor(() => {
      expect(screen.getByText("Authentication Error")).toBeInTheDocument();
      expect(screen.getByText("The client is not authorized")).toBeInTheDocument();
      expect(screen.getByRole("link", { name: /back to login/i })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /try again/i })).toBeInTheDocument();
    });

    expect(supabase.auth.exchangeCodeForSession).not.toHaveBeenCalled();
  });

  it("timeout: triggers 10s safety timeout if network hangs and renders error with Back to login & Try again", async () => {
    vi.useFakeTimers();
    mockSearchParams = new URLSearchParams("code=hanging-code");

    // Mock exchange that hangs indefinitely
    vi.mocked(supabase.auth.getSession).mockResolvedValue({
      data: { session: null },
      error: null,
    });
    vi.mocked(supabase.auth.exchangeCodeForSession).mockImplementation(
      () => new Promise(() => {})
    );
    vi.spyOn(apiModule, "getMe").mockImplementation(
      () => new Promise(() => {})
    );

    render(<AuthCallbackPage />);

    expect(screen.getByText("Confirming Authentication")).toBeInTheDocument();

    // Fast forward past the 10-second timeout
    act(() => {
      vi.advanceTimersByTime(10000);
    });

    expect(screen.getByText("Authentication Error")).toBeInTheDocument();
    expect(
      screen.getByText(/Authentication verification timed out after 10 seconds/)
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /back to login/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /try again/i })).toBeInTheDocument();
  });

  it("double-mount: handles React Strict Mode unmount and remount without duplicate code exchange", async () => {
    mockSearchParams = new URLSearchParams("code=strict-mode-code");

    let exchangeCallCount = 0;
    vi.mocked(supabase.auth.getSession).mockResolvedValue({
      data: { session: null },
      error: null,
    });
    vi.mocked(supabase.auth.exchangeCodeForSession).mockImplementation(async () => {
      exchangeCallCount++;
      return {
        data: { session: createMockSession("token-strict", "u3"), user: createMockUser("u3") },
        error: null,
      };
    });
    vi.spyOn(apiModule, "getMe").mockResolvedValue({
      id: 3,
      email: "strict@example.com",
      name: "Strict Mode User",
      picture_url: null,
      is_anonymous: false,
      profession: "Engineer",
      timezone: "UTC",
      delivery_time: "07:00",
      email_digest_enabled: true,
      has_completed_setup: true,
    });

    // Mount 1
    const { unmount } = render(<AuthCallbackPage />);

    // Strict Mode immediate unmount
    unmount();

    // Mount 2 (the active one)
    // On Mount 2, getSession now returns the established session
    vi.mocked(supabase.auth.getSession).mockResolvedValue({
      data: { session: createMockSession("token-strict", "u3") },
      error: null,
    });

    render(<AuthCallbackPage />);

    await waitFor(() => {
      expect(mockReplace).toHaveBeenCalledWith("/");
    });

    // Guard ensures exchangeCodeForSession is called only once
    expect(exchangeCallCount).toBe(1);
  });

  it("try again button: restarts callback flow on user interaction", async () => {
    mockSearchParams = new URLSearchParams("error=temporary_network&error_description=Temporary%20error");

    render(<AuthCallbackPage />);

    await waitFor(() => {
      expect(screen.getByText("Temporary error")).toBeInTheDocument();
    });

    // Now clear the error param to simulate retry recovery
    mockSearchParams = new URLSearchParams("code=retry-code");
    vi.mocked(supabase.auth.getSession).mockResolvedValueOnce({
      data: { session: null },
      error: null,
    });
    vi.mocked(supabase.auth.exchangeCodeForSession).mockResolvedValueOnce({
      data: { session: createMockSession("retry-token", "u4"), user: createMockUser("u4") },
      error: null,
    });
    vi.mocked(supabase.auth.getSession).mockResolvedValue({
      data: { session: createMockSession("retry-token", "u4") },
      error: null,
    });
    vi.spyOn(apiModule, "getMe").mockResolvedValueOnce({
      id: 4,
      email: "retry@example.com",
      name: "Retry User",
      picture_url: null,
      is_anonymous: false,
      profession: "DevOps",
      timezone: "UTC",
      delivery_time: "08:00",
      email_digest_enabled: true,
      has_completed_setup: true,
    });

    const tryAgainBtn = screen.getByRole("button", { name: /try again/i });
    fireEvent.click(tryAgainBtn);

    await waitFor(() => {
      expect(mockReplace).toHaveBeenCalledWith("/");
    });
  });
});

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { apiFetch, getMe, deleteAccount, ApiError } from "@/lib/api";
import { supabase } from "@/lib/supabaseClient";
import type { Session } from "@supabase/supabase-js";

vi.mock("@/lib/supabaseClient", () => ({
  supabase: {
    auth: {
      getSession: vi.fn(),
      refreshSession: vi.fn(),
      signOut: vi.fn(),
    },
  },
}));

describe("apiFetch", () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it("attaches Authorization: Bearer <token> when session exists", async () => {
    vi.mocked(supabase.auth.getSession).mockResolvedValue({
      data: {
        session: { access_token: "mock-valid-token" } as unknown as Session,
      },
      error: null,
    });

    const mockFetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ hello: "world" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    );
    global.fetch = mockFetch;

    const data = await apiFetch<{ hello: string }>("/api/test");

    expect(data).toEqual({ hello: "world" });
    expect(mockFetch).toHaveBeenCalledTimes(1);
    const headers = mockFetch.mock.calls[0][1]?.headers as Headers;
    expect(headers.get("Authorization")).toBe("Bearer mock-valid-token");
  });

  it("does not attach Authorization header when no session exists", async () => {
    vi.mocked(supabase.auth.getSession).mockResolvedValue({
      data: { session: null },
      error: null,
    });

    const mockFetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ public: true }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    );
    global.fetch = mockFetch;

    const data = await apiFetch<{ public: boolean }>("/api/public");

    expect(data).toEqual({ public: true });
    expect(mockFetch).toHaveBeenCalledTimes(1);
    const headers = mockFetch.mock.calls[0][1]?.headers as Headers;
    expect(headers.get("Authorization")).toBeNull();
  });

  it("handles a 401 response by attempting refreshSession once and retrying", async () => {
    vi.mocked(supabase.auth.getSession).mockResolvedValue({
      data: {
        session: { access_token: "expired-token" } as unknown as Session,
      },
      error: null,
    });

    vi.mocked(supabase.auth.refreshSession).mockResolvedValue({
      data: {
        session: { access_token: "refreshed-token" } as unknown as Session,
        user: null,
      },
      error: null,
    });

    const mockFetch = vi
      .fn()
      .mockResolvedValueOnce(new Response("Unauthorized", { status: 401 }))
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ success: true }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        })
      );
    global.fetch = mockFetch;

    const data = await apiFetch<{ success: boolean }>("/api/retry-test");

    expect(data).toEqual({ success: true });
    expect(mockFetch).toHaveBeenCalledTimes(2);
    expect(supabase.auth.refreshSession).toHaveBeenCalledTimes(1);
    const retryHeaders = mockFetch.mock.calls[1][1]?.headers as Headers;
    expect(retryHeaders.get("Authorization")).toBe("Bearer refreshed-token");
  });

  it("signs out locally and redirects to /login if retry also returns 401", async () => {
    Object.defineProperty(window, "location", {
      value: { href: "" },
      writable: true,
      configurable: true,
    });

    vi.mocked(supabase.auth.getSession).mockResolvedValue({
      data: {
        session: { access_token: "expired-token" } as unknown as Session,
      },
      error: null,
    });

    vi.mocked(supabase.auth.refreshSession).mockResolvedValue({
      data: {
        session: { access_token: "still-bad-token" } as unknown as Session,
        user: null,
      },
      error: null,
    });

    const mockFetch = vi
      .fn()
      .mockResolvedValueOnce(new Response("Unauthorized", { status: 401 }))
      .mockResolvedValueOnce(new Response("Unauthorized", { status: 401 }));
    global.fetch = mockFetch;

    await expect(apiFetch("/api/double-401")).rejects.toThrow(ApiError);
    expect(supabase.auth.signOut).toHaveBeenCalledWith({ scope: "local" });
    expect(window.location.href).toBe("/login");
  });

  it("getMe() calls /api/me and returns typed response", async () => {
    vi.mocked(supabase.auth.getSession).mockResolvedValue({
      data: { session: null },
      error: null,
    });

    const mockMe = {
      id: 42,
      email: "engineer@becon.dev",
      name: "Engineer",
      picture_url: null,
      is_anonymous: false,
      profession: "Software Engineer",
      timezone: "UTC",
      delivery_time: "08:00",
      email_digest_enabled: true,
      has_completed_setup: true,
    };

    const mockFetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(mockMe), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    );
    global.fetch = mockFetch;

    const me = await getMe();
    expect(me).toEqual(mockMe);
    expect(mockFetch.mock.calls[0][0]).toContain("/api/me");
  });

  it("deleteAccount() sends DELETE to /api/account and handles 204", async () => {
    vi.mocked(supabase.auth.getSession).mockResolvedValue({
      data: { session: null },
      error: null,
    });

    const mockFetch = vi.fn().mockResolvedValue(
      new Response(null, { status: 204 })
    );
    global.fetch = mockFetch;

    const result = await deleteAccount();
    expect(result).toBeUndefined();
    expect(mockFetch.mock.calls[0][0]).toContain("/api/account");
    expect(mockFetch.mock.calls[0][1]?.method).toBe("DELETE");
  });
});

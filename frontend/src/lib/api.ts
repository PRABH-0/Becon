import { supabase } from "@/lib/supabaseClient";
import { clearBeconCaches } from "@/lib/cache";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000";

export interface UserMe {
  id: number;
  email: string | null;
  name: string;
  picture_url: string | null;
  is_anonymous: boolean;
  profession: string | null;
  timezone: string;
  delivery_time: string;
  email_digest_enabled: boolean;
  has_completed_setup: boolean;
}

export class ApiError extends Error {
  status: number;
  data: unknown;

  constructor(status: number, message: string, data?: unknown) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.data = data;
  }
}

/**
 * Core API fetch wrapper.
 * Automatically resolves the latest access token from the active Supabase session.
 * Handles 401 with a single session refresh retry; if still 401, signs out locally and redirects to /login.
 */
export async function apiFetch<T = unknown>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const url = path.startsWith("http") ? path : `${API_BASE}${path.startsWith("/") ? "" : "/"}${path}`;

  // Helper to execute fetch with an optional bearer token
  const execute = async (token?: string | null): Promise<Response> => {
    const headers = new Headers(options.headers || {});
    if (token) {
      headers.set("Authorization", `Bearer ${token}`);
    }
    return fetch(url, {
      ...options,
      headers,
    });
  };

  // 1. Get current session token
  let token: string | null = null;
  try {
    const { data } = await supabase.auth.getSession();
    token = data.session?.access_token || null;
  } catch {
    token = null;
  }

  // 2. Perform initial request
  let res = await execute(token);

  // 3. Handle 401 with session refresh & single retry if a token was used
  if (res.status === 401 && token) {
    try {
      const { data: refreshData, error: refreshError } = await supabase.auth.refreshSession();
      if (!refreshError && refreshData.session?.access_token) {
        token = refreshData.session.access_token;
        res = await execute(token);
      }
    } catch {
      // Refresh failed
    }

    // If still 401 after retry, perform local sign-out and redirect
    if (res.status === 401) {
      try {
        await supabase.auth.signOut({ scope: "local" });
      } catch {
        // Ignore sign-out errors
      }
      clearBeconCaches();
      if (typeof window !== "undefined") {
        // eslint-disable-next-line @next/next/no-location-assign-relative-destination
        window.location.href = "/login";
      }
      throw new ApiError(401, "Session expired. Please log in again.");
    }
  }

  // Handle 204 No Content
  if (res.status === 204) {
    return undefined as unknown as T;
  }

  // Handle non-OK responses
  if (!res.ok) {
    let errorDetail = `Request failed with status ${res.status}`;
    let errorData: unknown = null;
    try {
      errorData = await res.json();
      if (errorData && typeof errorData === "object" && "detail" in errorData) {
        errorDetail = String((errorData as { detail: unknown }).detail);
      }
    } catch {
      // Response not JSON
    }
    throw new ApiError(res.status, errorDetail, errorData);
  }

  // Parse JSON response
  return res.json() as Promise<T>;
}

/**
 * Fetch the authenticated user's profile metadata and setup status from the backend.
 */
export async function getMe(): Promise<UserMe> {
  return apiFetch<UserMe>("/api/me");
}

/**
 * Permanently delete the user account and all cascaded data.
 */
export async function deleteAccount(): Promise<void> {
  return apiFetch<void>("/api/account", {
    method: "DELETE",
  });
}

import { createClient, SupabaseClient } from "@supabase/supabase-js";

export const SUPABASE_URL_PATH_ERROR =
  "SUPABASE_URL must be the project root like https://<ref>.supabase.co, remove the path";

export class SupabaseConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SupabaseConfigError";
  }
}

export interface NormalizedSupabaseUrlResult {
  url: string | null;
  error: string | null;
}

/**
 * Validate and normalize NEXT_PUBLIC_SUPABASE_URL to the bare project root
 * (scheme + host, no trailing slash, no path such as /rest/v1 or /auth/v1).
 */
export function normalizeSupabaseUrl(
  rawUrl: string | undefined | null
): NormalizedSupabaseUrlResult {
  const trimmed = (rawUrl ?? "").trim();
  if (!trimmed) {
    return {
      url: null,
      error: "NEXT_PUBLIC_SUPABASE_URL is empty or unset.",
    };
  }

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return {
      url: null,
      error: "SUPABASE_URL must be a valid http(s) project root like https://<ref>.supabase.co",
    };
  }

  if ((parsed.protocol !== "http:" && parsed.protocol !== "https:") || !parsed.host) {
    return {
      url: null,
      error: "SUPABASE_URL must be a valid http(s) project root like https://<ref>.supabase.co",
    };
  }

  if ((parsed.pathname && parsed.pathname !== "/") || parsed.search || parsed.hash) {
    return {
      url: null,
      error: SUPABASE_URL_PATH_ERROR,
    };
  }

  return {
    url: `${parsed.protocol}//${parsed.host}`,
    error: null,
  };
}

/**
 * Returns an error string when NEXT_PUBLIC_SUPABASE_URL is set to a malformed
 * value (such as including /rest/v1 or /auth/v1), or null if unset/valid.
 */
export function getSupabaseUrlConfigError(): string | null {
  const raw = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!raw || !raw.trim()) {
    return null;
  }
  return normalizeSupabaseUrl(raw).error;
}

export function isSupabaseMisconfiguredError(err: unknown): boolean {
  if (err instanceof SupabaseConfigError) return true;
  if (!(err instanceof Error)) return false;
  const msg = err.message.toLowerCase();
  return (
    msg.includes("supabase_url must be the project root") ||
    msg.includes("missing required supabase environment variables") ||
    msg.includes("pgrst125") ||
    msg.includes("no api key found in request")
  );
}

let clientInstance: SupabaseClient | null = null;

function getClient(): SupabaseClient {
  const rawUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!rawUrl || !rawUrl.trim() || !supabaseAnonKey || !supabaseAnonKey.trim()) {
    throw new SupabaseConfigError(
      "Missing required Supabase environment variables: NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY must be defined."
    );
  }

  const { url: normalizedUrl, error } = normalizeSupabaseUrl(rawUrl);
  if (error || !normalizedUrl) {
    console.error(error ?? SUPABASE_URL_PATH_ERROR);
    throw new SupabaseConfigError(error ?? SUPABASE_URL_PATH_ERROR);
  }

  if (!clientInstance) {
    clientInstance = createClient(normalizedUrl, supabaseAnonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    });
  }
  return clientInstance;
}

export const supabase: SupabaseClient = new Proxy({} as SupabaseClient, {
  get(_target, prop, receiver) {
    const client = getClient();
    const value = Reflect.get(client, prop, receiver);
    if (typeof value === "function") {
      return value.bind(client);
    }
    return value;
  },
});

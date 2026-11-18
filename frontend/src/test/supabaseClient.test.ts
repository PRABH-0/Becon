import { describe, it, expect } from "vitest";
import {
  normalizeSupabaseUrl,
  SUPABASE_URL_PATH_ERROR,
  isSupabaseMisconfiguredError,
  SupabaseConfigError,
} from "@/lib/supabaseClient";

describe("normalizeSupabaseUrl (Task 1.6b)", () => {
  it("accepts a valid bare project root URL", () => {
    const res = normalizeSupabaseUrl("https://myproject.supabase.co");
    expect(res).toEqual({ url: "https://myproject.supabase.co", error: null });
  });

  it("strips a trailing slash and normalizes to bare project root", () => {
    const res = normalizeSupabaseUrl("https://myproject.supabase.co/");
    expect(res).toEqual({ url: "https://myproject.supabase.co", error: null });
  });

  it("rejects URLs containing /rest/v1 path with clear guidance", () => {
    const res = normalizeSupabaseUrl("https://myproject.supabase.co/rest/v1");
    expect(res.url).toBeNull();
    expect(res.error).toBe(SUPABASE_URL_PATH_ERROR);
  });

  it("rejects URLs containing /auth/v1 path with clear guidance", () => {
    const res = normalizeSupabaseUrl("https://myproject.supabase.co/auth/v1");
    expect(res.url).toBeNull();
    expect(res.error).toBe(SUPABASE_URL_PATH_ERROR);
  });

  it("rejects empty or whitespace-only URLs", () => {
    expect(normalizeSupabaseUrl("").url).toBeNull();
    expect(normalizeSupabaseUrl("").error).toBeTruthy();
    expect(normalizeSupabaseUrl("   ").url).toBeNull();
    expect(normalizeSupabaseUrl(undefined).url).toBeNull();
  });

  it("detects SupabaseConfigError and PGRST125 as misconfiguration errors", () => {
    expect(isSupabaseMisconfiguredError(new SupabaseConfigError(SUPABASE_URL_PATH_ERROR))).toBe(true);
    expect(isSupabaseMisconfiguredError(new Error("404 PGRST125 Invalid path"))).toBe(true);
    expect(isSupabaseMisconfiguredError(new Error("No API key found in request"))).toBe(true);
    expect(isSupabaseMisconfiguredError(new Error("Invalid login credentials"))).toBe(false);
  });
});

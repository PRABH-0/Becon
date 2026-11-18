import { describe, it, expect, beforeEach } from "vitest";
import {
  clearBeconCaches,
  syncIdentityCache,
  syncUserCache,
  resetUserCacheTracker,
  getBriefingsCacheKey,
} from "@/lib/cache";

describe("cache helpers", () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    resetUserCacheTracker(null);
  });

  it("clearBeconCaches keeps becon_theme and non-becon keys", () => {
    localStorage.setItem("becon_theme", "dark");
    localStorage.setItem("unrelated_app_key", "keep-me");
    localStorage.setItem("becon_user_name", "Alex");
    localStorage.setItem("becon_user_avatar", "https://img.com/avatar.jpg");
    localStorage.setItem("becon_cached_briefings", "[]");
    localStorage.setItem("becon_briefings_user-123", "[]");

    clearBeconCaches();

    expect(localStorage.getItem("becon_theme")).toBe("dark");
    expect(localStorage.getItem("unrelated_app_key")).toBe("keep-me");
    expect(localStorage.getItem("becon_user_name")).toBeNull();
    expect(localStorage.getItem("becon_user_avatar")).toBeNull();
    expect(localStorage.getItem("becon_cached_briefings")).toBeNull();
    expect(localStorage.getItem("becon_briefings_user-123")).toBeNull();
  });

  it("syncUserCache purges caches when user changes", () => {
    localStorage.setItem("becon_theme", "light");
    localStorage.setItem("becon_user_name", "User 1");

    // Initial user login
    expect(syncUserCache("user-1")).toBe(false);
    expect(localStorage.getItem("becon_user_name")).toBe("User 1");

    // Same user login/re-sync
    expect(syncUserCache("user-1")).toBe(false);
    expect(localStorage.getItem("becon_user_name")).toBe("User 1");

    // Different user login triggers purge (including old avatar photo)
    localStorage.setItem("becon_user_avatar", "https://lh3.googleusercontent.com/user-1-photo");
    const purged = syncUserCache("user-2");
    expect(purged).toBe(true);
    expect(localStorage.getItem("becon_user_name")).toBeNull();
    expect(localStorage.getItem("becon_user_avatar")).toBeNull();
    expect(localStorage.getItem("becon_theme")).toBe("light");
  });

  it("syncUserCache clears old avatar even after full page reload (in-memory tracker reset)", () => {
    syncUserCache("user-a");
    syncIdentityCache("Alice", "https://lh3.googleusercontent.com/alice");
    expect(localStorage.getItem("becon_user_avatar")).toBe("https://lh3.googleusercontent.com/alice");

    // Simulate reload: reset in-memory tracker while localStorage still holds becon_active_user_id
    resetUserCacheTracker(null);

    // Account B signs in -> must clear Account A's cached avatar and name
    const purged = syncUserCache("user-b");
    expect(purged).toBe(true);
    expect(localStorage.getItem("becon_user_name")).toBeNull();
    expect(localStorage.getItem("becon_user_avatar")).toBeNull();
  });

  it("syncIdentityCache stores https avatars only and removes stale photo when unset", () => {
    syncIdentityCache("Ada", "https://lh3.googleusercontent.com/ada");
    expect(localStorage.getItem("becon_user_name")).toBe("Ada");
    expect(localStorage.getItem("becon_user_avatar")).toBe("https://lh3.googleusercontent.com/ada");

    // Non-https or empty avatar clears previous cached avatar
    syncIdentityCache("Ada", "http://insecure.example.com/pic.png");
    expect(localStorage.getItem("becon_user_avatar")).toBeNull();
  });

  it("getBriefingsCacheKey formats keys safely for guests vs authenticated users", () => {
    expect(getBriefingsCacheKey(null)).toBe("becon_cached_briefings_guest");
    expect(getBriefingsCacheKey(undefined)).toBe("becon_cached_briefings_guest");
    expect(getBriefingsCacheKey("")).toBe("becon_cached_briefings_guest");
    expect(getBriefingsCacheKey("11111111-2222-3333-4444-555555555555")).toBe(
      "becon_cached_briefings_11111111-2222-3333-4444-555555555555"
    );
  });
});

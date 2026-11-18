/**
 * Cache hygiene helpers for Becon.
 * Ensures user data, session info, and cached briefings are purged on logout/deletion/user-switch,
 * while preserving user UI theme preferences ('becon_theme').
 */

import { sanitizeHttpsUrl } from "@/lib/identity";

export const PRESERVED_CACHE_KEYS = new Set(["becon_theme"]);
const ACTIVE_USER_KEY = "becon_active_user_id";

/**
 * Remove all localStorage and sessionStorage keys starting with "becon_"
 * EXCEPT "becon_theme".
 */
export function clearBeconCaches(): void {
  if (typeof window === "undefined") return;

  const purge = (storage: Storage) => {
    try {
      const keysToRemove: string[] = [];
      for (let i = 0; i < storage.length; i++) {
        const key = storage.key(i);
        if (key && key.startsWith("becon_") && !PRESERVED_CACHE_KEYS.has(key)) {
          keysToRemove.push(key);
        }
      }
      for (const key of keysToRemove) {
        storage.removeItem(key);
      }
    } catch {
      // Storage access may throw in sandboxed iframes or restricted environments
    }
  };

  try {
    purge(window.localStorage);
  } catch {
    // Ignore
  }

  try {
    purge(window.sessionStorage);
  } catch {
    // Ignore
  }
}

let lastActiveUserId: string | null = null;

/**
 * Check if the active user ID has changed (both in-memory and across page reloads via localStorage).
 * If changed, purge caches (including becon_user_name and becon_user_avatar) to prevent cross-account leakage.
 */
export function syncUserCache(currentUserId: string | null): boolean {
  let storedUserId: string | null = null;
  if (typeof window !== "undefined") {
    try {
      storedUserId = window.localStorage.getItem(ACTIVE_USER_KEY);
    } catch {
      storedUserId = null;
    }
  }

  const previousUserId = lastActiveUserId ?? storedUserId;
  const switched = previousUserId !== null && previousUserId !== currentUserId;

  if (switched) {
    clearBeconCaches();
  }

  lastActiveUserId = currentUserId;
  if (typeof window !== "undefined") {
    try {
      if (currentUserId) {
        window.localStorage.setItem(ACTIVE_USER_KEY, currentUserId);
      } else {
        window.localStorage.removeItem(ACTIVE_USER_KEY);
      }
    } catch {
      // Ignore storage failures
    }
  }

  return switched;
}

/**
 * Refresh cached identity hints (becon_user_name / becon_user_avatar) from the current session.
 * Clears stale values whenever the current account has no name or no https avatar.
 */
export function syncIdentityCache(
  name: string | null | undefined,
  avatarUrl: string | null | undefined
): void {
  if (typeof window === "undefined") return;
  try {
    const cleanName = typeof name === "string" ? name.trim() : "";
    if (cleanName) {
      window.localStorage.setItem("becon_user_name", cleanName);
    } else {
      window.localStorage.removeItem("becon_user_name");
    }

    const safeAvatar = sanitizeHttpsUrl(avatarUrl);
    if (safeAvatar) {
      window.localStorage.setItem("becon_user_avatar", safeAvatar);
    } else {
      window.localStorage.removeItem("becon_user_avatar");
    }
  } catch {
    // Ignore storage failures
  }
}

/**
 * Reset tracked user id (primarily for testing).
 */
export function resetUserCacheTracker(id: string | null = null): void {
  lastActiveUserId = id;
}

/**
 * Generate a cache key for briefings scoped to the specific user ID.
 * Prevents account A from seeing account B's cached cards.
 */
export function getBriefingsCacheKey(userId?: string | null): string {
  if (!userId) {
    return "becon_cached_briefings_guest";
  }
  return `becon_cached_briefings_${userId}`;
}

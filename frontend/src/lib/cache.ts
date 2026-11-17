/**
 * Cache hygiene helpers for Becon.
 * Ensures user data, session info, and cached briefings are purged on logout/deletion/user-switch,
 * while preserving user UI theme preferences ('becon_theme').
 */

export const PRESERVED_CACHE_KEYS = new Set(["becon_theme"]);

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
 * Check if the active user ID has changed. If changed, purge caches to prevent
 * cross-account data leakage.
 */
export function syncUserCache(currentUserId: string | null): boolean {
  if (lastActiveUserId !== null && lastActiveUserId !== currentUserId) {
    clearBeconCaches();
    lastActiveUserId = currentUserId;
    return true;
  }
  lastActiveUserId = currentUserId;
  return false;
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

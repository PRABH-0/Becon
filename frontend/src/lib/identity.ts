import type { User } from "@supabase/supabase-js";
import type { UserMe } from "@/lib/api";

export interface ProfileIdentityInput {
  name?: string | null;
  role?: string | null;
  email?: string | null;
  picture_url?: string | null;
}

export interface ResolvedUserIdentity {
  displayName: string;
  firstName: string;
  subtitle: string;
  avatarUrl: string | null;
  isGuest: boolean;
}

const PLACEHOLDER_NAMES = new Set(["developer", "user", "guest reader", "reader", "profile"]);
const PLACEHOLDER_ROLES = new Set(["professional", "professional / user", "member", "user"]);

/**
 * Accept only valid https:// URLs with a non-empty host.
 * Rejects http://, javascript:, data:, relative paths, or malformed strings.
 */
export function sanitizeHttpsUrl(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== "https:" || !parsed.host) {
      return null;
    }
    return trimmed;
  } catch {
    return null;
  }
}

function cleanDisplayName(raw: unknown): string {
  if (typeof raw !== "string") return "";
  const trimmed = raw.trim();
  if (!trimmed || PLACEHOLDER_NAMES.has(trimmed.toLowerCase())) {
    return "";
  }
  return trimmed;
}

function cleanRole(raw: unknown): string {
  if (typeof raw !== "string") return "";
  const trimmed = raw.trim();
  if (!trimmed || PLACEHOLDER_ROLES.has(trimmed.toLowerCase())) {
    return "";
  }
  return trimmed;
}

function emailToDisplayName(email: string): string {
  const local = email.split("@")[0]?.trim() || "";
  if (!local) return "";
  return local.charAt(0).toUpperCase() + local.slice(1);
}

/**
 * Resolve user display name, subtitle, and https-only avatar URL.
 *
 * Name priority: saved profile name -> /api/me name -> user_metadata.full_name -> user_metadata.name -> email prefix.
 * Subtitle priority: saved profession/role -> email.
 * Guests: displayName="Guest Reader", subtitle="Exploring as guest", avatarUrl=null.
 */
export function resolveUserIdentity(params: {
  profile?: ProfileIdentityInput | null;
  me?: UserMe | null;
  user?: Pick<User, "email" | "is_anonymous" | "user_metadata"> | null;
  isAnonymous?: boolean;
}): ResolvedUserIdentity {
  const { profile, me, user, isAnonymous } = params;
  const isGuest = Boolean(isAnonymous || me?.is_anonymous || user?.is_anonymous);

  if (isGuest) {
    return {
      displayName: "Guest Reader",
      firstName: "Guest",
      subtitle: "Exploring as guest",
      avatarUrl: null,
      isGuest: true,
    };
  }

  const meta = (user?.user_metadata || {}) as Record<string, unknown>;
  const savedName = cleanDisplayName(profile?.name);
  const meName = cleanDisplayName(me?.name);
  const metaFullName = cleanDisplayName(meta.full_name);
  const metaName = cleanDisplayName(meta.name);

  const savedEmail = typeof profile?.email === "string" ? profile.email.trim() : "";
  const meEmail = typeof me?.email === "string" ? me.email.trim() : "";
  const authEmail = typeof user?.email === "string" ? user.email.trim() : "";
  const email = savedEmail || meEmail || authEmail;

  const displayName =
    savedName || meName || metaFullName || metaName || emailToDisplayName(email) || "Member";

  const firstName = displayName.split(/\s+/)[0] || displayName;

  const savedProfession = cleanRole(profile?.role) || cleanRole(me?.profession);
  const subtitle = savedProfession || email || "Member";

  const avatarUrl =
    sanitizeHttpsUrl(profile?.picture_url) ||
    sanitizeHttpsUrl(me?.picture_url) ||
    sanitizeHttpsUrl(meta.avatar_url) ||
    sanitizeHttpsUrl(meta.picture);

  return {
    displayName,
    firstName,
    subtitle,
    avatarUrl,
    isGuest: false,
  };
}

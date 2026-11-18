/**
 * Safe redirect helper for Next.js routing.
 * Ensures the target destination is strictly a same-origin relative path.
 * Rejects external URLs, protocol-relative attacks (//evil.com), backslash evasion, and javascript schemes.
 */
export function getSafeRedirectUrl(
  target: string | null | undefined,
  fallback = "/"
): string {
  if (!target || typeof target !== "string") {
    return fallback;
  }

  const trimmed = target.trim();

  // Must start with exactly one forward slash
  if (!trimmed.startsWith("/")) {
    return fallback;
  }

  // Reject protocol-relative URLs (e.g. //evil.com)
  if (trimmed.startsWith("//")) {
    return fallback;
  }

  // Reject backslashes which browsers or servers may treat as path separators (e.g. /\evil.com)
  if (trimmed.includes("\\")) {
    return fallback;
  }

  // Reject any embedded URL schemes (e.g. /http:, /javascript:)
  if (/^\/[a-zA-Z][a-zA-Z0-9+.-]*:/.test(trimmed)) {
    return fallback;
  }

  return trimmed;
}

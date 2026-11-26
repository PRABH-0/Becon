/**
 * Sentry frontend error monitoring.
 * Safe no-op unless NEXT_PUBLIC_SENTRY_DSN is configured.
 */
export function initFrontendSentry(): void {
  const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;
  if (!dsn || typeof window === "undefined") {
    return;
  }

  // When Sentry SDK is added in production, initialize here.
  // Currently verifies environment variable presence without failing in unmonitored builds.
  if (process.env.NODE_ENV === "development") {
    console.debug("[Sentry] Frontend DSN configured:", dsn ? "configured" : "none");
  }
}

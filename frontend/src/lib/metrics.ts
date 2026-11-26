import { apiFetch } from "./api";

export type MetricEventName =
  | "briefing_viewed"
  | "card_opened"
  | "card_saved"
  | "feedback_given"
  | "source_clicked";

/**
 * Dispatches an anonymous or authenticated product telemetry event (fire-and-forget).
 * Never blocks UI rendering or throws errors.
 */
export async function recordMetric(
  name: MetricEventName,
  properties: Record<string, unknown> = {}
): Promise<void> {
  if (typeof window === "undefined") {
    return;
  }

  try {
    let sessionId = window.sessionStorage?.getItem("becon_sid");
    if (!sessionId) {
      sessionId = `sess_${Math.random().toString(36).substring(2, 12)}`;
      try {
        window.sessionStorage?.setItem("becon_sid", sessionId);
      } catch {
        // Ignore storage access errors
      }
    }

    await apiFetch("/api/metrics/event", {
      method: "POST",
      body: JSON.stringify({
        name,
        properties,
        session_id: sessionId,
      }),
    });
  } catch {
    // Non-blocking telemetry failure is silently ignored in frontend
  }
}

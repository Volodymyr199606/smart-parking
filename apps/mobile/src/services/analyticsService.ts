import { supabase } from "./supabaseClient";

/**
 * Basic product analytics — fire-and-forget inserts into analytics_events.
 * Requires migration 00009_analytics_events.sql applied.
 *
 * Never throws; failures are logged only so user flows are never blocked.
 */

export type AnalyticsEventName =
  | "parking_list_viewed"
  | "parking_spot_opened"
  | "directions_clicked"
  | "report_submitted"
  | "favorite_added"
  | "favorite_removed";

export type AnalyticsEventPayload = Record<
  string,
  string | number | boolean | null
>;

const MAX_PAYLOAD_KEYS = 10;

function sanitizePayload(
  payload?: AnalyticsEventPayload
): AnalyticsEventPayload {
  if (!payload) return {};

  const sanitized: AnalyticsEventPayload = {};
  for (const [key, value] of Object.entries(payload)) {
    if (Object.keys(sanitized).length >= MAX_PAYLOAD_KEYS) break;
    if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
      sanitized[key] = value;
    } else if (value === null) {
      sanitized[key] = null;
    }
  }
  return sanitized;
}

/**
 * Track a product analytics event. Safe to call without await.
 */
export function trackEvent(
  eventName: AnalyticsEventName,
  payload?: AnalyticsEventPayload
): void {
  void trackEventAsync(eventName, payload);
}

async function trackEventAsync(
  eventName: AnalyticsEventName,
  payload?: AnalyticsEventPayload
): Promise<void> {
  try {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    const { error } = await supabase.from("analytics_events").insert({
      user_id: user?.id ?? null,
      event_name: eventName,
      event_payload: sanitizePayload(payload),
    });

    if (error) {
      console.warn(`[analytics] ${eventName}:`, error.message);
    }
  } catch (err) {
    console.warn(
      `[analytics] ${eventName}:`,
      err instanceof Error ? err.message : "unknown error"
    );
  }
}

import type { domain, services } from "@smart-parking/shared";

export interface ParkingSearchInput { origin: domain.GeoPoint; durationMinutes: number; radiusMeters: number; requireLegal: boolean }
export function searchErrorMessage(error: unknown): string {
  const code = (error as { code?: string } | null)?.code;
  if (code === "QUERY_LIMIT") return "Too many records in this area. Try a smaller radius.";
  if (code === "DATA_ERROR") return "Parking data could not be verified. Please retry.";
  return "Could not load parking results. Check your connection and retry.";
}
export function parkingSearchEmptyMessage(input: Pick<ParkingSearchInput, "requireLegal" | "radiusMeters">): string {
  return input.requireLegal ? "No verified legal parking found for this stay. Turn off Verified legal only to see candidates with unverified rules."
    : `No parking candidates found within ${input.radiusMeters < 1000 ? `${input.radiusMeters} m` : `${input.radiusMeters / 1000} km`}. Try a larger radius.`;
}
export function parkingSearchCardModel(result: services.ParkingSearchResult) {
  const a = result.availability;
  const freshness = a.status !== "UNKNOWN" && a.freshness === "FRESH" && a.ageMinutes !== null
    ? `Report age at search: ${a.ageMinutes < 1 ? "under 1 min" : `${Math.floor(a.ageMinutes)} min`}` : null;
  return {
    title: result.location.streetName || result.location.address || "Parking candidate",
    address: result.location.streetName ? result.location.address : null,
    distance: result.distanceMeters < 1000 ? `${Math.round(result.distanceMeters)} m away` : `${(result.distanceMeters / 1000).toFixed(1)} km away`,
    legality: { LEGAL: "Parking allowed", ILLEGAL: "Parking not allowed for this stay", UNKNOWN: "Parking rules not fully verified" }[result.legality.status],
    availability: { AVAILABLE: "Recently reported available", OCCUPIED: "Recently reported occupied", UNKNOWN: "Availability unknown" }[a.status],
    freshness,
    maxStay: result.legality.maxStayMinutes === null ? null : `Known time limit: ${result.legality.maxStayMinutes} min`,
    restrictions: [...new Set(result.legality.restrictions.flatMap(({ rule, applicability }) => {
      if (applicability.status === "DOES_NOT_APPLY") return [];
      if (applicability.status === "UNKNOWN") return ["Some restrictions could not be evaluated; check posted signs."];
      if (rule.kind === "METERED") return ["Meter requirements apply; check posted signs."];
      if (rule.kind === "OTHER") return ["Additional restriction recorded; check posted signs."];
      return [];
    }))],
  };
}

/** Only schedules re-query; never computes a new availability status. */
export function nextParkingEvidenceExpiry(results: readonly services.ParkingSearchResult[], now: number): number | null {
  const times = results.flatMap(r => r.availability.observations.map(o => o.evidence?.expiresAt))
    .filter((s): s is string => !!s).map(s => Date.parse(s)).filter(t => Number.isFinite(t) && t > now);
  return times.length ? Math.min(...times) : null;
}

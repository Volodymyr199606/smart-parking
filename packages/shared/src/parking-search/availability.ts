import type { ParkingAvailability, ParkingEvidence } from "../domain";
import { parseInstantMs } from "../services/isoInstant";
import type { ParkingSearchAvailability } from "./contracts";

/** Stable field ordering, independent of object insertion order or locale. */
export function evidenceKey(e: ParkingEvidence): string {
  return JSON.stringify([e.sourceCategory, e.sourceDetail, e.externalId, e.observedAt, e.retrievedAt, e.expiresAt]);
}
export function compareText(a: string, b: string): number { return a < b ? -1 : a > b ? 1 : 0; }
export function evidenceQuality(e: ParkingEvidence | null): number {
  return e?.sourceCategory === "COMMUNITY" ? 0 : e?.sourceCategory === "MOCK" ? 1 : 2;
}

/** Uses arrival, never Date.now(). No TTL is invented and CITY inventory is never occupancy. */
export function resolveParkingAvailability(observations: readonly ParkingAvailability[], arrivalTime: string): ParkingSearchAvailability {
  const arrival = parseInstantMs(arrivalTime);
  if (arrival === null) throw new Error("Availability requires a valid arrival instant");
  const unique = new Map(observations.map(o => [JSON.stringify([o.status, o.evidence ? evidenceKey(o.evidence) : null]), o]));
  const retained = [...unique.entries()].sort(([a], [b]) => compareText(a, b)).map(([, o]) => o);
  const base: ParkingSearchAvailability = { status: "UNKNOWN", evidence: null, freshness: "UNKNOWN", evaluatedAt: arrivalTime,
    ageMinutes: null, reasonCode: "NO_VALID_OBSERVATION", observations: retained };
  const valid = retained.flatMap(o => {
    const e = o.evidence;
    if (!e || !["COMMUNITY", "MOCK"].includes(e.sourceCategory) || !["AVAILABLE", "OCCUPIED", "UNKNOWN"].includes(o.status)) return [];
    const observed = e.observedAt === null ? null : parseInstantMs(e.observedAt), retrieved = parseInstantMs(e.retrievedAt);
    const expires = e.expiresAt === null ? null : parseInstantMs(e.expiresAt);
    if (observed === null || retrieved === null || observed > arrival || retrieved > arrival || retrieved < observed
      || (e.expiresAt !== null && (expires === null || expires <= observed))) return [];
    return [{ observation: o, observed, expires, quality: evidenceQuality(e) }];
  }).sort((a, b) => b.observed - a.observed || a.quality - b.quality);
  if (valid.length === 0) return base;
  const latest = valid[0], tied = valid.filter(v => v.observed === latest.observed && v.quality === latest.quality);
  const ageMinutes = (arrival - latest.observed) / 60_000;
  // Do not resurrect an older report when the latest observation has expired or is ambiguous.
  if (tied.some(v => v.expires !== null && v.expires <= arrival)) {
    return { ...base, ageMinutes, freshness: "EXPIRED", reasonCode: "EXPIRED_OBSERVATION" };
  }
  if (tied.some(v => v.expires === null)) return { ...base, ageMinutes, reasonCode: "EXPIRY_UNKNOWN" };
  if (new Set(tied.map(v => v.observation.status)).size !== 1) {
    return { ...base, ageMinutes, freshness: "FRESH", reasonCode: "CONFLICTING_OBSERVATIONS" };
  }
  const selected = latest.observation;
  return { ...base, status: selected.status, evidence: selected.evidence, ageMinutes, freshness: "FRESH",
    reasonCode: selected.status === "UNKNOWN" ? "REPORTED_UNKNOWN" : "CURRENT_OBSERVATION" };
}

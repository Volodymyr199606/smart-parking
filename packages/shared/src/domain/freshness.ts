/**
 * Deterministic freshness classification for a piece of ParkingEvidence.
 *
 * V1 defines the type only. No classification logic is implemented in this
 * milestone — a future deterministic service can compare
 * `ParkingEvidence.observedAt` / `retrievedAt` / `expiresAt` against the
 * current time and source-specific thresholds to produce one of these
 * values. Do not fabricate or hardcode a value in the meantime; leave
 * freshness unset/UNKNOWN until a real calculation exists.
 */
export type FreshnessStatus = "FRESH" | "AGING" | "STALE" | "EXPIRED" | "UNKNOWN";

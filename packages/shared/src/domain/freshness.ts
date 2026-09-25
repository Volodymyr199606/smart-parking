/**
 * Deterministic freshness classification for a piece of ParkingEvidence.
 *
 * Parking Search Runtime V1 compares explicit observation/retrieval/expiry
 * instants against requested arrival (parking-search/availability.ts).
 * It uses FRESH, EXPIRED or UNKNOWN, without inventing source TTLs.
 * AGING/STALE remain reserved until a source supplies a reviewed policy.
 */
export type FreshnessStatus = "FRESH" | "AGING" | "STALE" | "EXPIRED" | "UNKNOWN";

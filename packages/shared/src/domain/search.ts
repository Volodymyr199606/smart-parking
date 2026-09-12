import type { GeoPoint } from "./geo";

/**
 * Minimal request contract for CANDIDATE DISCOVERY:
 *
 *   location + radius -> findParkingCandidates(...) -> ParkingCandidate[]
 *
 * Contains only the constraints that candidate discovery actually
 * enforces. See `ParkingSearchConstraints` below for the broader future
 * PARKING DECISION / LEGAL SEARCH contract (`findLegalParking`) — do not
 * pass that wider type where this one is expected; a caller-visible
 * constraint that a function silently ignores is worse than not accepting
 * it at all.
 */
export interface ParkingCandidateSearchRequest {
  readonly origin: GeoPoint;
  readonly radiusMeters: number;
}

/**
 * Parameters for a future deterministic search such as:
 *
 *   findLegalParking({ latitude, longitude, arrivalTime, departureTime, radiusMeters })
 *
 * This is a contract only — no search/ranking/legality-evaluation
 * implementation exists yet. `findLegalParking` is expected to internally
 * narrow this down to a `ParkingCandidateSearchRequest` (location + radius)
 * for candidate discovery, then apply `arrivalTime` / `departureTime` /
 * `maxWalkingDistanceMeters` / `meteredPreference` as a separate
 * rule-evaluation and filtering step once that engine exists. Kept
 * intentionally small; add a constraint only when a real service needs it.
 *
 * NOT currently consumed by `findParkingCandidates` — see
 * `ParkingCandidateSearchRequest` for that contract instead.
 */
export interface ParkingSearchConstraints {
  readonly origin: GeoPoint;
  readonly radiusMeters: number;
  /** ISO 8601. Null means "now". */
  readonly arrivalTime: string | null;
  /** ISO 8601. Null means the caller doesn't know how long they'll stay. */
  readonly departureTime: string | null;
  /** Null means no walking-distance preference. */
  readonly maxWalkingDistanceMeters: number | null;
  readonly meteredPreference: "ANY" | "METERED_ONLY" | "FREE_ONLY";
}

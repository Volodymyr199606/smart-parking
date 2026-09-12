/**
 * Deterministic Parking Candidate Service (V1).
 *
 * Retrieves parking data from injected data sources, maps each row through
 * packages/shared/src/adapters, applies an exact-radius distance filter,
 * and returns domain-level `ParkingCandidate[]`. No LLM, no ranking beyond
 * distance, no legality evaluation — purely deterministic retrieval,
 * mapping, and filtering.
 *
 * WHY DEPENDENCY INJECTION INSTEAD OF A SUPABASE CLIENT HERE:
 * packages/shared has no Supabase dependency, and this service does not
 * add one. Callers (the mobile app, a Node script, a future agent tool)
 * already have their own configured Supabase client and query logic — they
 * pass in plain fetch functions that return rows already narrowed to
 * roughly `radiusMeters` of the origin (e.g. via the existing bounding-box
 * queries in apps/mobile/src/services/parkingService.ts and
 * cityParkingService.ts). This keeps the service credential-free, callable
 * from anywhere, and avoids adding @supabase/supabase-js as a new
 * dependency of packages/shared (it is currently only a dependency of the
 * repo root and apps/mobile).
 *
 * EXAMPLE (illustrative only — NOT wired into any app in this milestone):
 *
 *   import { services } from "@smart-parking/shared";
 *   // getNearbyParkingSpots(lat, lng, radiusMeters) already exists in
 *   // apps/mobile/src/services/parkingService.ts
 *
 *   const candidates = await services.findParkingCandidates(
 *     { origin: { latitude, longitude }, radiusMeters: 2000 },
 *     {
 *       fetchNearbySpots: (origin, radiusMeters) =>
 *         getNearbyParkingSpots(origin.latitude, origin.longitude, radiusMeters),
 *     }
 *   );
 *
 * CANDIDATE DISCOVERY VS. PARKING DECISION / LEGAL SEARCH:
 * This function takes a `ParkingCandidateSearchRequest` (location + radius
 * only) — NOT the broader `ParkingSearchConstraints` domain type, which
 * also carries `arrivalTime` / `departureTime` / `maxWalkingDistanceMeters` /
 * `meteredPreference`. Those fields belong to a future higher-level
 * `findLegalParking(...)`-style service that performs rule evaluation on
 * top of candidate discovery; this function has no rule engine and would
 * silently ignore them, so it does not accept them at all. See
 * packages/shared/src/domain/search.ts for the layering.
 *
 * RADIUS COMPLETENESS:
 * Exact radius filtering is applied to fetched rows; completeness depends
 * on the upstream fetcher. This service applies an exact circular-radius
 * filter (haversine distance <= radiusMeters) to every row it receives, so
 * nothing it returns is farther than the requested radius. It does NOT
 * guarantee that every point within the radius was retrieved in the first
 * place — that depends entirely on what the injected fetcher already
 * excluded before returning. The existing mobile bounding-box helpers
 * (apps/mobile/src/services/parkingService.ts,
 * cityParkingService.ts) use a fixed `radiusMeters / 111_000` degrees
 * offset for BOTH latitude and longitude; at San Francisco's latitude
 * (~37.7°N) this under-covers the east-west extent by roughly 20% (1
 * degree of longitude there is ~88 km, not 111 km), so a small number of
 * true edge-of-radius points could already be missing from what this
 * service receives. This is a pre-existing characteristic of the mobile
 * query helpers, not something introduced or fixed here.
 */

import type {
  GeoPoint,
  ParkingCandidateSearchRequest,
  ParkingCandidate,
} from "../domain";
import type { ParkingSpotRow, NormalizedLocationRow } from "../adapters";
import {
  mapParkingSpotToCandidate,
  mapNormalizedLocationToCandidate,
} from "../adapters";
import { distanceMeters } from "./distance";

/**
 * Which conceptual data source a fetcher targets. Selection is implicit —
 * a source is queried only when its fetcher is supplied in
 * `ParkingCandidateServiceDeps`. This is not a new domain concept: fact-level
 * provenance is already carried on each returned candidate via
 * `ParkingEvidence.sourceCategory` (see packages/shared/src/domain/evidence.ts).
 */
export type ParkingDataSourceKind = "CURRENT_SPOTS" | "CITY";

/** Fetch `parking_spots`-shaped rows already narrowed to roughly `radiusMeters` of `origin`. */
export type FetchParkingSpotRows = (
  origin: GeoPoint,
  radiusMeters: number
) => Promise<ParkingSpotRow[]>;

/** Fetch `normalized_parking_locations`-shaped rows already narrowed to roughly `radiusMeters` of `origin`. */
export type FetchNormalizedLocationRows = (
  origin: GeoPoint,
  radiusMeters: number
) => Promise<NormalizedLocationRow[]>;

export interface ParkingCandidateServiceDeps {
  /**
   * Supplies CURRENT_SPOTS candidates (`parking_spots` — real
   * AVAILABLE/OCCUPIED/UNKNOWN status). Omit to skip this source.
   */
  readonly fetchNearbySpots?: FetchParkingSpotRows;
  /**
   * Supplies CITY candidates (`normalized_parking_locations` — inventory
   * only; availability is always UNKNOWN, never inferred). Omit to skip
   * this source.
   */
  readonly fetchNearbyNormalizedLocations?: FetchNormalizedLocationRows;
}

/**
 * Finds parking candidates near `request.origin`, within
 * `request.radiusMeters`, from whichever sources are supplied in `deps`.
 *
 * `request` is a `ParkingCandidateSearchRequest` — location and radius
 * only. Every field it has is enforced; there are no accepted-but-ignored
 * constraints. (The broader `ParkingSearchConstraints` domain type is not
 * accepted here — see the "CANDIDATE DISCOVERY VS..." note above.)
 *
 * Legality is always `"UNKNOWN"` on every returned candidate (see
 * packages/shared/src/adapters/parking.ts) — this service does not
 * evaluate legality. Availability is preserved exactly as the adapters
 * produce it: real status for CURRENT_SPOTS, always UNKNOWN for CITY.
 *
 * Throws if neither fetcher is supplied — a silently empty result would be
 * indistinguishable from "no parking found nearby".
 */
export async function findParkingCandidates(
  request: ParkingCandidateSearchRequest,
  deps: ParkingCandidateServiceDeps
): Promise<ParkingCandidate[]> {
  if (!deps.fetchNearbySpots && !deps.fetchNearbyNormalizedLocations) {
    throw new Error(
      "findParkingCandidates requires at least one of deps.fetchNearbySpots or deps.fetchNearbyNormalizedLocations."
    );
  }

  const { origin, radiusMeters } = request;

  const [spotRows, normalizedRows] = await Promise.all([
    deps.fetchNearbySpots ? deps.fetchNearbySpots(origin, radiusMeters) : Promise.resolve([]),
    deps.fetchNearbyNormalizedLocations
      ? deps.fetchNearbyNormalizedLocations(origin, radiusMeters)
      : Promise.resolve([]),
  ]);

  const spotCandidates = spotRows.map((row) =>
    mapParkingSpotToCandidate(
      row,
      distanceMeters(origin, { latitude: row.latitude, longitude: row.longitude })
    )
  );

  const normalizedCandidates = normalizedRows.map((row) =>
    mapNormalizedLocationToCandidate(
      row,
      distanceMeters(origin, { latitude: row.latitude, longitude: row.longitude })
    )
  );

  return [...spotCandidates, ...normalizedCandidates]
    .filter(
      (candidate) => candidate.distanceMeters !== null && candidate.distanceMeters <= radiusMeters
    )
    .sort((a, b) => (a.distanceMeters ?? 0) - (b.distanceMeters ?? 0));
}

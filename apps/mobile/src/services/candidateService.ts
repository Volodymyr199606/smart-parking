/**
 * Bridges the mobile app's existing Supabase-backed row fetchers to the
 * deterministic parking candidate service in packages/shared.
 *
 * This is the ONLY file in apps/mobile that imports @smart-parking/shared
 * as a runtime VALUE (not just a type) — isolating the one new
 * cross-package runtime dependency to a single, small file. Everything
 * else in apps/mobile continues to use its existing local types
 * (apps/mobile/src/shared.ts) unchanged, and any other file that needs a
 * shared TYPE only (parkingService.ts, cityParkingService.ts) uses
 * `import type`, which is erased at compile time and carries no Metro
 * resolution risk.
 *
 * Dependency direction: apps/mobile -> packages/shared, never the
 * reverse — packages/shared has no Supabase dependency and does not
 * import from apps/mobile.
 */
import { domain, services } from "@smart-parking/shared";
import { fetchNearbyParkingSpotRows } from "./parkingService";
import { fetchNearbyNormalizedLocationRows } from "./cityParkingService";

/** Re-exported so callers in apps/mobile don't need their own direct import from @smart-parking/shared. */
export type ParkingPreviewCandidate = domain.ParkingCandidate;

/**
 * Finds parking candidates near (latitude, longitude) using the shared
 * deterministic candidate service (`findParkingCandidates`).
 *
 * `options.sources` explicitly selects which fetcher(s) to run —
 * `packages/shared/src/services/parking.ts` already defines the source
 * vocabulary (`ParkingDataSourceKind = "CURRENT_SPOTS" | "CITY"`); this
 * function just decides, per source, which mobile fetcher to wire in:
 *
 *  - `"CURRENT_SPOTS"` -> `fetchNearbyParkingSpotRows` (parking_spots)
 *  - `"CITY"`          -> `fetchNearbyNormalizedLocationRows` (normalized_parking_locations)
 *
 * Only the requested sources are queried — e.g. `{ sources: ["CITY"] }`
 * never touches `parking_spots`. The shared `findParkingCandidates`
 * service stays generic/database-independent; this mobile orchestration
 * layer is what decides which dependencies to provide.
 */
export async function findNearbyParkingCandidates(
  latitude: number,
  longitude: number,
  radiusMeters: number,
  options: { sources: readonly services.ParkingDataSourceKind[] }
): Promise<domain.ParkingCandidate[]> {
  const origin: domain.GeoPoint = { latitude, longitude };
  const wantsCurrentSpots = options.sources.includes("CURRENT_SPOTS");
  const wantsCity = options.sources.includes("CITY");

  return services.findParkingCandidates(
    { origin, radiusMeters },
    {
      fetchNearbySpots: wantsCurrentSpots ? fetchNearbyParkingSpotRows : undefined,
      fetchNearbyNormalizedLocations: wantsCity ? fetchNearbyNormalizedLocationRows : undefined,
    }
  );
}

/**
 * Explicit CITY-provenance check for a candidate, using
 * `ParkingEvidence.sourceCategory` (packages/shared/src/domain/evidence.ts)
 * — NOT a geographic proxy like `location.city`. A geographic field must
 * not stand in for provenance: `location.city` is null/non-null based on
 * which *table* a row came from, which is incidental, not a declared
 * source category. (A `parking_spots` row whose `source` were ever
 * "DATASF"/"SFMTA" would also carry `sourceCategory: "CITY"` per
 * `categorizeSpotSource` in packages/shared/src/adapters/parking.ts — so
 * `sourceCategory` is the actually-correct signal either way, not just a
 * style preference.)
 *
 * `availability.evidence` is the field populated by both adapters today
 * (`legality.evidence` is always null — no legality engine exists yet).
 */
export function isCityProvenance(candidate: domain.ParkingCandidate): boolean {
  return candidate.availability.evidence?.sourceCategory === "CITY";
}

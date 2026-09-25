import { services } from "@smart-parking/shared";
import type { adapters, domain, ParkingReport } from "@smart-parking/shared";
import { computeBoundingBoxDegrees } from "../utils/geoBoundingBox";
import { COMMUNITY_REPORT_TTL_MS, MOBILE_SEARCH_LIMITS as LIMITS, MobileParkingSearchError } from "./parkingSearchPolicy";
import type { MobileParkingSearchRepository, ParkingSearchRows } from "./parkingSearchRepository";

const uuid = (value: unknown): value is string => typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
const status = (value: unknown): value is domain.AvailabilityStatus => ["AVAILABLE", "OCCUPIED", "UNKNOWN"].includes(value as string);
const nullableText = (value: unknown) => value === null || typeof value === "string";
function dataError(): never { throw new MobileParkingSearchError("DATA_ERROR", "Malformed or mismatched parking search data"); }
function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return dataError();
  return value as Record<string, unknown>;
}
/** Postgres timestamps may contain microseconds. Preserve conservative millisecond bounds. */
function databaseInstant(value: unknown): { floor: number; ceil: number } {
  if (typeof value !== "string") return dataError();
  const match = /^(.*T\d{2}:\d{2}:\d{2})(?:\.(\d{1,6}))?(Z|[+-]\d{2}:\d{2})$/.exec(value);
  if (!match) return dataError();
  const fraction = (match[2] ?? "").padEnd(6, "0");
  const floor = services.parseInstantMs(`${match[1]}.${fraction.slice(0, 3)}${match[3]}`);
  if (floor === null) return dataError();
  return { floor, ceil: floor + (Number(fraction.slice(3)) > 0 ? 1 : 0) };
}
function completeRows(response: ParkingSearchRows, limit: number): readonly unknown[] {
  if (!Number.isSafeInteger(response.count) || response.count < 0 || !Array.isArray(response.rows)) return dataError();
  if (response.count > limit) throw new MobileParkingSearchError("QUERY_LIMIT", "Search exceeds the complete query budget; narrow the radius or retry later");
  if (response.rows.length !== response.count) throw new MobileParkingSearchError("QUERY_LIMIT", "Database returned an incomplete search page");
  return response.rows;
}
function candidateRow(value: unknown): adapters.ParkingSpotRow {
  const r = object(value);
  if (!uuid(r.id) || typeof r.street_name !== "string" || !nullableText(r.address) || typeof r.latitude !== "number" || !Number.isFinite(r.latitude)
    || Math.abs(r.latitude) > 90 || typeof r.longitude !== "number" || !Number.isFinite(r.longitude) || Math.abs(r.longitude) > 180 || !status(r.status)
    || !["MOCK", "DATASF", "SFMTA", "USER_REPORT"].includes(r.source as string)) return dataError();
  const updated = databaseInstant(r.updated_at);
  return { id: r.id.toLowerCase(), street_name: r.street_name, address: r.address as string | null, latitude: r.latitude, longitude: r.longitude,
    status: r.status, source: r.source as adapters.ParkingSpotRow["source"], updated_at: new Date(updated.floor).toISOString() };
}
type ReportRow = Pick<ParkingReport, "id" | "parking_spot_id" | "status" | "created_at">;
function reportRow(value: unknown): { row: ReportRow; timestamp: { floor: number; ceil: number } } {
  const r = object(value);
  if (!uuid(r.id) || !uuid(r.parking_spot_id) || !status(r.status)) return dataError();
  return { row: { id: r.id.toLowerCase(), parking_spot_id: r.parking_spot_id.toLowerCase(), status: r.status, created_at: r.created_at as string },
    timestamp: databaseInstant(r.created_at) };
}

/** parking_spots has no verified FK/association to normalized locations or curb rules.
 * Matching CITY provenance is not an ID join. Reuse the existing rule interface with no asserted rules. */
export const fetchCurrentSpotRules: services.FetchRulesForCandidate = async () => [];

/** Stateless per-request facade factory. Tests inject a repository and absolute clock; no client/env imports. */
export function createMobileParkingSearch(repository: MobileParkingSearchRepository, now: () => string = () => new Date().toISOString()) {
  return async function searchNearbyParking(request: domain.ParkingSearchRequest): Promise<services.ParkingSearchResult[]> {
    services.validateParkingSearchRequest(request);
    if (request.radiusMeters < LIMITS.minRadiusMeters || request.radiusMeters > LIMITS.maxRadiusMeters
      || (request.maxResults !== undefined && request.maxResults > LIMITS.maxResults)) {
      throw new MobileParkingSearchError("UNSUPPORTED_REQUEST", "Mobile search supports 1–10000 m and at most 100 results");
    }
    const query = { ...request, origin: { ...request.origin }, maxResults: request.maxResults ?? LIMITS.maxResults };
    const asOf = services.parseInstantMs(now()), arrival = services.parseInstantMs(query.arrivalTime)!;
    if (asOf === null) throw new MobileParkingSearchError("UNSUPPORTED_REQUEST", "Invalid search clock");
    const raw = completeRows(await repository.findSpots(computeBoundingBoxDegrees(query.origin.latitude, query.origin.longitude, query.radiusMeters), LIMITS.maxCandidateRows), LIMITS.maxCandidateRows);
    const unique = new Map<string, adapters.ParkingSpotRow>();
    for (const value of raw) {
      const row = candidateRow(value), prior = unique.get(row.id);
      if (prior && JSON.stringify(prior) !== JSON.stringify(row)) return dataError();
      unique.set(row.id, row);
    }
    const rows = [...unique.values()];
    // The existing shared discovery owns exact Haversine filtering. Reports are fetched only for its surviving IDs.
    const candidates = await services.findParkingCandidates(query, { fetchNearbySpots: async () => rows });
    if (candidates.length === 0) return [];
    const ids = candidates.map(c => c.location.id).sort(), reports = new Map<string, domain.ParkingAvailability[]>();
    const from = arrival - COMMUNITY_REPORT_TTL_MS, through = Math.min(arrival, asOf);
    let reportCount = 0;
    const identities = new Map<string, string>();
    if (from <= through) for (let offset = 0; offset < ids.length; offset += LIMITS.reportIdBatchSize) {
      const batch = ids.slice(offset, offset + LIMITS.reportIdBatchSize), allowed = new Set(batch);
      // Fetch one extra permitted page even at the exact budget to prove subsequent batches are empty.
      const remaining = LIMITS.maxReportRows - reportCount;
      const response = await repository.findReports(batch, new Date(from).toISOString(), new Date(through).toISOString(), Math.max(1, remaining));
      const values = completeRows(response, remaining);
      reportCount += response.count;
      for (const value of values) {
        const { row, timestamp } = reportRow(value);
        if (!allowed.has(row.parking_spot_id)) return dataError();
        const signature = JSON.stringify(row), prior = identities.get(row.id);
        if (prior && prior !== signature) return dataError();
        if (prior) continue;
        identities.set(row.id, signature);
        // Reject clock-skew/future evidence, never clamp it into a current observation.
        if (timestamp.ceil > through) continue;
        const observation: domain.ParkingAvailability = { status: row.status, evidence: { sourceCategory: "COMMUNITY", sourceDetail: "USER_REPORT",
          externalId: row.id, observedAt: new Date(timestamp.ceil).toISOString(), retrievedAt: new Date(timestamp.ceil).toISOString(),
          expiresAt: new Date(timestamp.floor + COMMUNITY_REPORT_TTL_MS).toISOString() } };
        const group = reports.get(row.parking_spot_id) ?? []; group.push(observation); reports.set(row.parking_spot_id, group);
      }
    }
    // All DB work finishes before the shared resolver's per-candidate error isolation.
    // Infrastructure failures therefore reject this facade instead of looking like empty/unknown parking.
    return new services.ParkingSearchService({ fetchNearbySpots: async () => rows, fetchRulesForCandidate: fetchCurrentSpotRules,
      fetchAvailabilityForCandidate: async (candidate, source) => source === "CURRENT_SPOTS" ? reports.get(candidate.location.id) ?? [] : [],
    }).searchParking(query);
  };
}

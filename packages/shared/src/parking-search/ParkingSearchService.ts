import type { GeoPoint, ParkingEvidence, ParkingRequestedInterval, ParkingSearchRequest } from "../domain";
import { findAndEvaluateParkingCandidates } from "../services/orchestration";
import { evaluateScheduleApplicability } from "../services/scheduleApplicability";
import { evaluateLegalConclusionReadiness } from "../services/regulationCoverage";
import { parseInstantMs } from "../services/isoInstant";
import { compareText, evidenceKey, resolveParkingAvailability } from "./availability";
import { compareParkingSearchResults, rankParkingResult } from "./ranking";
import type { ParkingSearchResult, ParkingSearchServiceDeps } from "./contracts";
import type { ParkingDataSourceKind } from "../services/parking";

export class ParkingSearchValidationError extends Error {
  readonly code = "INVALID_PARKING_SEARCH_REQUEST";
  constructor(readonly field: string) { super(`Invalid parking search field: ${field}`); this.name = "ParkingSearchValidationError"; }
}
function validPoint(p: GeoPoint): boolean {
  return !!p && Number.isFinite(p.latitude) && Math.abs(p.latitude) <= 90 && Number.isFinite(p.longitude) && Math.abs(p.longitude) <= 180;
}
export function validateParkingSearchRequest(request: ParkingSearchRequest): ParkingRequestedInterval {
  if (!request || typeof request !== "object") throw new ParkingSearchValidationError("request");
  if (!validPoint(request.origin)) throw new ParkingSearchValidationError("origin");
  if (!Number.isFinite(request.radiusMeters) || request.radiusMeters <= 0) throw new ParkingSearchValidationError("radiusMeters");
  const arrival = parseInstantMs(request.arrivalTime);
  if (arrival === null) throw new ParkingSearchValidationError("arrivalTime");
  const durationMs = request.durationMinutes * 60_000;
  if (typeof request.durationMinutes !== "number" || !Number.isSafeInteger(durationMs) || durationMs <= 0
    || !Number.isSafeInteger(arrival + durationMs) || Math.abs(arrival + durationMs) > 8.64e15) throw new ParkingSearchValidationError("durationMinutes");
  const departure = new Date(arrival + durationMs).toISOString();
  if (parseInstantMs(departure) !== arrival + durationMs) throw new ParkingSearchValidationError("durationMinutes");
  if (request.maxResults !== undefined && (!Number.isSafeInteger(request.maxResults) || request.maxResults <= 0)) throw new ParkingSearchValidationError("maxResults");
  if (request.requireLegal !== undefined && typeof request.requireLegal !== "boolean") throw new ParkingSearchValidationError("requireLegal");
  return { arrival: request.arrivalTime, departure };
}

/** Duplicate identical rows collapse. Conflicting identities fail rather than choosing a provider-order winner. */
function uniqueRows<T extends { readonly id: string; readonly latitude: number; readonly longitude: number }>(rows: T[]): T[] {
  const unique = new Map<string, T>();
  const stable = (row: T) => JSON.stringify(Object.keys(row).sort().map(key => [key, row[key as keyof T]]));
  for (const row of rows) {
    if (!row.id || !validPoint(row)) throw new Error("Invalid parking candidate provider row");
    const prior = unique.get(row.id);
    if (prior && stable(prior) !== stable(row)) throw new Error("Conflicting parking candidate provider identity");
    unique.set(row.id, row);
  }
  return [...unique.values()].sort((a, b) => compareText(a.id, b.id));
}

/** Credential-free orchestration. All data access is supplied by the caller. */
export class ParkingSearchService {
  constructor(private readonly deps: ParkingSearchServiceDeps) {}

  async searchParking(request: ParkingSearchRequest): Promise<ParkingSearchResult[]> {
    const interval = validateParkingSearchRequest(request);
    // Snapshot request scalars before awaiting providers; never mutate caller inputs.
    const candidateSearch = { origin: { ...request.origin }, radiusMeters: request.radiusMeters };
    const { requireLegal = false, maxResults } = request;
    if (!this.deps.fetchNearbySpots && !this.deps.fetchNearbyNormalizedLocations) throw new Error("Parking search requires a candidate fetcher");
    const sources: ParkingDataSourceKind[] = [];
    if (this.deps.fetchNearbySpots) sources.push("CURRENT_SPOTS");
    if (this.deps.fetchNearbyNormalizedLocations) sources.push("CITY");
    const groups = await Promise.all(sources.map(async sourceType => {
      const evaluated = await findAndEvaluateParkingCandidates({ candidateSearch, interval, coverageDeclaration: this.deps.coverageDeclaration }, {
        fetchNearbySpots: sourceType === "CURRENT_SPOTS" ? async (o, r) => uniqueRows(await this.deps.fetchNearbySpots!(o, r)) : undefined,
        fetchNearbyNormalizedLocations: sourceType === "CITY" ? async (o, r) => uniqueRows(await this.deps.fetchNearbyNormalizedLocations!(o, r)) : undefined,
        fetchRulesForCandidate: async candidate => [...await this.deps.fetchRulesForCandidate(candidate)].sort((a, b) => compareText(a.id, b.id)),
        maxConcurrentRuleLookups: this.deps.maxConcurrentRuleLookups,
      });
      const results: ParkingSearchResult[] = [];
      // Sequential availability lookups avoid introducing an unbounded second fanout.
      for (const { candidate, rules, legality } of evaluated) {
        if (requireLegal && legality.status !== "LEGAL") continue;
        let availability = resolveParkingAvailability([candidate.availability], interval.arrival);
        if (this.deps.fetchAvailabilityForCandidate) {
          try { availability = resolveParkingAvailability([candidate.availability,
            ...await this.deps.fetchAvailabilityForCandidate(candidate, sourceType)], interval.arrival); }
          catch { availability = { ...resolveParkingAvailability([], interval.arrival), reasonCode: "LOOKUP_FAILED" }; }
        }
        const restrictions = rules.map(rule => ({ rule, applicability: evaluateScheduleApplicability(rule.schedule, interval) }));
        const caps = restrictions.flatMap(({ rule, applicability }) => rule.kind === "TIME_LIMIT" && applicability.status === "APPLIES"
          && typeof rule.schedule?.maxDurationMinutes === "number" && Number.isFinite(rule.schedule.maxDurationMinutes)
          && rule.schedule.maxDurationMinutes > 0 ? [rule.schedule.maxDurationMinutes] : []);
        const coverage = evaluateLegalConclusionReadiness({ candidate, rules, coverageDeclaration: this.deps.coverageDeclaration });
        const evidence = [candidate.availability.evidence, candidate.legality.evidence, legality.evidence,
          ...rules.map(r => r.evidence), ...availability.observations.map(o => o.evidence)].filter((e): e is ParkingEvidence => e !== null);
        const provenance = [...new Map(evidence.map(e => [evidenceKey(e), e])).entries()].sort(([a], [b]) => compareText(a, b)).map(([, e]) => e);
        const candidateId = `${sourceType}:${candidate.location.id}`, distanceMeters = candidate.distanceMeters!;
        results.push({ candidateId, sourceType, location: candidate.location, distanceMeters,
          legality: { ...legality, coverage, restrictions, maxStayMinutes: caps.length ? Math.min(...caps) : null }, availability, provenance,
          ...rankParkingResult(candidateId, distanceMeters, legality.status, availability) });
      }
      return results;
    }));
    const results = groups.flat().sort(compareParkingSearchResults);
    return maxResults === undefined ? results : results.slice(0, maxResults);
  }
}

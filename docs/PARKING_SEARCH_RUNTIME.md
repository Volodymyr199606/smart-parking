# Parking Search Runtime V1

The shared core is implemented and offline-tested. Mobile/UI wiring is deferred. No AWS, Supabase or DataSF connection is needed by this service. CITY coverage remains INCOMPLETE. Artifact storage, curb publication, ingestion, migrations and native maps are unchanged.

## API and contracts

```ts
import { services } from "@smart-parking/shared";
import type { domain } from "@smart-parking/shared";

const service = new services.ParkingSearchService({
  fetchNearbySpots,             // existing ParkingSpotRow[] fetcher
  fetchRulesForCandidate,        // existing candidate -> ParkingRule[] lookup
  fetchAvailabilityForCandidate, // optional candidate + sourceType -> ParkingAvailability[]
});
const request: domain.ParkingSearchRequest = {
  origin: { latitude: 37.77, longitude: -122.42 },
  arrivalTime: "2026-09-24T17:00:00.000Z",
  durationMinutes: 60,
  radiusMeters: 1000,
  maxResults: 20,
  requireLegal: false,
};
const results: services.ParkingSearchResult[] = await service.searchParking(request);
```

Implementation: `packages/shared/src/parking-search/`. Request extends the existing candidate-search contract. `origin`, explicit ISO arrival, positive duration minutes and positive radius are required. `maxResults` is an optional positive integer; omitted means all matches. `requireLegal` defaults to false; true retains **only LEGAL**, excluding both UNKNOWN and ILLEGAL. No implicit clock, prediction, payment preference or unsupported filter is accepted as part of this contract. The older `ParkingSearchConstraints` remains a separate unimplemented planning contract for compatibility.

`ParkingSearchResult` contains:

| Field | Contract |
|---|---|
| `candidateId`, `sourceType` | Namespaced stable ID and existing `CURRENT_SPOTS` / `CITY` discovery source |
| `location` | Existing `ParkingLocation`, preserving its original ID and `point: GeoPoint` |
| `distanceMeters` | Unrounded Haversine distance |
| `legality` | Existing `ParkingLegality` (status, reasonCode, reason, evidence), coverage result, maxStayMinutes and each rule with schedule applicability |
| `availability` | Existing status/evidence plus freshness, evaluatedAt, ageMinutes, reasonCode and original observations |
| `provenance` | Deduplicated, deterministically ordered existing `ParkingEvidence` references |
| `rank`, `rankingReasons` | Serializable comparison tuple and machine-readable reason codes |

No UI formatting is added. Existing legality explanations remain available alongside their reason codes. Restrictions include APPLIES, DOES_NOT_APPLY and UNKNOWN results rather than silently discarding unresolved restrictions.

## Discovery and legality

The service reuses `findAndEvaluateParkingCandidates`, which composes existing row adapters, `findParkingCandidates`, `distanceMeters` and `evaluateParkingLegalConclusion`. Rule applicability and coverage use the existing `evaluateScheduleApplicability` and `evaluateLegalConclusionReadiness`. Rule IDs are sorted before evaluation for stable ordering. There is no duplicate schedule parser or legality engine.

Discovery uses only supplied fetchers. V1 can operate solely on `parking_spots`; the optional existing normalized-location fetcher is also supported. Nothing queries citywide curb storage. Each source is evaluated separately so `CURRENT_SPOTS:<id>` and `CITY:<id>` remain distinct even when source IDs collide. Identical repeated rows collapse before rule lookups; conflicting rows with the same ID or invalid coordinates produce explicit provider errors. Coordinates alone never prove that two records describe one physical space.

The existing exact circular filter runs before rule lookup and includes the radius boundary. Completeness still depends on the provider: the current mobile bounding-box helper uses the same degree offset for latitude and longitude and under-covers east/west in San Francisco. This core does not claim to recover candidates omitted by that query. Rule lookups retain the existing concurrency limit per discovery source; optional availability lookups run sequentially within each source.

Arrival plus duration produces the existing explicit arrival/departure interval. Known applicable violations remain ILLEGAL regardless of availability or incomplete coverage. Otherwise unresolved rules/coverage yield UNKNOWN. LEGAL still requires the existing complete synthetic/MOCK-only gate; a CITY/COMMUNITY source cannot become READY. `coverageDeclaration: "COMPLETE"` is a dependency option only for fixtures, never a user request flag; live adapters must omit it.

`maxStayMinutes` is the smallest finite positive TIME_LIMIT cap whose schedule APPLIES to the requested interval, or null. It is a known applicable restriction, **not a guaranteed lawful duration** across unknown rules or future schedule transitions. Exceeding it is evaluated by the existing legality engine. Missing, inactive or unresolved limits do not invent a maximum; parsed windows may supply a cap while legality remains UNKNOWN.

## Availability and conflicts

There was no implemented source TTL/freshness resolver to reuse. This core uses the existing `ParkingAvailability`, `ParkingEvidence` and `FreshnessStatus` types with a deliberately explicit policy:

1. Evaluate against requested arrival, never `Date.now()`. An observation needs a valid observedAt and retrievedAt, both at/before arrival, with retrieval not preceding observation. CITY evidence is inventory/regulation provenance and cannot supply occupancy.
2. Among valid COMMUNITY/MOCK observations, newest observedAt wins. At equal observation time COMMUNITY takes priority over MOCK. Within that equal-time/equal-source group, conflicting statuses become UNKNOWN.
3. Evidence needs a valid explicit expiry after observation. Arrival at or after expiry yields UNKNOWN/EXPIRED; missing expiry yields UNKNOWN/EXPIRY_UNKNOWN. No arbitrary TTL is invented. An expired or unbounded latest observation never resurrects older availability.
4. Malformed/future evidence is rejected as a signal but retained in `observations`. A current explicit UNKNOWN report supersedes older known status. Tied observations with any expired/missing expiry fail conservatively even when their statuses agree.
5. Current selected evidence is FRESH. AGING/STALE are not fabricated without a source policy. These are observations valid under their supplied expiry at arrival, not a forecast or reservation.

`parking_spots.updated_at` alone has no separate observation or expiry. The existing adapter's snapshot is preserved as provenance, but this service returns UNKNOWN unless independently valid observations are supplied. A provider maps `ParkingReport.created_at`/`status`/`id` into existing evidence/status fields and supplies an expiry from an explicitly reviewed application policy. It must scope reports by both source type and original candidate identity; never attach another spot's reports. `ParkingReport` already exists in shared types, so no duplicate report schema is introduced.

All original observations are retained in stable order. `availability.evidence` identifies the chosen observation, or is null when no single known signal is accepted. Availability lookup failure yields UNKNOWN/LOOKUP_FAILED and does not alter legality. No sensor or live city occupancy claim is made.

## Ranking and failure behavior

Ascending lexicographic tuple:

```text
[legalityPriority, availabilityPriority, evidenceQuality, evidenceAgeMinutes, distanceMeters, candidateId]
```

- Legality: LEGAL=0, UNKNOWN=1, ILLEGAL=2.
- Availability: AVAILABLE=0, UNKNOWN=1, OCCUPIED=2.
- Accepted fresh evidence: COMMUNITY=0, MOCK=1, otherwise 2. Unknown availability receives no evidence-quality/recency boost.
- Smaller evidence age wins; null sorts last. Then shorter exact distance wins, then code-unit candidate-ID order (not locale-dependent).

Thus LEGAL+AVAILABLE at 200 m outranks LEGAL+UNKNOWN at 100 m, and LEGAL+UNKNOWN outranks ILLEGAL+AVAILABLE. Reasons are `LEGAL_CONFIRMED`, `LEGALITY_UNKNOWN`, `ILLEGAL_KNOWN`, `AVAILABLE_RECENT_REPORT`, `OCCUPIED_RECENT_REPORT`, `AVAILABILITY_UNKNOWN`, `COMMUNITY_EVIDENCE`, `MOCK_EVIDENCE`, `FRESH_EVIDENCE` and `DISTANCE_TIEBREAKER`. They name the criteria used, not a fabricated confidence percentage. Limiting happens after filtering/ranking.

Malformed requests throw `ParkingSearchValidationError` with code `INVALID_PARKING_SEARCH_REQUEST` and a field name before any provider call. Coordinates must be finite/in range; duration must be positive and representable in whole milliseconds; arrival/departure must satisfy the existing strict ISO parser; radius must be finite/positive; maxResults must be a positive safe integer; requireLegal must be boolean.

No candidates or no results surviving requireLegal returns `[]`. Unknown availability alone never excludes a candidate. Missing discovery configuration and discovery failures throw. Rule lookup failures retain existing orchestration behavior: empty rules and UNKNOWN, not a false LEGAL conclusion. Provider data/errors remain separate from malformed-request validation.

Example projection from the tested synthetic LEGAL/UNKNOWN fixture (the complete result also contains location, restrictions, coverage, observations and provenance):

```json
{
  "candidateId": "CURRENT_SPOTS:legal-unknown",
  "sourceType": "CURRENT_SPOTS",
  "distanceMeters": 100.00000000025108,
  "legality": { "status": "LEGAL", "maxStayMinutes": 120, "reasonCode": null },
  "availability": { "status": "UNKNOWN", "freshness": "UNKNOWN", "evidence": null },
  "rank": [0, 1, 2, null, 100.00000000025108, "CURRENT_SPOTS:legal-unknown"],
  "rankingReasons": ["LEGAL_CONFIRMED", "AVAILABILITY_UNKNOWN", "DISTANCE_TIEBREAKER"]
}
```

## Mobile and future tool boundary

Mobile currently reads spots through `parkingService.getNearbyParkingSpots` / `getParkingSpots`, receives updates via `useRealtimeSpots`, and has a separately gated normalized-city preview through `candidateService.findNearbyParkingCandidates`. `candidateService.findAndEvaluateNearbyParkingCandidates` already wraps the shared legality orchestration but is not the ranked search UI.

Next add a thin mobile search adapter supplying `fetchNearbyParkingSpotRows`, the existing candidate rule lookup and a scoped report-evidence fetcher. Review the report expiry policy and correct/verify bounding-box completeness there. Keep source selection explicit and map normalized IDs through the correct existing rule association path. Do not assume every CITY-category `parking_spots` row is a normalized-location ID.

Later MapScreen/list code can delegate candidate distance, interval legality, legal-only filtering and ordering to this service; UI text, favorites, amenity filters, loading/error states and realtime-triggered refresh remain app concerns. No screen, hook, native map or mobile service changes are part of this task.

A future agent/tool should validate a structured request and call this same `searchParking(request)` boundary through approved providers. It must not query Supabase directly or override legality, availability or rank. No AI/LLM/agent/MCP code is added.

## Offline verification

`pnpm.cmd verify:parking-search` covers 42 checks, including all five legality/availability combinations, radius boundaries, exceeded limits, expiry/conflicts, ranking quality/recency/ties, duplicates, CITY coverage, provider failures, 17 malformed requests, serialization, input immutability and independence from wall clock/provider order. Networking is blocked in that test process.

Run `pnpm.cmd typecheck`, plus existing `verify:legality-engine`, `verify:orchestration`, `verify:schedule-parser`, `verify:schedule-applicability`, `verify:regulation-coverage` and `verify:legal-conclusion`. These use offline fixtures. No production database, AWS or DataSF access is needed.

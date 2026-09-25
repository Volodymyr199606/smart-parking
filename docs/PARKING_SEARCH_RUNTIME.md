# Parking Search Runtime V1

The shared core, Mobile Parking Search Adapter V1 and Mobile Parking Search UI V1 are implemented and offline-tested. The authenticated mobile landing route now displays ranked runtime results. The mobile facade uses the existing authenticated Supabase client when called by the app; automated verification injects mocks and makes no Supabase, AWS or DataSF calls. CITY coverage remains INCOMPLETE. Artifact storage, curb publication, ingestion, migrations and native maps are unchanged.

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

The existing exact circular filter runs before rule lookup and includes the radius boundary. Completeness still depends on the provider. The new mobile search adapter uses a conservative spherical bounding box and exact-count checks described below; legacy list helpers still have their own row limits. Rule lookups retain the existing concurrency limit per discovery source; optional availability lookups run sequentially within each source.

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

The authenticated `Map` route renders `ParkingSearchScreen`, which calls `searchNearbyParking` through `useParkingSearch`. The legacy `MapScreen` remains in the repository with its older raw-spot helpers and separately gated normalized-city preview, but is no longer this route's screen. `candidateService.findAndEvaluateNearbyParkingCandidates` remains a separate shared-legality wrapper.

The mobile adapter described below now supplies complete bounded spot discovery and scoped report evidence. It deliberately does not call the normalized-location rule lookup with `parking_spots` IDs. There is no verified association between those identities. Future normalized-location support must select that source explicitly and use its own existing association path.

The new list delegates distance, interval legality, legal-only filtering and ordering to the existing runtime. It has no frontend available-only filter, distance sort, favorites filter or amenity filter. Directions, reporting and selection are retained through small UI helpers; native-map integration remains a separate milestone.

## Mobile Parking Search Adapter V1

Public app API:

```ts
import { searchNearbyParking } from "../services/parkingSearch";
const results = await searchNearbyParking({
  origin: { latitude: 37.77, longitude: -122.42 },
  arrivalTime: "2026-09-24T17:00:00.000Z",
  durationMinutes: 60,
  radiusMeters: 1000,
  maxResults: 20,
  requireLegal: false,
});
```

`parkingSearch.ts` binds `createMobileParkingSearch` to `createParkingSearchRepository(supabase)`, using the existing singleton/auth session. No second client is created. The provider factory and query repository import no client/environment module and accept injected dependencies for offline tests. `ParkingSearchService` itself is unchanged. The shared strict instant parser is now exported for consistent adapter timestamp validation.

The data path is bounded box SELECT -> row validation/deduplication -> shared exact-radius discovery -> batched report SELECTs -> shared search/ranking. Report/database work is completed before the core's per-candidate failure isolation, so infrastructure errors reject the facade instead of becoming ordinary UNKNOWN availability. No citywide curb storage or unscoped report collection is fetched.

### Bounding-box completeness and budgets

`computeBoundingBoxDegrees` now uses the same sphere as shared Haversine, radius R=6,371,000 m. For angular radius δ=(requested meters + 1 m)/R and latitude φ, latitude bounds are φ±δ, clipped at the poles. Without a pole crossing, longitude half-width is asin(sin(δ)/cos(φ)). These are the spherical-cap extrema, so every point within the shared Haversine radius lies inside the box. The one-meter margin absorbs numerical boundary error. Exact-radius filtering remains authoritative and rejects box corners.

A pole/antimeridian crossing uses the entire [-180,180] longitude range. This intentionally broadens a single SQL box rather than generating incorrect wrapped inequalities. Broad queries may hit the explicit row budget; they fail rather than report incomplete nearest results. The old 111,320 meters/degree approximation could exclude boundary points and has been replaced in the existing helper, also correcting its legacy callers without changing their UI or query limits.

Constants in `parkingSearchPolicy.ts`:

| Bound | V1 value/behavior |
|---|---|
| Search radius | 1–10,000 m; requests outside this range reject before queries |
| Complete box candidates | At most 500 rows |
| Reports | At most 2,000 rows total across all batches |
| Report IDs per query | At most 50, limiting query URL size |
| Final results | Default/cap 100; caller may request fewer |

Each SELECT requests an exact count, an explicit range, stable ID order and only needed columns. A count above budget, missing count or row/count mismatch fails explicitly. In particular, a lower server response cap cannot silently truncate candidates or reports. This V1 fails incomplete pages rather than implementing pagination. A final-results limit applies only after complete bounded discovery and shared ranking.

### Report identity, expiry and visibility

Migration 00001 defines `parking_reports.parking_spot_id` as a UUID FK directly to `parking_spots.id`. The provider queries only the IDs surviving shared exact-radius discovery and validates every returned FK against its batch. A missing/wrong FK or conflicting duplicate identity is a DATA_ERROR, never a cross-candidate attachment. Identical candidate/report duplicates collapse. Candidate coordinates, statuses, provenance fields and timestamps are validated before existing shared row adapters are used.

No prior report TTL exists. V1 explicitly selects **five minutes for AVAILABLE, OCCUPIED and UNKNOWN reports**, isolated as `COMMUNITY_REPORT_TTL_MS`. Reports are manual status observations: the schema has creation time but no reservation, departure time, sensor confirmation or validity interval. A short, symmetric lifetime limits stale occupancy claims and avoids interpreting OCCUPIED as a durable reservation or extending availability more optimistically. Five minutes is an initial product policy, not an empirically proven parking turnover estimate; review it with field evidence before tuning. No UI code supplies a hidden expiry.

`created_at` is used as the server-recorded observation/capture time; expiry is creation plus TTL. PostgreSQL microseconds are accepted: observation/capture rounds upward to milliseconds and expiry rounds downward, so normalization never extends validity. Explicit UTC/offset timestamps use the shared strict parser. Impossible/malformed timestamps are data errors. Future reports relative to either requested arrival or the once-per-search clock are rejected as signals rather than clamped. Rejected future evidence cannot assert occupancy.

Report queries use `created_at >= arrival - TTL` and `created_at <= min(arrival, search clock)`. If that interval is empty, there can be no current observations and no report query is needed. With one equal TTL for all statuses, a report older than this horizon cannot remain current or need to supersede a newer current report. The shared resolver handles inclusive observation time, exclusive expiry, newest-observation selection, equal-priority conflicts and UNKNOWN. Adapters do not reproduce ranking or conflict resolution. Bare `parking_spots.status` remains insufficient without report evidence.

**Visibility limitation:** the checked-in report SELECT policy allows users to see their own reports (`auth.uid() = user_id`). This task does not change RLS or use a service key. Counts and observations are complete only for rows visible to the current session. An authenticated app cannot claim a complete community-wide feed; an unauthenticated/no-visible-report result remains UNKNOWN. Broader report access would need a separately reviewed product/security change.

### Rules, errors, races and realtime

V1 discovers only CURRENT_SPOTS. `fetchCurrentSpotRules` satisfies the existing `FetchRulesForCandidate` interface and returns `[]`: there is no verified spot-to-normalized-location/curb-regulation association. CITY provenance on a spot does not establish that association. Existing normalized-city rule fetchers remain available for their correct ID domain but are not invoked here. Live legality is therefore UNKNOWN and `requireLegal: true` returns `[]`; CITY remains INCOMPLETE.

Error behavior is explicit: `[]` means a successful query with no matches; `DATABASE_ERROR` means a failed request; `DATA_ERROR` means malformed/mismatched rows or missing exact count; `QUERY_LIMIT` means overflow/incomplete pages; `UNSUPPORTED_REQUEST` means mobile bounds/clock configuration. Existing shared request-validation errors remain intact. The repository does not expose raw server error details. These failures must be shown as errors, not “no parking available.”

The facade has no shared result state or cross-request cache; each call owns its candidate/report maps. The UI controller described below provides generation protection for successes, failures and scheduled refreshes. A late A cannot overwrite completed B, and prior results are cleared when a new search starts.

Existing `useRealtimeSpots` listens to spot INSERT/UPDATE/DELETE events. The new screen retains that subscription and debounces events into facade refreshes. There was no report subscription to preserve; report realtime is deferred pending publication/permission review. A future report event must likewise invalidate the search, never set a competing availability value. Successful local reports and evidence expiry already refresh through the facade.

### Adapter verification

`pnpm.cmd verify:mobile-parking-search` injects a fake Supabase query builder, exercises the real repository/provider/shared-service path, blocks network entry points and verifies that the Supabase singleton was never imported. Boundary tests cover 15,120 spherical destination points at SF/equatorial/high/polar latitudes, small through maximum supported radii, cardinal/diagonal/intermediate bearings, negative longitudes and both antimeridian directions. Additional cases cover query scoping, empty results, stale/future/malformed/conflicting reports, microsecond timestamps, FK safety, DB failures, duplicate rows, server caps, global report budgets, coverage, requireLegal and deterministic replay.

A future agent/tool should validate a structured request and call this same `searchParking(request)` boundary through approved providers. It must not query Supabase directly or override legality, availability or rank. No AI/LLM/agent/MCP code is added.

## Mobile Parking Search UI V1

### Request and lifecycle flow

`ParkingSearchScreen` is a thin list screen on the existing authenticated `Map` route. `useParkingSearchLocation` reuses Expo Location foreground permission and balanced-accuracy location. Loading, denied permission and location failure are distinct states with retry. There is no fallback coordinate, demo origin or unbounded all-spots query. Profile and Settings remain accessible while location/search is pending.

Once a valid origin is available and the screen is focused in the foreground, `useParkingSearch` runs the existing `searchNearbyParking` facade. Controls use arrival **now**, duration presets **30/60/120/240 minutes** (default 60), radius presets **250/500/1000/2000 meters** (default 500), and optional **Verified legal only** (default off), mapped directly to `requireLegal`. Requests use `maxResults: 100`. Arrival is captured anew for each request. Control changes and spot realtime bursts debounce for 250 ms; pull-to-refresh and explicit retry run immediately.

`parkingSearchController.ts` owns loading/error/results and one scheduled timer. Each input change or refresh advances a generation. Success, failure and timer callbacks must still match it; late requests cannot overwrite newer state. Blur, background, session identity changes and unmount invalidate prior work and clear scheduled timers. Returning to the foreground starts a fresh search. The facade has no abort-signal contract, so in-flight transport may finish but its obsolete result is ignored. Previous cards are cleared during loading and errors rather than presented as current evidence.

### Cards and actions

`ParkingSearchControls`, `ParkingSearchResultCard` and `parkingSearchViewModel` keep presentation outside the screen/controller. The list renders the returned array in runtime order without sorting or filtering. Selection stores only `candidateId` and derives the selected result from that array; refresh or a missing result clears selection. Cards show distance, known applicable time limit and relevant restriction summaries without exposing raw rank numbers. A known limit does not imply that all parking rules were verified.

Legality labels are **Parking allowed**, **Parking not allowed for this stay**, and **Parking rules not fully verified**. Availability labels are **Recently reported available**, **Recently reported occupied**, and **Availability unknown**. Text carries the distinction independently of color. The screen explicitly says current availability reflects the user's own recent reports, not a community-wide feed. Most live legality remains UNKNOWN because the adapter has no verified rule association; CITY remains INCOMPLETE.

Fresh availability uses the runtime's `ageMinutes`, labeled **Report age at search** so it cannot masquerade as a continuously updated clock. UNKNOWN does not display a fresh occupancy claim. Successful empty searches distinguish radius-based no candidates from no verified legal results. Provider failures show sanitized messages and retry, including a smaller-radius suggestion for query-budget overflow. Development logging exposes an error code only, not raw Supabase messages or stack traces.

Directions reuse the existing Apple Maps/Google Maps behavior, extracted into `parkingDirections.ts` and called with the result's coordinates. AVAILABLE/OCCUPIED actions reuse `reportParkingSpot` with the original current-spot ID. Successful reporting refreshes the same search facade; it never optimistically patches independent card availability. Report failures stay visible. Controls/cards expose accessible labels and selected/expanded state; buttons expose disabled/busy state and retain at least 48-pixel control targets (52 for `AppButton`).

### Evidence expiry and future boundaries

The controller schedules one refresh at the earliest future expiry in the runtime's observations. At expiry it clears the old cards and requests a new runtime evaluation. It does not calculate a replacement availability status or introduce a UI TTL. If a known observation expires while its request is still pending, that response is rejected with a retryable error instead of displayed as current. There is no aggressive polling; lifecycle cleanup cancels the timer and foreground return refreshes even without realtime events.

Broader community availability requires a separately reviewed report-visibility/RLS and privacy design, with verified publication/subscription behavior before adding report realtime. UI wording alone cannot provide that data access. Native maps remain deferred: a later map can consume these same result coordinates, identities and runtime ordering without a second discovery or availability path. This milestone changes no native-map implementation, EAS configuration, migration, publication or ingestion infrastructure.

### UI verification scope

`pnpm.cmd verify:parking-search-ui` runs 32 offline controller/view-model/helper checks using injected search, location, directions, report and timer dependencies. Cases include request inputs, loading, permission denial, location failure/retry, both empty states, sanitized errors/retry, late success and late failure races, exact result-order preservation, all legality/availability labels, freshness/time limits, direction coordinates, report refresh, expiry, expired in-flight evidence, lifecycle cleanup, debounce and realtime coalescing. Network entry points are blocked and the test rejects loading a Supabase client/environment module.

Typecheck, the 42 shared runtime checks, 38 mobile adapter checks (including 15,120 bounding-box points), and 7 regulation-association checks pass alongside this suite. These tests exercise state and presentation models, not a React Native renderer or device. Visual layout, screen-reader behavior and external directions-app launch still need a device smoke test using an approved development setup.

## Offline verification

`pnpm.cmd verify:parking-search` covers 42 checks, including all five legality/availability combinations, radius boundaries, exceeded limits, expiry/conflicts, ranking quality/recency/ties, duplicates, CITY coverage, provider failures, 17 malformed requests, serialization, input immutability and independence from wall clock/provider order. Networking is blocked in that test process.

Run `pnpm.cmd typecheck`, plus existing `verify:legality-engine`, `verify:orchestration`, `verify:schedule-parser`, `verify:schedule-applicability`, `verify:regulation-coverage` and `verify:legal-conclusion`. These use offline fixtures. No production database, AWS or DataSF access is needed.

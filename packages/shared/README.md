# @smart-parking/shared

Shared TypeScript types, constants, and utility functions intended for the monorepo.

> **Current consumption status:**
>
> - **`apps/mobile`** — imports the `domain`/`adapters`/`services` namespaces from `@smart-parking/shared` as a normal pnpm workspace dependency (added to `apps/mobile/package.json`). `apps/mobile/src/services/candidateService.ts` is the only file that imports it as a runtime **value** (`services.findParkingCandidates`); every other mobile file that needs a shared type uses `import type`, which Metro never has to resolve. Metro's `unstable_enablePackageExports` is disabled in `apps/mobile/metro.config.js` (for unrelated CJS-package reasons), so resolution falls back to this package's `"main"` field — confirmed working via `npx expo export --platform android`, whose bundle sourcemap includes `packages/shared/src/index.ts`, `adapters/parking.ts`, `services/parking.ts`, and `services/distance.ts` as real bundled modules. The **legacy exports** at the bottom of `src/index.ts` (`ParkingSpot`, `ParkingStatus`, etc.) are still **not** used by mobile — it keeps its own inlined copy at `apps/mobile/src/shared.ts` for those, and the two have drifted (mobile adds `FavoriteParkingSpot`, `NormalizedParkingLocation`, `CityParkingQueryResult`). Only `domain`/`adapters`/`services` are consumed at runtime.
> - **`apps/web`** — does **not** import from `@smart-parking/shared`. The website is self-contained.
>
> This package typechecks (`pnpm typecheck:shared`) and is part of the monorepo workspace. Its `domain`/`adapters`/`services` namespaces are consumed at runtime by `apps/mobile` (see above); the legacy top-level exports are not consumed by any app. Consolidating those remaining legacy types (and revisiting the Expo Go import constraint they were originally added to work around) is deferred to a future refactor.

## Domain model (V1)

`src/domain/` holds a framework-independent, **storage-independent** parking domain model: `ParkingLocation`, `ParkingLegality`, `ParkingAvailability`, `ParkingEvidence`, `ParkingCandidate`, `ParkingCandidateSearchRequest`, `ParkingSearchConstraints`. It has no React, Supabase, LLM, or database-row dependencies of any kind. See `src/domain/index.ts` and `docs/ARCHITECTURE.md` §13 for details and status.

Two search-request types exist at different layers — do not mix them up:
- `ParkingCandidateSearchRequest` (location + radius only) — what `findParkingCandidates` actually accepts and enforces.
- `ParkingSearchConstraints` (adds arrival/departure/walking-distance/metered preference) — reserved for a future `findLegalParking`-style service once a rule-evaluation engine exists; not accepted by `findParkingCandidates` today.

`src/adapters/` holds the pure mapping functions from `parking_spots` / `normalized_parking_locations` rows to `ParkingCandidate`. This is the only part of the package allowed to know about storage-shaped (snake_case) row types. Dependencies point one way only: `adapters` → `domain`. The domain model never imports from `adapters`.

Import each as a namespace to keep the boundary visible at call sites:

```typescript
import { domain, adapters } from "@smart-parking/shared";

const candidate: domain.ParkingCandidate = adapters.mapParkingSpotToCandidate(spotRow);
```

`src/domain/` and `src/adapters/` are imported by `apps/mobile` (see "Current consumption status" above via `import type`, plus real value usage inside `apps/mobile/src/services/candidateService.ts`). Neither is imported by `apps/web`.

## Regulation model (V1)

`src/domain/rule.ts` adds `ParkingRule`, `ParkingRuleKind` (`"METERED" | "TIME_LIMIT" | "OTHER"`), `ParkingRuleSchedule`, `ParkingTimeWindow`, and `DayOfWeek` — a deterministic representation of a known regulation ("this block is metered", "2-hour limit"). A `ParkingRule` describes what applies; it never decides whether a specific arrival/departure is legal — there is no `isLegal`/`evaluateLegality`/`isRuleActive`/`isWithinSchedule` function anywhere in this package. `ParkingRuleSchedule` fields (`daysOfWeek`, `timeWindow`, `allDay`, `maxDurationMinutes`, `timezone`) are all independently nullable — `null` means unknown, never "every day"/"all the time". Provenance reuses `ParkingEvidence`; no separate rule-provenance type was introduced.

`src/adapters/regulation.ts` adds `mapCityRegulationRowToParkingRules(row: CityParkingBlockRow)`, mapping a `city_parking_blocks` row to zero or more `ParkingRule`s: a `TIME_LIMIT` rule when `hour_limit` (a real integer column) is a valid positive number; an `OTHER` rule when `regulation_type`/`agency`/`permit_area`/`days_of_week`/`hours` carry any information (preserved verbatim, never classified further); an empty array when the row has none of the above. The raw `days_of_week`/`hours` text fields are preserved verbatim via `ParkingRule.rawText` rather than parsed into `schedule` — see `docs/CITY_DATA_PLAN.md` "Regulation data — current capabilities" for why. Now wired to a live query via `src/services/regulation.ts` (below) and `apps/mobile/src/services/regulationService.ts`.

**Corrected before commit:** the first version of this adapter emitted a `METERED` rule for every row, reasoning that `city_parking_blocks` is populated exclusively from DataSF's "SFMTA Metered Street Blocks" dataset. That's an inference about which ingestion pipeline produced the row (via an unresolved `source_id` foreign key), not a fact verified on the row itself, so it was removed. `"METERED"` remains a valid `ParkingRuleKind` value, reserved for a future, separate adapter over `city_parking_meters` (the structurally reliable meter-inventory table) — not built here. Meter inventory ("there is a meter here") and regulation ("a payment/time rule applies") are kept as distinct concepts.

`ParkingCandidate` was intentionally left unchanged — there is no reliable join yet between `city_parking_blocks` rows and `normalized_parking_locations`/`ParkingCandidate` (blocks aren't part of the normalized pipeline), so coupling `ParkingRule[]` onto `ParkingCandidate` now would be premature. See `docs/ARCHITECTURE.md` §13 for the intended future shape (`ParkingCandidate` + `ParkingRule[]` → legality engine → `ParkingLegality`).

## Deterministic parking service (V1)

`src/services/` holds `findParkingCandidates(request: ParkingCandidateSearchRequest, deps)` — retrieves rows via caller-supplied fetch functions (dependency injection, no Supabase client of its own), maps them through `adapters`, applies an exact-radius distance filter to the fetched rows, and returns sorted `ParkingCandidate[]`. It depends on `domain` and `adapters` only; it adds no new runtime dependency to this package. `request` only accepts location + radius — every field it has is enforced, unlike the broader `ParkingSearchConstraints`. See `src/services/parking.ts` for the full contract, an illustrative usage example, and documented radius-completeness caveats.

```typescript
import { services } from "@smart-parking/shared";

const candidates = await services.findParkingCandidates(
  { origin: { latitude, longitude }, radiusMeters: 2000 },
  { fetchNearbySpots: myFetchFn }
);
```

Wired into `apps/mobile` via `apps/mobile/src/services/candidateService.ts`
(`findNearbyParkingCandidates`), which supplies `fetchNearbyParkingSpotRows`
(`parkingService.ts`) and, when the city-data preview flag is on,
`fetchNearbyNormalizedLocationRows` (`cityParkingService.ts`) as the
injected fetchers. Not imported by `apps/web`.

## Regulation lookup service (V1)

`src/services/regulation.ts` adds `findParkingRulesForLocation(locationId, { fetchCityParkingBlocksForLocation })` — answers "what regulation records are associated with this location?", **not** "is parking legal now?". Same DI pattern as `findParkingCandidates`: it calls the injected fetcher, maps every returned row through `adapters.mapCityRegulationRowToParkingRules`, and flattens — no SQL, no join logic, and no knowledge of which table `locationId` belongs to lives in this package.

```typescript
import { services } from "@smart-parking/shared";

const rules = await services.findParkingRulesForLocation(candidate.location.id, {
  fetchCityParkingBlocksForLocation: myFetchFn,
});
```

Wired into `apps/mobile` via `apps/mobile/src/services/candidateService.ts`'s `findParkingRulesForCandidate(candidate)`, which first checks `isCityProvenance(candidate)` — non-CITY candidates (`parking_spots`-sourced) resolve to `[]` immediately, with no query, since their `location.id` belongs to a different table entirely — then supplies `apps/mobile/src/services/regulationService.ts`'s `fetchCityParkingBlocksForLocation` as the injected fetcher. That mobile file performs the actual deterministic, ID-based joins, tried in strength order: a PRIMARY `city_parking_meters.block_id` foreign-key lookup (exact PK match, at most one row), falling back to a WEAKER `blockface_id` text match (not guaranteed one-to-one) only when the FK path is unusable (missing `city_row_id`, meter not found, or `block_id` null) — see `docs/CITY_DATA_PLAN.md` "Regulation lookup — join path" for the full comparison. `regulationService.ts` imports `@smart-parking/shared` only as a type (`import type { adapters }`), preserving `candidateService.ts` as the sole file that imports it as a runtime value. Not wired to any UI. Not imported by `apps/web`.

## Legality engine (V1)

`src/services/legality.ts` adds `evaluateParkingLegality(rules: readonly ParkingRule[], interval: ParkingRequestedInterval): ParkingLegality` — a **pure** function (no Supabase, network, env vars, React, mobile, or LLM dependency; same inputs always produce the same output). It answers "is parking legal for this requested interval, given only these known rules?" — **not** a full search/ranking flow (`findLegalParking` is a future milestone, not implemented here). `ParkingCandidate.legality` itself still always reports `status: "UNKNOWN"`, unchanged — this evaluator's real verdict is available only through the separate orchestration layer below (`findAndEvaluateParkingCandidates`), which composes it alongside a candidate instead of mutating `candidate.legality`.

```typescript
import { services } from "@smart-parking/shared";

const legality = services.evaluateParkingLegality(rules, {
  arrival: "2026-06-01T14:00:00-07:00",
  departure: "2026-06-01T15:30:00-07:00",
});
```

`ParkingRequestedInterval` (`domain/legality.ts`) is a new, narrower type than `ParkingSearchConstraints` — both `arrival`/`departure` are required, full ISO 8601 date-time strings with an explicit offset/`Z` (matching the existing `ParkingEvidence` timestamp convention); a bare date or ambiguous format is rejected, not guessed. Every calendar component (day-of-month vs. actual days in that month/year including leap years, hour/minute/second range) is independently validated before any date arithmetic runs, so a syntactically-ISO but calendrically-impossible string like `"2026-02-30T10:00:00Z"` is rejected (`UNKNOWN`/`INVALID_INTERVAL`) rather than silently normalized into a different, valid instant the way `new Date(...)` alone would do it.

**Applicability gate.** For each `TIME_LIMIT` rule, `evaluateParkingLegality` calls `evaluateScheduleApplicability`. `APPLIES` + usable exceeded max → `ILLEGAL`. `UNKNOWN` applicability must not become `ILLEGAL` even if duration exceeds the limit. `DOES_NOT_APPLY` cannot prove `ILLEGAL` or `LEGAL`. Parsed time-window rules (`allDay !== true`) never produce a new `LEGAL` result — city data does not prove complete coverage. Legacy `LEGAL` still requires every known rule to be an all-day (`allDay === true`) `TIME_LIMIT` with a usable, non-exceeded max. Duration is always instant subtraction, never local wall-clock math.

**Precedence:** (1) invalid interval → `UNKNOWN`/`INVALID_INTERVAL`; (2) no rules → `UNKNOWN`/`INSUFFICIENT_RULE_DATA`; (3) any TIME_LIMIT whose schedule `APPLIES` with a usable exceeded max → `ILLEGAL`/`EXCEEDS_MAX_DURATION`; (4) `OTHER` → `UNKNOWN`/`UNPARSED_RESTRICTION`; (5) `METERED` → `UNKNOWN`/`INSUFFICIENT_RULE_DATA`; (6) unresolved TIME_LIMIT applicability or unusable max → `UNKNOWN`/`INSUFFICIENT_RULE_DATA`; (7) parsed time-window TIME_LIMIT (applies-but-not-exceeded or does-not-apply) → `UNKNOWN`/`INSUFFICIENT_RULE_DATA`; (8) `LEGAL` only if every rule is an all-day TIME_LIMIT with a usable, non-exceeded max.

With today's DataSF adapter (`allDay` is never `true`), `LEGAL` remains unreachable. Parsed windows **can** newly prove `ILLEGAL` when they apply and are exceeded.

Verified by `scripts/verify-legality-engine.ts` (`pnpm verify:legality-engine`, 33 cases: 23 legacy all-day cases plus parsed-window integration).

This evaluator was **not** changed by Regulation Coverage V1. Coverage is a separate question (see below) and is not yet a gate on `LEGAL`.

## Regulation coverage / legal-conclusion readiness (V1)

`src/domain/coverage.ts` and `src/services/regulationCoverage.ts` add `evaluateLegalConclusionReadiness({ candidate, rules, coverageDeclaration? }): LegalConclusionCoverage` — a **pure** function answering "is the regulation evidence sufficient to even permit a LEGAL conclusion?" Coverage and legality stay separate: coverage is "do we know enough?"; legality is "given known rules, what verdict follows?" This is categorical (`READY` | `INCOMPLETE`), not a confidence score.

```typescript
import { services } from "@smart-parking/shared";

const coverage = services.evaluateLegalConclusionReadiness({
  candidate,
  rules,
  coverageDeclaration: "UNDECLARED", // live CITY lookup must leave this undeclared
});
```

**READY** only for an explicitly declared complete synthetic/MOCK `TIME_LIMIT`-only rule set with fully known schedules. **INCOMPLETE** otherwise — including every real CITY candidate. Completeness cannot be inferred from `rules.length > 0` or successful parses of the returned array.

**Real CITY candidates cannot currently be READY.** One associated `city_parking_blocks` row does not prove all restrictions for the location; unmatched source rows are dropped; no ingested field asserts that every restriction was captured; street sweeping / meter payment / permit applicability / classified no-parking are unresolved. A `COMPLETE` declaration is ignored when CITY provenance is present.

**Not wired into `evaluateParkingLegality`.** INCOMPLETE does not prevent a later confirmed `ILLEGAL`; it only means `LEGAL` would be unsafe. That gate is a later milestone.

Verified by `scripts/verify-regulation-coverage.ts` (`pnpm verify:regulation-coverage`).

## Schedule applicability (V1)

`src/services/scheduleApplicability.ts` adds `evaluateScheduleApplicability(schedule: ParkingRuleSchedule | null, interval: ParkingRequestedInterval): ScheduleApplicabilityResult` — a **pure** function answering whether a schedule `APPLIES`, `DOES_NOT_APPLY`, or is `UNKNOWN` for a requested interval. `evaluateParkingLegality` calls this as its TIME_LIMIT applicability gate; this module does not itself return LEGAL/ILLEGAL.

```typescript
import { services } from "@smart-parking/shared";

const applicability = services.evaluateScheduleApplicability(rule.schedule, {
  arrival: "2026-09-15T10:00:00-07:00",
  departure: "2026-09-15T12:00:00-07:00",
});
```

Timezone conversion uses `Intl.DateTimeFormat` with `schedule.timezone` (DataSF TIME_LIMIT rules now set `"America/Los_Angeles"`). Machine timezone is never used. Windows are half-open `[start, end)`; partial overlap, multi-day local requests, and DST duration mismatches are `UNKNOWN`. Verified by `scripts/verify-schedule-applicability.ts` (`pnpm verify:schedule-applicability`).

## Search + legality orchestration (V1)

`src/services/orchestration.ts` adds `findAndEvaluateParkingCandidates(request: { candidateSearch, interval }, deps): Promise<EvaluatedParkingCandidate[]>` — the flow that connects the three services above: `findParkingCandidates` → an injected per-candidate rule fetcher → `evaluateParkingLegality`. No new business logic; this file only sequences and composes existing calls (plus a tiny bounded-concurrency helper — see below).

```typescript
import { services } from "@smart-parking/shared";

const results = await services.findAndEvaluateParkingCandidates(
  {
    candidateSearch: { origin: { latitude, longitude }, radiusMeters: 2000 },
    interval: { arrival: "2026-06-01T14:00:00-07:00", departure: "2026-06-01T15:30:00-07:00" },
  },
  {
    fetchNearbySpots: myFetchSpotsFn,
    fetchNearbyNormalizedLocations: myFetchLocationsFn,
    fetchRulesForCandidate: myFetchRulesFn, // e.g. mobile's existing findParkingRulesForCandidate
  }
);
```

**Not named `findLegalParking`.** With today's real ingested data, most CITY candidates with a known `TIME_LIMIT` rule evaluate to `UNKNOWN`, not `LEGAL` (see the Legality engine section above — `schedule.allDay` is never confirmed `true`). This function returns **every** discovered candidate, `UNKNOWN` included, in the same distance order `findParkingCandidates` produces — never only "legal" ones. `findLegalParking` is reserved for a later milestone once rule-coverage semantics justify that name.

**Result shape.** `EvaluatedParkingCandidate { candidate: ParkingCandidate; rules: readonly ParkingRule[]; legality: ParkingLegality }` — explicit composition; `candidate.legality` is left untouched (always the pre-existing `UNKNOWN` placeholder).

**Why the rule fetcher is a dependency, not a direct call.** The real `findParkingRulesForCandidate` (apps/mobile) depends on Supabase-backed joins — this package still adds no Supabase dependency. `deps.fetchRulesForCandidate` has exactly that function's signature/semantics (`(candidate) => Promise<ParkingRule[]>`, resolving to `[]` — never throwing — for "no known rules"), so the caller supplies its own existing implementation unchanged; this package makes no provenance/routing decision of its own.

**Error isolation.** A candidate-discovery failure fails the whole call (propagated unchanged — nothing useful to return without candidates). An individual candidate's rule-lookup failure is caught per-candidate and treated as `[]` rules (never fabricated) so that candidate is still returned, evaluated as `UNKNOWN`/`INSUFFICIENT_RULE_DATA` by the same `evaluateParkingLegality` path used for a genuine "no rules" result — one accepted V1 limitation being that a failed lookup and a genuine zero-rules result are indistinguishable in the returned `reasonCode`.

**Concurrency.** Candidate discovery can return on the order of ~100-200 rows (mobile's per-fetcher query caps). Rather than an unbounded `Promise.all` across every candidate's rule lookup, a tiny dependency-free worker-pool helper caps concurrent lookups at 8 by default (`deps.maxConcurrentRuleLookups` to override); result order is preserved regardless of completion order.

Wired into `apps/mobile` via `apps/mobile/src/services/candidateService.ts`'s `findAndEvaluateNearbyParkingCandidates`, which supplies the existing `fetchNearbyParkingSpotRows`/`fetchNearbyNormalizedLocationRows` (selected by source, exactly like `findNearbyParkingCandidates`) and `fetchRulesForCandidate: findParkingRulesForCandidate` — all pre-existing, unchanged functions. Not wired to any UI/screen. Not imported by `apps/web`.

Verified by `scripts/verify-orchestration.ts` (`pnpm verify:orchestration`, 10 cases with fake injected fetchers, including ordering preservation and per-candidate error isolation) — no test framework added.

## Structure

```
packages/shared/
├── src/
│   ├── types/
│   │   ├── parking.ts      → ParkingSpot, ParkingStatus, ParkingType, ParkingSource, ParkingReport
│   │   ├── user.ts         → UserProfile
│   │   └── index.ts        → Barrel export for all types
│   ├── constants/
│   │   ├── app.ts          → APP_NAME, APP_DESCRIPTION
│   │   ├── map.ts          → Default coordinates, search radius, marker colors
│   │   └── index.ts        → Barrel export for all constants
│   ├── utils/
│   │   ├── format.ts       → Formatting helpers (status, type, color, date)
│   │   └── index.ts        → Barrel export for all utils
│   └── index.ts            → Top-level barrel export (everything)
├── package.json
├── tsconfig.json
└── README.md
```

## Usage

Import from the package in apps:

```typescript
import {
  ParkingSpot,
  ParkingStatus,
  DEFAULT_LATITUDE,
  DEFAULT_LONGITUDE,
  formatParkingStatus,
  getMarkerColor,
} from "@smart-parking/shared";
```

## Types

| Type | Description |
|------|-------------|
| `ParkingStatus` | `"AVAILABLE"` \| `"OCCUPIED"` \| `"UNKNOWN"` |
| `ParkingType` | `"METERED"` \| `"FREE"` \| `"LOADING_ZONE"` \| `"STREET_SWEEPING"` \| `"GARAGE"` \| `"UNKNOWN"` |
| `ParkingSource` | `"MOCK"` \| `"DATASF"` \| `"SFMTA"` \| `"USER_REPORT"` |
| `ParkingSpot` | Full parking spot record (matches DB columns exactly) |
| `ParkingReport` | User-submitted availability report (matches DB columns exactly) |
| `UserProfile` | Public user profile (matches DB columns exactly) |

> **Note:** Enum values use UPPERCASE to match the database CHECK constraints exactly.

## Constants

| Constant | Value |
|----------|-------|
| `DEFAULT_LATITUDE` | 37.7749 (San Francisco) |
| `DEFAULT_LONGITUDE` | -122.4194 (San Francisco) |
| `DEFAULT_SEARCH_RADIUS_METERS` | 500 |
| `MARKER_COLORS.AVAILABLE` | #22c55e (green) |
| `MARKER_COLORS.OCCUPIED` | #ef4444 (red) |
| `MARKER_COLORS.UNKNOWN` | #a3a3a3 (gray) |

## Utilities

| Function | Description |
|----------|-------------|
| `formatParkingStatus(status)` | Returns human-readable label |
| `formatParkingType(type)` | Returns human-readable label |
| `getMarkerColor(status)` | Returns hex color for map markers |
| `formatUpdatedAt(date)` | Returns relative time string (e.g. "2 min ago") |

## Type Checking

```bash
pnpm typecheck
```

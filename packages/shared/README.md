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

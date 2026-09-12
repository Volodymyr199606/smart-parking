# @smart-parking/shared

Shared TypeScript types, constants, and utility functions intended for the monorepo.

> **Current consumption status:**
>
> - **`apps/mobile`** — does **not** import from `@smart-parking/shared`. The mobile app uses an inlined copy at `apps/mobile/src/shared.ts` to avoid monorepo resolution issues with Expo Go / Metro. The two files have drifted (mobile adds `FavoriteParkingSpot`, `NormalizedParkingLocation`, and `CityParkingQueryResult`; this package retains `UserProfile` and `formatUpdatedAt`).
> - **`apps/web`** — does **not** import from `@smart-parking/shared`. The website is self-contained.
>
> This package typechecks (`pnpm typecheck:shared`) and is part of the monorepo workspace, but is not consumed by any app at runtime. Consolidating types here (and resolving Expo Go import constraints) is deferred to a future refactor.

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

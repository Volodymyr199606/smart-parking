# Smart Parking — Architecture Reference

> **Document status:** Current implementation as of the Expo SDK 54 / Next.js 15 monorepo.
> Previously this document described planned architecture; it now reflects what is actually built.
> Future / planned items are clearly labelled **[FUTURE]**.

---

## Table of Contents

1. [Product Overview](#1-product-overview)
2. [Repository Structure](#2-repository-structure)
3. [High-Level Architecture](#3-high-level-architecture)
4. [Mobile App Architecture](#4-mobile-app-architecture)
5. [Website Architecture](#5-website-architecture)
6. [Supabase Backend](#6-supabase-backend)
7. [Database Schema](#7-database-schema)
8. [Authentication](#8-authentication)
9. [Realtime](#9-realtime)
10. [City Data Pipeline](#10-city-data-pipeline)
11. [Security and RLS](#11-security-and-rls)
12. [UI/UX Principles](#12-uiux-principles)
13. [Future Architecture Direction](#13-future-architecture-direction)

---

## 1. Product Overview

Smart Parking helps drivers in San Francisco find nearby street parking faster.

**Two surfaces:**
- **Mobile app** (`apps/mobile`) — Core product. Drivers find, report, and navigate to parking spots on the go.
- **Website** (`apps/web`) — Marketing landing page, animated product demo (scripted, not live data), and Supabase-backed waitlist.

**Target user:** Everyday SF drivers who want to reduce time spent searching for street parking.

---

## 2. Repository Structure

A TypeScript-first pnpm monorepo (`pnpm@10.22.0`):

```
smart-parking/
├── apps/
│   ├── mobile/          → React Native Expo app (iOS + Android) — main product
│   └── web/             → Next.js marketing website (landing + waitlist)
├── packages/
│   └── shared/          → Shared types/constants/utils (not currently imported by either app — see §4.5)
├── supabase/
│   ├── migrations/      → 10 SQL migration files (00001–00010)
│   ├── scripts/         → Idempotent helper SQL for safe re-application
│   └── seed/            → 26 mock SF parking spots
├── scripts/             → City data ingestion pipeline (TypeScript, service-role only)
├── docs/                → Architecture and city data planning
├── archive/             → Previous Java/Spring + Leaflet stack (reference only, not used)
├── DEMO.md              → Demo script and portfolio guide
└── README.md            → Project overview
```

---

## 3. High-Level Architecture

```
┌──────────────────────────┐     ┌──────────────────────────┐
│   📱 Mobile App          │     │   🌐 Marketing Website   │
│   React Native + Expo    │     │   Next.js 15 (Vercel)    │
│   iOS + Android          │     │   Landing + Waitlist     │
│   apps/mobile            │     │   apps/web               │
└────────────┬─────────────┘     └────────────┬─────────────┘
             │                                │
             │       @supabase/supabase-js    │
             └──────────────┬─────────────────┘
                            ▼
             ┌──────────────────────────────┐
             │          SUPABASE            │
             │  Auth · PostgreSQL · RLS     │
             │  Realtime (parking_spots)    │
             └──────────────┬───────────────┘
                            │
             ┌──────────────▼───────────────┐
             │   City Data (offline/batch)  │
             │   DataSF / SFMTA → scripts/  │
             │   → city tables (read-only)  │
             └──────────────────────────────┘
```

**Key design decisions:**
- No custom backend server — clients talk to Supabase directly via PostgREST
- Row Level Security enforces permissions in the database, not in application middleware
- City data ingestion runs from local scripts with service-role access — no Edge Functions yet
- Mobile list view works in Expo Go without native binaries; native map is prepared for an EAS build later

---

## 4. Mobile App Architecture

### 4.1 Tech stack

| Concern | Technology |
|---|---|
| Framework | React Native + Expo (SDK 54, managed workflow) |
| Language | TypeScript 5.9 |
| Navigation | `@react-navigation/native` + `@react-navigation/native-stack` (React Navigation v7) |
| State management | React Context only (`AuthContext`) — no Zustand or Redux |
| Auth | Supabase Auth via `@supabase/supabase-js`, session stored in AsyncStorage |
| Realtime | Supabase Realtime (`postgres_changes` subscription on `parking_spots`) |
| Location | `expo-location` (foreground permission) |
| Maps | `react-native-maps` 1.20.1 (implemented, disabled in Expo Go — see §4.4) |
| UI | Custom components — no third-party UI library |

### 4.2 Folder structure

```
apps/mobile/
├── App.tsx                  → Entry point; checks env vars, wraps AuthProvider + NavigationContainer
├── index.js                 → Expo entry (registers App)
├── app.config.js            → Expo config (EAS project ID, Google Maps key wiring, splash)
├── eas.json                 → EAS build profiles (development / preview / production)
├── src/
│   ├── shared.ts            → Inlined types, constants, utilities (replaces @smart-parking/shared)
│   ├── components/          → Reusable UI components
│   │   ├── AppButton.tsx
│   │   ├── AppInput.tsx
│   │   ├── AvailabilityBadge.tsx
│   │   ├── ConfigErrorScreen.tsx  → Shown when Supabase env vars are missing
│   │   ├── ParkingMapView.tsx     → react-native-maps wrapper with error boundary
│   │   ├── ParkingSpotCard.tsx
│   │   └── ScreenContainer.tsx
│   ├── constants/
│   │   ├── env.ts           → ENV object + isSupabaseConfigured()
│   │   └── theme.ts         → Colors, spacing, radius, font tokens
│   ├── contexts/
│   │   └── AuthContext.tsx  → Supabase Auth state, signUp/signIn/signOut
│   ├── hooks/
│   │   └── useRealtimeSpots.ts → parking_spots INSERT/UPDATE/DELETE subscription
│   ├── navigation/
│   │   └── RootNavigator.tsx   → Auth-gated native stack (Welcome/Login/Register vs Map/Profile/Settings)
│   ├── screens/
│   │   ├── MapScreen.tsx        → Main screen: list + map toggle, search, filters, detail card, reports
│   │   ├── ProfileScreen.tsx    → User info, favorites count, reports count, logout
│   │   ├── SettingsScreen.tsx   → App version, realtime/map status, logout
│   │   ├── LoginScreen.tsx
│   │   ├── RegisterScreen.tsx
│   │   └── WelcomeScreen.tsx
│   ├── services/
│   │   ├── supabaseClient.ts    → Supabase client (AsyncStorage auth persistence)
│   │   ├── parkingService.ts    → getNearbyParkingSpots, getParkingSpots, reportParkingSpot, getReportsCount
│   │   ├── favoritesService.ts  → addFavorite, removeFavorite, getFavorites, getFavoritesCount
│   │   ├── analyticsService.ts  → trackEvent (fire-and-forget, never throws)
│   │   ├── cityParkingService.ts → getNormalizedParkingNearby, getNormalizedParkingByCity (not wired to UI yet)
│   │   └── authService.ts       → Thin wrappers over Supabase Auth
│   ├── types/
│   │   └── index.ts             → RootStackParamList navigation types
│   └── utils/
│       ├── appStatus.ts         → getAppVersion, map/city/realtime status labels
│       ├── getErrorMessage.ts   → Safe error → string helper
│       ├── mapSupport.ts        → isNativeMapSupported() (false in Expo Go)
│       └── parkingSpotsState.ts → upsertSpotById, replaceSpotById, removeSpotById (dedup helpers)
└── assets/                  → App icons, splash image
```

### 4.3 Navigation

Auth-gated native stack via `RootNavigator.tsx`:

```
Unauthenticated:
  Welcome → Login → Register

Authenticated:
  Map (default) → Profile (header back)
              → Settings (header back)
```

There is no tab bar and no Expo Router. Navigation is entirely React Navigation native stack.

### 4.4 Map implementation and Expo Go limitation

`react-native-maps` is installed and `ParkingMapView` is fully implemented with colored pin markers, an error boundary, and a map/list view toggle in `MapScreen`. However:

- `isNativeMapSupported()` in `mapSupport.ts` returns `false` when `Constants.appOwnership === "expo"` (i.e. running inside Expo Go)
- In Expo Go the app renders a list-only view and shows a banner: *"Map view coming soon · Showing nearby parking list"*
- The native map requires an **EAS development build** and a Google Maps API key for Android (`EXPO_PUBLIC_GOOGLE_MAPS_API_KEY` in `apps/mobile/.env`)
- `eas.json` and `app.config.js` are configured with a real EAS project ID; no build has been published yet

### 4.5 Types and shared package

The mobile app **does not import from `@smart-parking/shared`**. It uses `apps/mobile/src/shared.ts` — an inlined copy — because Metro bundler in Expo Go has difficulty resolving workspace packages. The inlined file includes types that the shared package does not have (`FavoriteParkingSpot`, `NormalizedParkingLocation`, `CityParkingQueryResult`). Reconciling the two is a deferred refactor.

### 4.6 City parking service (implemented but not wired to UI)

`cityParkingService.ts` provides three read-only query functions over `normalized_parking_locations`:
- `getNormalizedParkingNearby(lat, lng, radiusMiles)` — bounding box + client-side haversine
- `getNormalizedParkingByCity(city)` — city name filter
- `getActiveNormalizedParking()` — active inventory flag

These functions are not called by any screen. They are available for future integration when the city-data cutover is deliberately made.

---

## 5. Website Architecture

### 5.1 Tech stack

| Concern | Technology |
|---|---|
| Framework | Next.js 15 (App Router) |
| Language | TypeScript 5.7 |
| Styling | Tailwind CSS v4 — CSS-first via `@tailwindcss/postcss`; no `tailwind.config` file |
| Icons | `lucide-react` |
| Backend | Supabase (`@supabase/supabase-js`) — waitlist only |
| Deployment | Vercel (root directory: `apps/web`) |

### 5.2 Folder structure

```
apps/web/
├── next.config.ts           → outputFileTracingRoot set to monorepo root
├── postcss.config.mjs       → @tailwindcss/postcss only
├── src/
│   ├── app/
│   │   ├── layout.tsx       → Root layout, metadata
│   │   ├── page.tsx         → Landing page (all sections)
│   │   ├── home/page.tsx    → redirect("/") alias
│   │   └── globals.css      → @import "tailwindcss" + @theme brand tokens
│   ├── components/
│   │   ├── Nav.tsx, Hero.tsx, Problem.tsx, Solution.tsx
│   │   ├── Features.tsx, About.tsx, Footer.tsx
│   │   ├── DemoPreview.tsx  → Section wrapper for PhoneDemo
│   │   ├── PhoneDemo.tsx    → Scripted animated phone mockup (hardcoded spots, no live data)
│   │   └── Waitlist.tsx     → Email form → waitlist_signups insert
│   └── lib/
│       └── supabase.ts      → createClient; returns null if env vars missing (no crash)
```

### 5.3 Landing page sections

The single `/` route renders these sections in order:
Nav → Hero → Problem → Solution → Features → DemoPreview → Waitlist → About → Footer

### 5.4 Demo section

The `PhoneDemo` component is a **scripted animation**, not a live product interface:
- Spots are hardcoded arrays — no Supabase queries
- A timer loop auto-cycles filters, selects a spot, simulates report, and shows a toast
- User interaction buttons have no `onClick` handlers — the demo cannot be driven by the viewer
- The section headline ("Real data, real spots, today") overstates it; the demo shows sample data

### 5.5 Waitlist

`Waitlist.tsx` inserts `{ full_name, email, interest }` into `waitlist_signups`. Handles idle / submitting / success / already-registered (Postgres `23505`) / error states. If Supabase env vars are absent the form degrades to a friendly error message; the build does not fail.

### 5.6 Deployment

No `vercel.json` exists. Vercel project settings must specify:
- Root directory: `apps/web`
- Environment variables: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`

The web app imports no workspace packages, so no special monorepo transpilation is needed.

---

## 6. Supabase Backend

Supabase provides everything the apps need without a custom server:

| Service | Used for |
|---|---|
| **Auth** | Email/password signup and login; session tokens returned to clients |
| **PostgreSQL** | All persistent data via PostgREST |
| **Realtime** | `parking_spots` INSERT/UPDATE/DELETE broadcast to mobile clients |
| **Row Level Security** | Database-enforced permissions (no app middleware) |
| **Dashboard** | Manual migration apply; seed SQL; admin reads |

**Not currently used:** Storage, Edge Functions, scheduled functions, PostGIS.

Both clients (`apps/mobile` and `apps/web`) connect using the **anon key**. The **service role key** is used only by local ingestion scripts and must never appear in client code or be committed to source control.

---

## 7. Database Schema

All 10 migrations are applied in order. Summary of tables:

### parking_spots
| Column | Type | Notes |
|---|---|---|
| id | uuid | PK |
| street_name | text | Required |
| address | text | Optional full address |
| latitude | double precision | GPS latitude |
| longitude | double precision | GPS longitude |
| status | text | `AVAILABLE` \| `OCCUPIED` \| `UNKNOWN` |
| parking_type | text | `METERED` \| `FREE` \| `LOADING_ZONE` \| `STREET_SWEEPING` \| `GARAGE` \| `UNKNOWN` |
| price | text | Display string, e.g. `"$3.50/hr"` |
| time_limit | text | Display string, e.g. `"2 hours"` |
| source | text | `MOCK` \| `DATASF` \| `SFMTA` \| `USER_REPORT` |
| created_at | timestamptz | Auto-set |
| updated_at | timestamptz | Auto-updated via `set_updated_at()` trigger |

> **No PostGIS.** Location is stored as plain `latitude`/`longitude` columns. Nearby queries use a bounding-box approximation (`radiusMeters / 111_000` degrees offset). PostGIS would be added in a later migration.

### profiles
| Column | Type | Notes |
|---|---|---|
| id | uuid | PK, references `auth.users(id)` |
| full_name | text | Display name |
| email | text | User email |
| created_at | timestamptz | Auto-set |
| updated_at | timestamptz | Auto-updated via trigger |

Auto-created by `handle_new_user()` trigger on `auth.users` INSERT.

### parking_reports
| Column | Type | Notes |
|---|---|---|
| id | uuid | PK |
| user_id | uuid | References `auth.users` |
| parking_spot_id | uuid | References `parking_spots` |
| status | text | `AVAILABLE` \| `OCCUPIED` \| `UNKNOWN` |
| note | text | Optional user note |
| created_at | timestamptz | Auto-set |

### waitlist_signups
| Column | Type | Notes |
|---|---|---|
| id | uuid | PK |
| full_name | text | Optional |
| email | text | Required, unique |
| interest | text | Optional message |
| created_at | timestamptz | Auto-set |

### favorite_parking_spots (migration 00008)
| Column | Type | Notes |
|---|---|---|
| id | uuid | PK |
| user_id | uuid | References `auth.users` (CASCADE) |
| parking_spot_id | uuid | References `parking_spots` (CASCADE) |
| created_at | timestamptz | Auto-set |

UNIQUE on `(user_id, parking_spot_id)`.

### analytics_events (migration 00009)
| Column | Type | Notes |
|---|---|---|
| id | uuid | PK |
| user_id | uuid | References `auth.users` — nullable |
| event_name | text | e.g. `parking_spot_opened`, `directions_clicked` |
| event_payload | jsonb | Structured metadata |
| created_at | timestamptz | Auto-set |

Append-only; no SELECT policy for clients.

### City data tables (migrations 00005–00007, optional)

See [§10 City Data Pipeline](#10-city-data-pipeline) and [`docs/CITY_DATA_PLAN.md`](./CITY_DATA_PLAN.md).

### Secure status-update RPC (migration 00010)

```sql
-- Called by the mobile app instead of a direct UPDATE:
SELECT update_parking_spot_status(spot_id := $1, new_status := $2);
```

`SECURITY DEFINER` function. Validates `new_status` is one of the three allowed values. Replaces the broad UPDATE policy from migration 00002 (which 00010 drops). Clients cannot update any other column.

---

## 8. Authentication

Supabase email/password auth. No OAuth, no magic link (not yet implemented).

**Session lifecycle:**
1. App starts → `supabase.auth.getSession()` restores session from AsyncStorage
2. `onAuthStateChange` listener keeps `AuthContext` in sync
3. Tokens auto-refresh via `supabase-js`
4. Logout → `supabase.auth.signOut()`, clears AsyncStorage

`App.tsx` renders `ConfigErrorScreen` when `EXPO_PUBLIC_SUPABASE_URL` or `EXPO_PUBLIC_SUPABASE_ANON_KEY` are missing, preventing a crash on misconfiguration.

---

## 9. Realtime

`useRealtimeSpots` hook in `apps/mobile/src/hooks/`:

```
supabase.channel("parking_spots_changes")
  .on("postgres_changes", { event: "INSERT", table: "parking_spots" }, onInsert)
  .on("postgres_changes", { event: "UPDATE", table: "parking_spots" }, onUpdate)
  .on("postgres_changes", { event: "DELETE", table: "parking_spots" }, onDelete)
  .subscribe()
```

- Only `parking_spots` is in the Supabase Realtime publication (migration `00003`)
- `MapScreen` drives `setSpots` state from these callbacks (insert/update/replace, remove by id)
- Dedup helpers in `parkingSpotsState.ts` prevent duplicate entries on reconnection
- `connectionStatus` (`live` / `reconnecting` / `offline`) is surfaced as a badge in the map header

Realtime events are not broadcast for `parking_reports`, `favorites`, or city tables.

---

## 10. City Data Pipeline

### What exists today

The city data pipeline is an **offline ingestion prototype** — not a real-time feed and not wired into the mobile UI.

```
DataSF Socrata API          scripts/ingest-sf-parking-data.ts
(public HTTP/JSON)    →     (service-role, runs locally)
                            ↓
                      city_parking_sources
                      city_parking_blocks
                      city_parking_meters
                      (planned, not built: city_parking_regulations
                       — docs/CITY_REGULATION_STORAGE.md)
                            ↓
                      scripts/normalize-city-parking.ts
                            ↓
                      normalized_parking_locations
                            ↓
                      (mobile app does NOT read this yet)
```

### Data sources ingested

| DataSF dataset | ID | Target table |
|---|---|---|
| SFMTA Metered Street Blocks | `27b3-yjjx` | `city_parking_blocks` |
| Parking Meters | `8vzz-qzz9` | `city_parking_meters` |
| Parking Regulations (blockface map) | `hi6h-neyh` | `city_parking_blocks` (merged; lossy — see `docs/CITY_REGULATION_STORAGE.md`) |

### Ingestion scripts

| Command | Script | What it does |
|---|---|---|
| `pnpm ingest:sf-parking` | `scripts/ingest-sf-parking-data.ts` | Full DataSF ingest (all configured datasets) |
| `pnpm ingest:sf-parking:meters` | same, `--meters-only --limit=100` | Safe test batch of 100 meters |
| `pnpm normalize:city-parking` | `scripts/normalize-city-parking.ts` | Upserts `city_parking_meters` → `normalized_parking_locations` |
| `pnpm verify:normalized-parking` | `scripts/verify-normalized-parking.ts` | Read-only validation of normalized rows |
| `pnpm check:city-parking` | `scripts/check-city-parking-data.ts` | Inspects `city_parking_meters_clean` view |
| `pnpm check:city-parking-service` | `scripts/check-city-parking-service.ts` | Tests `cityParkingService.ts` queries |

All ingest scripts require `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` in the repo-root `.env`.

### Critical data distinction

City data describes **parking infrastructure and regulations** — not live occupancy:

| Question | Data type | Source |
|---|---|---|
| "Can I legally park here at 4pm Tuesday?" | Static legal/rule | City tables (curb rules, sweeping schedules — *not yet imported*) |
| "Did someone report this space open recently?" | Estimated availability | `parking_spots.status` + `parking_reports` |
| "Is the meter sensor showing a free space right now?" | True realtime occupancy | *Not available citywide from DataSF/SFMTA today* |

**The `active` field on `normalized_parking_locations`** is the city's meter-active flag — not an indication that a parking space is currently unoccupied. Never display it as live availability.

### What the mobile app uses today

The mobile app reads only `parking_spots` (26 mock rows, `source = 'MOCK'`). Status reflects user reports and Supabase Realtime updates. City tables are populated but not queried by any screen.

`cityParkingService.ts` is implemented and typechecks, but is imported by no screen. It is available for a deliberate UI integration step.

---

## 11. Security and RLS

See [`supabase/README.md`](../supabase/README.md) for the full RLS table. Key principles:

- Every table has RLS enabled
- Client roles (anon, authenticated) can only perform explicitly granted operations
- `parking_spots` has **no client UPDATE path** — all status changes go through `update_parking_spot_status()` RPC (migration 00010)
- City tables are read-only for all client roles; ingest requires service role
- The service role key must never be shipped in client apps or committed to source control
- Favorites and reports are scoped to `auth.uid()` — no cross-user access

---

## 12. UI/UX Principles

### Mobile

- Clean, minimal, no visual clutter
- White/light backgrounds, generous spacing
- System fonts (SF Pro on iOS, Roboto on Android)
- Rounded elements — 8/12/16px radius, full-radius buttons
- Subtle drop shadows on cards, no harsh borders
- Palette: gray text, blue accents, green (available), red (occupied), amber (warnings)
- Every screen handles: loading, empty, success, and error states
- Touch targets minimum 44px; bottom-aligned actions for thumb reach

### Website

- Startup landing-page aesthetic — confident, trustworthy
- Whitespace-driven; no walls of text
- Card-based feature highlights
- Consistent colors with mobile app
- Responsive across all screen sizes

---

## 13. Future Architecture Direction

These items are **planned** and **not yet implemented**. None of the systems below exist in the codebase.

### Parking domain model

The long-term direction separates concerns into a proper service layer:

```
City Data (DataSF / SFMTA — batch sync)
        ↓
Normalization (normalize-city-parking.ts → normalized_parking_locations)
        ↓
Parking Domain Model — IMPLEMENTED (V1), packages/shared/src/domain/ (pure, storage-independent)
  - ParkingLocation   (where something is — no legality/availability implied)
  - ParkingLegality   (LEGAL / ILLEGAL / UNKNOWN — type only, no evaluation yet)
  - ParkingAvailability (AVAILABLE / OCCUPIED / UNKNOWN)
  - ParkingEvidence   (source, observedAt, retrievedAt, expiresAt)
  - ParkingCandidate  (composition of the above + distance)
        ↓
Database Adapters — IMPLEMENTED (V1), packages/shared/src/adapters/ (only place that knows row shapes)
  - mapParkingSpotToCandidate, mapNormalizedLocationToCandidate
  - Dependency direction: adapters → domain (never the reverse)
        ↓
Parking Candidate Service — IMPLEMENTED (V1), packages/shared/src/services/
  - findParkingCandidates(request: ParkingCandidateSearchRequest, deps) → ParkingCandidate[]
  - request is location + radius only — NOT the broader ParkingSearchConstraints
    (that stays reserved for a future findLegalParking-style service; see
    packages/shared/src/domain/search.ts)
  - deps.fetchNearbySpots / fetchNearbyNormalizedLocations are injected by
    the caller (dependency injection) — this package still has no
    Supabase dependency; callers reuse their own existing queries
  - Applies exact-radius (haversine) distance filtering on whatever rows
    the fetcher returns
        ↓
Mobile Runtime Integration — IMPLEMENTED (V1), apps/mobile/src/services/candidateService.ts
  - apps/mobile depends on @smart-parking/shared as a normal pnpm workspace
    package (added to apps/mobile/package.json); Metro resolves and bundles
    it via the package's "main" field (verified with `expo export`)
  - fetchNearbyParkingSpotRows (parkingService.ts) / fetchNearbyNormalizedLocationRows
    (cityParkingService.ts) are the injected fetchers — apps/mobile still
    owns all Supabase access; packages/shared never does
  - Both fetchers use a corrected bounding-box prefilter
    (apps/mobile/src/utils/geoBoundingBox.ts) that scales the longitude
    offset by 1/cos(latitude) — the old `radiusMeters / 111_000` offset
    applied to both axes under-covered the east-west extent by ~20% at
    San Francisco's latitude
  - MapScreen's existing parking_spots list/map is UNCHANGED — it still
    calls getNearbyParkingSpots/getParkingSpots directly. The candidate
    service only powers an additive "City parking data (preview)" section,
    shown only when EXPO_PUBLIC_ENABLE_CITY_DATA_PREVIEW is on
        ↓
Parking Regulation Model — IMPLEMENTED (V1), packages/shared/src/domain/rule.ts
  - ParkingRule       (a known regulation/restriction — describes what
    applies, never whether a specific arrival/departure is legal)
  - ParkingRuleKind   ("METERED" | "TIME_LIMIT" | "OTHER" — narrow on
    purpose; only what city_parking_blocks can support deterministically
    today, see docs/CITY_DATA_PLAN.md "Regulation data — current
    capabilities")
  - ParkingRuleSchedule / ParkingTimeWindow / DayOfWeek (REPRESENTS
    applicability — days/time-window/all-day/maxDurationMinutes/timezone,
    all independently nullable; no evaluation function anywhere)
  - Reuses ParkingEvidence for provenance — no duplicate provenance type
        ↓
Regulation Adapter — IMPLEMENTED (V1 + Schedule Parser V1), packages/shared/src/adapters/regulation.ts
  - mapCityRegulationRowToParkingRules(row: CityParkingBlockRow) → ParkingRule[]
    (zero or more: TIME_LIMIT when hour_limit is a valid positive number;
    OTHER when regulation_type/agency/permit_area/days_of_week/hours carry
    any information, preserved verbatim; empty array otherwise)
  - Does NOT produce METERED — reviewed and corrected: the first version
    inferred METERED from "this row lives in city_parking_blocks", which
    is an unverified inference about the ingestion pipeline, not a fact
    proven on the row. METERED is reserved for a future, separate adapter
    over city_parking_meters (the structurally reliable meter-inventory
    table) — meter inventory and regulation are distinct concepts
  - Schedule Parser V1 (packages/shared/src/adapters/regulationSchedule.ts):
    TIME_LIMIT rules now carry parsed schedule.daysOfWeek and
    schedule.timeWindow when the source days_of_week/hours values match
    V1-supported DataSF formats (see CITY_DATA_PLAN.md "Regulation schedule
    parser V1" for exact supported/unsupported formats). allDay is set to
    false when a timeWindow is parsed, null otherwise — NEVER true (no
    source evidence of an all-day rule exists in V1). timezone is set to
    America/Los_Angeles for DataSF-sourced TIME_LIMIT rules. Raw source
    text is preserved in rawText regardless of parse result. The legality
    applicability gate (allDay === true) is UNCHANGED — schedule parsing
    and schedule applicability are not wired into LEGAL/ILLEGAL outcomes
    in this milestone.
  - NOT wired to any live Supabase query in this file — a separate
    lookup/association layer (below) now supplies rows to it
        ↓
Regulation Lookup Service — IMPLEMENTED (V1)
  - packages/shared/src/services/regulation.ts: findParkingRulesForLocation(
    locationId, { fetchCityParkingBlocksForLocation }) — fetches via the
    injected dependency, maps every row through
    mapCityRegulationRowToParkingRules, flattens. No SQL, no join logic,
    no Supabase dependency — pure orchestration, same DI pattern as
    findParkingCandidates
  - apps/mobile/src/services/regulationService.ts: fetchCityParkingBlocksForLocation(locationId)
    — the actual Supabase joins, tried in strength order (corrected from
    an earlier version that used only the weaker path):
      PRIMARY: locationId -> raw_source.city_row_id -> city_parking_meters.id
        -> city_parking_meters.block_id (real FK) -> city_parking_blocks.id
        (exact PK lookup, at most one row)
      FALLBACK (only when the primary path is unusable — city_row_id
      missing, meter not found, or block_id null): locationId ->
        raw_source.blockface_id -> city_parking_blocks.blockface_id
        (exact text match, not guaranteed one-to-one)
    ID-based only in both paths; no geographic/fuzzy matching. See
    docs/CITY_DATA_PLAN.md "Regulation lookup — join path" for the full
    comparison and cardinality notes.
  - apps/mobile/src/services/candidateService.ts: findParkingRulesForCandidate(candidate)
    — convenience wrapper wiring the two together; keeps candidateService.ts
    as the ONLY apps/mobile file that imports @smart-parking/shared as a
    runtime value (regulationService.ts only imports it as a type). Guards
    on `isCityProvenance(candidate)` first — non-CITY candidates
    (parking_spots-sourced) resolve to [] immediately, with no Supabase
    query, since their location.id belongs to a different table entirely
  - Answers "what regulations are associated with this location?" — NOT
    "is parking legal now?". No schedule evaluation. Not wired to any UI
        ↓
Schedule Applicability — IMPLEMENTED (V1), packages/shared/src/services/scheduleApplicability.ts
  - evaluateScheduleApplicability(schedule, interval) → { status, reason }
    status: APPLIES | DOES_NOT_APPLY | UNKNOWN
  - Pure function. Uses Intl.DateTimeFormat with schedule.timezone only
    (DataSF adapter sets America/Los_Angeles). Never uses machine TZ.
  - allDay === true → APPLIES for any valid interval. Windowed eval
    requires daysOfWeek + timeWindow + timezone. Partial data → UNKNOWN.
  - Half-open windows [start, end). Full containment → APPLIES. Zero
    overlap → DOES_NOT_APPLY. Partial overlap / multi-day / DST
    duration mismatch → UNKNOWN.
  - Wired into evaluateParkingLegality as the TIME_LIMIT applicability
    gate (legality does not reimplement weekday/window/DST logic)
        ↓
Legality Engine — IMPLEMENTED (V1 + schedule integration), packages/shared/src/services/legality.ts
  - evaluateParkingLegality(rules: ParkingRule[], interval: ParkingRequestedInterval) → ParkingLegality
    — a PURE function (no Supabase/network/env/React/mobile/LLM). Takes
    only a ParkingRule[] and a requested interval — deliberately does NOT
    accept ParkingCandidate (nothing about location/availability/distance
    affects the verdict). ParkingRequestedInterval (new,
    domain/legality.ts) requires both `arrival`/`departure` as full ISO
    8601 date-time strings with an explicit offset/`Z` — narrower than
    ParkingSearchConstraints' softer nullable "now"/"unknown duration"
    fields, which a future findLegalParking would resolve before calling
    this
  - TIME_LIMIT applicability is evaluateScheduleApplicability(...).status
    APPLIES + usable max exceeded → ILLEGAL / EXCEEDS_MAX_DURATION
    (outranks OTHER/METERED). UNKNOWN applicability, even if duration
    exceeds the limit → not ILLEGAL. DOES_NOT_APPLY → not ILLEGAL and
    not LEGAL. Duration is departureInstant - arrivalInstant, never
    local wall-clock subtraction.
  - Parsed time-window TIME_LIMIT (allDay !== true) may produce ILLEGAL
    or UNKNOWN — never a new LEGAL result. Incomplete city-data coverage
    means "this known limit is not violated" is not "parking is legal".
  - Legacy LEGAL remains only when EVERY known rule is TIME_LIMIT with
    allDay === true and a usable, non-exceeded maxDurationMinutes.
    Applicability is never inferred from rawText / sourceRegulationType /
    agency / permitArea content.
  - `maxDurationMinutes` must also be a plain finite, positive number to
    be "usable" — `NaN`/`Infinity`/`0`/negative values never prove either
    verdict, treated as no usable value instead of trusted
  - Interval parsing independently range-checks every calendar component
    (month 1-12, day vs. actual days-in-month incl. leap years, hour
    0-23, minute/second 0-59) BEFORE any date arithmetic — `new
    Date("2026-02-30T10:00:00Z")` silently normalizes to
    `2026-03-02T10:00:00.000Z` rather than rejecting it, which this
    engine must not allow; an impossible calendar date is UNKNOWN /
    INVALID_INTERVAL, never silently rolled into a different valid instant
  - Precedence: (1) invalid/impossible-calendar interval → UNKNOWN
    "INVALID_INTERVAL"; (2) no rules → UNKNOWN "INSUFFICIENT_RULE_DATA";
    (3) any CONFIRMED-APPLICABLE (allDay === true) TIME_LIMIT rule with a
    usable maxDurationMinutes that's exceeded → ILLEGAL
    "EXCEEDS_MAX_DURATION" (checked before OTHER/METERED/unresolved below
    — a proven, confirmed-applicable violation outranks "unknown"; an
    unresolved TIME_LIMIT is skipped here entirely, it cannot prove a
    violation); (4) otherwise any OTHER rule present → UNKNOWN
    "UNPARSED_RESTRICTION"; (5) otherwise any METERED rule present →
    UNKNOWN "INSUFFICIENT_RULE_DATA" (not currently produced by any
    adapter); (6) otherwise any TIME_LIMIT rule with unresolved
    applicability → UNKNOWN "INSUFFICIENT_RULE_DATA"; (7) otherwise LEGAL
    only if every rule is a confirmed-applicable TIME_LIMIT with a usable,
    non-exceeded maxDurationMinutes — since the current adapter never sets
    `allDay` to anything but `null`, LEGAL (and, after this correction,
    ILLEGAL via an unresolved rule) is effectively unreachable with
    today's real data for unresolved rules. That is intentional, not a
    bug: "no proven violation" is never converted into "LEGAL", and "not
    proven applicable" is never converted into "ILLEGAL"
  - ParkingLegality gained a new `reasonCode: LegalityReasonCode | null`
    field alongside the existing `reason` string (machine-readable
    counterpart) — "EXCEEDS_MAX_DURATION" | "INSUFFICIENT_RULE_DATA" |
    "UNPARSED_RESTRICTION" | "INVALID_INTERVAL" | null (null on LEGAL, and
    on the pre-existing adapter-level UNKNOWN placeholders that don't call
    this evaluator at all)
  - Verified by scripts/verify-legality-engine.ts (`pnpm
    verify:legality-engine`) — 23 in-memory cases including the
    applicability-gate correction, malformed maxDurationMinutes, and
    impossible-calendar-date rejection; no test framework added
  - Does NOT implement findLegalParking, recommendation ranking, schedule
    parsing/applicability evaluation, timezone conversion, street
    sweeping, or permit/meter-payment interpretation — none of that exists
    anywhere in this codebase yet
        ↓
Regulation Coverage / Legal-Conclusion Readiness — IMPLEMENTED (V1),
packages/shared/src/domain/coverage.ts +
packages/shared/src/services/regulationCoverage.ts
  - evaluateLegalConclusionReadiness({ candidate, rules,
    coverageDeclaration? }) → LegalConclusionCoverage
    { readiness: READY | INCOMPLETE, reasonCode, reason }
  - Pure function. No Supabase. No confidence/probability score.
  - READY: explicitly declared complete synthetic/MOCK TIME_LIMIT-only
    rule set with fully known schedules. The live CITY pipeline cannot
    prove this.
  - INCOMPLETE: no rules; undeclared completeness; CITY/COMMUNITY
    provenance; OTHER; METERED; unsupported/partial TIME_LIMIT schedule.
    Real CITY candidates are always INCOMPLETE in V1.
  - Coverage is NOT folded into ParkingLegality and is NOT a gate
    inside evaluateParkingLegality (the known-rule engine is unchanged).
    Coverage-gated composition is evaluateParkingLegalConclusion
    (packages/shared/src/services/legalConclusion.ts).
  - Verified by scripts/verify-regulation-coverage.ts
    (`pnpm verify:regulation-coverage`)
        ↓
Coverage-Gated Legal Conclusion — IMPLEMENTED (V1),
packages/shared/src/services/legalConclusion.ts
  - evaluateParkingLegalConclusion({ candidate, rules, interval,
    coverageDeclaration? }) → ParkingLegality
  - Composes evaluateParkingLegality + evaluateLegalConclusionReadiness.
    Does not put ParkingCandidate into the low-level engine.
  - ILLEGAL unchanged regardless of coverage. UNKNOWN unchanged (READY
    cannot invent LEGAL). LEGAL only when coverage is READY; otherwise
    UNKNOWN / INSUFFICIENT_RULE_DATA. No new LegalityReasonCode.
  - Verified by scripts/verify-legal-conclusion.ts
    (`pnpm verify:legal-conclusion`)
        ↓
Search + Legality Orchestration — IMPLEMENTED (V1),
packages/shared/src/services/orchestration.ts
  - findAndEvaluateParkingCandidates(request: {candidateSearch,
    interval, coverageDeclaration?}, deps) → EvaluatedParkingCandidate[]
    — connects findParkingCandidates → deps.fetchRulesForCandidate
    (injected, one call per candidate) → evaluateParkingLegalConclusion
    into one deterministic flow. coverageDeclaration defaults to
    UNDECLARED; production CITY lookup must not pass COMPLETE.
    deps.fetchRulesForCandidate has exactly
    candidateService.ts's findParkingRulesForCandidate's signature/
    semantics — the mobile wiring
    (candidateService.ts's findAndEvaluateNearbyParkingCandidates) passes
    that existing function in unchanged, so packages/shared still has no
    Supabase dependency and makes no provenance-routing decision itself
  - EvaluatedParkingCandidate { candidate, rules, legality } — explicit
    composition, never mutates candidate.legality (which stays the
    always-UNKNOWN placeholder from findParkingCandidates)
  - Deliberately NOT named findLegalParking: returns every discovered
    candidate — UNKNOWN legality included, in the same distance order
    findParkingCandidates produces — never only "legal" ones. No
    filtering, ranking, or scoring. findLegalParking remains reserved for
    a later milestone once rule-coverage semantics justify that name
  - Error isolation: a candidate-discovery failure fails the whole call
    (error propagates unchanged); an individual candidate's rule-lookup
    failure is caught and treated as `[]` rules (never fabricated) so the
    candidate is still returned with UNKNOWN/INSUFFICIENT_RULE_DATA —
    indistinguishable from a genuine "no known rules" result, a
    documented V1 limitation
  - Concurrency: a tiny dependency-free worker-pool helper
    (mapWithConcurrencyLimit) caps concurrent rule lookups at 8 by default
    (overridable via deps.maxConcurrentRuleLookups) — candidate discovery
    can return on the order of ~100-200 rows (mobile's per-fetcher query
    limits), so an unbounded Promise.all over rule lookups was avoided
  - Verified by scripts/verify-orchestration.ts (`pnpm
    verify:orchestration`) — 11 in-memory cases with fake injected
    fetchers, including coverage-gated LEGAL, ordering preservation, and
    per-candidate error isolation; no test framework added
  - Mobile wiring: candidateService.ts's
    findAndEvaluateNearbyParkingCandidates supplies the three real deps
    (fetchNearbySpots/fetchNearbyNormalizedLocations by source selection,
    fetchRulesForCandidate = findParkingRulesForCandidate). Not wired to
    any UI/screen in this milestone
  - Does NOT implement findLegalParking (filtering/ranking to only proven
    legal results), recommendation ranking, prediction, or any new
    legality/schedule logic — evaluateParkingLegalConclusion is the final
    per-candidate verdict; evaluateParkingLegality remains the known-rule
    engine inside that composition
        ↓
[FUTURE] findLegalParking (truthfully-named legal-only filtering)
  - A future filter/rank step over findAndEvaluateParkingCandidates'
    output, once rule-coverage is mature enough that "legal" is a
    meaningful, non-misleading guarantee. Not built.
  - isReportedAvailable(location)
  - getNearbyOptions(userLocation, criteria) — ParkingSearchConstraints contract exists; no implementation
        ↓
[FUTURE] Agent Tools (read-only, composable)
  - find_parking(near, filters)
  - check_legality(location, time)
  - get_restrictions(location)
        ↓
[FUTURE] Single Parking Agent / Harness
        ↓
[FUTURE] MCP interface (optional external layer)
```

**Status:** The pure domain model is implemented in `packages/shared/src/domain/` (no framework or storage dependencies). Database-row mapping adapters are implemented separately in `packages/shared/src/adapters/`, which depends on `domain` — never the reverse. A deterministic retrieval service, `packages/shared/src/services/` (`findParkingCandidates`), sits on top of both.

`apps/mobile` now depends on `@smart-parking/shared` as a real pnpm workspace runtime dependency (`apps/mobile/src/services/candidateService.ts` is the only mobile file that imports it as a value; everywhere else uses `import type`, which Metro never needs to resolve). This was verified, not assumed: `npx expo export --platform android` was run with the integration in place, and the resulting bundle's sourcemap was inspected to confirm `packages/shared/src/index.ts`, `adapters/parking.ts`, `services/parking.ts`, and `services/distance.ts` are genuinely present in the module graph. `apps/web` still does not import any of the three.

This integration is intentionally additive: the existing `parking_spots` list/map in `MapScreen` is untouched and still calls `getNearbyParkingSpots`/`getParkingSpots` directly. `findParkingCandidates` currently only powers a small, separately-rendered "City parking data (preview)" section, gated by the existing `EXPO_PUBLIC_ENABLE_CITY_DATA_PREVIEW` flag, which is OFF by default and was already wired to a Settings status row before this milestone. City candidates always carry `availability.status = "UNKNOWN"` and `legality.status = "UNKNOWN"` — normalized city inventory is never treated as proof of a legal, open space.

A deterministic regulation model (`ParkingRule`, `packages/shared/src/domain/rule.ts`) and its adapter (`mapCityRegulationRowToParkingRules`, `packages/shared/src/adapters/regulation.ts`) are also implemented. A `ParkingRule` describes a *regulation* ("2-hour limit") — never a legality verdict; `ParkingLegality.status` remains `"UNKNOWN"` everywhere, unchanged. The adapter only produces `TIME_LIMIT` (from the real `hour_limit` column) and `OTHER` (when other regulation fields carry unclassified information); it does **not** produce `METERED` — an earlier version incorrectly inferred that from table membership rather than a verified field, and was corrected before commit. `METERED` remains a valid `ParkingRuleKind`, reserved for a future adapter over `city_parking_meters` (the structurally reliable meter-inventory table); meter inventory and regulation are kept as distinct concepts.

The adapter is now wired to a live query, via a small lookup/association layer: `apps/mobile/src/services/regulationService.ts` resolves a candidate's `location.id` to `city_parking_blocks` row(s) through two ID-based joins tried in strength order — a primary `city_parking_meters.block_id` foreign-key lookup, falling back to a weaker `blockface_id` exact text match only when the FK path can't be used (see `docs/CITY_DATA_PLAN.md` "Regulation lookup — join path" for the full precedence and why) — and `packages/shared/src/services/regulation.ts`'s `findParkingRulesForLocation` fetches + maps + flattens the result into `ParkingRule[]`. `candidateService.ts`'s `findParkingRulesForCandidate(candidate)` wires the two together, guarding on `isCityProvenance(candidate)` first so non-CITY candidates resolve to `[]` without any query, while keeping `candidateService.ts` the only mobile file that imports `@smart-parking/shared` as a runtime value. This layer answers "what regulations are associated with this location?" only — it is not wired to any UI.

A pure, deterministic legality engine (`evaluateParkingLegality`, `packages/shared/src/services/legality.ts`) is also implemented. It takes only a `ParkingRule[]` and a new, narrower `ParkingRequestedInterval` (both `arrival`/`departure` required, full ISO 8601 with explicit offset/`Z` — unlike `ParkingSearchConstraints`' softer nullable fields) and returns a `ParkingLegality`. A `TIME_LIMIT` rule's `maxDurationMinutes` can only prove EITHER an `ILLEGAL` violation OR a `LEGAL` verdict once its `schedule.allDay === true` ("confirmed-applicable") — reviewed and corrected: an earlier version let any exceeded `TIME_LIMIT` rule prove `ILLEGAL` regardless of `allDay`, which was asymmetric; an unresolved rule (`allDay` not `true`) now proves neither direction and contributes `UNKNOWN` instead. The engine also independently range-checks every calendar component of `arrival`/`departure` (day-of-month vs. actual days in that month/year, hour/minute/second bounds) before any arithmetic, since `new Date("2026-02-30T10:00:00Z")` would otherwise silently roll over to a different, valid instant instead of being rejected. It never parses free text, never evaluates `daysOfWeek`/`timeWindow`, and never assumes a timezone. "No proven violation" is never converted into `LEGAL`, and "not proven applicable" is never converted into `ILLEGAL` — with today's real ingested data (where `allDay` is always `null`), an unresolved `TIME_LIMIT` rule alone can only ever produce `UNKNOWN`; a small machine-readable `reasonCode` field was added to `ParkingLegality` to make the "why" explicit. This remained the evaluator only in that milestone — no orchestration existed yet.

That orchestration now exists: `findAndEvaluateParkingCandidates` (`packages/shared/src/services/orchestration.ts`) connects `findParkingCandidates` → an injected per-candidate rule fetcher → `evaluateParkingLegality` into one deterministic flow, returning `EvaluatedParkingCandidate[]` (`{ candidate, rules, legality }`, explicit composition — `candidate.legality` itself is never mutated). It is deliberately **not** named `findLegalParking`: it returns every discovered candidate, `UNKNOWN` legality included, in distance order — a name promising "legal parking" would overstate what today's rule coverage can prove. The rule-fetcher dependency (`fetchRulesForCandidate`) is injected with exactly `candidateService.ts`'s existing `findParkingRulesForCandidate` signature, so `packages/shared` still has zero Supabase dependency and makes no CITY-provenance routing decision of its own — it only calls what it is given. A candidate-discovery failure fails the whole call (propagated unchanged); an individual candidate's rule-lookup failure is caught per-candidate and treated as `[]` rules (never fabricated), preserving that candidate as `UNKNOWN`/`INSUFFICIENT_RULE_DATA`. A small dependency-free worker-pool helper bounds rule-lookup concurrency (default 8 concurrent, overridable) rather than firing an unbounded `Promise.all` across up to ~100-200 candidates. `apps/mobile/src/services/candidateService.ts`'s `findAndEvaluateNearbyParkingCandidates` wires the three real dependencies (the existing mobile fetchers, unchanged) but is not wired to any UI/screen. `findLegalParking` — real filtering/ranking down to only proven-legal results — ranking, prediction, schedule-applicability evaluation, timezone conversion, street-sweeping ingestion, freshness calculation, agent tools, and MCP all remain entirely unbuilt.

**Important:** MCP is an optional access interface at the boundary — not where business logic lives. Core parking services must be deterministic and independently testable without MCP.

### Edge Functions

A `sync-city-parking` Edge Function (not yet created) would replace the local ingest scripts with a scheduled, server-side pipeline:

```
Supabase cron → Edge Function (service role)
  → DataSF / SFMTA paginated fetch
  → upsert city_parking_sources / city_parking_blocks / city_parking_meters
  → trigger normalize step
  → update import audit log
```

### EAS native map

When an EAS development build is produced:
1. Set `EXPO_PUBLIC_GOOGLE_MAPS_API_KEY` in `apps/mobile/.env`
2. Run `pnpm build:dev:android` or `pnpm build:dev:ios`
3. `isNativeMapSupported()` will return `true` in the dev build
4. Map/list toggle activates; `ParkingMapView` renders with real `react-native-maps` pins

No code changes are needed — the feature flag and component are already implemented.

---

*Last updated: September 2026 — reflects Expo SDK 54 / Next.js 15 monorepo state.*

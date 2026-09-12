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
| Parking Regulations (blockface map) | `hi6h-neyh` | `city_parking_blocks` (merged) |

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
  - Applies exact-radius distance filtering on whatever rows the fetcher
    returns; does not fix any prefilter inaccuracy upstream of it
        ↓
[FUTURE] Deterministic Parking Services
  - isLegalToParkNow(location, time) — needs a curb-rule model (not built)
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

**Status:** The pure domain model is implemented in `packages/shared/src/domain/` (no framework or storage dependencies). Database-row mapping adapters are implemented separately in `packages/shared/src/adapters/`, which depends on `domain` — never the reverse. A deterministic retrieval service, `packages/shared/src/services/` (`findParkingCandidates`), sits on top of both. None of the three are yet imported by `apps/mobile` or `apps/web` — no UI or service currently constructs a `ParkingCandidate`. Curb-rule ingestion, legality evaluation, freshness calculation, ranking, agent tools, and MCP remain entirely unbuilt.

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

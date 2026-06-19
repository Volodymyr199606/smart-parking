# Smart Parking — Mobile App

React Native Expo app for iOS and Android. This is the main product.

## Purpose

Help drivers in San Francisco find available street parking in real time.

## Expo Go (recommended for demos)

The **list-view MVP runs fully in Expo Go** on iPhone or Android — no EAS build, no Apple signing required.

```bash
# From the monorepo root
pnpm install

cd apps/mobile
cp .env.example .env   # add Supabase credentials
pnpm start
# or: pnpm start:tunnel
```

Scan the QR code with **Expo Go** (not the iPhone Camera app).

> **Important:** Because `expo-dev-client` is installed for future EAS builds, use `pnpm start` (includes `--go`) for Expo Go. Plain `expo start` without `--go` opens a dev-client QR that Expo Go cannot read.

**What works in Expo Go:**

- Login, register, logout
- Parking list with live Supabase data (nearby + demo fallback)
- Search, filters (including **Favorites** filter chip)
- Heart toggle — save / remove favorites
- Pull-to-refresh, spot detail, report status, directions
- Realtime updates (live badge)
- Profile with favorites + reports counts
- Settings screen
- Basic analytics events

**Expo Go note:** The parking screen shows a banner — *“Map view coming soon · Showing nearby parking list”* — by design. Native map is **postponed** until an EAS development build.

If Expo CLI has network issues:

```bash
# Windows
set EXPO_OFFLINE=1 && pnpm start -c

# macOS/Linux
EXPO_OFFLINE=1 pnpm start -c
```

If LAN scanning fails, use tunnel mode:

```bash
pnpm start:tunnel
```

## Native map (postponed — EAS later)

Native map pins require an **EAS development build** (not Expo Go). See [EAS Development Build](#eas-development-build-map-view) below when you are ready for map view.

## Current Features

| Feature | Status |
|---------|--------|
| Welcome screen | Working |
| Login / Register (Supabase Auth) | Working |
| Logout (Profile + Settings) | Working |
| Parking spot list with live data | Working (Expo Go) |
| Nearby parking (location-based) | Working |
| Search by street / address | Working |
| Filter by status, type, favorites | Working |
| Favorites (heart toggle) | Working |
| Pull-to-refresh | Working |
| Spot detail card with status | Working |
| Report spot status | Working |
| Realtime updates (live badge) | Working |
| Get directions (opens Maps app) | Working |
| Profile stats (favorites + reports) | Working |
| Settings screen | Working |
| Analytics events | Working |
| Map view with parking pins | **Postponed** — EAS dev build only |

## Known Limitations

- **Expo Go** — list MVP only; native maps need a custom dev build (postponed).
- **Nearby query** — capped at 100 spots per load for performance.
- **City data** — ingestion scripts exist as a prototype; MVP list uses `parking_spots` seed data.
- **Push notifications** — not implemented.

## Required Environment Variables

Copy the template and fill in your Supabase project values:

```bash
cp .env.example .env
```

See [`.env.example`](./.env.example) for all supported variables:

| Variable | Required | Description |
|----------|----------|-------------|
| `EXPO_PUBLIC_SUPABASE_URL` | Yes | Supabase project URL |
| `EXPO_PUBLIC_SUPABASE_ANON_KEY` | Yes | Supabase anon (public) key |
| `EXPO_PUBLIC_ENABLE_CITY_DATA_PREVIEW` | No | City data preview in Settings (default `false`) |
| `EXPO_PUBLIC_ENABLE_MAP` | No | Native map toggle for EAS builds (default on) |
| `EXPO_PUBLIC_GOOGLE_MAPS_API_KEY` | No | Android Google Maps key for EAS builds |

Get Supabase values from **Settings → API** in the dashboard.

If required vars are missing, the app shows a configuration error screen instead of crashing silently.

## How to Run (Expo Go)

```bash
cd apps/mobile
pnpm start
```

Options:

- Scan QR with **Expo Go** on a physical device — use `pnpm start`, not `pnpm start:dev`
- Press `a` for Android emulator / `i` for iOS simulator
- Tunnel if LAN fails: `pnpm start:tunnel`

## EAS Development Build (Map View — later)

Native maps (`react-native-maps`) are **not** supported in Expo Go. Use an EAS **development** build when you are ready for map pins.

### One-time setup

```bash
npm install -g eas-cli
cd apps/mobile
npx eas login
npx eas init
```

Ensure `apps/mobile/.env` has your Supabase credentials.

### Build

```bash
cd apps/mobile
pnpm build:dev:ios      # iPhone — requires Apple Developer
pnpm build:dev:android  # Android APK
```

### Run with the dev client

After installing the development build:

```bash
pnpm start:dev
# Scan QR with the Smart Parking dev app (not Expo Go)
```

- **Dev build:** Map/List toggle with colored pins.
- **If map fails:** falls back to list automatically.
- **Disable map:** `EXPO_PUBLIC_ENABLE_MAP=false` in `.env`.

## Folder Structure

```
apps/mobile/
├── App.tsx                → Entry point (AuthProvider + Navigation)
├── app.config.js          → Expo config (location + EAS project)
├── eas.json               → EAS build profiles
├── .env.example           → Env template (copy to .env)
├── index.js               → Expo bootstrap
├── metro.config.js        → Metro config
├── package.json           → Dependencies
└── src/
    ├── screens/           → Welcome, Login, Register, Map, Profile, Settings
    ├── components/        → AppButton, ParkingSpotCard, ParkingMapView, ...
    ├── utils/             → mapSupport, getErrorMessage, parkingSpotsState
    ├── navigation/        → RootNavigator
    ├── contexts/          → AuthContext
    ├── hooks/             → useRealtimeSpots
    ├── services/          → supabaseClient, parkingService, favoritesService, analyticsService
    └── constants/         → theme, env
```

## Design Principles

- Clean, minimalistic, professional
- Generous whitespace and spacing
- Rounded cards and pill buttons
- Green = available, Red = occupied, Gray = unknown
- No clutter, no heavy animations

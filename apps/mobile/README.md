# Smart Parking — Mobile App

React Native Expo app for iOS and Android. This is the main product.

## Purpose

Help drivers in San Francisco find available street parking in real time.

## Expo Go (recommended for demos)

The **list-view MVP runs fully in Expo Go** on iPhone — no EAS build, no Apple signing required.

```bash
# From the monorepo root
pnpm install

cd apps/mobile
cp .env.example .env   # add Supabase credentials
pnpm start
# or: npx expo start --go
```

Scan the QR code with **Expo Go** (not the iPhone Camera app).

> **Important:** Because `expo-dev-client` is installed for future EAS builds, you must use `--go` (or `pnpm start`) for Expo Go. Plain `expo start` opens a dev-client QR that Expo Go cannot read.

Scan the QR code with **Expo Go** on your iPhone (same Wi‑Fi).

**What works in Expo Go:**
- Login, register, logout
- Parking list with live Supabase data
- Search, filters, pull-to-refresh
- Spot detail, report status, directions
- Realtime updates (live badge)

**Expo Go note:** The parking screen shows a banner — *“Map view coming soon · Showing nearby parking list”* — and uses the polished list UI.

If Expo CLI has network issues:

```bash
# Windows
set EXPO_OFFLINE=1 && pnpm start -c

# macOS/Linux
EXPO_OFFLINE=1 pnpm start -c
```

If LAN scanning fails, use tunnel mode (still Expo Go):

```bash
pnpm start:tunnel
```

## Native map (optional, later)

Native map pins require an **EAS development build** (not Expo Go). See [EAS Development Build](#eas-development-build-map-view) below if you want map view later.

## Current Features

| Feature | Status |
|---------|--------|
| Welcome screen | Working |
| Login (Supabase Auth) | Working |
| Register (Supabase Auth) | Working |
| Parking spot list with live data | Working (Expo Go) |
| Search by street/address | Working |
| Filter by status and type | Working |
| Pull-to-refresh | Working |
| Location-based loading | Working |
| Spot detail card with status | Working |
| Report spot status (available/occupied/unknown) | Working |
| Realtime updates (live badge) | Working |
| Get directions (opens Maps app) | Working |
| Profile with sign out | Working |
| Map view with parking pins | EAS dev build only |

## Known Limitations

- **Expo Go** — list MVP only; native maps need a custom dev build.
- **Profile stats** — "Reports submitted" and "Favorite spots" show "Coming soon".
- **No favorites** — planned for next phase.

## Required Environment Variables

Create a `.env` file in this directory:

```env
EXPO_PUBLIC_SUPABASE_URL=https://your-project-ref.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=your-anon-public-key-here
```

Get these from your Supabase project: **Settings → API**.

## How to Run (Expo Go)

```bash
cd apps/mobile
pnpm start
```

Options:
- Scan QR code with **Expo Go** on a physical device (same WiFi) — use `pnpm start`, not `pnpm start:dev`
- Press `a` for Android emulator
- Press `i` for iOS simulator
- Use tunnel if LAN doesn't work: `pnpm start:tunnel`

## EAS Development Build (Map View)

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
├── index.js               → Expo bootstrap
├── metro.config.js        → Metro config
├── package.json           → Dependencies
└── src/
    ├── screens/           → Welcome, Login, Register, MapScreen, Profile
    ├── components/        → AppButton, ParkingSpotCard, ParkingMapView, ...
    ├── utils/             → mapSupport (native map detection)
    ├── navigation/        → RootNavigator
    ├── contexts/          → AuthContext
    ├── hooks/             → useRealtimeSpots
    ├── services/          → supabaseClient, parkingService
    └── constants/         → theme, env
```

## Design Principles

- Clean, minimalistic, professional
- Generous whitespace and spacing
- Rounded cards and pill buttons
- Green = available, Red = occupied, Gray = unknown
- No clutter, no heavy animations

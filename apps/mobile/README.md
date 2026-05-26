# Smart Parking — Mobile App

React Native Expo app for iOS and Android. This is the main product.

## Purpose

Help drivers in San Francisco find available street parking in real time.

## Current Features

| Feature | Status |
|---------|--------|
| Welcome screen | Working |
| Login (Supabase Auth) | Working |
| Register (Supabase Auth) | Working |
| Parking spot list with live data | Working |
| Search by street/address | Working |
| Filter by status and type | Working |
| Pull-to-refresh | Working |
| Location-based loading | Working |
| Spot detail card with status | Working |
| Report spot status (available/occupied/unknown) | Working |
| Realtime updates (live badge) | Working |
| Get directions (opens Maps app) | Working |
| Profile with sign out | Working |
| Map view | Not yet (requires development build) |

## Known Limitations

- **No map view** — `react-native-maps` requires a custom development build via EAS. The current MVP uses a list view in Expo Go.
- **Profile stats** — "Reports submitted" and "Favorite spots" are not yet wired to the database.
- **No favorites** — planned for next phase.

## Required Environment Variables

Create a `.env` file in this directory:

```env
EXPO_PUBLIC_SUPABASE_URL=https://your-project-ref.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=your-anon-public-key-here
```

Get these from your Supabase project: **Settings → API**.

## How to Run

```bash
# From the monorepo root
pnpm install

# Start the app
cd apps/mobile
npx expo start
```

Options:
- Scan QR code with **Expo Go** on a physical device (same WiFi)
- Press `a` for Android emulator
- Press `i` for iOS simulator
- Use `--tunnel` if LAN doesn't work: `npx expo start --tunnel`

If Expo CLI crashes with network errors, start in offline mode:

```bash
# Windows
set EXPO_OFFLINE=1 && npx expo start -c

# macOS/Linux
EXPO_OFFLINE=1 npx expo start -c
```

## Folder Structure

```
apps/mobile/
├── App.tsx                → Entry point (AuthProvider + Navigation)
├── index.js               → Expo bootstrap
├── metro.config.js        → Monorepo-aware Metro config
├── app.json               → Expo config
├── package.json           → Dependencies
└── src/
    ├── screens/           → WelcomeScreen, LoginScreen, RegisterScreen, MapScreen, ProfileScreen
    ├── components/        → AppButton, AppInput, ParkingSpotCard, AvailabilityBadge, ScreenContainer
    ├── navigation/        → RootNavigator (auth-gated stack)
    ├── contexts/          → AuthContext (Supabase auth state)
    ├── hooks/             → useRealtimeSpots (live parking updates)
    ├── services/          → supabaseClient, parkingService, authService
    ├── constants/         → theme (colors, spacing, fonts), env
    └── types/             → RootStackParamList, env declarations
```

## Design Principles

- Clean, minimalistic, professional
- Generous whitespace and spacing
- Rounded cards and pill buttons
- Green = available, Red = occupied, Gray = unknown
- No clutter, no heavy animations

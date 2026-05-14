# Smart Parking — Mobile App

React Native Expo app for iOS and Android. This is the main product.

## Purpose

Help drivers in San Francisco find available street parking in real time.

## Current Screens

| Screen | Status | Description |
|--------|--------|-------------|
| Welcome | Placeholder | Landing screen with Get Started / Sign In buttons |
| Login | Placeholder | Email + password form (no auth connected yet) |
| Register | Placeholder | Full name, email, password form |
| Map | Placeholder | Mock parking spot list (map integration coming) |
| Profile | Placeholder | User info and sign out |

## Reusable Components

| Component | Description |
|-----------|-------------|
| `ScreenContainer` | Safe area wrapper with consistent padding |
| `AppButton` | Primary, secondary, and outline button variants |
| `AppInput` | Labeled text input with error state |
| `ParkingSpotCard` | Card displaying spot info and availability |
| `AvailabilityBadge` | Color-coded status badge (green/red/gray) |

## Folder Structure

```
apps/mobile/
├── App.tsx                → Entry point
├── app.json               → Expo config
├── package.json           → Dependencies
├── tsconfig.json          → TypeScript config
├── babel.config.js        → Babel config
├── assets/                → Icons and images (placeholder)
└── src/
    ├── screens/           → App screens
    ├── components/        → Reusable UI components
    ├── navigation/        → React Navigation setup
    ├── constants/         → Theme (colors, spacing, fonts)
    ├── types/             → TypeScript types
    ├── hooks/             → Custom hooks (future)
    ├── services/          → API/Supabase services (future)
    └── utils/             → Utility functions (future)
```

## How to Run

```bash
cd apps/mobile
pnpm install
pnpm start
```

Then press:
- `i` for iOS simulator
- `a` for Android emulator
- Scan QR code with Expo Go on a physical device

## Next Steps

- [ ] Connect Supabase Auth (login/register)
- [ ] Add react-native-maps with real SF parking data
- [ ] Subscribe to Supabase Realtime for live updates
- [ ] Add favorites feature
- [ ] Add spot reporting (mark as available/occupied)

## Design Principles

- Clean, minimalistic, professional
- Generous whitespace and spacing
- Rounded cards and pill buttons
- Green = available, Red = occupied, Gray = unknown
- No clutter, no heavy animations
- Feels like a real startup product

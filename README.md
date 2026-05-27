# Smart Parking

Real-time street parking availability for San Francisco drivers.

---

## Project Structure

This is a TypeScript-first monorepo with the following layout:

```
smart-parking/
├── apps/
│   ├── mobile/        → React Native Expo app (iOS + Android) — main product
│   └── web/           → Next.js marketing website (landing + waitlist)
├── packages/
│   └── shared/        → Shared TypeScript types, constants, helpers
├── supabase/
│   ├── migrations/    → SQL migration files (3 migrations)
│   └── seed/          → Seed data for development (26 SF parking spots)
├── archive/
│   └── ...            → Previous Java/Spring Boot backend (reference only)
└── README.md          → This file
```

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Mobile App | React Native + Expo 54 (TypeScript, React 19) |
| Website | Next.js 15 + Tailwind CSS 4 (TypeScript, React 19) |
| Backend | Supabase (Postgres, Auth, Realtime) |
| Database | PostgreSQL via Supabase |
| Shared | `@smart-parking/shared` workspace package |
| Deployment | Expo Go (dev) / EAS (production) · Vercel (web) |

## Current MVP Status

| Feature | Status |
|---------|--------|
| Supabase Auth (signup, login, logout) | Working |
| Parking spots loaded from Supabase | Working |
| User spot reports (available/occupied/unknown) | Working |
| Realtime updates via Supabase channels | Working |
| Location-based spot loading | Working |
| Search and filter (status, type) | Working |
| Profile with user info | Working |
| List-based spot browsing | Working |
| Map view (react-native-maps) | Not yet — requires dev build |
| Marketing website (landing + waitlist) | Working |
| Favorites | Not yet |
| Push notifications | Not yet |

## Architecture

The mobile app connects directly to Supabase:
- **Auth** — email/password signup and login with session persistence
- **Database** — parking spots and user reports via PostgREST
- **Realtime** — live updates when spots change status

The app uses a **list view** instead of a map because `react-native-maps` requires a custom development build (not available in Expo Go). Map integration is planned for the next phase.

## Getting Started

```bash
# Install all dependencies (monorepo)
pnpm install
```

Run the mobile app:

```bash
cd apps/mobile
cp .env.example .env   # Add your Supabase credentials
npx expo start
```

Run the marketing website:

```bash
cd apps/web
pnpm dev
# Open http://localhost:3000
```

- See [`apps/mobile/README.md`](./apps/mobile/README.md) for mobile setup.
- See [`apps/web/README.md`](./apps/web/README.md) for website details.
- See [`supabase/README.md`](./supabase/README.md) for database setup.

## Branch

Active development happens on the `rebuild-next-supabase` branch.

## License

See [LICENSE](./LICENSE).

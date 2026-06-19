# Smart Parking

**Real-time street parking for San Francisco — mobile-first, Supabase-powered.**

Smart Parking helps drivers find open spots faster. The **mobile app** (React Native + Expo) is the main product: search nearby parking, filter by availability, save favorites, get directions, and report status with live updates. The **website** (Next.js) is the landing page, interactive demo, and waitlist for early access.

**Portfolio demo:** See **[DEMO.md](./DEMO.md)** for a full walkthrough, architecture summary, and step-by-step demo script for recruiters and hackathons.

| Surface | Purpose | Demo today |
|---------|---------|------------|
| **Mobile app** | Core product for drivers | **Expo Go** — polished list-view MVP |
| **Website** | Marketing + waitlist | Local or **Vercel** deploy |
| **Supabase** | Auth, database, realtime | Shared backend for both |

**Native map / EAS:** Postponed for the current MVP. Expo Go uses a **list view** (banner: *“Map view coming soon”*). Native map pins (`react-native-maps`) are prepared for a later **EAS development build** — not required to demo core flows.

---

## Project Structure

This is a TypeScript-first monorepo:

```
smart-parking/
├── apps/
│   ├── mobile/        → React Native Expo app (iOS + Android) — main product
│   └── web/           → Next.js marketing website (landing + waitlist)
├── packages/
│   └── shared/        → Shared TypeScript types, constants, helpers
├── supabase/
│   ├── migrations/    → SQL migration files (00001–00010)
│   └── seed/          → Seed data for development (26 SF parking spots)
├── scripts/           → City data ingestion prototype (optional)
├── archive/           → Previous Java/Spring stack (reference only)
├── DEMO.md            → Demo script & portfolio guide
└── README.md          → This file
```

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Mobile App | React Native + Expo 54 (TypeScript, React 19) |
| Website | Next.js 15 + Tailwind CSS 4 (TypeScript, React 19) |
| Backend | Supabase (Postgres, Auth, Realtime) |
| Database | PostgreSQL via Supabase |
| Deployment | Expo Go (demo) / EAS (native map later) · Vercel (web) |

## Current MVP Status

| Feature | Status |
|---------|--------|
| Auth (signup, login, logout) | Working |
| Parking list (Supabase + nearby query) | Working |
| Search by street / address | Working |
| Filters (Available, Occupied, Metered, Free) | Working |
| Nearby parking (location + bounding box) | Working |
| User spot reports (available / occupied / unknown) | Working |
| Realtime updates (live badge) | Working |
| Favorites (heart toggle) | Working |
| Favorites filter chip | Working |
| Profile with real stats (favorites + reports counts) | Working |
| Settings screen | Working |
| Basic analytics events | Working |
| List-based spot browsing (Expo Go) | Working |
| Marketing website + Supabase waitlist | Working |
| City data ingestion prototype (`scripts/`, migrations 00005–00007) | Prototype / optional |
| Native map view | **Postponed** — EAS dev build later |
| Push notifications | Not yet |

## Architecture

The mobile app connects directly to Supabase:

- **Auth** — email/password signup and login with session persistence
- **Database** — parking spots, reports, favorites, analytics via PostgREST
- **Realtime** — live updates when spots change status
- **Reports** — secure status updates via `update_parking_spot_status` RPC (migration `00010`)

The **list view** is the default in Expo Go. Native maps require a custom EAS development build and are optional for later.

The marketing website uses the same Supabase project for **waitlist signups** (`waitlist_signups` table). Row Level Security allows insert only from the browser.

### Supabase migrations (apply in order)

| # | File | Purpose |
|---|------|---------|
| 1 | `00001_initial_schema.sql` | Core tables, RLS, triggers |
| 2 | `00002_allow_spot_status_update.sql` | Legacy UPDATE policy (removed by 00010) |
| 3 | `00003_enable_realtime.sql` | Realtime on `parking_spots` |
| 4 | `00004_waitlist_signups.sql` | Website waitlist |
| 5 | `00005_city_parking_data.sql` | City ingest tables (optional) |
| 6 | `00006_city_parking_views.sql` | City data views (optional) |
| 7 | `00007_normalized_city_parking.sql` | Normalized city locations (optional) |
| 8 | `00008_favorite_parking_spots.sql` | User favorites |
| 9 | `00009_analytics_events.sql` | Analytics events |
| 10 | `00010_secure_parking_spot_status_update.sql` | Secure report RPC |

See [`supabase/README.md`](./supabase/README.md) for apply instructions.

## Getting Started

```bash
# Install all dependencies (monorepo)
pnpm install
```

**Mobile (Expo Go — recommended for demos):**

```bash
cd apps/mobile
cp .env.example .env   # Add your Supabase credentials
pnpm start             # Expo Go (--go flag included)
# Tunnel if LAN fails: pnpm start:tunnel
```

**Website:**

```bash
cd apps/web
cp .env.example .env.local
pnpm dev
# Open http://localhost:3000
```

### Website waitlist setup

1. Apply Supabase migrations through `00010` (see [`supabase/README.md`](./supabase/README.md)).
2. Set `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` in `apps/web/.env.local`.
3. For Vercel: root directory `apps/web`, same env vars in project settings.

## Documentation

| Doc | Description |
|-----|-------------|
| [**DEMO.md**](./DEMO.md) | Portfolio & hackathon demo guide |
| [apps/mobile/README.md](./apps/mobile/README.md) | Mobile setup, Expo Go, env vars, EAS (later) |
| [apps/web/README.md](./apps/web/README.md) | Website & waitlist |
| [supabase/README.md](./supabase/README.md) | Database & migrations |
| [docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md) | Detailed architecture (reference) |

## License

See [LICENSE](./LICENSE).

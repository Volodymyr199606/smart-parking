# Smart Parking

**Real-time street parking for San Francisco — mobile-first, Supabase-powered.**

Smart Parking helps drivers find open spots faster. The **mobile app** (React Native + Expo) is the main product: search nearby parking, filter by availability, get directions, and report status with live updates. The **website** (Next.js) is the landing page, interactive demo, and waitlist for early access.

**Portfolio demo:** See **[DEMO.md](./DEMO.md)** for a full walkthrough, architecture summary, and step-by-step demo script for recruiters and hackathons.

| Surface | Purpose | Demo today |
|---------|---------|------------|
| **Mobile app** | Core product for drivers | **Expo Go** — polished list-view MVP |
| **Website** | Marketing + waitlist | Local or **Vercel** deploy |
| **Supabase** | Auth, database, realtime | Shared backend for both |

**Note:** The current Expo Go build uses a **list view** (not native map pins). Native map support is prepared for a later **EAS development build**; it is not required to demo the MVP.

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
│   ├── migrations/    → SQL migration files (4 migrations)
│   └── seed/          → Seed data for development (26 SF parking spots)
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
| Supabase Auth (signup, login, logout) | Working |
| Parking spots loaded from Supabase | Working |
| User spot reports (available/occupied/unknown) | Working |
| Realtime updates via Supabase channels | Working |
| Location-based spot loading | Working |
| Search and filter (status, type) | Working |
| Profile with user info | Working |
| List-based spot browsing (Expo Go) | Working |
| Marketing website + Supabase waitlist | Working |
| Native map view | EAS dev build later |
| Favorites | Not yet |
| Push notifications | Not yet |

## Architecture

The mobile app connects directly to Supabase:

- **Auth** — email/password signup and login with session persistence
- **Database** — parking spots and user reports via PostgREST
- **Realtime** — live updates when spots change status

The **list view** is the default in Expo Go. Native maps (`react-native-maps`) require a custom EAS development build and are optional for later.

The marketing website uses the same Supabase project for **waitlist signups** (`waitlist_signups` table). Row Level Security allows insert only from the browser.

## Getting Started

```bash
# Install all dependencies (monorepo)
pnpm install
```

**Mobile (Expo Go — recommended for demos):**

```bash
cd apps/mobile
cp .env.example .env   # Add your Supabase credentials
npx expo start
```

**Website:**

```bash
cd apps/web
cp .env.example .env.local
pnpm dev
# Open http://localhost:3000
```

### Website waitlist setup

1. Apply all Supabase migrations including `00004_waitlist_signups.sql` (see [`supabase/README.md`](./supabase/README.md)).
2. Set `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` in `apps/web/.env.local`.
3. For Vercel: root directory `apps/web`, same env vars in project settings.

## Documentation

| Doc | Description |
|-----|-------------|
| [**DEMO.md**](./DEMO.md) | Portfolio & hackathon demo guide |
| [apps/mobile/README.md](./apps/mobile/README.md) | Mobile setup, Expo Go, EAS |
| [apps/web/README.md](./apps/web/README.md) | Website & waitlist |
| [supabase/README.md](./supabase/README.md) | Database & migrations |
| [docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md) | Detailed architecture (reference) |

## License

See [LICENSE](./LICENSE).

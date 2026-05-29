# Smart Parking — Demo & Portfolio Guide

This document helps you present Smart Parking to recruiters, hackathon judges, and portfolio reviewers. It focuses on what the product does, how to demo it, and what is planned next.

---

## Project Overview

**Smart Parking** is a mobile-first app that helps drivers in San Francisco find street parking faster. Users see nearby spots, filter by availability and type, open directions, and report status so others get live updates.

The project is a **TypeScript monorepo** with three main parts:

| Part | Role |
|------|------|
| **Mobile app** (`apps/mobile`) | Main product — drivers use this on the go |
| **Website** (`apps/web`) | Marketing landing page, product demo, waitlist signup |
| **Supabase** (`supabase/`) | Backend — Postgres, Auth, Realtime, Row Level Security |

The mobile app is the core deliverable. The website supports discovery, storytelling, and early-access signups.

---

## Problem

Finding street parking in dense cities is frustrating:

- Drivers circle blocks without knowing what is open
- Availability changes minute by minute
- No single place combines location, status, and community updates
- Manual searching wastes time and fuel

---

## Solution

Smart Parking gives drivers a simple workflow:

1. Open the app and see parking near you (list view in the current MVP)
2. Search and filter by status or type
3. Tap a spot for details
4. Get directions in Apple Maps or Google Maps
5. Report Available / Occupied / Unknown so the community stays current
6. See updates in near real time via Supabase Realtime

The website explains the product, shows an interactive phone demo, and collects waitlist signups for launch.

---

## Tech Stack

| Layer | Technology |
|-------|------------|
| Mobile | React Native, Expo 54, TypeScript, React Navigation |
| Website | Next.js 15, Tailwind CSS 4, TypeScript |
| Backend | Supabase (PostgreSQL, Auth, Realtime) |
| Tooling | pnpm monorepo |
| Mobile demo | Expo Go (list MVP) |
| Mobile map (later) | EAS development build + react-native-maps |
| Web deploy | Vercel (`apps/web` root) |

---

## Architecture Summary

```
┌─────────────────────┐     ┌─────────────────────┐
│   Mobile App        │     │   Marketing Website │
│   (Expo / RN)       │     │   (Next.js)         │
│   Main product      │     │   Landing + waitlist│
└──────────┬──────────┘     └──────────┬──────────┘
           │                           │
           │    @supabase/supabase-js  │
           └───────────┬───────────────┘
                       ▼
           ┌───────────────────────┐
           │   Supabase            │
           │   Auth · Postgres ·   │
           │   Realtime · RLS      │
           └───────────────────────┘
```

**Design choices:**

- **No custom backend server** — clients talk to Supabase directly (good for MVP speed)
- **Row Level Security** — permissions enforced in the database
- **Realtime** — `parking_spots` changes broadcast to connected clients
- **List-first mobile UI** — works in Expo Go without native map binaries

For deeper technical detail, see [`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md).

---

## Mobile App Demo Flow

**Environment:** Expo Go on iPhone (or Android). Requires `apps/mobile/.env` with Supabase credentials.

**What reviewers see:** A polished **list-view MVP** with a banner: *“Map view coming soon · Showing nearby parking list.”*

| Step | Action | What to highlight |
|------|--------|-------------------|
| 1 | Open app in Expo Go | No app store build required for demo |
| 2 | Register or log in | Supabase Auth, session persistence |
| 3 | View parking list | Live data from `parking_spots` (26 seeded SF spots) |
| 4 | Search / filter | By street, Available, Occupied, Metered, Free |
| 5 | Tap a spot | Detail card with status, price, time limit |
| 6 | Get directions | Opens native Maps app |
| 7 | Report status | Inserts `parking_reports`, updates spot |
| 8 | Realtime | Change a spot in Supabase dashboard — list updates live |

**Run locally:**

```bash
pnpm install
cd apps/mobile
cp .env.example .env   # add Supabase URL + anon key
npx expo start
```

See [`apps/mobile/README.md`](./apps/mobile/README.md).

---

## Website Demo Flow

**Environment:** Local (`pnpm dev`) or deployed on Vercel. Requires `NEXT_PUBLIC_SUPABASE_*` env vars for waitlist.

| Step | Action | What to highlight |
|------|--------|-------------------|
| 1 | Open landing page | Hero, problem, solution, features |
| 2 | Scroll to demo section | Interactive phone preview (filters, spot tap, report, directions) |
| 3 | Scroll to waitlist | Name, email, optional interest |
| 4 | Submit waitlist | Row in `waitlist_signups` (dashboard only) |

**Run locally:**

```bash
cd apps/web
cp .env.example .env.local
pnpm dev
# http://localhost:3000
```

See [`apps/web/README.md`](./apps/web/README.md).

---

## Supabase Backend Explanation

**Migrations (apply in order):**

1. `00001_initial_schema.sql` — profiles, parking_spots, parking_reports, RLS, triggers
2. `00002_allow_spot_status_update.sql` — authenticated users can update spot status
3. `00003_enable_realtime.sql` — realtime on `parking_spots`
4. `00004_waitlist_signups.sql` — website waitlist (insert-only for anon)

**Key tables:**

| Table | Purpose |
|-------|---------|
| `profiles` | User profile linked to `auth.users` |
| `parking_spots` | Locations, status, type, price, coordinates |
| `parking_reports` | User-submitted status reports |
| `waitlist_signups` | Marketing site email capture |

**Security:** RLS on all tables. Waitlist allows public insert only — no client read. Parking data requires authenticated users for reports; spots are readable by signed-in users.

**Seed data:** 26 mock San Francisco spots in `supabase/seed/seed.sql`.

See [`supabase/README.md`](./supabase/README.md).

---

## Demo Flow (Quick Script)

Use this order for a 5–8 minute live or recorded demo.

### Mobile (Expo Go)

1. **Open mobile app in Expo Go** — scan QR from `npx expo start`
2. **Register or log in** — create a test account
3. **View nearby parking list** — note live badge and location bar
4. **Search / filter parking** — e.g. “Market” or filter “Available”
5. **Tap a parking spot** — detail card opens
6. **Open directions** — launches Maps
7. **Submit parking report** — tap Available, Occupied, or Unknown
8. **Show realtime update** — in Supabase Table Editor, change another spot’s status; app list updates without refresh

### Website

9. **Open deployed website** — Vercel URL or `localhost:3000`
10. **Submit waitlist form** — confirm success message; verify row in Supabase dashboard

---

## Current MVP Limitations

Be transparent with reviewers — these are intentional scope cuts for speed.

| Area | Limitation |
|------|------------|
| Mobile map | **List view in Expo Go.** Native map pins need an EAS development build (not required for current demo). |
| Data | 26 **mock** SF spots (`source = MOCK`), not live city APIs yet |
| Map UI | No `react-native-maps` in Expo Go; code path exists for future EAS build |
| Profile | “Reports submitted” and favorites — coming soon |
| Favorites | Not implemented |
| Push notifications | Not implemented |
| Payments | Not implemented |
| City APIs | DataSF / SFMTA integration planned |
| MCP / AI layer | Planned post-MVP |

---

## Future Roadmap

| Phase | Focus |
|-------|--------|
| **Now** | Expo Go list MVP + deployed website + waitlist |
| **Next** | Merge mobile polish; keep `main` deployable |
| **Soon** | EAS development build + native map (optional; requires Apple/Android signing) |
| **Later** | DataSF / SFMTA data import and scheduled sync |
| **Later** | Favorites, profile stats, push notifications |
| **Future** | MCP tool layer for AI-assisted parking queries (read-only on same data) |

---

## Links

| Resource | Path |
|----------|------|
| Mobile setup | [`apps/mobile/README.md`](./apps/mobile/README.md) |
| Website setup | [`apps/web/README.md`](./apps/web/README.md) |
| Database setup | [`supabase/README.md`](./supabase/README.md) |
| Architecture (detailed) | [`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md) |
| Repo root | [`README.md`](./README.md) |

---

## One-Line Pitch

> Smart Parking is a React Native + Supabase app that shows nearby street parking in real time, lets drivers report availability, and syncs live updates — with a Next.js marketing site and waitlist for launch.

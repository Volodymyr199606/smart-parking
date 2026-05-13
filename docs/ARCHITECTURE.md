# Smart Parking — Architecture Document

> This document defines the new architecture for the Smart Parking project rebuild.
> It replaces the previous Java/Spring Boot/MySQL stack with a TypeScript-first approach
> using Next.js (website), React Native Expo (mobile app), and Supabase (backend).

---

## Table of Contents

1. [Product Vision](#1-product-vision)
2. [Why We Are Switching](#2-why-we-are-switching)
3. [New High-Level Architecture](#3-new-high-level-architecture)
4. [Mobile App Architecture](#4-mobile-app-architecture)
5. [Website Architecture](#5-website-architecture)
6. [Supabase Backend / Data Architecture](#6-supabase-backend--data-architecture)
7. [Database Schema Proposal](#7-database-schema-proposal)
8. [Authentication Design](#8-authentication-design)
9. [Realtime Design](#9-realtime-design)
10. [City Data Integration Plan (DataSF / SFMTA)](#10-city-data-integration-plan-datasf--sfmta)
11. [Future MCP Integration Plan](#11-future-mcp-integration-plan)
12. [Security and Permissions (RLS)](#12-security-and-permissions-rls)
13. [MVP Roadmap](#13-mvp-roadmap)
14. [Non-Goals for MVP](#14-non-goals-for-mvp)
15. [UI/UX Design Principles](#15-uiux-design-principles)

---

## 1. Product Vision

Smart Parking is a mobile-first application that helps drivers in San Francisco find available street parking in real time.

**Core value proposition:** Open the app, see nearby open spots on a map, navigate to one, and park — all in under 30 seconds.

**Two surfaces:**
- **Mobile App (React Native Expo)** — The primary product. Used by drivers on the go to find, navigate to, and report parking spots.
- **Website (Next.js)** — A marketing and subscription surface. Landing page, product demo, waitlist signup, and future subscription management.

**Target user:** Everyday drivers in San Francisco who waste time circling blocks looking for parking.

---

## 2. Why We Are Switching

### Previous Stack
| Layer | Technology | Pain Points |
|-------|-----------|-------------|
| Frontend | Next.js + React + Leaflet | Tightly coupled to backend REST API, web-only |
| Backend | Java 21 + Spring Boot 3.4 | Heavy setup, slow iteration, complex deployment |
| Database | PostgreSQL (via Render) | Manual schema management, no built-in auth |
| Auth | Custom JWT + Spring Security | Custom implementation, hard to maintain |
| Realtime | WebSocket + STOMP (planned) | Never fully implemented, complex config |
| Deployment | Render (backend) + Vercel (frontend) | Cold starts, two platforms to manage |

### New Stack
| Layer | Technology | Why |
|-------|-----------|-----|
| Mobile App | React Native Expo | Cross-platform iOS/Android from one TypeScript codebase |
| Website | Next.js 14+ | Fast, SEO-friendly marketing site with React |
| Backend | Supabase | Managed Postgres, Auth, Realtime, Storage, Edge Functions — all in one |
| Language | TypeScript everywhere | One language, shared types, faster development |
| Maps | React Native Maps (mobile) + Mapbox/Leaflet (web demo) | Native performance on mobile |
| Deployment | Expo EAS (mobile) + Vercel (website) + Supabase (backend) | Simple, managed, no cold starts |

### Key Reasons for the Switch

1. **Speed of development** — No more writing Java boilerplate, DTOs, services, and controllers for simple CRUD.
2. **One language** — TypeScript everywhere eliminates context-switching between Java and TypeScript.
3. **Mobile-first** — The real product is a mobile app. React Native Expo gives us iOS + Android from one codebase.
4. **Managed infrastructure** — Supabase handles auth, database, realtime, and storage. No server to maintain.
5. **Simpler deployment** — No more Render cold starts. Supabase is always on. Expo handles app builds.
6. **Built-in realtime** — Supabase Realtime replaces the unfinished WebSocket/STOMP setup.
7. **Built-in auth** — Supabase Auth replaces custom JWT implementation.
8. **Row Level Security** — Database-level permissions replace Spring Security annotations.
9. **Cost** — Supabase free tier is generous. No paid Render/Railway needed for MVP.

---

## 3. New High-Level Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                        CLIENTS                               │
├─────────────────────────┬───────────────────────────────────┤
│                         │                                    │
│   📱 Mobile App         │   🌐 Website                      │
│   React Native Expo     │   Next.js (Vercel)                │
│   iOS + Android         │   Landing / Demo / Waitlist       │
│                         │                                    │
└────────────┬────────────┴──────────────┬────────────────────┘
             │                           │
             │      Supabase Client      │
             │      (supabase-js)        │
             │                           │
┌────────────▼───────────────────────────▼────────────────────┐
│                      SUPABASE                                │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│   🔐 Auth          PostgreSQL         ⚡ Realtime           │
│   Email/Password   + PostGIS          Spot updates          │
│   OAuth            Tables + RLS       Availability changes  │
│                                                              │
│   📦 Storage       🔧 Edge Functions  📊 Dashboard          │
│   User avatars     Data sync jobs     Monitoring            │
│   (future)         City data import   Usage analytics       │
│                                                              │
└─────────────────────────────┬───────────────────────────────┘
                              │
                    ┌─────────▼─────────┐
                    │  External Data     │
                    │  DataSF / SFMTA    │
                    │  (future import)   │
                    └───────────────────┘
```

---

## 4. Mobile App Architecture

### Overview
The mobile app is the primary product surface. It must be fast, clean, and feel like a real startup app.

### Tech Stack
- **Framework:** React Native with Expo (managed workflow)
- **Navigation:** Expo Router (file-based routing)
- **State Management:** React Context + Zustand (lightweight)
- **Maps:** react-native-maps (Apple Maps on iOS, Google Maps on Android)
- **Backend Client:** @supabase/supabase-js
- **UI Library:** Custom components (no heavy UI libraries)
- **Icons:** lucide-react-native or expo-vector-icons

### Folder Structure
```
mobile/
├── app/                    # Expo Router screens
│   ├── (tabs)/             # Tab navigation
│   │   ├── map.tsx         # Main map screen
│   │   ├── search.tsx      # Search for spots
│   │   ├── favorites.tsx   # Saved spots
│   │   └── profile.tsx     # User profile
│   ├── (auth)/             # Auth screens
│   │   ├── login.tsx
│   │   └── register.tsx
│   ├── spot/[id].tsx       # Spot detail
│   └── _layout.tsx         # Root layout
├── components/             # Reusable components
│   ├── ui/                 # Base UI (Button, Card, Input)
│   ├── map/                # Map-specific components
│   └── spots/              # Parking spot cards/lists
├── lib/                    # Utilities
│   ├── supabase.ts         # Supabase client init
│   ├── types.ts            # Shared TypeScript types
│   └── constants.ts        # App constants
├── hooks/                  # Custom hooks
│   ├── useAuth.ts
│   ├── useNearbySpots.ts
│   └── useRealtimeSpots.ts
├── contexts/               # React contexts
│   └── auth-context.tsx
├── assets/                 # Images, fonts
├── app.json                # Expo config
├── tsconfig.json
└── package.json
```

### Key Screens
1. **Map Screen** — Full-screen map with colored markers (green/red). User location. Tap marker for details.
2. **Search Screen** — Search by address or area. Filter by price, availability, restrictions.
3. **Spot Detail** — Address, price, restrictions, availability status. "Navigate" button opens native maps.
4. **Favorites** — List of saved spots with live availability status.
5. **Profile** — Account info, preferences, logout.
6. **Auth Screens** — Clean login/register with email+password (and future OAuth).

---

## 5. Website Architecture

### Overview
The website is NOT the app. It is a polished startup landing page for marketing, demo, and subscription management.

### Tech Stack
- **Framework:** Next.js 14+ (App Router)
- **Styling:** Tailwind CSS
- **Deployment:** Vercel
- **Backend Client:** @supabase/supabase-js (for waitlist, auth)
- **Animations:** Framer Motion (subtle, minimal)

### Folder Structure
```
website/
├── src/
│   ├── app/
│   │   ├── page.tsx            # Landing page
│   │   ├── demo/page.tsx       # Interactive demo
│   │   ├── waitlist/page.tsx   # Waitlist signup
│   │   ├── pricing/page.tsx    # Subscription plans
│   │   ├── privacy/page.tsx    # Privacy policy
│   │   ├── terms/page.tsx      # Terms of service
│   │   └── layout.tsx          # Root layout
│   ├── components/
│   │   ├── ui/                 # Button, Card, Input
│   │   ├── landing/            # Hero, Features, CTA
│   │   └── layout/             # Header, Footer
│   ├── lib/
│   │   ├── supabase.ts         # Supabase client
│   │   └── types.ts            # Shared types
│   └── styles/
│       └── globals.css
├── public/                     # Static assets
├── tailwind.config.ts
├── tsconfig.json
└── package.json
```

### Key Pages
1. **Landing Page** — Hero, feature highlights, social proof, CTA to download app or join waitlist.
2. **Demo** — Interactive map demo (web-only preview of the app experience).
3. **Waitlist** — Email capture form. Stores in Supabase `waitlist` table.
4. **Pricing** — Future subscription tiers (free, pro, team).
5. **Privacy Policy / Terms** — Legal pages.

---

## 6. Supabase Backend / Data Architecture

### Why Supabase
Supabase provides everything we need in one managed platform:
- **PostgreSQL** — Full relational database with PostGIS for geospatial queries.
- **Auth** — Email/password, OAuth, magic links. No custom JWT needed.
- **Realtime** — Subscribe to database changes. Spots update live.
- **Edge Functions** — Serverless TypeScript functions for background jobs.
- **Row Level Security (RLS)** — Database-level permissions. No middleware needed.
- **Storage** — File uploads (future: user avatars, spot photos).

### Supabase Client Setup
Both the mobile app and website use the same Supabase project:

```typescript
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL   // or NEXT_PUBLIC_
const supabaseKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY

export const supabase = createClient(supabaseUrl, supabaseKey)
```

### Data Flow
```
Mobile App / Website
        │
        ▼
  supabase-js client
        │
        ├── Auth requests → Supabase Auth
        ├── Data queries → PostgreSQL (via PostgREST)
        ├── Realtime subscriptions → Supabase Realtime
        └── File uploads → Supabase Storage
```

---

## 7. Database Schema Proposal

### Tables

#### `profiles` (extends Supabase auth.users)
| Column | Type | Notes |
|--------|------|-------|
| id | uuid | Primary key, references auth.users(id) |
| full_name | text | Display name |
| avatar_url | text | Profile picture URL (nullable) |
| created_at | timestamptz | Auto-set |
| updated_at | timestamptz | Auto-set |

#### `parking_spots`
| Column | Type | Notes |
|--------|------|-------|
| id | uuid | Primary key |
| address | text | Street address |
| latitude | float8 | GPS latitude |
| longitude | float8 | GPS longitude |
| location | geography(Point, 4326) | PostGIS point for spatial queries |
| available | boolean | Current availability |
| price_per_hour | numeric(5,2) | Price in USD (0 = free) |
| restrictions | text | Time limits, rules (nullable) |
| spot_type | text | street, garage, lot |
| source | text | manual, datasf, sfmta |
| last_reported_at | timestamptz | Last time availability was reported |
| created_at | timestamptz | Auto-set |
| updated_at | timestamptz | Auto-set |

#### `favorites`
| Column | Type | Notes |
|--------|------|-------|
| id | uuid | Primary key |
| user_id | uuid | References profiles(id) |
| spot_id | uuid | References parking_spots(id) |
| created_at | timestamptz | Auto-set |

#### `availability_reports`
| Column | Type | Notes |
|--------|------|-------|
| id | uuid | Primary key |
| spot_id | uuid | References parking_spots(id) |
| reporter_id | uuid | References profiles(id) |
| available | boolean | Reported status |
| reported_at | timestamptz | When the report was made |

#### `waitlist` (website only)
| Column | Type | Notes |
|--------|------|-------|
| id | uuid | Primary key |
| email | text | Unique |
| source | text | landing, demo, referral |
| created_at | timestamptz | Auto-set |

### PostGIS Spatial Queries
```sql
-- Find spots within 500m of a location
SELECT * FROM parking_spots
WHERE ST_DWithin(
  location,
  ST_SetSRID(ST_MakePoint(-122.4194, 37.7749), 4326)::geography,
  500
)
AND available = true
ORDER BY location <-> ST_SetSRID(ST_MakePoint(-122.4194, 37.7749), 4326)::geography;
```

---

## 8. Authentication Design

### Approach
Use Supabase Auth entirely. No custom JWT logic.

### Supported Methods (MVP)
- Email + password (signup, login)
- Password reset via email

### Future Methods
- Google OAuth
- Apple Sign-In (required for iOS App Store)
- Magic link (passwordless)

### Auth Flow
```
1. User opens app → Check Supabase session
2. No session → Show login/register screen
3. User registers → Supabase creates auth.users row + triggers profile creation
4. User logs in → Supabase returns session with access_token + refresh_token
5. All API calls include access_token automatically via supabase-js
6. Token refresh is handled by supabase-js automatically
7. Logout → Clear session locally and on server
```

### Profile Creation Trigger
A Postgres function auto-creates a `profiles` row when a new user signs up:

```sql
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name)
  VALUES (NEW.id, NEW.raw_user_meta_data->>'full_name');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
```

---

## 9. Realtime Design

### How Supabase Realtime Works
Supabase Realtime uses PostgreSQL's replication features to broadcast row-level changes to subscribed clients via WebSocket.

### What We Subscribe To
- **Parking spot availability changes** — When a spot's `available` field changes, all nearby clients see the update instantly.

### Client Subscription (Mobile App)
```typescript
const channel = supabase
  .channel('spot-updates')
  .on(
    'postgres_changes',
    {
      event: 'UPDATE',
      schema: 'public',
      table: 'parking_spots',
      filter: `available=eq.true`
    },
    (payload) => {
      // Update local state with new spot data
      updateSpotInState(payload.new)
    }
  )
  .subscribe()
```

### Realtime Use Cases
1. **Spot becomes available** — Map marker turns green for all nearby users.
2. **Spot becomes occupied** — Map marker turns red for all nearby users.
3. **New spot added** — Appears on map for nearby users.

### Performance Considerations
- Subscribe only to spots within the user's visible map area.
- Unsubscribe when user navigates away from the map.
- Use Supabase Realtime filters to limit broadcast scope.

---

## 10. City Data Integration Plan (DataSF / SFMTA)

### Data Sources
- **DataSF Open Data** — San Francisco open data portal with parking meter locations, time limits, and pricing.
- **SFMTA** — Real-time parking availability from sensors (limited availability).

### Integration Strategy (Post-MVP)
1. **Phase 1: Static Import** — Download parking meter location data from DataSF. Import into `parking_spots` table with `source = 'datasf'`.
2. **Phase 2: Scheduled Sync** — Supabase Edge Function runs on a cron schedule to fetch updated data from DataSF APIs.
3. **Phase 3: Real-Time Feed** — If SFMTA provides real-time sensor data, subscribe to their feed and update `available` status in real time.

### DataSF Datasets of Interest
- Parking Meters (locations, rates, time limits)
- Street Sweeping Schedule (temporary no-parking zones)
- Parking Citations (hot zones to avoid)
- SFMTA Real-time Parking (sensor data, limited coverage)

### Edge Function for Data Import
```typescript
// supabase/functions/sync-datasf/index.ts
import { createClient } from '@supabase/supabase-js'

Deno.serve(async () => {
  const response = await fetch('https://data.sfgov.org/resource/xxxx.json')
  const meters = await response.json()

  // Transform and upsert into parking_spots
  const spots = meters.map(transformMeterToSpot)
  await supabase.from('parking_spots').upsert(spots, { onConflict: 'source_id' })

  return new Response('Sync complete')
})
```

---

## 11. Future MCP Integration Plan

### What is MCP?
MCP (Model Context Protocol) is a standard for connecting AI models to external data and tools. It would allow an AI assistant to query parking data, check availability, and help users find spots via natural language.

### Why MCP is Not Core
MCP is an **access layer**, not application logic. The app works without it. MCP is added later as an optional interface for AI-powered features.

### Planned MCP Tools (Future)
| Tool | Description |
|------|-------------|
| `find_parking` | Search for available spots near a location |
| `check_availability` | Check if a specific spot is currently available |
| `get_restrictions` | Get parking rules for a spot or area |
| `report_availability` | Report a spot as available or occupied |
| `get_favorites` | Get user's saved parking spots |

### Architecture with MCP
```
AI Assistant (Claude, etc.)
        │
        ▼
   MCP Server (Edge Function or standalone)
        │
        ▼
   Supabase PostgreSQL (same data the app uses)
```

### Implementation Plan
1. Build the app first without MCP.
2. After MVP, create a Supabase Edge Function that exposes MCP-compatible tool endpoints.
3. The MCP server reads from the same `parking_spots` table.
4. No changes to the app are needed — MCP is purely additive.

---

## 12. Security and Permissions (RLS)

### Row Level Security Philosophy
Every table has RLS enabled. Users can only read/write data they're authorized to access. The database enforces this — not the application code.

### RLS Policies

#### `profiles`
```sql
-- Users can read their own profile
CREATE POLICY "Users can view own profile"
  ON profiles FOR SELECT
  USING (auth.uid() = id);

-- Users can update their own profile
CREATE POLICY "Users can update own profile"
  ON profiles FOR UPDATE
  USING (auth.uid() = id);
```

#### `parking_spots`
```sql
-- Anyone (authenticated) can read parking spots
CREATE POLICY "Authenticated users can view spots"
  ON parking_spots FOR SELECT
  TO authenticated
  USING (true);

-- Only service role (Edge Functions) can insert/update spots from data imports
-- Users report availability via the availability_reports table
```

#### `favorites`
```sql
-- Users can view their own favorites
CREATE POLICY "Users can view own favorites"
  ON favorites FOR SELECT
  USING (auth.uid() = user_id);

-- Users can add their own favorites
CREATE POLICY "Users can insert own favorites"
  ON favorites FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Users can delete their own favorites
CREATE POLICY "Users can delete own favorites"
  ON favorites FOR DELETE
  USING (auth.uid() = user_id);
```

#### `availability_reports`
```sql
-- Authenticated users can report spot availability
CREATE POLICY "Users can report availability"
  ON availability_reports FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = reporter_id);

-- Users can view their own reports
CREATE POLICY "Users can view own reports"
  ON availability_reports FOR SELECT
  USING (auth.uid() = reporter_id);
```

#### `waitlist`
```sql
-- Anyone (including anonymous) can insert into waitlist
CREATE POLICY "Anyone can join waitlist"
  ON waitlist FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);
```

---

## 13. MVP Roadmap

### Phase 1: Foundation (Days 1-2)
- [ ] Set up Supabase project (database, auth, realtime)
- [ ] Create database schema with PostGIS
- [ ] Configure RLS policies
- [ ] Set up Expo project for mobile app
- [ ] Set up Next.js project for website
- [ ] Shared TypeScript types package

### Phase 2: Authentication (Day 3)
- [ ] Mobile: Login/Register screens
- [ ] Mobile: Auth context with session management
- [ ] Mobile: Protected routes
- [ ] Website: Waitlist signup form

### Phase 3: Core Mobile App (Days 4-6)
- [ ] Map screen with user location
- [ ] Display parking spots as colored markers
- [ ] Tap marker to see spot details
- [ ] Navigate to spot (open native maps)
- [ ] Seed database with SF parking data (manual or DataSF import)

### Phase 4: Realtime + Reporting (Day 7)
- [ ] Subscribe to spot availability changes
- [ ] Report spot as available/occupied
- [ ] Live marker color updates

### Phase 5: Website (Day 8)
- [ ] Landing page with hero, features, CTA
- [ ] Interactive demo (embedded map preview)
- [ ] Waitlist form connected to Supabase

### Phase 6: Polish (Days 9-10)
- [ ] Favorites feature (save/unsave spots)
- [ ] Profile screen
- [ ] Loading/error/empty states
- [ ] Performance optimization
- [ ] App Store screenshots and metadata

---

## 14. Non-Goals for MVP

These are explicitly out of scope to keep the MVP focused:

- **Payment processing** — No in-app payments or subscriptions.
- **Push notifications** — Not needed for initial launch.
- **Parking reservation** — Users find spots, not reserve them.
- **In-app navigation** — We open native Maps apps for directions.
- **Admin dashboard** — Manage data via Supabase Dashboard directly.
- **Multi-city support** — SF only for MVP.
- **Parking garage integration** — Street parking only.
- **IoT sensor integration** — Community reporting first.
- **Social features** — No sharing, comments, or community feed.
- **MCP integration** — Added post-MVP as enhancement.
- **Offline mode** — Requires internet for real-time data.
- **Android Auto / CarPlay** — Future enhancement.
- **Analytics dashboard** — Use Supabase built-in analytics.
- **Custom map tiles** — Use default map providers.
- **Multiple languages** — English only for MVP.

---

## 15. UI/UX Design Principles

### Mobile App Design
- **Clean and minimal** — No visual clutter. Every element earns its place.
- **White/light backgrounds** — Clean, airy feel. No dark backgrounds (except optional dark mode later).
- **Generous spacing** — Plenty of padding between elements. Never feel cramped.
- **Readable typography** — System fonts (SF Pro on iOS, Roboto on Android). Clear hierarchy.
- **Rounded elements** — Rounded cards (16px radius), rounded buttons (full radius for pills).
- **Subtle shadows** — Light drop shadows on cards. No harsh borders.
- **Simple color palette:**
  - Primary: Slate/Gray (text, backgrounds)
  - Accent: Blue (actions, links)
  - Success: Green (available spots)
  - Danger: Red (occupied spots)
  - Warning: Amber (restrictions)
- **Clear hierarchy** — Title → subtitle → content → action. Every screen follows this pattern.
- **Touch-friendly** — Large tap targets (44px minimum). Bottom-aligned actions for thumb reach.
- **No unnecessary animations** — Subtle transitions on navigation. No bouncing, spinning, or flashy effects.
- **Status states** — Every screen handles: loading, empty, success, and error states gracefully.

### Website Design
- **Startup landing page aesthetic** — Professional, confident, trustworthy.
- **Hero section** — Bold headline, clear subtitle, strong CTA.
- **Whitespace-driven** — Let content breathe. No walls of text.
- **Card-based sections** — Feature highlights in clean cards.
- **Mobile-responsive** — Looks great on all screen sizes.
- **Consistent with app** — Same color palette and typography principles.

### Shared Design Tokens
```
Colors:
  gray-50:  #f8fafc (backgrounds)
  gray-600: #475569 (body text)
  gray-900: #0f172a (headings)
  blue-600: #2563eb (primary actions)
  green-500: #22c55e (available)
  red-500:  #ef4444 (occupied)
  amber-500: #f59e0b (warnings)

Spacing:
  Base unit: 4px
  Common: 8, 12, 16, 24, 32, 48, 64

Border radius:
  Small: 8px (inputs, small cards)
  Medium: 12px (cards)
  Large: 16px (large cards, modals)
  Full: 9999px (buttons, pills, badges)

Typography:
  Headings: font-weight 300 (light) to 500 (medium)
  Body: font-weight 400 (regular)
  Small: 12px, Body: 14-16px, Headings: 24-48px
```

---

## Appendix A: What Exists Now (Current Project Analysis)

### Current Project Structure
```
smart-parking-main/
├── frontend/                  # Next.js web app
│   ├── src/
│   │   ├── app/               # Pages (home, map, dashboard, login, register, etc.)
│   │   ├── components/        # UI components (map, auth, layout)
│   │   ├── contexts/          # Auth context
│   │   ├── hooks/             # WebSocket hook
│   │   └── lib/               # API client, types
│   ├── package.json           # Next.js 16, React 18, Leaflet, Axios, STOMP
│   └── next.config.ts
├── src/                       # Java Spring Boot backend
│   └── main/java/com/smart/parking/backend/
│       ├── controller/        # AuthController, ParkingSpotController, WebSocket
│       ├── model/             # User, ParkingSpot (JPA entities)
│       ├── service/           # Auth, ParkingSpot, User services
│       ├── repository/        # JPA repositories
│       ├── security/          # JWT filter, JWT util
│       ├── config/            # Security, WebSocket, DataSource configs
│       ├── dto/               # Request/response DTOs
│       └── exception/         # Global exception handler
├── pom.xml                    # Spring Boot 3.4.5, Java 21, PostgreSQL + MySQL drivers
├── README.md                  # Project overview with screenshots
├── DEPLOYMENT.md              # Render deployment guide
└── Various migration docs     # PostgreSQL setup guides
```

### What Can Be Reused
| Asset | Reuse Strategy |
|-------|---------------|
| TypeScript types (`lib/types.ts`) | Adapt for new schema |
| UI design patterns (Tailwind classes) | Reference for mobile and website styling |
| Home page copy and layout | Adapt for website landing page |
| Map interaction patterns | Reference for mobile map UX |
| Auth flow logic | Replace with Supabase Auth (simpler) |
| Data models (ParkingSpot, User) | Inform new Supabase schema |
| README screenshots | Reference for visual consistency |

### What Should Be Replaced
| Component | Reason |
|-----------|--------|
| Spring Boot backend (entire `src/` Java folder) | Replaced by Supabase |
| Custom JWT auth | Replaced by Supabase Auth |
| Axios API client | Replaced by supabase-js |
| WebSocket/STOMP hook | Replaced by Supabase Realtime |
| Leaflet map (frontend) | Mobile uses react-native-maps; website demo can keep Leaflet/Mapbox |
| MySQL/PostgreSQL JPA setup | Replaced by Supabase managed Postgres |
| Render deployment config | No longer needed |

### What Should Be Archived
Move to an `_archive/` folder (do not delete):
- `src/` (entire Java backend)
- `pom.xml`
- `DEPLOYMENT.md`, `RENDER_*.md`, `POSTGRESQL_*.md`
- `frontend/` (current Next.js app — reference only)

### Risks Before Rebuilding
1. **Losing working features** — Current app has working auth, map, and dashboard. Archive everything before changing.
2. **PostGIS setup** — Supabase supports PostGIS but requires enabling the extension manually.
3. **React Native learning curve** — If unfamiliar, the map integration takes time.
4. **Supabase Realtime limits** — Free tier has connection limits. Monitor usage.
5. **DataSF API reliability** — External data source may be slow or change formats.
6. **App Store requirements** — Apple requires Apple Sign-In if any OAuth is offered.

---

## Appendix B: Recommended New Folder Structure

```
smart-parking/
├── mobile/                    # React Native Expo app (primary product)
│   ├── app/                   # Expo Router screens
│   ├── components/            # UI components
│   ├── hooks/                 # Custom hooks
│   ├── lib/                   # Supabase client, utils, types
│   ├── contexts/              # Auth, app state
│   ├── assets/                # Images, fonts
│   ├── app.json
│   ├── tsconfig.json
│   └── package.json
├── website/                   # Next.js marketing site
│   ├── src/
│   │   ├── app/               # Pages
│   │   ├── components/        # UI components
│   │   └── lib/               # Supabase client, utils
│   ├── public/
│   ├── tailwind.config.ts
│   ├── tsconfig.json
│   └── package.json
├── supabase/                  # Supabase configuration
│   ├── migrations/            # SQL migration files
│   ├── functions/             # Edge Functions (data sync, etc.)
│   ├── seed.sql               # Seed data for development
│   └── config.toml            # Supabase CLI config
├── packages/                  # Shared code (optional monorepo)
│   └── shared/
│       ├── types.ts           # Shared TypeScript types
│       └── constants.ts       # Shared constants
├── docs/                      # Documentation
│   └── ARCHITECTURE.md        # This file
├── _archive/                  # Previous code (reference only)
│   ├── spring-boot-backend/
│   └── nextjs-frontend/
└── README.md                  # New project README
```

---

*Document created: May 12, 2026*
*Status: Planning phase — no code changes have been made.*
*Next step: Review this document, then begin Phase 1 (Foundation) setup.*

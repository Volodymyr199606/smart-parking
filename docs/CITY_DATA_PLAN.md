# City Data Integration Plan — Smart Parking (San Francisco)

> **Status:** Planning only — no ingestion code, no schema migrations, no mobile UI changes in this phase.  
> **Goal:** Prepare to import real city parking and curb data from DataSF and SFMTA without breaking the current Expo app, auth, realtime, reports, or the 26-row `MOCK` seed in `parking_spots`.

Related: high-level architecture overview in [`ARCHITECTURE.md`](./ARCHITECTURE.md) §10.

---

## Table of Contents

1. [Executive summary](#1-executive-summary)
2. [Data domains we will integrate](#2-data-domains-we-will-integrate)
3. [Official data sources](#3-official-data-sources)
4. [Curb rules vs live availability](#4-curb-rules-vs-live-availability)
5. [How this maps to the app today](#5-how-this-maps-to-the-app-today)
6. [MVP strategy (phased)](#6-mvp-strategy-phased)
7. [Proposed Supabase tables (future)](#7-proposed-supabase-tables-future)
8. [Ingestion approach (design only)](#8-ingestion-approach-design-only)
9. [Future Edge Function idea](#9-future-edge-function-idea)
10. [Risks and limitations](#10-risks-and-limitations)
11. [Open questions and next steps](#11-open-questions-and-next-steps)

---

## 1. Executive summary

Smart Parking today shows **26 mock spots** in San Francisco with **user-reported availability** (`AVAILABLE` / `OCCUPIED` / `UNKNOWN`) and Supabase Realtime updates. City open data does **not** provide citywide, real-time “this space is free right now” for every curb space.

What San Francisco **does** publish well:

- **Where** parking infrastructure exists (meters, blockfaces, garages).
- **What rules apply** (time limits, RPP areas, sweeping schedules, many regulations by blockface).
- **Some** specialized layers (color curb, loading, accessible parking) via SFMTA GIS — with varying completeness.

The integration plan is therefore:

1. **Inventory + rules first** (static / scheduled sync).
2. **Treat “availability” as app-layer signal** (user reports, heuristics, optional future feeds) — not as something we assume from DataSF CSV alone.
3. **Keep `MOCK` data** until a deliberate cutover migration is tested.

---

## 2. Data domains we will integrate

### 2.1 Parking meters

**What it is:** Point (or space) locations of SFMTA parking meters, often with rate zone, meter type (single-space vs multi-space), on/off-street flag, and related SFpark-era metadata.

**Why we want it:** Anchor the map to **real places** users can park and pay; show **price** and **meter context** instead of invented addresses.

**Typical fields (source-dependent):** meter ID, lat/lng, street name, blockface, rate area, hourly rate band, `ON_OFF_STR`, post ID, CAP color (often in SFMTA GIS, not in simplified DataSF exports).

**Primary sources:**

| Source | Dataset / layer | Notes |
|--------|-----------------|--------|
| DataSF | [Parking Meters](https://data.sfgov.org/Transportation/Parking-Meters/8vzz-qzz9) (`8vzz-qzz9`) | Tabular open data; good for bulk CSV/JSON import |
| DataSF | [Map of Parking Meters](https://data.sfgov.org/Transportation/Map-of-Parking-Meters/fqfu-vcqd) (`fqfu-vcqd`) | Map-oriented companion dataset |
| SFMTA ArcGIS | [Parking MapServer](https://services.sfmta.com/arcgis/rest/services/Parking/parking/MapServer) — **Layer 11: Meters** | Richer attributes; GeoJSON query API; `MaxRecordCount` 10,000 per request |
| SFMTA ArcGIS | Layers **12–13** (Metered blockfaces / streetblocks) | Line geometry; links meters to block segments |

**Integration use:** Seed `city_meters` (future table) and optionally **project** summary rows into `parking_spots` with `source = 'DATASF'` or `'SFMTA'`.

---

### 2.2 Curb rules

**What it is:** Regulations that govern whether parking is allowed, for how long, and under what permit — usually attached to a **blockface** (segment of street), not a live occupancy state.

**Includes:** Time-limited parking, residential permit (RPP) rules for non-holders, government permit zones, no overnight, oversized vehicle rules, tow-away / no-parking periods, and (separately) **color curb** (loading, disabled, etc.).

**Why we want it:** Answer “**Can I park here at 4pm on Tuesday?**” even when we do not know if a car is currently in the space.

**Primary sources:**

| Source | Dataset / layer | Notes |
|--------|-----------------|--------|
| DataSF | [Parking regulations (except non-metered color curb)](https://data.sfgov.org/Transportation/Parking-regulations-except-non-metered-color-curb-/hi6h-neyh) (`hi6h-neyh`) | Blockface-level; **explicitly excludes** color curb and detailed meter hours |
| DataSF | [Color curb](https://data.sfgov.org/City-Management-and-Ethics/Color-curb/v3se-eucw) (`v3se-eucw`) | Separate; completeness varies |
| SFMTA ArcGIS | Layer **18: MTA.colorcurb** | Colored curb zones (loading, blue, etc.) |
| SFMTA ArcGIS | Layer **9: Time Limited Parking**, Layer **10: Other parking regulations** | Additional regulation geometry |
| SFMTA ArcGIS | [parkingregulations_timelimited MapServer](https://services.sfmta.com/arcgis/rest/services/Parking/parkingregulations_timelimited/MapServer) | Custodian docs note **limited accuracy** and missing color curb |

**Important:** Meter **operating hours**, cap color, and pay-station logic often live in SFMTA internal / SFpark systems — **not** fully in the open “regulations” CSV.

---

### 2.3 Street sweeping

**What it is:** Scheduled times when parking is prohibited for street cleaning, typically by block and side of street.

**Why we want it:** Prevent tickets; show **temporary** no-parking windows; complement static curb rules.

**Primary sources:**

| Source | Dataset / layer | Notes |
|--------|-----------------|--------|
| DataSF | [Street Sweeping Schedule](https://data.sfgov.org/City-Infrastructure/Street-Sweeping-Schedule/yhqp-riqs) (`yhqp-riqs`) | Widely used by community tools; Socrata API |
| SFMTA ArcGIS | Parking MapServer **Layer 3: Street cleaning (Public Works)** | Spatial layer aligned with SFMTA parking stack |

**Integration use:** Store in `street_sweeping_rules` (future); at query time, mark spots/blockfaces as **restricted** during sweeping windows (does not imply a car is present).

---

### 2.4 Parking zones

**What it is:** Polygon or area-level groupings: Residential Parking Permit (RPP) areas, parking management districts, rate areas, car-share pricing zones, etc.

**Why we want it:** Context for **permits**, **pricing bands**, and map styling — “you are in Area 2 ($3/hr meters).”

**Primary sources:**

| Source | Dataset / layer | Notes |
|--------|-----------------|--------|
| SFMTA ArcGIS | Layer **17: MTA.rpp_areas** — [REST layer 17](https://services.sfmta.com/arcgis/rest/services/Parking/parking/MapServer/17) | Polygons; weekly script updates per layer metadata |
| SFMTA ArcGIS | Layer **15: parkingmanagementdistricts**, **14: carshare_pricing_zones** | District-level context |
| DataSF / SFMTA | Meter rate area attributes on meter layers | Point-level zone codes (e.g. Area 1–5) |

**Integration use:** `parking_zones` table with `geometry` (PostGIS later) or simplified `zone_code` on meters/blockfaces for MVP.

---

### 2.5 City parking restrictions (umbrella)

**What it is:** The combined rule set a driver cares about: regulations + sweeping + color curb + special cases (accessible, car share, tow-away, loading, garages).

**Sources:** Union of §2.2–2.4 plus:

| Source | Dataset / layer | Notes |
|--------|-----------------|--------|
| SFMTA ArcGIS | Layer **1: Accessible parking**, **0: On-street Car Share**, **7: Garages and Lots** | Specialized inventory |
| SFMTA ArcGIS | Layer **6–5** Motorcycle parking | Niche but easy to layer |
| SFDPW / DataSF | [Street Space Permits / Parking Signs](https://data.sfgov.org/d/sftu-nd43) (`sftu-nd43`) | Sign-level metadata; optional advanced phase |

**Product framing:** Show **restrictions** and **risk** (ticket/tow) separately from **availability** (green/red markers).

---

## 3. Official data sources

### 3.1 DataSF (Socrata)

- Portal: [data.sfgov.org](https://data.sfgov.org/)
- API pattern: `https://data.sfgov.org/resource/{dataset-id}.json` with `$limit`, `$offset`, `$where`
- Docs: [dev.socrata.com](https://dev.socrata.com/)

**Pros:** Simple HTTP, CSV export, stable for hackathon batch jobs.  
**Cons:** May lag SFMTA GIS; not all layers published; field names differ per dataset.

### 3.2 SFMTA ArcGIS REST

- Base service: `https://services.sfmta.com/arcgis/rest/services/Parking/parking/MapServer`
- Staging mirror (sometimes cited in docs): `https://stageservices.sfmta.com/arcgis/rest/services/Parking/parking/MapServer`
- Query example (meters, GeoJSON):  
  `.../MapServer/11/query?where=1%3D1&outFields=*&f=geojson&resultRecordCount=1000&resultOffset=0`

**Pros:** Richer geometry (points, lines, polygons), more layers in one stack.  
**Cons:** Pagination required (`MaxRecordCount` 10,000); coordinate systems must be normalized to WGS84; terms of use and rate limits must be respected.

### 3.3 What is *not* a reliable public feed today

- **Citywide real-time on-street occupancy** for all meters (SFpark pilot sensors largely historical post-2013).
- **Single “source of truth” curb API** — SFMTA [Digital Curb Program](https://www.sfmta.com/) is improving internal consolidation; public exports remain fragmented.

---

## 4. Curb rules vs live availability

| Concept | Meaning | City data support | Smart Parking today |
|--------|---------|-------------------|---------------------|
| **Curb rules** | Legal/time-based: “2hr meter”, “RPP Zone G”, “no parking Mon 8–10 sweeping” | Strong in open data (with gaps) | Partially mimicked in `parking_type`, `time_limit`, `price` on mock rows |
| **Live availability** | Physical: “no car in this space right now” | Weak / partial publicly | `parking_spots.status` + `parking_reports` + Realtime |

**Rules tell you if parking is allowed.**  
**Availability tells you if a space is likely free.**

```
┌─────────────────────────────────────────────────────────────┐
│  User question: "Can I park here?"                          │
│    → curb rules + sweeping + zone (city static data)        │
├─────────────────────────────────────────────────────────────┤
│  User question: "Is someone already there?"                   │
│    → user reports, decay, optional sensors (app layer)        │
└─────────────────────────────────────────────────────────────┘
```

**Do not** set `status = 'AVAILABLE'` just because a meter exists or rules allow parking. Default imported city rows should use `status = 'UNKNOWN'` until a report or trusted feed updates them.

---

## 5. How this maps to the app today

Current schema (`00001_initial_schema.sql`) — **unchanged in this phase**:

| Column | Role today | City data future |
|--------|------------|------------------|
| `parking_spots.source` | `MOCK` \| `DATASF` \| `SFMTA` \| `USER_REPORT` | Use `DATASF` / `SFMTA` for imported inventory |
| `parking_spots.status` | Demo + user reports | `UNKNOWN` at import; reports override |
| `parking_spots.parking_type` | UI badge | Map from regulation type / layer |
| `parking_spots.price`, `time_limit` | Display strings | Derive from meter rate area + regulations |
| `parking_reports` | User submissions | Unchanged; still the main “live” signal |

Mobile types in `apps/mobile/src/shared.ts` already define `ParkingSource` — no change required until we ingest.

**Non-goals for this phase:** Touch `AuthContext`, `useRealtimeSpots`, report flows, or seed SQL.

---

## 6. MVP strategy (phased)

### Phase 0 — Planning (now)

- This document.
- No DB or app changes.

### Phase 1 — Static inventory (first import)

**Scope:** Parking meters only (≈30k points citywide; start with one neighborhood for dev).

**Approach:**

- Load into **new** tables (see §7), not destructive overwrite of `MOCK`.
- Optional: duplicate a **small subset** into `parking_spots` with `source = 'DATASF'` for map QA behind a feature flag.
- All imported spots: `status = 'UNKNOWN'`.

**Demo:** Map shows real meter locations; list shows real streets/rates; availability still from reports.

### Phase 2 — Rules layer (restrictions, not occupancy)

**Scope:** Blockface regulations + street sweeping schedule.

**UX (later):** Detail sheet sections — “Restrictions”, “Next street sweeping”, separate from “Reported availability”.

**Logic:** Compute `is_parking_allowed_now` at read time from rules + local time (America/Los_Angeles).

### Phase 3 — Zones and curb geometry

**Scope:** RPP polygons, management districts, color curb / loading where data quality allows.

**Requires:** PostGIS or precomputed “zone at point” lookup table.

### Phase 4 — Smarter availability (still not full city RT)

- Decay user reports (e.g. trust for 15–30 minutes).
- Aggregate reports per blockface.
- Optional: explore any remaining SFMTA occupancy APIs (expect limited coverage).

### Cutover from MOCK

Only after mobile QA:

1. Migration adds `external_id` + unique constraint per source.
2. Seed script keeps `MOCK` in dev; production uses `DATASF`/`SFMTA`.
3. Document rollback: re-run `seed.sql` for demos.

---

## 7. Proposed Supabase tables (future)

> **Not implemented yet.** Names are proposals for the next migration batch.

### 7.1 `city_data_sync_runs`

Audit log for ingestion jobs.

| Column | Type | Notes |
|--------|------|-------|
| id | uuid | PK |
| source | text | `DATASF`, `SFMTA` |
| dataset | text | e.g. `parking_meters`, `street_sweeping` |
| started_at | timestamptz | |
| finished_at | timestamptz | |
| status | text | `running`, `success`, `failed` |
| rows_fetched | int | |
| rows_upserted | int | |
| error_message | text | nullable |

### 7.2 `city_meters`

Canonical meter inventory from city feeds.

| Column | Type | Notes |
|--------|------|-------|
| id | uuid | PK |
| external_id | text | Stable ID from city |
| source | text | `DATASF` or `SFMTA` |
| latitude | double precision | |
| longitude | double precision | |
| street_name | text | |
| blockface_id | text | nullable, for joins |
| rate_area | text | nullable |
| hourly_rate_hint | text | nullable display |
| meter_type | text | SS / MS / etc. |
| on_street | boolean | |
| raw_payload | jsonb | Full source row for debugging |
| updated_at | timestamptz | |

**Unique:** `(source, external_id)`

### 7.3 `curb_rules`

Blockface or segment rules (from regulations datasets).

| Column | Type | Notes |
|--------|------|-------|
| id | uuid | PK |
| external_id | text | |
| source | text | |
| regulation_type | text | RPP, time_limited, no_parking, etc. |
| days | text | e.g. `Mon,Tue` |
| hours | text | e.g. `0800-1000` |
| hour_limit | int | nullable |
| permit_area | text | nullable |
| street_name | text | nullable |
| geometry_ref | text | nullable until PostGIS |
| raw_payload | jsonb | |
| updated_at | timestamptz | |

### 7.4 `street_sweeping_rules`

| Column | Type | Notes |
|--------|------|-------|
| id | uuid | PK |
| external_id | text | |
| street_name | text | |
| block_side | text | L/R/B |
| weekday | text | |
| start_time | time | |
| end_time | time | |
| latitude | double precision | nullable anchor |
| longitude | double precision | nullable anchor |
| raw_payload | jsonb | |
| updated_at | timestamptz | |

### 7.5 `parking_zones`

| Column | Type | Notes |
|--------|------|-------|
| id | uuid | PK |
| zone_type | text | `RPP`, `MANAGEMENT_DISTRICT`, `RATE_AREA`, … |
| zone_code | text | e.g. RPP area name |
| name | text | |
| geometry | geography/geometry | PostGIS phase |
| raw_payload | jsonb | |
| updated_at | timestamptz | |

### 7.6 Extensions to existing `parking_spots` (later migration)

| Column | Type | Notes |
|--------|------|-------|
| external_id | text | nullable; city meter / space ID |
| city_meter_id | uuid | FK → `city_meters.id` |
| rules_summary | text | nullable cached string for UI |

**Constraint:** unique `(source, external_id)` where `external_id` is not null.

**RLS:** Imports use **service role** only; mobile clients keep read-only on city tables if exposed.

---

## 8. Ingestion approach (design only)

### 8.1 Principles

1. **Idempotent upserts** — Keyed by `(source, external_id)`.
2. **Never delete MOCK rows** in dev without an explicit flag.
3. **Store `raw_payload`** — City schemas change; debugging without re-fetch.
4. **Paginate** — ArcGIS 10k cap; Socrata `$offset`.
5. **Normalize coordinates** — Output WGS84 lat/lng for mobile map.
6. **Separate fetch from transform** — JSON files in object storage or staging schema optional for v1.

### 8.2 Recommended pipelines

| Stage | Tool | When |
|-------|------|------|
| Hackathon / dev | Manual: download CSV from DataSF → one-off SQL or script in `scripts/` (not committed with secrets) | Phase 1 experiment |
| Staging | Node/Deno script run locally with service role | Validate transforms |
| Production | Supabase Edge Function + `pg_cron` or Supabase scheduled trigger | Weekly / monthly per dataset |

### 8.3 Transform rules (sketch)

**Meter → `city_meters`:**

- Map lat/lng from geometry or columns.
- `external_id` = city POST_ID or OBJECTID string.
- `hourly_rate_hint` from rate area lookup table (maintain small JSON map in repo).

**Meter → `parking_spots` (optional projection):**

- `street_name`, `address`, `latitude`, `longitude` from meter.
- `parking_type = 'METERED'`.
- `price` / `time_limit` from joined rules if available; else null.
- `status = 'UNKNOWN'`.
- `source = 'DATASF'` or `'SFMTA'`.

**Regulations → `curb_rules`:**

- One row per blockface + regulation; do not collapse incompatible rules without conflict resolution.

**Sweeping → `street_sweeping_rules`:**

- Parse weekday/time fields; handle holidays in a later phase (not in base dataset).

### 8.4 Join strategy (location)

Until PostGIS:

- **Nearest meter within ~25m** for point queries.
- **Blockface ID** when both meter and regulation rows share a common ID (preferred when present).

PostGIS phase:

- `ST_DWithin`, `ST_Contains` for zones and curb lines.

### 8.5 What stays manual for MVP demo

- Keep `supabase/seed/seed.sql` for guaranteed 26-spot demo.
- City import runs against a **Supabase branch** or separate project first.

---

## 9. Future Edge Function idea

**Name:** `sync-city-parking` (or split per dataset: `sync-meters`, `sync-sweeping`).

**Trigger:** Cron (weekly for regulations, monthly for meters) or manual invoke from dashboard.

**Flow:**

```
┌──────────────┐     ┌─────────────────┐     ┌──────────────────┐
│ Cron / Admin │────▶│ Edge Function   │────▶│ DataSF / SFMTA   │
│   invoke     │     │ sync-city-parking│     │ HTTP APIs        │
└──────────────┘     └────────┬────────┘     └──────────────────┘
                              │
                              ▼
                     ┌──────────────────┐
                     │ Supabase DB      │
                     │ (service role)   │
                     │ city_* tables    │
                     │ + sync_runs log  │
                     └──────────────────┘
```

**Responsibilities:**

- Fetch paginated pages.
- Validate row counts and schema version (hash of column names).
- Upsert into `city_*` tables.
- Write `city_data_sync_runs` row.
- **Do not** push to Realtime channel unless projecting to `parking_spots` and intentionally updating `updated_at`.

**Secrets:** Service role key in Edge Function env only; never in mobile app.

**Optional follow-up function:** `explain-parking-here` — given lat/lng, return rules + sweeping + report summary for future AI/MCP layer (reads same tables).

---

## 10. Risks and limitations

| Risk | Impact | Mitigation |
|------|--------|------------|
| **No real-time occupancy** | Users expect green markers from city data | Clear UX copy; default `UNKNOWN`; lean on reports |
| **Incomplete / stale regulations** | Wrong “you can park here” advice | Show “verify signs”; cite source + last sync date |
| **Color curb gaps** | Missing loading/blue zones | Use SFMTA layer 18 + DataSF color curb; flag low confidence |
| **Meter hours in internal DB** | Price/time wrong outside rate area | Show rate **area** not exact hours until richer feed |
| **10k ArcGIS page size** | Incomplete imports | Loop `resultOffset`; verify total count |
| **Schema changes** | Broken transforms | `raw_payload` + sync version field |
| **Overwriting MOCK/demo data** | Broken hackathon demo | Separate tables first; feature flag |
| **Legal / terms of use** | Compliance | Review DataSF/SFMTA terms; attribute city data in app |
| **Performance** | 30k+ meters slow on mobile | Spatial index; load bbox; cluster markers |
| **RLS mistakes** | Public write to city tables | Service role only for writes |
| **Conflicting rules** | Same blockface, multiple regulations | Priority rules document + manual QA samples |

**SFpark sensor note:** ArcGIS meter layer may still include `SENSOR_FLA` from the pilot; treat as **historical metadata**, not live occupancy.

---

## 11. Open questions and next steps

### Open questions

1. **Product priority:** Meters-first vs sweeping-first for user value?
2. **Geography for v1 import:** Single neighborhood (e.g. SoMa) vs full city?
3. **PostGIS timing:** Enable in Supabase now vs after first flat import?
4. **Single `parking_spots` table vs split** city inventory + app overlay table?

### Recommended next steps (implementation phase — not now)

1. Add migration `00005_city_data_tables.sql` with §7 tables only (no change to reports/auth).
2. Add `scripts/import-meters.ts` (local, service role) for one neighborhood CSV.
3. Add mobile “Data source: SFMTA / last updated” on spot detail (small UI).
4. Link this doc from `supabase/README.md` and `ARCHITECTURE.md` §10.

### What to commit in this phase

- `docs/CITY_DATA_PLAN.md` only (this file).

---

## Appendix A — Quick reference links

| Domain | URL |
|--------|-----|
| Parking Meters (DataSF) | https://data.sfgov.org/Transportation/Parking-Meters/8vzz-qzz9 |
| Parking regulations (DataSF) | https://data.sfgov.org/Transportation/Parking-regulations-except-non-metered-color-curb-/hi6h-neyh |
| Street Sweeping (DataSF) | https://data.sfgov.org/City-Infrastructure/Street-Sweeping-Schedule/yhqp-riqs |
| Color curb (DataSF) | https://data.sfgov.org/City-Management-and-Ethics/Color-curb/v3se-eucw |
| SFMTA Parking MapServer | https://services.sfmta.com/arcgis/rest/services/Parking/parking/MapServer |
| RPP areas (layer 17) | https://services.sfmta.com/arcgis/rest/services/Parking/parking/MapServer/17 |

## Appendix B — SFMTA Parking MapServer layer index

| ID | Layer name (summary) |
|----|----------------------|
| 0 | On-street Car Share |
| 1 | Accessible parking |
| 2 | PCO Beats |
| 3 | Street cleaning (Public Works) |
| 4 | Parking census - onstreet |
| 5 | Motorcycle parking (unmetered) |
| 6 | Motorcycle parking (metered) |
| 7 | Garages and Lots |
| 8 | Parking census - offstreet |
| 9 | Time Limited Parking |
| 10 | Other parking regulations |
| 11 | **Meters** |
| 12 | Metered blockfaces |
| 13 | Metered streetblocks |
| 14 | carshare_pricing_zones |
| 15 | parkingmanagementdistricts |
| 16 | rpp_addresses |
| 17 | **rpp_areas** |
| 18 | **colorcurb** |
| 19 | meters_cad |
| 20 | rpp_parcels |

---

*Last updated: planning phase — May 2026.*

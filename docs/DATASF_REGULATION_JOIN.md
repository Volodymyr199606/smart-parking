# DataSF Regulation-to-Block Join Discovery V1

**Curb feature storage follow-up:** [City Curb Feature Storage Design V1](./CITY_CURB_STORAGE.md) profiles all 18,355 `pep9-66vw` rows: `globalid` is unique in this capture, but lifetime physical identity is undocumented; 17 direction-insensitive equal-geometry groups contain 34 rows. The proposed storage uses immutable content versions and snapshot membership. No source identities were merged, targets persisted, or associations verified.

**Storage design follow-up:** [City Regulation Association Storage Design V1](./CITY_REGULATION_ASSOCIATION_STORAGE.md) turns the research requirements into a proposed normalized run/assessment/link model, review/publication contract, conditional SQL draft and TypeScript DTOs. Missing persisted curb-version identity blocks migration creation; no associations or runtime changes are implemented.

**Latest follow-up:** [Spatial association validation V2](#16-spatial-association-validation-v2--2026-09-18) completed full-source competition profiling. Of 7,778 usable regulations, 165 pass an experimental geometry-only screen; **zero are independently verified**. The user confirmed that production PostGIS is **not enabled**. No associations or production changes were made.

**Current follow-up (2026-09-18):** [Spatial association design V1](#15-spatial-association-design-v1--2026-09-18) contains new public-source geometry measurements. The earlier sections record identifier-join discovery; their milestone exclusions are historical. Production storage/backfill/idempotency are complete per the supplied baseline, but no regulation association is verified or implemented.

> **Status:** read-only research. No migration, ingest write, lookup, legality, coverage, spatial join, or UI change was implemented.
>
> **Date:** 2026-09-15.
>
> **Profiler:** `pnpm profile:regulation-join` → `scripts/profile-regulation-join.ts` (Socrata JSON only; geometry omitted except a bounded 8-row bbox sample).
>
> **Related:** [`CITY_REGULATION_STORAGE.md`](./CITY_REGULATION_STORAGE.md), [`CITY_DATA_PLAN.md`](./CITY_DATA_PLAN.md), [`ARCHITECTURE.md`](./ARCHITECTURE.md) §10.

## Recommendation

**C. NO VERIFIED IDENTIFIER JOIN, spatial association required later.**

There is no verified deterministic identifier that associates DataSF Parking Regulations (`hi6h-neyh`) rows with `city_parking_blocks` / `city_parking_meters` / `normalized_parking_locations`.

A **verified** identifier hop **does** exist between meters and metered blocks via the *uninested* DataSF dataset **Blockfaces with Meters** (`mk27-a5x2`):

```
meters.blockface_id → mk27-a5x2.blockface_id → mk27-a5x2.block_id → 27b3-yjjx.block_id
```

That hop does **not** include regulations. `hi6h-neyh` has no `blockface_id` / `block_id` / `street_id`. Non-zero `fid_100` does not match `mk27-a5x2.blockface_id` or `mk27-a5x2.block_id`. Do not treat C as A or B.

Do not choose A or B. Do not invent a join. Unmatched regulation rows must stay unmatched.

---

## 1. Current ingest sources (this repo)

From `scripts/ingest-sf-parking-data.ts` `DATASETS`:

| Role | DataSF id | Display name | Target today |
|---|---|---|---|
| Blocks | `27b3-yjjx` | SFMTA Metered Street Blocks | `city_parking_blocks` (`00005`) |
| Meters | `8vzz-qzz9` | Parking Meters | `city_parking_meters` (`00005`) → `normalized_parking_locations` (`00007`, meters only) |
| Regulations | `hi6h-neyh` | Parking Regulations (blockface map) | `UPDATE city_parking_blocks` by guessed `blockface_id` |

`scripts/normalize-city-parking.ts` reads **meters only**. `raw_source` keeps `city_row_id` and meter `blockface_id`.

### Fields currently mapped from each source

**Blocks (`mapBlockRow`)** — keys the script *looks for*, vs what live `27b3-yjjx` JSON actually has:

| Destination | Source keys tried | Live `27b3-yjjx` |
|---|---|---|
| `external_id` | `objectid`, `object_id`, `id`, `globalid` | `objectid` present (unique) |
| `blockface_id` | `blockface_id`, `blockface`, `blockfaceid`, `blkface_id` | **absent** (live key is `block_id`, unused) |
| `street_name` | `street_name`, `streetname`, `street`, `name` | `street_name` |
| `cross_street_from` / `to` | `from_street` / `to_street` (etc.) | **absent** (live keys `fm_addr_no` / `to_addr_no`) |
| `spaces_count` | `number_of_spaces`, `spaces`, … | not a live identifier |
| `latitude` / `longitude` | `lat`/`lng` or `location` | **absent** (geometry is polygon `shape`) |
| `raw_payload` | full row | yes |

**Meters (`mapMeterRow`)**: `post_id`, `blockface_id`, `street_name`, `street_num`, lat/lng, `meter_type`, `cap_color`, `on_offstreet_type`, `active_meter_flag`, `jurisdiction`, `raw_payload`. `city_parking_meters.block_id` is resolved by looking up meter `blockface_id` in `city_parking_blocks.blockface_id` — a key that live **blocks** do not populate.

**Regulations (`ingestRegulations` / `regulationBlockfaceId`)**: lookup `blockface_id` / `blockface` / `blkface_id` / `blockfaceid` else `name`. Patch: `regulation`, `agency`, `days`, `hours`, `hrlimit`, `rpparea1`. Unmatched rows are **dropped**. Live `hi6h-neyh` has **none** of those lookup keys (7788/7788 unmatched on current field names).

---

## 2. Live metadata (Socrata `api/views/{id}.json`)

### `hi6h-neyh` — Parking regulations (except non-metered color curb)

Dataset text: regulations **by blockface**. Includes RPP, time limits, government permit, no overnight, oversized vehicle. **Does not** include non-metered color curb or curb cuts.

Identifier-like columns:

| Field | Type | Description |
|---|---|---|
| `objectid` | text | *"An ObjectID is a unique, not null integer field used to uniquely identify rows in tables in a ESRI geodatabase"* |
| `fid_100` | text | **empty description** (name only `FID_100`) |
| `globalid` | text | no description; absent on every live JSON row |
| `shape` | multiline | line geometry |
| `length_ft` | text | no FK text |
| `analysis_neighborhood` / `supervisor_district` | text | midpoint of the geographic feature |

No column is documented as `blockface_id`, CNN, street segment id, or a foreign key to meters/blocks.

The same layer on SFMTA ArcGIS (`Parking/parkingregulations_timelimited`) lists `FID_100` as `esriFieldTypeSmallInteger` with **no alias, domain, or attribute paragraph**. `relationships: []`. Attribute docs mention `name` as “blockface number; street name; or …”, but that `name` field is **not** present on live DataSF JSON rows.

### `27b3-yjjx` — SFMTA Metered Street Blocks

*"List of street blocks with parking meters."* Columns include `objectid`, `block_id`, `street_id`, `street_name`, `fm_addr_no`, `to_addr_no`, `associated_block_id`, `pm_district_id`, `block_num`, polygon `shape`. **No `blockface_id`.** No metadata text saying `block_id` equals regulation `objectid` or `fid_100`.

### `8vzz-qzz9` — Parking Meters

Meter attributes. Documented identifiers:

| Field | Description |
|---|---|
| `post_id` | Unique identifier of meter |
| `parking_space_id` | Physical location, not the meter |
| `blockface_id` | **"Blockface (side of street) ID"** |
| `street_id` | **"Street identifier"** |
| `street_seg_ctrln_id` | **"Street segment centerline identifier"** |
| `pm_district_id` | Parking Management District ID |
| `latitude` / `longitude` / point `shape` | meter point |

No `fid_100`. No `block_id`. No documented link to `hi6h-neyh`.

---

## 3. Nearby DataSF datasets (read-only; **not ingested**)

| Id | Name | Why inspected | Result |
|---|---|---|---|
| `mk27-a5x2` | Blockfaces with Meters | Has both `blockface_id` and `block_id` | **Verified meter↔block hop.** No regulation id overlap. Line `shape` + endpoints. |
| `pep9-66vw` | Blockfaces | Citywide curb-coincident lines; schema has `sfpark_id`, `cnn_id`, truncated `blockface_` | IDs populated on **1910/18355** rows only. `sfpark_id` matches meter `blockface_id` (99.21% of populated pep9 values) — a **meter** hop, not a regulation hop. `cnn_id` ∩ regulation ids = 0. `fid_100` ∩ `sfpark_id` = 0. |
| `qbyz-te2i` | Map of Parking Regulations | Same summary text as `hi6h-neyh` | **7788 rows**, same count as regulations. After omitting geometry, live rows had **no remaining identifier keys**. Map view of the same regulation layer, not a hop. |

SFMTA Parking MapServer layer 12 (Metered blockfaces) states that **other** parking-regulation blockfaces live in `MTA.parkingregulations`, and the rest of the city in `MTA.blockfaces`. That is consistent with separate geographies, not a shared published key.

DataSF catalog search for `fid_100` returned no SF dataset that documents the field as a foreign key.

---

## 4. Empirical counts (full live fetch, 2026-09-15)

| Dataset | Rows |
|---|---|
| `hi6h-neyh` | 7788 |
| `27b3-yjjx` | 1773 |
| `8vzz-qzz9` | 38717 (30392 distinct `post_id` / `objectid` on the latest fetch; max share 2 — duplicate-looking rows in the feed, not used as a join). Distinct counts drifted slightly vs an earlier fetch the same day — live DataSF, not a join key. |
| `mk27-a5x2` | 3172 |
| `pep9-66vw` | 18355 |

### Coverage / uniqueness

**Regulations**

| Field | Non-null | Distinct | Notes |
|---|---|---|---|
| `objectid` | 7788/7788 | 7788 | max share 1 — source-row identity |
| `fid_100` | 7358/7788 | 6715 | 328 rows = `"0"` (max share); 430 missing |
| `blockface_id`, `street_id`, ingest name keys | 0 | 0 | |

**Blocks**

| Field | Non-null | Distinct | Notes |
|---|---|---|---|
| `objectid` | 1773/1773 | 1773 | unique |
| `block_id` | 1773/1773 | 1773 | unique; **not** `blockface_id` |
| `street_id` | 1772/1773 | 382 | many blocks per street (max 61) |
| `associated_block_id` | 45/1773 | 19 | sparse |
| `blockface_id` | 0 | 0 | |

**Meters**

| Field | Non-null | Distinct | Notes |
|---|---|---|---|
| `blockface_id` | 38717/38717 | 3079 | two sentinel `"0"`; max 196 meters / face |
| `street_id` | 38707/38717 | 374 | street grain (max 1692 meters) |
| `street_seg_ctrln_id` | 38694/38717 | 2309 | centerline segment |
| `post_id` | 38717/38717 | 30392 | meter identity |
| `block_id` | 0 | 0 | |

**`pep9-66vw` (citywide blockfaces; not ingested)**

| Field | Non-null | Distinct | Notes |
|---|---|---|---|
| `sfpark_id` | 1910/18355 | 1907 | documented meter-database blockface id; 99.21% of values match `meters.blockface_id`; **0** overlap with regulation `fid_100`/`objectid` |
| `blockface_` | 1910/18355 | 1906 | truncated GIS leftover; no metadata FK to regulations |
| `cnn_id` | 1910/18355 | 1184 | no overlap with regulation ids |
| `name` | 18355/18355 | 1908 | max share **16445** — not a key |

**`mk27-a5x2`**

| Field | Non-null | Distinct | Notes |
|---|---|---|---|
| `blockface_id` | 3172/3172 | 3172 | unique |
| `block_id` | 3172/3172 | 1741 | max 6 faces per block |
| `street_id` | 3172/3172 | 382 | street grain |
| `objectid` | 3172/3172 | 3172 | unique (this dataset only) |

---

## 5. Identifier intersections

A join is **not** valid merely because values overlap. Small integer namespaces collide.

### Regulation → blocks / meters (invalid or accidental)

| Pair | Left distinct | Right distinct | Intersection | Left matched | Classification |
|---|---|---|---|---|---|
| `regs.objectid` ∩ `blocks.objectid` | 7788 | 1773 | **0** | 0% | INVALID |
| `regs.objectid` ∩ `blocks.block_id` | 7788 | 1773 | 29 | 0.37% | INVALID (location mismatch) |
| `regs.objectid` ∩ `meters.objectid` | 7788 | 29122 | **0** | 0% | INVALID |
| `regs.objectid` ∩ `meters.blockface_id` | 7788 | 3079 | **0** | 0% | INVALID |
| `regs.objectid` ∩ `meters.street_id` | 7788 | 374 | 356 | 4.57% / **95% of street_ids** | INVALID (small-int collision + street grain; location mismatch) |
| `regs.objectid` ∩ `meters.street_seg_ctrln_id` | 7788 | 2309 | **0** | 0% | INVALID |
| `regs.fid_100` ∩ `blocks.objectid` | 6715 | 1773 | **0** | 0% | INVALID |
| `regs.fid_100` ∩ `blocks.block_id` | 6715 | 1773 | 2 | 0.03% | INVALID (location mismatch) |
| `regs.fid_100` ∩ `meters.blockface_id` (excl. 0) | 6714 | 3078 | **0** | 0% | INVALID |
| `regs.fid_100` ∩ `meters.street_id` (excl. 0) | 6714 | 373 | 104 | 1.55% / 28% of street_ids | INVALID (street grain + collision; location mismatch) |
| `regs.fid_100` ∩ `meters.street_seg_ctrln_id` (excl. 0) | 6714 | 2308 | **0** | 0% | INVALID |
| `regs.fid_100` ∩ `meters.post_id` | 6715 | 30392 | **0** | 0% | INVALID |
| `regs.objectid` ∩ `mk27.block_id` | 7788 | 1741 | 4 | 0.05% | INVALID |
| `regs.fid_100` ∩ `mk27.blockface_id` (excl. 0) | 6714 | 3172 | **0** | 0% | INVALID |
| `regs.fid_100` ∩ `mk27.block_id` (excl. 0) | 6714 | 1741 | **0** | 0% | INVALID |
| `regs.fid_100` ∩ `pep9.cnn_id` | 6714 | 1184 | **0** | 0% | INVALID |
| `regs.fid_100` ∩ `pep9.sfpark_id` | 6714 | 1907 | **0** | 0% | INVALID |
| `regs.objectid` ∩ `pep9.blockface_` | 7788 | 1906 | 194 | 2.49% | INVALID (`objectid` is ESRI row id; truncated GIS field; not documented) |
| Current ingest keys on regs | 0 | — | — | — | UNAVAILABLE |

`objectid` ∩ `street_id` matching **95% of street_ids** is the signature of colliding a large unique integer sequence with a small street-id domain (~374 values), not a documented FK.

### Metered-block identity (not regulation)

| Pair | Intersection | Notes | Classification |
|---|---|---|---|
| `meters.blockface_id` ∩ `mk27.blockface_id` | 3078 / 3079 (99.97%) | unique on mk27 | **VERIFIED** meter→mk27 face |
| `meters.blockface_id` ∩ `pep9.sfpark_id` | 1892 / 1907 of pep9 (99.21%); 61% of meter faces | pep9 ids only on 1910/18355 rows | **VERIFIED** for the populated pep9 subset (meters only) |
| `blocks.block_id` ∩ `mk27.block_id` | 1741 / 1741 of mk27 (100%); 98.20% of 27b3 blocks | 1:N faces per block | **VERIFIED** mk27→block |
| `blocks.street_id` ∩ `meters.street_id` | 371 | street, not block | VERIFIED street-level only; **INVALID** as block join |
| `blocks.block_id` ∩ `meters.blockface_id` | **0** | current ingest assumption | **INVALID** / UNAVAILABLE on live fields |
| `blocks.objectid` ∩ `meters.objectid` | **0** | | INVALID |

---

## 6. Representative match inspection

Apparent `objectid` = `block_id` pairs are **different places**:

| Shared value | Regulation neighborhood | Block |
|---|---|---|
| 918 | Marina | 24TH ST 4000–4099 |
| 922 | Noe Valley | WEST PORTAL AVE 100–199 (West of Twin Peaks) |
| 890 | Inner Sunset | TERRY A FRANCOIS BLVD (Mission Bay) |
| 12805 | Hayes Valley | 28TH AVE 500–598 (Outer Richmond) |
| 905 | Mission | CASTRO ST 400–799 (Castro/Upper Market) |

Apparent non-zero `fid_100` = `block_id` pairs:

| Shared value | Regulation neighborhood | Block |
|---|---|---|
| 884 | West of Twin Peaks | Potrero Hill (street_name null, 500–599) |
| 913 | Oceanview/Merced/Ingleside | 07TH AVE 1300–1399 (Inner Sunset) |

Do not use these overlaps.

Apparent non-zero `fid_100` = meter `street_id` pairs (wrong grain even if they matched; they do not):

| Shared value | Regulation neighborhood | Meter street / neighborhood |
|---|---|---|
| 837 | Sunset/Parkside | FRONT ST / Financial District/South Beach |
| 402 | Mission Bay | ELM ST / Tenderloin |
| 670 | Presidio Heights | STILLMAN ST / South of Market |
| 112 | Chinatown | 12TH AVE / Inner Richmond |
| 419 | Mission Bay | FRANKLIN ST / Hayes Valley |

Apparent `objectid` = meter `street_id` pairs:

| Shared value | Regulation neighborhood | Meter street / neighborhood |
|---|---|---|
| 303 | Sunset/Parkside | ASHBURY ST / Haight Ashbury |
| 109 | Mission | 09TH AVE / Inner Richmond |
| 446 | Tenderloin | GROVE ST / Hayes Valley |
| 380 | Mission Bay | DAVIS ST / Financial District/South Beach |
| 321 | Outer Mission | BALBOA ST / Outer Richmond |

Do not use `street_id` as a regulation join.

---

## 7. `fid_100` findings

- Present on 7358/7788 regulation rows; **6715 distinct**; **not unique**.
- Metadata description: **none** (DataSF and SFMTA ArcGIS).
- ArcGIS type: `SmallInteger`. Classic leftover join/shapefile FID name. **No relationship class.**
- `"0"` is a **328-row sentinel** mixing unrelated regulations (already profiled in `CITY_REGULATION_STORAGE.md`).
- Non-zero values do **not** correspond to `27b3-yjjx.block_id` / `objectid`, meter `blockface_id` / `post_id` / `street_seg_ctrln_id`, or `mk27-a5x2.blockface_id` / `block_id`.
- Catalog search did not identify a published dataset whose primary key is `fid_100`.
- **Do not join on `fid_100`.** Store it only as provenance (`source_fid_100` in the planned table).

Classification: **INVALID** as a cross-dataset key; meaning **unverified**.

---

## 8. `objectid` findings

- `hi6h-neyh.objectid`: documented ESRI row id; empirically unique 7788/7788.
- `27b3-yjjx.objectid`: a **different** unique sequence (values like `1168875`, no overlap with regulation objectids).
- `8vzz-qzz9.objectid`: a third sequence (no overlap with regulation objectids).
- `mk27-a5x2.objectid`: a fourth sequence (no overlap).
- Cross-dataset numeric collisions with `block_id` / `street_id` fail location checks.

**`objectid` is source-row identity only.** Classification: **VERIFIED** as regulation upsert key; **INVALID** as a join to blocks/meters.

---

## 9. Geometry / spatial feasibility (not implemented)

| Dataset | Geometry | Enough to *consider* later spatial work? |
|---|---|---|
| `hi6h-neyh` | `MultiLineString` (8/8 sample) | Yes — curb/blockface-like lines |
| `27b3-yjjx` | `Polygon` (8/8 sample) | Yes — but **polygons**, not curb lines; may span a street rather than one side |
| `8vzz-qzz9` | point + lat/lng (8/8 sample) | Yes — point-to-line / point-to-polygon proximity |
| `mk27-a5x2` | line + endpoint lat/lng, orientation, parity | Best **metered** curb geometry; still no regulation id |
| `pep9-66vw` | citywide curb lines | IDs mostly missing on live JSON |

An 8×8 bbox overlap of the *first pages* of regs vs blocks was 0. That only shows those pages are not the same window; it is **not** a spatial join.

Plausible later methods (design only): line-to-polygon intersection against `27b3-yjjx`; line-to-line against `mk27-a5x2` / `pep9-66vw`; meter point → nearest metered face. **None of these is deterministic without a later spec.**

Ambiguity risks that forbid treating spatial as a silent production join:

- Opposite curb sides (regulations are blockface-sided; metered-block polygons may not be)
- Intersections / shared endpoints
- Long blocks vs short regulation segments (`length_ft` varies; sample 84–753 ft)
- Overlapping / stacked regulation lines (one-to-many `fid_100` groups already observed)
- One regulation spanning more than one metered `block_id`
- Unmetered regulation geometry with **no** corresponding `27b3-yjjx` / `mk27-a5x2` row (regulations are citywide; metered blocks are not)

A future spatial design must leave unmatched rows unmatched. Do not add PostGIS in this milestone.

---

## 10. Join-quality classification (conservative)

| Candidate | Class |
|---|---|
| Current ingest `blockface_id` / `name` on `hi6h-neyh` | **UNAVAILABLE** |
| `regs.objectid` → any block/meter/mk27/pep9 id | **INVALID** (except as regulation row identity) |
| `regs.fid_100` → any block/meter/mk27/pep9 id | **INVALID** |
| `regs.objectid` / `fid_100` → `street_id` | **INVALID** (wrong grain + collisions) |
| `blocks.block_id` → `meters.blockface_id` | **INVALID** on live fields |
| `blocks.street_id` = `meters.street_id` | **VERIFIED** street-level only; not a block join |
| `meters.blockface_id` → `mk27-a5x2.blockface_id` → `block_id` → `27b3-yjjx.block_id` | **VERIFIED** for **meters↔blocks**, **UNAVAILABLE** for regulations |
| `pep9-66vw` as regulation hop | **UNAVAILABLE** / **INVALID** (populated ids are meter `sfpark_id`, which does not overlap regulation `objectid`/`fid_100`; citywide curb IDs mostly missing) |
| `meters.blockface_id` → `pep9.sfpark_id` | **VERIFIED** on the 1910-row populated subset only; **not** a regulation join |
| `qbyz-te2i` as hop | **UNAVAILABLE** (same regulation map, no extra keys) |
| Spatial line/polygon/point association | **PLAUSIBLE_BUT_UNPROVEN** — feasibility only; not a production join |

**VERIFIED** is used only where metadata + coverage + uniqueness + (where needed) identity of the *same physical object type* agree. No regulation→block candidate meets that bar.

---

## 11. Impact on future `city_parking_regulations.block_id`

Implemented in migration `00011` with **`block_id` nullable**. Join discovery is unchanged:

- Keep **`block_id` nullable**.
- Ingest **all** `hi6h-neyh` rows losslessly by `objectid`.
- Do **not** mark unmatched rows as ingest errors.
- Do **not** expose unmatched rows to candidates (lookup still requires a proven block).
- Do **not** fall back to `objectid`, `fid_100`, or `street_id` “almost matches.”
- CITY coverage remains **INCOMPLETE** / not `READY`.

Optional later work (out of scope): ingest `mk27-a5x2` so **meters** can attach to `city_parking_blocks` via `block_id` instead of the broken `blockface_id` text match. That does not populate regulation `block_id`.

---

## 12. How unmatched rows should behave

| Stage | Behavior |
|---|---|
| Future ingest | UPSERT every source row; `block_id` null |
| Lookup | `WHERE block_id = :block` only; nulls never attach to a candidate |
| Coverage | Treat CITY as incomplete; empty `ParkingRule[]` stays uninformative |
| Spatial later | Fill `block_id` only for rows a **separately verified** association proves; leave the rest null |

---

## 13. Effect on CITY coverage / readiness

None in this milestone (no runtime change). Discovery confirms the storage-design constraint: **normalized regulation storage cannot become location-complete** until a later spatial (or newly published identifier) design exists. Sweeping, permit interpretation, meter payment, and `OTHER` kinds remain out of scope as before.

---

## 14. What this milestone did not do

No `city_parking_regulations` table, no ingest writes, no mobile lookup change, no PostGIS, no geospatial matcher, no `ParkingRule` / legality / coverage / UI / AI / agent / MCP work.

---

## 15. Spatial association design V1 — 2026-09-18

### Decision and scope

**Curb-line association is PLAUSIBLE_BUT_UNPROVEN.** Citywide `pep9-66vw` lines provide the strongest measured geometric correspondence. Neither closeness nor a unique candidate proves the regulation's physical side, authoritative extent, or current applicability. There are no accepted matches in this milestone. Keep `city_parking_regulations.block_id` null and runtime on the existing block lookup; CITY remains **INCOMPLETE**.

The supplied production baseline is 7,788 regulations, idempotent ingestion, and 7,788 null `block_id` values. This task did not re-read production rows or ingest anything. New evidence below comes from public DataSF GETs and a read-only extension-metadata access attempt.

### Geometry inventory and current storage

Metadata endpoints are linked per dataset. Counts are from the profiler run beginning **2026-09-18 20:19:46 UTC**, not metadata's cached row counts. “Usable” means coordinates passed this diagnostic's shape/finite/San Francisco bounds checks; it does not certify topology. Excluded rows remain valid storage identities and must not disappear from a future association audit.

| Dataset | Actual geometry / identity | Fetched / usable geometry rows | Components and approximate lengths |
|---|---|---:|---|
| Regulations [`hi6h-neyh`](https://data.sfgov.org/api/views/hi6h-neyh.json) | `shape`: MultiLineString; `objectid` is source identity | 7,788 / 7,778 | All usable lines have one component; min 0.211 m, median 81.873 m, p90 171.243 m, max 3,165.625 m |
| Metered blocks [`27b3-yjjx`](https://data.sfgov.org/api/views/27b3-yjjx.json) | `shape`: Polygon; `block_id` | 1,773 / 1,770 | One ring in each usable polygon; perimeter min 51.449 m, median 261.971 m, max 1,569.797 m (not curb length) |
| Meters [`8vzz-qzz9`](https://data.sfgov.org/api/views/8vzz-qzz9.json) | `shape`: Point; also longitude/latitude; `post_id` | 38,717 / 38,699 | Points have no length; 27,950 distinct usable `post_id`/geometry pairs |
| Metered blockfaces [`mk27-a5x2`](https://data.sfgov.org/api/views/mk27-a5x2.json) | `shape`: LineString; `blockface_id`, with `block_id` hop | 3,172 / 3,166 | One line; min 0.059 m, median 72.483 m, p90 149.427 m, max 265.406 m |
| Citywide blockfaces [`pep9-66vw`](https://data.sfgov.org/api/views/pep9-66vw.json) | `shape`: LineString; `globalid` for source provenance, partially populated `sfpark_id` | 18,355 / 18,355 | One line; min 0.354 m, median 82.252 m, p90 183.311 m, max 1,159.459 m |

Meter retrieval contained 10,749 repeated `post_id` groups, all with identical geometry per identity. The profiler collapses identical identity/geometry pairs and reports this explicitly. It cannot establish whether repetitions originate in the published view or pagination, and does not reconcile differing non-geometric attributes: meter eligibility uses the first fetched representative. Meter statistics are consequently corroborating diagnostics only. Other sources had no repeated usable identities or conflicting geometries per identity.

Current repository storage contracts, inspected in migrations `00005`, `00007`, `00011`, `ingest-sf-parking-data.ts`, and `normalize-city-parking.ts`:

- `city_parking_blocks`: raw source `shape` is retained in `raw_payload` when supplied. No typed geometry column; nullable latitude/longitude are not derived from polygon centroids by the mapper. Source polygons identify street blocks, not a single curb side.
- `city_parking_meters`: raw source geometry in `raw_payload` plus explicit latitude/longitude. Meter `blockface_id` describes a side of street, but a point does not establish the whole curb's extent.
- `normalized_parking_locations`: meter-derived latitude/longitude points with city-row/blockface provenance in `raw_source`; no retained full curb geometry.
- `city_parking_regulations`: no geometry column; `raw_source` deliberately excludes `shape`, `the_geom`, and `location`. This profile fetches geometry separately; it does not alter storage.
- `mk27-a5x2` and `pep9-66vw` are public research inputs, not newly ingested tables. A future pipeline needs versioned geometry and identity provenance rather than silently attaching today's public geometry to an older stored regulation snapshot.

### CRS and side-of-street evidence

DataSF's Socrata [MultiLine](https://dev.socrata.com/docs/datatypes/multiline) and [Line](https://dev.socrata.com/docs/datatypes/line) geometry use WGS84 longitude/latitude. Observed coordinates are in San Francisco (approximately longitude -122.514 to -122.366 and latitude 37.707 to 37.822 across these sources). Degrees are not metres. The profiler uses a fixed local equirectangular approximation centered on (-122.44, 37.77), Earth radius 6,371,008.8 m. Distances are exploratory and not survey-grade acceptance thresholds.

The related SFMTA [metered-blockface ArcGIS layer](https://services.sfmta.com/arcgis/rest/services/Parking/parking/MapServer/12?f=pjson) advertises spatial reference 4326. The related [time-limit/RPP ArcGIS layer](https://services.sfmta.com/arcgis/rest/services/Parking/parkingregulations_timelimited/MapServer/0?f=pjson) instead advertises a custom CCSF-CS13 Transverse Mercator system in US feet, NAD83(2011). That service is not assumed to be the complete DataSF regulation source. Do not mix native ArcGIS feet, WGS84 degrees, and projected metres.

Regulations expose no usable street name, side, odd/even parity, or left/right orientation field. Their `globalid` field is unpopulated. Coordinate order alone does not establish a semantic left or right side.

Metered blockfaces expose `blockface_orientation` (N/S/E/W/NE/NW/SE/SW), `str_num_parity` (Odd/Even, mixed case), `str_seg_orientation` (L/R), street name, and address ranges. Orientation/parity values are populated on all 3,172 fetched rows. However, metadata and ArcGIS domains do not document the L/R reference direction sufficiently to interpret it as an independently verified side rule. There is no matching regulation-side attribute to corroborate these labels.

Meter metadata explicitly calls `blockface_id` a side-of-street ID, but `orientation` and `parity_digit_position` are empty on all 38,717 fetched rows. Citywide curb metadata describes curb-coincident geometry assembled from several methods, including partial regulation segments; attributes were described as in progress/unverified except `SFPARK_ID`. Its cached metadata reports only 1,910 populated `sfpark_id` rows, with 1,907 distinct values; `globalid` is populated on all 18,355 fetched usable rows. Thus source-row provenance exists even where a meter/block-side identity is unavailable. This corrects any implication in historical sections that citywide source identities themselves are all missing.

### Reproducible profile and limitations

Run `pnpm.cmd exec tsx scripts/profile-regulation-spatial.ts`. Optional `--self-check` runs arithmetic checks without network access. The script loads no credentials, opens no database connection, writes no files, exports no matcher, and selects no target. It uses the existing DataSF retry helper, not a new GIS dependency.

All five public sources were fetched through existing `$limit`/`$offset` pagination; `rowsUpdatedAt` was unchanged before/after each fetch. This is not a transactionally stable snapshot, and default pagination ordering is a limitation. Per-source identity/geometry digests and exclusions are emitted to make later comparisons possible. Source `rowsUpdatedAt` values were regulations 1781371764, blocks 1788629267, meters 1788629318, metered faces 1788629262, citywide curbs 1602522061; the citywide layer's age is an additional validation concern.

Full-source equality/grouping uses all **7,778 usable regulations**. Other spatial tests use **266 regulations**: 256 systematic positions in numeric `objectid` order plus the five shortest and five longest, deduplicated. No multipart additions were needed. This purposive sample is not a random citywide match-rate estimate. Sample identity digest: `036fdc3292cadb01eb212065e7d0a542ff6f29a87c0d4b58c783918cd184e021`.

Strategies:

- **Exact coordinate fingerprint:** reversal/component-order insensitive, but preserves vertices and precision. Zero equal fingerprints does not prove zero topological equality after resampling.
- **Minimum line distance:** analytic segment distance at 3/10/25 m; one close endpoint suffices. It is not a safe association criterion.
- **Buffered length coverage:** length-weighted midpoints of subsegments at most 5 m long; fraction of regulation length within a target's 3/10/25 m buffer. This estimates overlap; it is not a robust topological intersection length or proof of equal extents.
- **Sampled symmetric Hausdorff:** maximum of distances in both directions, using the same samples plus original vertices; threshold 5 m. Approximate, not continuous Hausdorff distance. Endpoint tests require both paired endpoints within 5 m, allowing reversed direction.
- **Intersection/containment:** planar segment crossing/touching and polygon interior diagnostics; boundary tolerance 1e-7 m. Floating-point arithmetic and source geometry have not undergone robust topology validation.
- **Meter proximity:** distinct nonzero `blockface_id` groups from deduplicated active on-street M/T meter points; also at least three distinct posts on a face within 3 m. No curb is reconstructed from points.

Robust line-overlap lengths, projection selection/accuracy validation, geometry repair, positional uncertainty, independently verified curb sides, and ground-truth acceptance testing are deferred. Existing JS tooling has no GIS topology framework; these bounded diagnostics are not reusable production GIS logic. No centroid-based assignment was attempted.

### Candidate counts (0 / 1 / 2+)

Every row below uses the 266-regulation sample unless marked **full**. “1” means one geometrically eligible target under that experiment, not an accepted match. Thresholds are experiments, not proposed production defaults.

| Strategy | Metered blockface lines: 0 / 1 / 2+ | Citywide curb lines: 0 / 1 / 2+ |
|---|---:|---:|
| Exact coordinate fingerprint, **full 7,778** | 7,778 / 0 / 0 | 7,778 / 0 / 0 |
| Minimum distance <=3 m | 251 / 15 / 0 | 33 / 226 / 7 |
| >=80% regulation length within 3 m | 259 / 7 / 0 | 45 / 221 / 0 |
| Minimum distance <=10 m | 234 / 26 / 6 | 13 / 25 / 228 |
| >=80% regulation length within 10 m | 252 / 11 / 3 | 28 / 187 / 51 |
| Minimum distance <=25 m | 208 / 12 / 46 | 4 / 1 / 261 |
| >=80% regulation length within 25 m | 248 / 4 / 14 | 13 / 46 / 207 |
| Sampled symmetric Hausdorff <=5 m | 265 / 1 / 0 | 61 / 205 / 0 |
| Both paired endpoints <=5 m | 265 / 1 / 0 | 61 / 205 / 0 |
| Planar line intersection/touch | 266 / 0 / 0 | 256 / 10 / 0 |

Citywide curbs yield unique candidates for **221/266 (83.1%)** under the 80%-within-3-m experiment and **205/266 (77.1%)** under sampled Hausdorff <=5 m. Metered blockfaces yield 7/266 (2.6%) and 1/266 (0.4%) respectively. Do not extrapolate these sample rates, intersect the reported sets without measuring that intersection, or label them accuracy/confidence percentages.

| Other strategy | 0 / 1 / 2+ |
|---|---:|
| Metered-block polygon intersection | 247 / 19 / 0 |
| >=80% regulation length inside a metered-block polygon | 252 / 14 / 0 |
| Meter face groups within 3 m | 261 / 5 / 0 |
| Meter face groups within 10 m | 249 / 17 / 0 |
| Meter face groups within 25 m | 213 / 24 / 29 |
| At least three distinct meter posts on one face within 3 m | 265 / 1 / 0 |
| Other regulation lines within 3 m | 225 / 38 / 3 |
| >=80% regulation length within another regulation's 3 m buffer | 255 / 11 / 0 |
| Other regulation lines within 10 m | 31 / 84 / 151 |
| >=80% regulation length within another regulation's 10 m buffer | 200 / 62 / 4 |
| Other regulation lines within 25 m | 5 / 7 / 254 |
| >=80% regulation length within another regulation's 25 m buffer | 40 / 202 / 24 |
| Other regulation sampled Hausdorff <=5 m / paired endpoints <=5 m / intersection (each) | 258 / 8 / 0 |

Meter diagnostics used 22,432 eligible deduplicated points. Counts for other regulations exclude each sampled row itself.

### Ambiguity and grouping evidence

- **Opposite curbs:** 1,427 metered-face pairs share block/street IDs and have opposite cardinal side labels. Of these, 88 have minimum separation <=10 m and 1,261 <=25 m; median minimum separation is 14.664 m. Example block `10802`: faces `108022`/`108021`, E/W, Even/Odd, separation 12.236 m. A 25 m candidate search around 35/266 sampled regulations includes such opposite-labelled pairs. Wide distance buffers cannot resolve side. Citywide curb “opposite side” counts are unavailable because equivalent side attributes are absent; a reported zero from that diagnostic is not evidence of safety.
- **Corners/short lines:** the full usable regulation set includes 244 lines shorter than 20 m. The shortest is objectid `5538`, 0.211 m. A corner-like diagnostic (minimum distance <=3 m, but <20% length coverage) finds 8 regulation/metered-face pairs, 16 regulation/citywide-curb pairs, and 28 regulation/other-regulation pairs. These are potential endpoint/corner interactions, not independently labelled intersection locations. Any touch or closest endpoint is insufficient evidence.
- **Long/multi-block lines:** 76 usable regulations exceed 300 m. Longest IDs/lengths: `1895` 733.305 m; `2674` 839.269 m; `6514` 870.120 m; `440` 1,059.398 m; `6913` 3,165.625 m. None of these five intersects a fetched metered-block polygon. No multi-polygon intersections appeared in the 266 sample. This does not establish that long lines stay within one city block: the target inventory is metered blocks only. Citywide block segmentation and full-source robust multi-block tests remain unresolved. A singular block FK is not an adequate assumption for long regulations.
- **Shared geometry/stacked rules:** 32 exact-coordinate groups contain 65 regulation rows, maximum group size 3. Twenty-two groups have differing rule attributes. For example IDs `82` and `6036` share geometry but describe time-limited M-Sa 800-1800 versus no-oversized-vehicles M-Su 2400-600. This supports potential stacked rules and requires preserving all source identities, not collapsing regulations by geometry. It does not resolve schedule applicability, conflicts, or rule priority.
- **`fid_100`:** among usable regulations, 425 lack it and 328 contain sentinel `0`. The 125 repeated nonzero groups contain 439 rows and 2,061 within-group pairs: only 20 pairs share exact coordinates; 24 have >=80% one-direction buffered coverage within 3 m; 1,821 are separated by >25 m. These categories overlap where appropriate. Shared `fid_100` is neither a unique geometry identity nor a block/curb join.

### Target classification and next design

| Target representation | Classification for regulation association | Evidence / limitation |
|---|---|---|
| Metered-block polygons (`27b3-yjjx` / stored source polygon) | **UNSAFE** as a sole side-specific target | Can combine both sides, only 19 sample intersections, and no regulation-side identity; useful only as later coarse corroboration |
| Metered blockface lines (`mk27-a5x2`) | **PLAUSIBLE_BUT_UNPROVEN** | Blockface identity and side-labelled attributes exist; geometry follows meter spacing, which need not equal full regulation extent; only 7 unique strict buffered candidates |
| Citywide curb lines (`pep9-66vw`) | **PLAUSIBLE_BUT_UNPROVEN**, strongest geometry candidate | 221 unique strict buffered candidates; physically curb-coincident metadata, but age, incomplete side identities, unverified attributes, and partial segments prevent verified association |
| Meter points (`8vzz-qzz9`) | **PLAUSIBLE_BUT_UNPROVEN** as corroboration; **UNSAFE** as sole curb extent | Point/blockface identities help check a known side, but points omit intervening geometry, corners, gaps, and unmetered curbs |
| Inferred complete curb geometry from meter points | **UNAVAILABLE** in current storage/profile | No authoritative reconstruction or ordered curb topology is present; no inferred lines were created |

No regulation-to-target association is **VERIFIED_CANDIDATE** yet. The strongest next investigation is versioned citywide curb lines with bidirectional extent checks, explicit enumeration of neighbouring/opposite-side alternatives, and independent validation of side and identity. Metered-face identities and meter points can corroborate only where their actual extents and provenance agree. Do not pick the nearest target, break ties arbitrarily, or transfer a blockface's rules to the opposite side through a shared block polygon.

Deterministic unique association appears feasible for a **subset**, given the 205 unique sampled Hausdorff candidates, but is not yet safe for automation. Validate a labelled set including corners, short/long lines, parallel/opposite sides, and all exclusion classes; establish a suitable metric CRS and positional-error budget; test complete candidate enumeration; then measure false associations. Do not fill `block_id` on the strength of this profile.

### Proposed future result contract (documentation only)

Each result should identify the regulation source key/`objectid`, source and target snapshot versions, geometry digests, target dataset/row identity and independently verified curb-side identity, algorithm/threshold version, measured distances/covered intervals in both directions, every competing candidate, and categorical rejection reasons. Keep diagnostic candidates separate from accepted associations. No confidence percentage.

| Category | Required future evidence |
|---|---|
| `VERIFIED_EXACT` | Valid, versioned geometries with verified topological equality **and** authoritative same-side/extent identity; coordinate fingerprint equality alone is insufficient |
| `VERIFIED_UNIQUE_SPATIAL` | Exactly one target passes calibrated distance, bidirectional extent, identity and independently verified side checks, with complete nearby candidate enumeration and no unresolved corner/multi-block ambiguity |
| `AMBIGUOUS` | Multiple viable targets, uncertain side/identity, unresolved extent, or contradictory corroboration; includes a single geometric candidate whose semantic identity remains unverified |
| `UNMATCHED` | No qualifying candidate or missing/unusable geometry, with distinct reason codes so unavailable evidence is not mistaken for “no regulation” |

Preserve many regulation rows on the same curb. Long regulations may need several verified curb intervals with source provenance; never silently shorten the source line or force it into a single block. A future explicit regulation-to-curb/interval relation is likely needed. A nullable FK to a street-block polygon cannot encode side or many-to-many extents on its own. This is a design proposal, not a schema change or implemented helper.

### PostGIS: useful later; live availability unconfirmed

The repository does not enable or use PostGIS. A read-only production REST request for `pg_catalog.pg_extension` returned HTTP 406 / `PGRST106` (schema not exposed). The REST OpenAPI document exposes no PostGIS metadata views/functions. Neither observation proves the extension is absent; direct SQL metadata access is unavailable in this environment. **Live availability is UNKNOWN.** The SQL Editor check requested from the user is read-only:

```sql
SELECT e.extname, e.extversion, n.nspname AS schema_name
FROM pg_extension AS e
JOIN pg_namespace AS n ON n.oid = e.extnamespace
WHERE e.extname = 'postgis';
```

A returned row confirms installation and its schema; zero rows confirms absence in that database. No extension was enabled or schema modified.

PostGIS would materially help a later validated implementation: indexed [`ST_DWithin`](https://postgis.net/docs/ST_DWithin.html) for candidate enumeration with correct distance units; [`ST_Intersects`](https://postgis.net/docs/ST_Intersects.html) for robust topology (but corner touches still need rejection); [`ST_LineLocatePoint`](https://postgis.net/docs/ST_LineLocatePoint.html) for positions along a line and interval comparisons; [`ST_HausdorffDistance`](https://postgis.net/docs/ST_HausdorffDistance.html) for densified discrete shape distance. Geometry distances use CRS units; geography distances use metres. Hausdorff remains a discrete approximation. These functions do not supply missing curb-side semantics or ground truth.

### Coverage and verification

Reliable association would solve **regulation row -> physical curb/location** only. Street sweeping, permit semantics, meter-payment interpretation, `OTHER` rule semantics, unsupported schedule grammar, and completeness across all applicable city sources remain unresolved. Geometric association never implies CITY `READY`.

The full public-source profiler completed with exit 0; transient DataSF HTTP 425 retries recovered. Arithmetic self-checks and `pnpm.cmd typecheck` passed. No ingest, production-row read/write, migration, extension enablement, `block_id` update, runtime lookup, legality, coverage, AI/agent/MCP, or UI implementation was performed. The only Supabase access was read-only metadata inspection; no secrets were printed.

---

## 16. Spatial association validation V2 — 2026-09-18

### Result and scope

**No association currently qualifies as `VERIFIED_UNIQUE_SPATIAL`.** Full-source geometry analysis yields 165 promising rows after conservative geometric exclusions, but neither their curb-side semantics nor their authoritative extents have been independently validated. These are review candidates, not a safe production backfill. CITY remains **INCOMPLETE** and `block_id` remains untouched.

The user supplied the production SQL result for `SELECT extname, extversion FROM pg_extension WHERE extname = 'postgis';`: **Success. No rows returned.** Therefore **PostGIS is not enabled in that database**, superseding V1's unknown status. This is user-reported SQL evidence; V2 made no Supabase connection and enabled nothing.

### Completed run and reusable evidence

Command: `pnpm.cmd exec tsx scripts/profile-regulation-spatial.ts --v2 --evidence`. The completed run began **2026-09-18T23:29:57.837Z**, exited **0**, and recovered from **35 HTTP 425 retry events** using the existing fetch helper. No restart/refetch was needed after the interruption: the original process completed and its output was reused.

Evidence is retained locally at `%TEMP%\smart-parking-spatial-v2.jsonl`. Despite the filename, this is **tagged JSON records interspersed with progress lines**, not bare JSONL; split a record at its first space before parsing JSON. PowerShell redirection produced UTF-16LE. Integrity inspection found the completion marker, zero malformed tagged records, **7,778 `V2_ROW` records with 7,778 distinct regulation IDs**, and **83,796 candidate pairs**. The approximately 75.9 MB log contains measurements, not giant coordinate arrays or credentials. It is temporary evidence, not a committed artifact. The tables and bounded cases below preserve the main findings in the repository.

Each `V2_ROW` retains every curb within the 50 m minimum-distance search bound, not only the diagnostic best: target ID, minimum distance, paired endpoint distance, symmetric sampled Hausdorff, regulation length fractions within 3/5/10 m, reverse 3 m coverage, length ratio, undirected chord-angle difference, second-best gap, parallel/opposite competitors, corner/fragment flags, source text, and an explicit null accepted association. Full-source geometry digests and metadata are emitted separately. `--self-check` runs without network; the original V1 mode remains available without `--v2`.

| Source | Fetched | Usable | Excluded | Geometry |
|---|---:|---:|---:|---|
| `hi6h-neyh` regulations | 7,788 | 7,778 | 10 | Single-component MultiLineString |
| `pep9-66vw` citywide curbs | 18,355 | 18,355 | 0 | LineString |
| `mk27-a5x2` metered faces | 3,172 | 3,166 | 6 | LineString |

All usable source IDs were unique. Geometry/identity digests match V1: regulations `d15a726a3f7c89587e9be242e8882ab2017b8baac0a8c088f14f55615914d534`; curbs `16c97866a440b45d510db842f2c396c864a2d893c54cf7585df9a43f3b72a18e`; metered faces `e630ffe5859fd287627e418569eef9833a38cba46a14af60dfe274b69dcd3882`. Metadata `rowsUpdatedAt` remained unchanged during each fetch. Offset pagination is still not a transactional snapshot. V2 did not refetch metered polygons or meter points, which were evaluated in V1.

### Metadata reinspection: supporting evidence is not independent verification

The profiler now inventories every public metadata column and counts meaningful values from fetched rows, excluding empty/null-placeholder strings. Live metadata: [regulations](https://data.sfgov.org/api/views/hi6h-neyh.json), [citywide curbs](https://data.sfgov.org/api/views/pep9-66vw.json), [metered faces](https://data.sfgov.org/api/views/mk27-a5x2.json).

| Source fields | Observed availability / semantics | Corroboration value |
|---|---|---|
| Regulation `regdetails`, `mtab_reso_text` | 946 / 274 populated rows | Sometimes street, cross streets, side, address/offset extent, resolution references; potentially independent historical text, but clause-to-row identity and current applicability require validation |
| Regulation `mtab_motion`, `mtab_date`, `enacted` | 437 / 518 / 781 populated | Possible links to original resolutions; not curb identifiers |
| Regulation `analysis_neighborhood`, `supervisor_district` | Both 7,778 | Explicitly derived from geometry midpoint, so not independent corroboration; useful only for sample diversity |
| Regulation `objectid`, `fid_100`, `globalid` | 7,788 / 7,358 / 0 populated | Row identity / unverified grouping / unavailable; no regulation-to-curb key |
| Regulation `length_ft` | 7,489 populated | A length attribute, with no independent survey provenance established |
| Regulation RPP fields, `agency`, `exceptions`, `conflict`, symbols, schedules, edit/audit fields | Present with varying completeness | Rule content, regional scope, provenance, or undocumented flags; not street-side identity. `from_time`/`to_time` are not from/to street names |
| Curb `popupinfo`, `street_nam` | 964 / 113 meaningful values | Some street, from/to cross-street and side descriptions; metadata explicitly says attributes are unverified except `SFPARK_ID` |
| Curb `name` | 18,355 populated | Often `Placemark` or a numeric ID; not an authoritative street name |
| Curb `sfpark_id`, `blockface_`, `cnn_id`, `globalid` | 1,910 / 1,910 / 1,888 / 18,355 | Partial meter-face identity / undocumented label / segment-like ID without verified regulation semantics / source identity |
| Curb `shape_leng` | 18,355 populated | Undocumented units/provenance; not used as independent measured length |
| Metered face `street_name`, `street_id`, `block_id`, `block_num`, `blockface_id` | All 3,172 | Target identity/context; does not add a regulation identity hop |
| Metered face `fm_addr_no`, `to_addr_no` | Both 3,171 | Address ranges; no matching structured regulation address fields |
| Metered face orientation/parity/L-R | All 3,172 | Target side labels; L/R reference convention remains undocumented |
| Metered face `neighborhood_id`, `pm_district_id`, `area_type` | 3,164 / 3,170 / 1,302 | Target grouping without verified cross-source semantics; do not equate these to regulation neighborhood text |
| Metered face derived neighborhood/district, endpoint coordinates, edit/load fields | Present | Geometry-derived context and provenance, not independent side truth |

There are no dedicated regulation street-name/from-street/to-street/address-range/side/parity columns. Nevertheless, V1's broad statement that there is no usable textual location information needs qualification: narrative fields **do** contain location clues. A cardinal-side phrase appears on **186 usable regulations**, including **10** with a strong geometric candidate. Some narratives mention both sides, several streets, multiple disconnected intervals, or visibly truncated clauses. No automatic text agreement/disagreement parser or resolution lookup was implemented.

### Search, measurements, and experimental screen

A 100 m grid indexes complete curb bounding boxes. Every regulation queries all intersecting cells within an expanded 50 m bbox, then exact diagnostic segment distance removes candidates beyond 50 m. This reduced **142,765,190** possible pairs to **94,970 bbox candidates** and **83,796 measured pairs**. Grid-vs-brute-bbox checks on every 97th regulation and synthetic negative-coordinate/boundary cases passed. No nearest-only truncation is used.

V1's local equirectangular metric, <=5 m sample spacing, and floating-point topology limitations remain. Coverage is buffered sampled length, not exact overlap; raw fractions may exceed 1 by floating-point epsilon. Direction is endpoint-chord orientation modulo 180 degrees, not semantic side, travel direction, or robust orientation on curved/multipart geometry. Hausdorff, endpoints, coverage, length and angle are related geometric measurements, not independent corroborating sources. Near-identical shapes and a recurring approximately 1.287 m offset may reflect common source lineage or transformations; neither is evidence of independent ground truth.

An experimental **strong geometry** pair requires symmetric sampled Hausdorff <=5 m, both paired endpoints <=5 m, >=80% length coverage in both directions at 3 m, regulation/curb length ratio 0.8–1.25, and chord-angle difference <=10 degrees. A further **geometry-only screen** requires exactly one such pair, that pair also best by Hausdorff, second-best Hausdorff >=15 m and gap >=10 m, no flagged parallel/opposite competitor, no corner or multi-curb proxy, and regulation length 20–300 m. These are sensitivity/rejection experiments, not finalized acceptance thresholds.

### Full-source candidate and margin statistics

All counts below use **7,778 usable regulations**; columns are candidate multiplicities, not successful matches.

| Experiment | 0 candidates | 1 candidate | 2+ candidates |
|---|---:|---:|---:|
| Exact coordinate fingerprint | 7,778 | 0 | 0 |
| Minimum distance <=3 m | 658 | 6,774 | 346 |
| Minimum distance <=5 m | 463 | 5,799 | 1,516 |
| Minimum distance <=10 m | 261 | 960 | 6,557 |
| Minimum distance <=25 m | 111 | 95 | 7,572 |
| Minimum distance <=50 m | 83 | 18 | 7,677 |
| >=80% regulation length within 3 m | 1,118 | 6,608 | 52 |
| >=80% regulation length within 5 m | 960 | 6,757 | 61 |
| >=80% regulation length within 10 m | 800 | 5,901 | 1,077 |
| Sampled Hausdorff <=5 m | 1,574 | 6,176 | 28 |
| Paired endpoints <=5 m | 1,574 | 6,176 | 28 |
| Strong geometry conjunction | 1,613 | 6,137 | 28 |

The full source exposes ambiguity absent from V1's 266-row sample. For example regulation `6930` has two curb IDs (`{A91ECFEB-742D-481C-B90E-022B9BD7EB93}` and `{C35B71EB-4B26-477E-9986-5BE1F7188315}`) with identical retained strong-pair measurements and a zero gap. Do not break such ties by ID.

Best/second-best refer to **all retained candidates within the minimum-distance search bound**, ordered by symmetric sampled Hausdorff. Among 7,695 rows with candidates, best Hausdorff median is 1.287 m (p90 23.500 m). Among 7,677 rows with two or more, second-best median is 16.156 m and gap median 13.183 m (p10 7.312, p90 72.887). Strong-candidate rows have gap median 13.043 m (p10 8.960, p90 70.580).

| Gap within retained candidate set | All rows with 2+ candidates | Rows with a strong pair and 2+ candidates |
|---|---:|---:|
| <2 m | 187 | 29 |
| 2–<5 m | 253 | 19 |
| 5–<10 m | 1,556 | 1,332 |
| 10–<20 m | 3,199 | 3,045 |
| >=20 m | 2,482 | 1,739 |

The experimental margin test passes for **3,713** rows, including **2,817** with a strong pair. Eighteen rows have only one candidate; their missing second is censored with a >50 m Hausdorff lower bound, not measured infinity. Likewise, a measured second-best above 50 m is **not** proven globally second-best: an excluded curb could have a Hausdorff between 50 m and that value. For a strong best <=5 m, the outside-search lower bound still exceeds the proposed 15 m / 10 m margin experiment. Large gaps printed above 50 m must not be represented as globally measured separation.

### Opposite-side, corner, extent, and stacked-rule findings

**Parallel/opposite-curb proxies:** a competitor is flagged when its chord differs from the best curb by <=15 degrees, minimum curb-to-curb separation is 3–30 m, and projected longitudinal overlap covers >=50% of the shorter extent. **6,230 regulations** have such a competitor, including **5,370 of the 6,165 rows with a strong pair**. These are possible opposite sides, not verified street topology. A separate partial `sfpark_id` -> unique metered-face identity check finds opposite-labelled pairs for **52 rows**, including **2 strong-candidate rows**. No side is selected from a small distance advantage. Missing labels do not prove absence of opposite-side ambiguity.

**Corner/intersection proxies:** a regulation endpoint within 10 m of endpoints from two curb segments, whose endpoints are within 10 m of one another and whose chords differ by >=25 degrees, is flagged. There are **5,906 cases**, including **5,374 strong-candidate rows**. This is intentionally overinclusive: normal full-block curbs end at intersections. It is not a measured false-match count. A future rejection rule should reject unresolved endpoint-to-junction/branch assignment until authoritative topology and interval extent prove the intended segment; the broad 10 m proxy must be calibrated against labelled examples before use.

**Extent:** the best-candidate regulation/curb length ratio is <0.5 for **252 rows** and >2 for **61**; median ratio is 1.000. There are **244 regulations shorter than 20 m** and **76 longer than 300 m**. Longest objectid `6913` is 3,165.625 m, with 53 nearby curbs; its diagnostic best has Hausdorff 1,516.808 m and length ratio 17.130. Objectids `440` (1,059.398 m) and `6514` (870.120 m) have nearly identical whole-curb geometries, demonstrating that a source curb record itself need not correspond to one conventional city block.

**Potential multi-curb extent:** two rows, `3475` (231.552 m) and `6168` (132.569 m), have at least two partial curb candidates whose union covers 95.745% and 92.593% of regulation length within 3 m. Each fragment covers 10–<80% of the regulation, >=80% of itself is near the regulation, its angle differs by <=20 degrees, and it is shorter than the regulation. Neither pair passes the additional <=10 m endpoint adjacency check, so the strict multi-curb proxy reports **0**. This is evidence of possible fragmented/gapped extent, **not proof of genuinely adjacent physical curbs**, and zero strict cases does not establish that the singular FK is sufficient. Preserve these unresolved cases rather than forcing the best fragment.

**Stacked rules:** all **32 identical-coordinate groups (65 rows)** share a diagnostic best curb; V1's rule comparison found differing attributes in 22 groups. Additionally, **21 nonidentical regulation pairs** have sampled Hausdorff <=2 m, all sharing the same diagnostic best. In total **758 curb IDs** are best for multiple regulations, but that broader number is not a count of verified stacks. Example `3632` (time-limited) and `6771` (no oversized vehicles) both point geometrically to `{A212C57B-1DA3-4791-983F-0B383B66A442}`. Preserve multiple rule identities; do not confuse multiple rules on one curb with one rule having several competing curbs.

### Bounded inspection sample

The completed profiler emitted 18 sample slots / **14 distinct regulation IDs**, spanning downtown-area, residential-area, angled, short, long, corner, opposite-curb, stacked, and narrative-side categories; categories can overlap. Neighborhood-based labels are sampling proxies, not independently verified land use. Dossiers contain source text, regulation endpoint coordinates, full competing-ID lists, and detailed top-three measurements/target metadata without full geometry arrays. The following cases were reviewed at the metadata/diagnostic level; **no field survey, authoritative map-side validation, or human-labelled accuracy study occurred**.

| Regulation ID(s) | Review evidence | Finding |
|---|---|---|
| `2705` | South of Market; 246.631 m; best curb `{2117E736-4729-4880-96FF-B3D176B140CB}`; best H 1.171 m, observed second H 269.057 m | Passes geometry screen; second is search-censored globally; target is only labelled `Placemark`, leaving identity unverified |
| `4173` | South of Market; best H 1.172 m; gap 21.788 m | Parallel competitor remains despite clear geometric preference |
| `6180`, `3974` | Sunset/Parkside; 20.855 m / 355.289 m; nearly coincident best curbs | Residential-area, corner and parallel-curb cases; `3974` is also a long-line example |
| `2509`, `368` | Bernal Heights / Bayview; chord angles 62.986 / 55.128 degrees | Angled geometries with strong bests still have parallel/corner flags |
| `2512`, `5144` | 16.283 / 18.951 m; nearly coincident best curbs | Short extents remain excluded; `2512`'s target popup names Wawona Street's north side, but regulation detail only describes vehicle dimensions |
| `887` | 548.857 m; nearly coincident whole-curb best; six parallel competitors | Long curb identity is not proof of a single block or side-safe association |
| `1967` | 63.556 m; nearly coincident best; gap 35.646 m | Clear separation does not remove a parallel-curb competitor |
| `3632`, `6771` | Same geometry, time-limited vs oversized restriction; best H 1.286 m; gap 13.543 m | Expected possible many-rules-to-one-curb; parallel and corner uncertainty still shared |
| `6017` | Text names Taraval Street, south side, 29th–30th Avenue; 74.075 m; best H <0.001 m; gap 18.548 m | Promising row-specific text, but target lacks verified street/side attributes and parallel/corner flags remain |
| `3383` | Grove Street narrative includes both north whole-block and south partial intervals; best H 1.287 m | Cannot assign all resolution clauses to this one geometry. Metered-face context identifies a south competitor, not an independent identity for the best curb |

Additional retained-evidence review: `3361` passes the geometry screen (25.069 m, best H 1.287 m, observed gap 44.259 m), but its resolution text includes Eddy and Jones Streets on several sides and is truncated. Of the 165 screened rows, only six have either narrative field populated; five contain resolution numbers or generic vehicle definitions, and `3361` is the sole side-bearing narrative. No screened row therefore gained independently verified side/extent from this review. Fragmented candidates `3475`/`6168` are documented above.

No direct textual street contradiction was established for an inspected best candidate; most targets lack reliable comparable text. That absence is not agreement. Any demonstrated street/side/extent disagreement must reject a future candidate, while multi-clause or unverified text stays ambiguous. No candidate was upgraded by textual proximity or keyword overlap.

### Conservative future contract and estimated coverage

Use only `VERIFIED_UNIQUE_SPATIAL`, `AMBIGUOUS`, and `UNMATCHED` for this proposed contract. **Drop `VERIFIED_EXACT` for now:** exact coordinate fingerprints found no matches, near-zero sampled distances are not exact topology, and neither establishes independent side identity.

A future `VERIFIED_UNIQUE_SPATIAL` result must have versioned valid geometry in a validated metric CRS; calibrated bidirectional shape/extent agreement; one independently identified physical curb/interval; a defensible second-candidate margin with search-bound provenance; no unresolved parallel/opposite-side or corner/branch ambiguity; and independent, row-specific side/extent corroboration (validated source text or equivalent authoritative evidence). Geometry metrics alone do not meet the independent-evidence requirement. Short, long, fragmented, curved, and conflicting-text cases need explicit validated handling. The exploratory thresholds above are not final acceptance defaults.

| Profiling category | Count | % of 7,778 usable | % of 7,788 source rows |
|---|---:|---:|---:|
| Potential verified with currently established independent evidence | **0** | **0%** | **0%** |
| `AMBIGUOUS`: candidate(s) exist, acceptance evidence unresolved | **7,695** | **98.933%** | **98.806%** |
| `UNMATCHED`: no curb within the 50 m diagnostic search bound | **83** | **1.067%** | **1.066%** |
| Excluded/unavailable geometry | **10** | Outside usable denominator | **0.128%** |

The **165 geometry-only screened rows (2.121% of usable)** are a subset of `AMBIGUOUS`, not an additional category, verified coverage, or measured accuracy. The zero verified count reflects the unmet independent-evidence gate, not proof that every geometric candidate is wrong. `UNMATCHED` means no candidate in this bounded inventory/search, not no applicable parking regulation. Rows with weak candidates remain ambiguous in this conservative taxonomy rather than being silently dropped.

### Storage and computation recommendation

Do not treat the existing singular `city_parking_regulations.block_id` as a sufficient general association model. It identifies a street-block row, not an independently verified curb side or interval. Long source records, partial extents, stacked rules, and the two fragmented candidates justify designing an explicit relation, even though V2 has not proved physical adjacency for a multi-curb case.

Future design: `city_parking_regulation_associations` with regulation identity, target ID/type (curb/interval), categorical match quality, evidence/provenance including source and target snapshot/geometry versions, matcher version, and creation time. Allow many rules per target and potentially multiple verified intervals per regulation; preserve interval boundaries and reasons. Store unresolved candidate evidence separately from accepted links. Define idempotent identities over regulation/target/interval/version and a reviewed promotion process. This is documentation only, not a migration or SQL write.

| Future approach | Assessment |
|---|---|
| Application-side runtime matching | Not recommended: repeats expensive geometry work at lookup time, makes reproducibility harder, and exposes changing source evidence to runtime decisions |
| PostGIS through a future controlled migration | Recommended for robust spatial operations and indexed enumeration after CRS/topology validation; installation alone does not solve side semantics |
| Offline/precomputed association | Recommended execution model: versioned snapshots, complete evidence, reviewable rejected cases, and deterministic reruns before any promotion |
| Hybrid | **Preferred:** offline batch validation using PostGIS in an isolated development/analysis database, reviewed versioned association artifacts, and eventual simple runtime lookup only in a separately authorized milestone |

The measured workload (83,796 candidate pairs after grid filtering) is practical for batch processing; it does not justify a runtime JS matcher or a heavy dependency in this profiling task. PostGIS offers indexed [distance enumeration](https://postgis.net/docs/ST_DWithin.html) with explicit CRS units and [densified discrete Hausdorff](https://postgis.net/docs/ST_HausdorffDistance.html), plus topology/interval tools discussed in V1. Use a future controlled extension decision; do not enable it on production merely to repeat this experiment.

Association would address regulation-row-to-physical-location linkage only. Street sweeping, permit interpretation, meter payment, `OTHER` semantics, unsupported schedules, and complete city-source coverage remain unresolved. **CITY remains INCOMPLETE.**

### Validation and safety

Full V2 profiler: exit 0. Arithmetic and grid checks: passed. `pnpm.cmd typecheck`: passed, including scripts and all workspaces, again when continuing from the interruption. Evidence integrity and candidate multiplicity totals: checked. `git diff --check`: passed (line-ending notices only). Changes are limited to the profiler and the three design documents. No production access/writes, ingest, `block_id` population, extension enablement, migration, runtime/legality/coverage/AI/agent/MCP/UI changes, secrets, or commit were introduced by V2.

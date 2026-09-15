# DataSF Regulation-to-Block Join Discovery V1

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

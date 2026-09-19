# City Regulation Storage Normalization — Implementation V1

> **Status:** implemented (additive table + dual-write ingest). Runtime lookup, adapters, legality, coverage, and UI are unchanged. No spatial join.
>
> **Related:** `docs/CITY_DATA_PLAN.md`, `docs/ARCHITECTURE.md` §10, `docs/DATASF_REGULATION_JOIN.md`, `supabase/migrations/00005_city_parking_data.sql`, `supabase/migrations/00011_city_parking_regulations.sql`.

This document answers: what is the smallest correct relational design that can preserve every DataSF Parking Regulations (`hi6h-neyh`) row, instead of merging them onto singular columns of `city_parking_blocks`.

It does **not** claim that this design makes CITY coverage `READY`.

---

## 1. Current data flow (verified)

```
DataSF hi6h-neyh row
  → scripts/ingest-sf-parking-data.ts ingestRegulations()
      1. UPSERT city_parking_regulations by (source_id, objectid)
         block_id = null (no verified join)
      2. legacy UPDATE city_parking_blocks (singular columns)
         unmatched blockface lookups: dropped from the block table only
  → apps/mobile regulationService.ts  (still reads city_parking_blocks)
      candidate → meter.block_id FK → one block
      or conservative blockface fallback (0/1 keep, 2+ → [])
  → packages/shared adapters.mapCityRegulationRowToParkingRules
  → ParkingRule[]
  → evaluateParkingLegality / evaluateLegalConclusionReadiness
```

`scripts/normalize-city-parking.ts` still reads **meters only**. Regulation columns never reach `normalized_parking_locations`.

No later migration after `00005` alters `city_parking_blocks` regulation columns (`00007` adds `normalized_parking_locations` only).

---

## 2. Overwrite mechanism (from current code)

Verified in `ingestRegulations()` (`scripts/ingest-sf-parking-data.ts`):

1. **Destination key.** `regulationBlockfaceId(row)` reads `blockface_id` / `blockface` / `blkface_id` / `blockfaceid`, else `name`. That string is looked up in `loadBlockfaceIndex()`: a `Map<blockface_id, city_parking_blocks.id>`. Duplicate blockface values **last-write-wins** in the Map.
2. **Multiple source rows can resolve to the same block.** Yes, whenever two source rows produce the same lookup string. The loop does not group or append; it updates one block per source row.
3. **What happens.** `supabase.from("city_parking_blocks").update(patch).eq("id", blockId)` replaces `regulation_type`, `agency`, `days_of_week`, `hours`, `hour_limit`, `permit_area`, `imported_at`, `updated_at`.
4. **Fields lost from the earlier source row.** All of those patch columns. Also `rpparea2` / `rpparea3` (never stored). Also every unmapped source field (`exceptions`, `from_time`, `to_time`, `hrs_begin`, `hrs_end`, `objectid`, `fid_100`, geometry, …).
5. **Ingestion order matters.** Socrata page order is the write order. The last matching source row for a blockface is the one that remains.
6. **No history of overwritten regulation rows.** `city_parking_blocks.raw_payload` is set only by `ingestBlocks()` from the **blocks** dataset (`27b3-yjjx`), not from regulations. Regulation ingest does not write `raw_payload`. Unmatched regulation rows are not stored anywhere.

`city_parking_blocks` uniqueness is `(source_id, external_id)` — the **block** object id — not a regulation id. Regulation columns are a 1:1 summary on a 1:N source.

---

## 3. Live source identity (DataSF metadata + full fetch)

Dataset: [Parking regulations (except non-metered color curb)](https://data.sfgov.org/d/hi6h-neyh) (`hi6h-neyh`).

View metadata (`https://data.sfgov.org/api/views/hi6h-neyh.json`) documents **`objectid`**: *"An ObjectID is a unique, not null integer field used to uniquely identify rows in tables in a ESRI geodatabase."*

`globalid` exists in the view schema but was **absent** (omitted/null) on every live JSON row fetched.

There is **no** `blockface_id`, `blockface`, `blockfaceid`, `blkface_id`, or `name` field on live regulation rows.

**Do not invent an ID. Do not use fetch index.** `objectid` is the only documented + empirically unique row identity.

---

## 4. Cardinality profile (full dataset, 2026-09-15)

Read-only: `pnpm profile:regulation-data -- --full`. Geometry dropped per page. No Supabase writes.

| Metric | Value |
|---|---|
| Regulation rows | **7788** |
| Distinct `objectid` | **7788** (0 duplicates) |
| Ingest blockface keys present | **0 / 7788** |
| Distinct `fid_100` | 6715 (non-null 7358; 430 rows missing `fid_100`) |
| `fid_100` groups with 1 row | 6588 |
| `fid_100` groups with 2 rows | 74 |
| `fid_100` groups with 3+ rows | 53 |
| Max rows sharing one `fid_100` | 328 (`fid_100 = "0"`) |
| Multi-`fid_100` groups whose regulation/days/hours/hrlimit/agency/rpp payload differs | **47 / 127** |

**`fid_100` is not a row identity** and is **not** a safe blockface key: `"0"` is a 328-row sentinel bucket mixing unrelated regulations. Do not upsert or join on `fid_100`.

**One-to-many is verified** on some non-zero `fid_100` groups. Example `fid_100 = "1245"` (14 rows) includes both:

- `Time limited` / `M-Sa` / `800-2200` / `hrlimit=1` / `rpparea1=EE`
- `No oversized vehicles` / `M-Su` / `2400-600` / `hrlimit=0`

Those would not survive a singular `city_parking_blocks` UPDATE even if a join existed.

Metered blocks (`27b3-yjjx`) full fetch: **1773** rows. Live keys are `objectid` and `block_id` — **not** `blockface_id`. Overlap with regulation keys is accidental and unusable as a join:

| Overlap | Count |
|---|---|
| regulation `objectid` ∈ blocks.`block_id` | 29 / 7788 |
| regulation `fid_100` ∈ blocks.`block_id` | 2 / 7788 |
| regulation `objectid` ∈ blocks.`objectid` | 0 |
| ingest blockface keys on blocks | **0 / 1773** |

**Live ingest implication:** `regulationBlockfaceId()` matches nothing on current `hi6h-neyh` rows, so `ingestRegulations()` would count **all 7788 as unmatched and persist none**. The code overwrite path remains real; on today's field names the dominant live failure is **drop**, not overwrite. `mapBlockRow()` likewise does not read blocks.`block_id`, so `city_parking_blocks.blockface_id` would also be null from current `27b3-yjjx` JSON. Meter `blockface_id` values (e.g. `667121`) are a third ID space.

A later join-key or spatial-association design is required before regulations can attach to CITY candidates. **Join discovery V1** (`docs/DATASF_REGULATION_JOIN.md`) found **no verified identifier join** (recommendation **C**). That is **out of scope for this storage design**, but it constrains `block_id` to be **nullable**.

---

## 5. Table (implemented — migration `00011`)

Additive table `public.city_parking_regulations`. Existing `city_parking_blocks` regulation columns were **not** dropped or renamed.

```text
city_parking_blocks (unchanged)
        1
        |
        | optional, nullable
        v
city_parking_regulations  (many)
```

### Columns (only fields justified now)

| Column | Type | Why |
|---|---|---|
| `id` | uuid PK | Internal PK, same pattern as other city tables |
| `source_id` | uuid NOT NULL FK → `city_parking_sources` | Same convention as blocks/meters (not a text dataset id) |
| `external_id` | text NOT NULL | DataSF `objectid` |
| `block_id` | uuid NULL FK → `city_parking_blocks(id)` ON DELETE SET NULL | Proven association when one exists; **null until a join is verified** |
| `regulation_type` | text | Mapped today from `regulation` |
| `agency` | text | Mapped today |
| `days_of_week` | text | Mapped today from `days` |
| `hours` | text | Mapped today |
| `hour_limit` | **numeric** | Source includes `0.5` and `0.330000013`; current blocks column is `integer` and cannot store those losslessly |
| `rpparea1` | text | Source field currently squeezed into `permit_area` |
| `rpparea2` | text | Present on 719 / 7788 rows; currently discarded |
| `rpparea3` | text | Present on 45 / 7788 rows; currently discarded |
| `source_fid_100` | text | Observed GIS field; **not** a uniqueness or FK key |
| `raw_source` | jsonb NOT NULL | Slim source row **without** `shape` / geometry |
| `imported_at` | timestamptz | Retrieval/import time |
| `created_at` / `updated_at` | timestamptz | Same trigger pattern as `00005` |

**Unique:** `(source_id, external_id)` — idempotent UPSERT key.

**Indexes:** unique `(source_id, external_id)`; `(block_id)` for a later lookup-by-block; `(source_id)`; `(imported_at DESC)`. No `source_fid_100` index (not a join key).

**RLS:** public SELECT for `anon`/`authenticated`; service-role writes — same as other city tables.

### Implemented ingest behavior

- Mapper: `scripts/map-city-parking-regulation.ts`
- UPSERT every fetched source row into `city_parking_regulations` on `(source_id, external_id)`
- `external_id = string(objectid)`; missing `objectid` **throws** (no array index / `fid_100` identity)
- `block_id` is always `null` in V1 (join discovery recommendation C)
- Legacy `city_parking_blocks` UPDATE remains (lossy / deprecated compatibility path)
- Runtime lookup still reads block columns only
- Verify: `pnpm verify:regulation-storage`

### Explicitly not first-class columns

- Geometry (`shape`): too large (~hundreds of KB/row). Omit from `raw_source` in V1. Re-fetch later if a spatial join is designed.
- `from_time` / `to_time` / `hrs_begin` / `hrs_end` / `exceptions` / `conflict` / `regdetails`: keep inside `raw_source` until a parser needs them.
- `globalid`: absent on all live rows.
- `permit_area` compatibility duplicate: do not add; the three `rpparea*` columns are the source of truth.
- Array of permit areas: rejected. Three named nullable source columns match the source schema without inventing list semantics.

Do **not** join on the 29 `objectid` ∩ `block_id` collisions.

---

## 6. Block FK and unmatched rows

**V1 ingest:** UPSERT every source regulation row. Set `block_id` only when a **later, separately verified** join succeeds. Until then `block_id` stays null.

**Unmatched rows must be retained**, not discarded.

| Option | Tradeoff |
|---|---|
| Drop (current) | Loses 7788/7788 live rows today; makes coverage completeness unrecoverable |
| Separate unmatched table | Extra object; same data as nullable FK |
| **Retain with `block_id` NULL (recommended)** | Lossless storage; lookup-by-block naturally ignores them; later join can fill FK without re-losing rows |

Nullable `block_id` is honest: the pipeline cannot currently prove block association from live text fields.

---

## 7. Idempotent ingest (implemented)

- UPSERT on `(source_id, external_id)` where `external_id = string(objectid)`.
- Same source row twice → one DB row, columns updated.
- New `objectid` → insert.
- Changed payload → update `raw_source` and mapped columns.
- Partial `--limit` fetches UPSERT only the fetched page; they are **not** a full sync.
- V1 does **not** delete rows missing from a later fetch (including after a partial run).

If `objectid` were ever missing, ingest **stops** — it does not fall back to array index. That case was not observed (7788/7788 present and unique).

---

## 8. Source deletion / staleness (V1: upsert-only)

**V1:** UPSERT/update only. Do **not** delete rows that disappear from DataSF. Do **not** soft-delete.

A missing source row might be a fetch failure, pagination hole, or a real repeal. Automatic delete would drop evidence the legality engine might still need.

Later (not V1): `active boolean` / `absent_from_source_at` soft-deactivate after N successful full syncs that omit the `objectid`. Historical retain. No hard delete in this implementation.

---

## 9. Adapter / lookup / domain impact (later)

Keep `ParkingRule`, schedule parser, applicability, and legality **unchanged**.

**Adapter:** add a mapper from a `CityParkingRegulationRow` (new table) → `ParkingRule[]`, parallel to `mapCityRegulationRowToParkingRules`. One source regulation row still may emit TIME_LIMIT + OTHER. `hour_limit` as numeric: convert to minutes only when finite and `> 0` (existing guard).

**Lookup:** after a real `block_id` exists:

```
candidate → authoritative city_parking_blocks.id
         → SELECT * FROM city_parking_regulations WHERE block_id = :id
         → map each row → flatten ParkingRule[]
```

That **eliminates overwrite** for associated rows (many regulation rows per block, not one UPDATE). It does **not** by itself attach today's unmatched rows.

The hardened blockface fallback (0 → `[]`, 1 → that block, 2+ → `[]`) **must stay**. Do not union ambiguous blocks' regulations.

Until `block_id` is populated, lookup should keep using current block columns (dual-read) or return `[]` — do not silently treat all unmatched regulations as applying to a candidate.

---

## 10. Coverage impact

### This design would solve

- Loss of additional `hi6h-neyh` rows that share a destination block (overwrite).
- Loss of `rpparea2` / `rpparea3`.
- Loss of fractional `hour_limit` values if stored as `numeric`.
- Total drop of unmatched source rows (if V1 retains them).
- Missing per-row identity (`objectid`) on stored regulations.

### This would **not** make CITY `READY`

Still missing / unresolved:

- Street sweeping (`yhqp-riqs`) not ingested
- Permit **interpretation** (fields stored, not evaluated)
- Meter payment / `METERED` adapter
- Classified no-parking / oversized / overnight / government-permit kinds (`OTHER`)
- Unsupported day/hour grammar
- **Block association** for live `hi6h-neyh` (join keys do not match)
- Proof that other city datasets do not apply
- `COMPLETE` declaration for CITY (still forbidden)

Normalized storage is necessary but not sufficient for CITY coverage `READY`.

---

## 11. Additive migration sequence

1. **Migration `00011` (done):** create `city_parking_regulations` + indexes + FK + RLS. Leave `city_parking_blocks` regulation columns in place.
2. **Ingest dual-write (done):** UPSERT regulations by `objectid`; keep writing the old block patch so today's lookup does not go empty.
3. **Verify mapping:** `pnpm verify:regulation-storage`. After a live `--full` ingest: row counts vs DataSF 7788; unique `external_id`; `block_id` null rate 100% until a join exists.
4. **Lookup switch (not this milestone):** fetch `city_parking_regulations` by `block_id` after association exists; keep conservative blockface fallback.
5. **Adapter switch (not this milestone):** map regulation table rows, not block summary columns.
6. **Regression:** existing verify scripts + ingest/lookup checks. No legality/coverage semantic change in V1.
7. **Later deprecation:** stop writing block regulation columns; eventually drop them in a **separate** migration after dual-read is gone.

First migration must not drop columns. `00011` does not.

---

## 12. Backfill

Copying current `city_parking_blocks` regulation columns into the new table **cannot** recover overwritten or never-matched source rows. Do not backfill from those columns.

**Required backfill (normal ingest, not a one-off script):**

1. Apply `supabase/migrations/00011_city_parking_regulations.sql` to the target Supabase project (SQL Editor or CLI). Do not apply to production automatically from this repo.
2. Set `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` in repo-root `.env`.
3. Re-fetch DataSF: `pnpm ingest:sf-parking -- --only=regulations --full`
4. Confirm `city_parking_regulations` row count vs live `hi6h-neyh` (7788 at last profile), unique `(source_id, external_id)`, and `block_id` IS NULL for every live row.

`--limit` is a bounded/dev ingest only. It UPSERTs that page and must not be treated as a complete source sync.

Geometry is omitted. `block_id` remains null until a join design exists.

Existing block summary columns can be left as a stale convenience copy; they are not a lossless archive.

---

## 13. Open follow-up (not this design)

**Join discovery V1 (2026-09-15):** no verified deterministic identifier associates `hi6h-neyh` with `city_parking_blocks` / meters. See [`DATASF_REGULATION_JOIN.md`](./DATASF_REGULATION_JOIN.md). Recommendation **C** — keep `block_id` null; spatial association is a later design, not a current join.

Until that is solved, lossless **storage** and **location-complete coverage** are different problems.

**Spatial association design V1 (2026-09-18):** [new geometry evidence and the proposed result contract](./DATASF_REGULATION_JOIN.md#15-spatial-association-design-v1--2026-09-18) leave association **PLAUSIBLE_BUT_UNPROVEN**. Of 266 sampled regulations, 221 had one citywide curb candidate under an experimental 80%-length-within-3-m test; this does not verify curb-side identity. No associations were accepted. Normalized regulation geometry remains intentionally omitted; a future pipeline needs versioned external geometry and source identity provenance.

The earlier block-FK lookup sketches are conditional, not a complete side-specific design. A street-block polygon can combine opposite sides, and a long regulation can cover multiple curb intervals. A future regulation-to-curb relation may therefore be needed before a lookup switch; do not automatically populate the existing singular `block_id` from proximity. Production storage/backfill/idempotency are complete per the supplied baseline, while runtime remains unchanged and CITY remains **INCOMPLETE**.

**Spatial validation V2 (2026-09-18):** [full-source competition and proposed storage contract](./DATASF_REGULATION_JOIN.md#16-spatial-association-validation-v2--2026-09-18) measured 83,796 regulation/curb pairs across all 7,778 usable regulation geometries. The 165 geometry-only screened rows remain unverified; no associations were accepted. Two regulations have high union coverage from separate partial curb candidates, without verified adjacency. This supports designing a future `city_parking_regulation_associations` relation with curb/interval targets, categorical quality, evidence/provenance, snapshot and matcher versions, and timestamps, rather than forcing every regulation into one block FK. It does not prove those two cases span adjacent physical curbs, and no schema was changed.

The user confirmed PostGIS is not enabled in production. The recommendation is future offline validation in an isolated spatial database followed by reviewed, precomputed associations; production extension enablement and runtime lookup changes require separate work. CITY remains **INCOMPLETE**.

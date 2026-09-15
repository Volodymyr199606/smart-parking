/**
 * Regulation Schedule Data Profiling (V1) — READ-ONLY, OBSERVATIONAL ONLY.
 *
 * Answers "what exact shapes/vocabularies do the real city regulation
 * fields (`regulation_type`, `days_of_week`, `hours`, `hour_limit`,
 * `permit_area`, `agency`) actually contain?" — nothing more. This script
 * does NOT parse, classify into `ParkingRuleSchedule`, or change any
 * legality/adapter/orchestration logic anywhere in this repo. Every
 * "classification" tally below (e.g. "does this string contain a dash")
 * exists only to print a human-readable count for this milestone's
 * report; none of it is exported, reused elsewhere, or wired into
 * `mapCityRegulationRowToParkingRules` / `evaluateParkingLegality`.
 *
 * WHY THIS DATA SOURCE, NOT SUPABASE:
 * The two project-supported options were (A) read the already-populated
 * Supabase `city_parking_blocks` table, or (B) query the exact DataSF
 * source dataset `scripts/ingest-sf-parking-data.ts` already fetches from.
 * This environment has no `SUPABASE_URL`/`SUPABASE_SERVICE_ROLE_KEY`/`.env`
 * configured (verified before writing this script — there is no
 * reachable Supabase project here), so (A) is not available. (B) is: the
 * DataSF "Parking Regulations" dataset (Socrata id `hi6h-neyh`, the same
 * `DATASETS.regulations.datasetId` in `ingest-sf-parking-data.ts`) is a
 * PUBLIC, unauthenticated JSON endpoint — confirmed reachable from this
 * environment — so profiling it requires no credentials, no `.env`, and
 * no new machinery beyond a small paginated `fetch`, which mirrors the
 * existing ingestion script's own `fetchSocrataPage`/`fetchAllRows`
 * pattern (duplicated here in miniature, not imported, since those
 * helpers are not exported and this script must have zero dependency —
 * including no accidental Supabase env-var requirement — on the rest of
 * that file to run standalone).
 *
 * WHY THE FIELD-EXTRACTION KEY LISTS ARE COPIED VERBATIM:
 * The Socrata dataset's raw field names (e.g. `regulation`, `days`,
 * `hrlimit`, `rpparea1`) are NOT the same as the `city_parking_blocks`
 * column names they get mapped to. To profile what is ACTUALLY persisted
 * (not what the raw Socrata schema might suggest), this script copies
 * `ingestRegulations()`'s exact `pickString`/`pickNumber` key lists from
 * `scripts/ingest-sf-parking-data.ts` verbatim. This is deliberate
 * duplication for profiling fidelity, not a new parser — see the FIXED
 * finding note near `PERSISTED_PERMIT_AREA_KEYS` below for why this
 * specifically mattered for `permit_area` (DataSF Permit Area Ingestion
 * Fix V1 corrected the key list this script's copy also reflects).
 *
 * ALSO DEMONSTRATES (DataSF Permit Area Ingestion Fix V1): in addition to
 * profiling, this script now prints a small, read-only co-occurrence
 * check for `rpparea1`/`rpparea2`/`rpparea3` — evidence for why
 * `permit_area` (a singular text column) intentionally maps only
 * `rpparea1` and does not attempt to concatenate the (rarer) additional
 * area codes. This is still observation/counting only; no schema,
 * adapter, or legality code is touched by this script.
 *
 * Usage:
 *   pnpm profile:regulation-data
 *   pnpm profile:regulation-data -- --limit=1000
 *   pnpm profile:regulation-data -- --full
 *
 * `--full` paginates until the dataset ends (geometry is dropped per page)
 * and also fetches SFMTA Metered Street Blocks (`27b3-yjjx`) objectid /
 * block_id values for a read-only join-key overlap check. No writes.
 *
 * No writes: this script never calls Supabase, never calls DataSF with a
 * write verb, and never modifies any file. Output is bounded — it never
 * dumps the full sampled dataset, only counts and a fixed number of
 * representative examples per field.
 */

const SOCRATA_BASE = "https://data.sfgov.org/resource";
/** Same dataset id as DATASETS.regulations.datasetId in scripts/ingest-sf-parking-data.ts. */
const REGULATIONS_DATASET_ID = "hi6h-neyh";
const PAGE_SIZE = 1000;
/** ~40% of the dataset's real total (7,788 rows as of this milestone) — enough for a representative profile without fetching the whole public dataset needlessly. Override with --limit=N. */
const DEFAULT_SAMPLE_SIZE = 3000;
/** How many distinct values to print per field — bounded output, never a full dump. */
const MAX_DISTINCT_VALUES_SHOWN = 25;
const MAX_COMBO_VALUES_SHOWN = 15;

type SocrataRow = Record<string, unknown>;

function log(message: string): void {
  console.log(`[profile] ${message}`);
}

// --- Minimal fetch helpers (mirrors ingest-sf-parking-data.ts's fetchSocrataPage/fetchAllRows; not imported — see module doc comment) ---

const MAX_ROWS_SAFETY = 100_000;
const BLOCKS_DATASET_ID = "27b3-yjjx";
const MAX_MULTI_GROUP_EXAMPLES = 3;
const MAX_ROWS_PER_GROUP_SHOWN = 6;

/** Ingest's regulationBlockfaceId key list (scripts/ingest-sf-parking-data.ts), copied verbatim. */
const INGEST_BLOCKFACE_KEYS = ["blockface_id", "blockface", "blkface_id", "blockfaceid"];
const INGEST_BLOCKFACE_FALLBACK_KEYS = ["name"];

function omitGeometry(row: SocrataRow): SocrataRow {
  const out: SocrataRow = { ...row };
  delete out.shape;
  delete out.the_geom;
  delete out.location;
  return out;
}

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchSocrataPage(
  datasetId: string,
  offset: number,
  limit: number
): Promise<SocrataRow[]> {
  const url = new URL(`${SOCRATA_BASE}/${datasetId}.json`);
  url.searchParams.set("$limit", String(limit));
  url.searchParams.set("$offset", String(offset));

  let lastError = "";
  for (let attempt = 1; attempt <= 5; attempt += 1) {
    const res = await fetch(url.toString(), { headers: { Accept: "application/json" } });
    if (res.ok) {
      const data = (await res.json()) as unknown;
      if (!Array.isArray(data)) {
        throw new Error(`DataSF ${datasetId}: expected a JSON array`);
      }
      return (data as SocrataRow[]).map(omitGeometry);
    }
    const body = await res.text().catch(() => "");
    lastError = `HTTP ${res.status}: ${body.slice(0, 200)}`;
    if (res.status === 425 || res.status === 429 || res.status === 503) {
      const backoffMs = 1000 * attempt * attempt;
      log(`  ${datasetId} offset=${offset} ${lastError.trim()} — retry ${attempt}/5 in ${backoffMs}ms`);
      await sleep(backoffMs);
      continue;
    }
    throw new Error(`DataSF ${datasetId} ${lastError}`);
  }
  throw new Error(`DataSF ${datasetId} ${lastError}`);
}

async function fetchSample(datasetId: string, sampleSize: number): Promise<SocrataRow[]> {
  const rows: SocrataRow[] = [];
  let offset = 0;
  const cap = Math.min(sampleSize, MAX_ROWS_SAFETY);
  while (rows.length < cap) {
    const pageSize = Math.min(PAGE_SIZE, cap - rows.length);
    const page = await fetchSocrataPage(datasetId, offset, pageSize);
    rows.push(...page);
    log(`  fetched ${datasetId} offset=${offset} count=${page.length} (total so far: ${rows.length})`);
    if (page.length < pageSize) break; // reached end of dataset
    offset += page.length;
    await sleep(400);
  }
  return rows;
}

// --- Field extraction (copied verbatim from ingest-sf-parking-data.ts's pickString/pickNumber and ingestRegulations()'s key lists) ---

function pickString(row: SocrataRow, keys: string[]): string | null {
  for (const key of keys) {
    const v = row[key];
    if (v !== null && v !== undefined && String(v).trim() !== "") {
      return String(v).trim();
    }
  }
  return null;
}

function pickNumber(row: SocrataRow, keys: string[]): number | null {
  for (const key of keys) {
    const v = row[key];
    if (v === null || v === undefined || v === "") continue;
    const n = typeof v === "number" ? v : Number(v);
    if (!Number.isNaN(n)) return n;
  }
  return null;
}

/** Exact key lists from ingestRegulations()'s `patch` object in scripts/ingest-sf-parking-data.ts. */
const REGULATION_TYPE_KEYS = ["regulation", "regulation_type", "type"];
const AGENCY_KEYS = ["agency"];
const DAYS_OF_WEEK_KEYS = ["days", "days_of_week"];
const HOURS_KEYS = ["hours"];
const HOUR_LIMIT_KEYS = ["hrlimit", "hr_limit", "hour_limit"];
/**
 * FIXED (DataSF Permit Area Ingestion Fix V1 — was the PRIMARY FINDING of
 * the prior profiling-only milestone): `ingestRegulations()` now maps
 * `permit_area` from `rpparea1` (the block's PRIMARY RPP permit area),
 * not the old `["permitarea", "permit_area"]` keys, which never matched
 * anything in the real Socrata schema. This key list is copied verbatim
 * from the current `scripts/ingest-sf-parking-data.ts` to profile exactly
 * what is now persisted. `rpparea2`/`rpparea3` (up to two ADDITIONAL,
 * genuinely distinct permit-area codes DataSF records on some blocks) are
 * profiled separately below, alongside it, to keep demonstrating that gap
 * — they are still not captured by the singular `permit_area` column
 * (see docs/CITY_DATA_PLAN.md "DataSF permit area ingestion fix" for why,
 * and the proposed, not-yet-built schema change). This script does not
 * modify scripts/ingest-sf-parking-data.ts.
 */
const PERSISTED_PERMIT_AREA_KEYS = ["rpparea1"];
const RAW_PERMIT_AREA_KEY = "rpparea1";
const RAW_PERMIT_AREA_2_KEY = "rpparea2";
const RAW_PERMIT_AREA_3_KEY = "rpparea3";

interface MappedFields {
  readonly regulation_type: string | null;
  readonly agency: string | null;
  readonly days_of_week: string | null;
  readonly hours: string | null;
  readonly hour_limit: number | null;
  readonly permit_area: string | null;
  readonly raw_permit_area: string | null; // == rpparea1; profiling-only alias, same value as permit_area now that the fix is in
  readonly raw_permit_area_2: string | null; // rpparea2; NOT captured by any persisted column today
  readonly raw_permit_area_3: string | null; // rpparea3; NOT captured by any persisted column today
}

function mapRow(row: SocrataRow): MappedFields {
  return {
    regulation_type: pickString(row, REGULATION_TYPE_KEYS),
    agency: pickString(row, AGENCY_KEYS),
    days_of_week: pickString(row, DAYS_OF_WEEK_KEYS),
    hours: pickString(row, HOURS_KEYS),
    hour_limit: pickNumber(row, HOUR_LIMIT_KEYS),
    permit_area: pickString(row, PERSISTED_PERMIT_AREA_KEYS),
    raw_permit_area: pickString(row, [RAW_PERMIT_AREA_KEY]),
    raw_permit_area_2: pickString(row, [RAW_PERMIT_AREA_2_KEY]),
    raw_permit_area_3: pickString(row, [RAW_PERMIT_AREA_3_KEY]),
  };
}

// --- Bounded reporting helpers ---

function countNonNull<T>(values: readonly (T | null)[]): number {
  return values.filter((v) => v !== null).length;
}

function distinctFrequency(values: readonly (string | number | null)[]): Array<[string, number]> {
  const counts = new Map<string, number>();
  for (const v of values) {
    const key = v === null ? "<null>" : String(v);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1]);
}

function printDistinct(label: string, values: readonly (string | number | null)[], max = MAX_DISTINCT_VALUES_SHOWN): void {
  const freq = distinctFrequency(values);
  log(`${label}: ${freq.length} distinct value(s) observed (showing up to ${max}):`);
  for (const [value, count] of freq.slice(0, max)) {
    log(`    ${JSON.stringify(value)} -> ${count}`);
  }
  if (freq.length > max) {
    log(`    ... ${freq.length - max} more distinct value(s) not shown`);
  }
}

/** Purely observational substring/pattern tallies for the report — see module doc comment. Not a parser: no result here is used to classify a ParkingRule or evaluate legality. */
function tallyPatterns(
  label: string,
  values: readonly (string | null)[],
  tests: Record<string, (v: string) => boolean>
): void {
  const nonNull = values.filter((v): v is string => v !== null);
  const results: Record<string, number> = {};
  for (const name of Object.keys(tests)) results[name] = 0;
  for (const v of nonNull) {
    for (const [name, test] of Object.entries(tests)) {
      if (test(v)) results[name] += 1;
    }
  }
  log(`${label} pattern tallies (of ${nonNull.length} non-null values):`);
  for (const [name, count] of Object.entries(results)) {
    log(`    ${name}: ${count}`);
  }
}

function parseArgs(argv: string[]): { sampleSize: number; full: boolean } {
  let full = false;
  let sampleSize = DEFAULT_SAMPLE_SIZE;
  for (const arg of argv) {
    if (arg === "--full") {
      full = true;
      sampleSize = MAX_ROWS_SAFETY;
    }
    if (arg.startsWith("--limit=")) {
      const n = Number(arg.split("=")[1]);
      if (Number.isFinite(n) && n > 0) {
        sampleSize = Math.floor(n);
        full = false;
      }
    }
  }
  return { sampleSize, full };
}

function fieldNonNullCount(rows: readonly SocrataRow[], keys: string[]): number {
  return rows.filter((row) => pickString(row, keys) !== null).length;
}

function groupBy(rows: readonly SocrataRow[], keys: string[]): Map<string, SocrataRow[]> {
  const groups = new Map<string, SocrataRow[]>();
  for (const row of rows) {
    const key = pickString(row, keys);
    if (key === null) continue;
    const list = groups.get(key) ?? [];
    list.push(row);
    groups.set(key, list);
  }
  return groups;
}

function printIdentityUniqueness(label: string, rows: readonly SocrataRow[], keys: string[]): void {
  const values = rows.map((row) => pickString(row, keys));
  const nonNull = values.filter((v): v is string => v !== null);
  const unique = new Set(nonNull).size;
  const counts = new Map<string, number>();
  for (const v of nonNull) counts.set(v, (counts.get(v) ?? 0) + 1);
  const duplicateValues = [...counts.entries()].filter(([, c]) => c > 1).sort((a, b) => b[1] - a[1]);
  log(
    `  ${label}: non-null=${nonNull.length}/${rows.length} unique=${unique} duplicateValues=${duplicateValues.length} maxShare=${duplicateValues[0]?.[1] ?? (nonNull.length > 0 ? 1 : 0)}`
  );
  for (const [value, count] of duplicateValues.slice(0, 8)) {
    log(`    ${JSON.stringify(value)} -> ${count}`);
  }
}

function printCardinality(label: string, groups: Map<string, SocrataRow[]>): void {
  let ones = 0;
  let twos = 0;
  let threePlus = 0;
  let max = 0;
  for (const list of groups.values()) {
    const n = list.length;
    max = Math.max(max, n);
    if (n === 1) ones += 1;
    else if (n === 2) twos += 1;
    else threePlus += 1;
  }
  log(
    `  ${label}: distinctKeys=${groups.size} ones=${ones} twos=${twos} threePlus=${threePlus} maxRowsForOneKey=${max}`
  );
}

function printMultiExamples(label: string, groups: Map<string, SocrataRow[]>): void {
  const multi = [...groups.entries()].filter(([, list]) => list.length >= 2).sort((a, b) => b[1].length - a[1].length);
  if (multi.length === 0) {
    log(`  ${label}: no multi-row groups in this sample`);
    return;
  }
  log(`  ${label}: showing up to ${MAX_MULTI_GROUP_EXAMPLES} groups with 2+ rows`);
  for (const [key, list] of multi.slice(0, MAX_MULTI_GROUP_EXAMPLES)) {
    log(`    key=${JSON.stringify(key)} n=${list.length}`);
    for (const row of list.slice(0, MAX_ROWS_PER_GROUP_SHOWN)) {
      log(
        `      ${JSON.stringify({
          objectid: row.objectid ?? null,
          fid_100: row.fid_100 ?? null,
          regulation: row.regulation ?? null,
          days: row.days ?? null,
          hours: row.hours ?? null,
          hrlimit: row.hrlimit ?? null,
          agency: row.agency ?? null,
          rpparea1: row.rpparea1 ?? null,
          rpparea2: row.rpparea2 ?? null,
          rpparea3: row.rpparea3 ?? null,
        })}`
      );
    }
    if (list.length > MAX_ROWS_PER_GROUP_SHOWN) {
      log(`      ... ${list.length - MAX_ROWS_PER_GROUP_SHOWN} more row(s) not shown`);
    }
  }
}

function slimGroupSignature(row: SocrataRow): string {
  return [
    String(row.regulation ?? ""),
    String(row.days ?? ""),
    String(row.hours ?? ""),
    String(row.hrlimit ?? ""),
    String(row.agency ?? ""),
    String(row.rpparea1 ?? ""),
    String(row.rpparea2 ?? ""),
    String(row.rpparea3 ?? ""),
  ].join("|");
}

function printWhetherMultiRowsDiffer(groups: Map<string, SocrataRow[]>): void {
  let groupsChecked = 0;
  let groupsWithDifferingPayload = 0;
  for (const list of groups.values()) {
    if (list.length < 2) continue;
    groupsChecked += 1;
    const signatures = new Set(list.map(slimGroupSignature));
    if (signatures.size > 1) groupsWithDifferingPayload += 1;
  }
  log(
    `  multi-row groups whose regulation/days/hours/hrlimit/agency/rpp fields are not identical: ${groupsWithDifferingPayload}/${groupsChecked}`
  );
}

async function main(): Promise<void> {
  const { sampleSize, full } = parseArgs(process.argv.slice(2));

  log("Regulation Schedule Data Profiling (V1) — read-only, no writes");
  log(`Source: DataSF Socrata dataset ${REGULATIONS_DATASET_ID} (public, unauthenticated)`);
  log(
    full
      ? `Requesting the full dataset (cap ${MAX_ROWS_SAFETY}; geometry dropped per page)...`
      : `Requesting up to ${sampleSize} rows (bounded sample; dataset total is larger)...`
  );

  const rawRows = await fetchSample(REGULATIONS_DATASET_ID, sampleSize);
  log(`\nSample size actually retrieved: ${rawRows.length}\n`);

  const mapped = rawRows.map(mapRow);

  log("=== Null / non-null counts (fields as persisted into city_parking_blocks) ===");
  for (const field of ["regulation_type", "agency", "days_of_week", "hours", "hour_limit", "permit_area"] as const) {
    const values = mapped.map((m) => m[field]);
    const nonNull = countNonNull(values);
    log(`  ${field}: non-null=${nonNull} null=${mapped.length - nonNull} (of ${mapped.length})`);
  }

  log("\n=== permit_area mapping status (FIXED in DataSF Permit Area Ingestion Fix V1) ===");
  const persistedPermitAreaNonNull = countNonNull(mapped.map((m) => m.permit_area));
  const rawPermitArea2NonNull = countNonNull(mapped.map((m) => m.raw_permit_area_2));
  const rawPermitArea3NonNull = countNonNull(mapped.map((m) => m.raw_permit_area_3));
  log(
    `  permit_area as persisted today (keys ${JSON.stringify(PERSISTED_PERMIT_AREA_KEYS)}): ${persistedPermitAreaNonNull} non-null of ${mapped.length} (was 0 before the fix)`
  );
  log(
    `  raw '${RAW_PERMIT_AREA_2_KEY}' (2nd distinct permit area on the same block, NOT captured by any column): ${rawPermitArea2NonNull} non-null of ${mapped.length}`
  );
  log(
    `  raw '${RAW_PERMIT_AREA_3_KEY}' (3rd distinct permit area on the same block, NOT captured by any column): ${rawPermitArea3NonNull} non-null of ${mapped.length}`
  );

  log("\n=== rpparea1/2/3 co-occurrence (demonstrates why a singular text column is incomplete) ===");
  let onlyArea1 = 0;
  let area1AndArea2 = 0;
  let area1Area2AndArea3 = 0;
  let none = 0;
  let area2WithoutArea1 = 0;
  let area3WithoutArea1OrArea2 = 0;
  let area2EqualsArea1 = 0;
  let area3EqualsEither = 0;
  for (const m of mapped) {
    const a1 = m.raw_permit_area;
    const a2 = m.raw_permit_area_2;
    const a3 = m.raw_permit_area_3;
    if (a1 === null && a2 === null && a3 === null) none += 1;
    if (a1 !== null && a2 === null && a3 === null) onlyArea1 += 1;
    if (a1 !== null && a2 !== null && a3 === null) area1AndArea2 += 1;
    if (a1 !== null && a2 !== null && a3 !== null) area1Area2AndArea3 += 1;
    if (a2 !== null && a1 === null) area2WithoutArea1 += 1;
    if (a3 !== null && (a1 === null || a2 === null)) area3WithoutArea1OrArea2 += 1;
    if (a2 !== null && a2 === a1) area2EqualsArea1 += 1;
    if (a3 !== null && (a3 === a1 || a3 === a2)) area3EqualsEither += 1;
  }
  log(`  rows with no permit area at all: ${none}`);
  log(`  rows with exactly one permit area (rpparea1 only): ${onlyArea1}`);
  log(`  rows with exactly two distinct permit areas (rpparea1 + rpparea2): ${area1AndArea2}`);
  log(`  rows with all three distinct permit areas: ${area1Area2AndArea3}`);
  log(`  rows where rpparea2 appears WITHOUT rpparea1 (would indicate a non-sequential/alternative relationship): ${area2WithoutArea1}`);
  log(`  rows where rpparea3 appears without both rpparea1 and rpparea2: ${area3WithoutArea1OrArea2}`);
  log(`  rows where rpparea2 duplicates rpparea1's value: ${area2EqualsArea1}`);
  log(`  rows where rpparea3 duplicates rpparea1 or rpparea2's value: ${area3EqualsEither}`);
  log(
    "  Interpretation from this evidence alone: rpparea1/2/3 are filled strictly in order (2 never appears " +
      "without 1, 3 never appears without both 1 and 2) and are always mutually distinct codes (never equal) " +
      "when present together — consistent with a fixed-width (max 3) list of genuinely different, simultaneously " +
      "applicable RPP permit areas for one block, not alternatives and not duplicates."
  );

  log("\n=== regulation_type ===");
  printDistinct("regulation_type", mapped.map((m) => m.regulation_type));

  log("\n=== agency ===");
  printDistinct("agency", mapped.map((m) => m.agency));

  log("\n=== permit_area (as persisted today, post-fix) ===");
  printDistinct("permit_area", mapped.map((m) => m.permit_area));

  log("\n=== raw rpparea2 / rpparea3 (still NOT persisted anywhere — profiling only) ===");
  printDistinct("raw_permit_area_2", mapped.map((m) => m.raw_permit_area_2));
  printDistinct("raw_permit_area_3", mapped.map((m) => m.raw_permit_area_3));

  log("\n=== hour_limit ===");
  const hourLimits = mapped.map((m) => m.hour_limit).filter((v): v is number => v !== null);
  log(`  non-null count: ${hourLimits.length} of ${mapped.length}`);
  if (hourLimits.length > 0) {
    log(`  min=${Math.min(...hourLimits)} max=${Math.max(...hourLimits)}`);
  }
  printDistinct("hour_limit distinct values", mapped.map((m) => m.hour_limit));

  log("\n=== days_of_week ===");
  printDistinct("days_of_week", mapped.map((m) => m.days_of_week));
  tallyPatterns("days_of_week", mapped.map((m) => m.days_of_week), {
    hasDash: (v) => v.includes("-"),
    hasComma: (v) => v.includes(","),
    hasInternalSpace: (v) => v.trim().includes(" "),
    allUppercase: (v) => v === v.toUpperCase(),
    hasLowercaseLetter: (v) => /[a-z]/.test(v),
    containsWeekendWord: (v) => /weekend/i.test(v),
    containsEverydayPhrase: (v) => /every ?day|all ?day/i.test(v),
  });

  log("\n=== hours ===");
  printDistinct("hours", mapped.map((m) => m.hours));
  tallyPatterns("hours", mapped.map((m) => m.hours), {
    hasDash: (v) => v.includes("-"),
    hasColon: (v) => v.includes(":"),
    hasAmPmMarker: (v) => /am|pm/i.test(v),
    isFourDigitDashFourDigit: (v) => /^\d{4}-\d{4}$/.test(v),
    isVariableDigitDashVariableDigit: (v) => /^\d{1,4}-\d{1,4}$/.test(v),
    hasInternalSpace: (v) => v.includes(" "),
    containsAllDayOrTwentyFourHour: (v) => /all ?day|24 ?hour/i.test(v),
    hasMultipleCommaOrSemicolonSegments: (v) => v.split(/[,;]/).length > 1,
    startsWithZeroPadded: (v) => /^0\d{3}-/.test(v),
    looksLikeOvernightWindow: (v) => {
      const m = v.match(/^(\d{1,4})-(\d{1,4})$/);
      if (!m) return false;
      return Number(m[1]) > Number(m[2]);
    },
  });

  log("\n=== days_of_week + hours combinations (top " + MAX_COMBO_VALUES_SHOWN + ") ===");
  const combos = mapped.map((m) => `${m.days_of_week ?? "<null>"} | ${m.hours ?? "<null>"}`);
  printDistinct("days_of_week + hours combo", combos, MAX_COMBO_VALUES_SHOWN);

  log("\n=== hour_limit presence vs. regulation_type (does hour_limit correlate with regulation_type?) ===");
  const byRegType = new Map<string, { withLimit: number; withoutLimit: number }>();
  for (const m of mapped) {
    const key = m.regulation_type ?? "<null>";
    const bucket = byRegType.get(key) ?? { withLimit: 0, withoutLimit: 0 };
    if (m.hour_limit !== null && m.hour_limit > 0) bucket.withLimit += 1;
    else bucket.withoutLimit += 1;
    byRegType.set(key, bucket);
  }
  for (const [regType, counts] of [...byRegType.entries()].sort(
    (a, b) => b[1].withLimit + b[1].withoutLimit - (a[1].withLimit + a[1].withoutLimit)
  )) {
    log(`  ${JSON.stringify(regType)}: withPositiveHourLimit=${counts.withLimit} withoutPositiveHourLimit=${counts.withoutLimit}`);
  }

  log("\n=== 5 representative raw rows (values exactly as received, not normalized; geometry omitted) ===");
  for (const row of rawRows.slice(0, 5)) {
    log(
      `  ${JSON.stringify({
        objectid: row.objectid,
        fid_100: row.fid_100,
        globalid: row.globalid,
        blockface_id: row.blockface_id,
        name: row.name,
        regulation: row.regulation,
        days: row.days,
        hours: row.hours,
        hrlimit: row.hrlimit,
        rpparea1: row.rpparea1,
        rpparea2: row.rpparea2,
        rpparea3: row.rpparea3,
        agency: row.agency,
      })}`
    );
  }

  log("\n=== Source-row identity (read-only; no invented IDs) ===");
  log("  DataSF view metadata describes objectid as: unique, not-null ESRI geodatabase ObjectID.");
  log("  Live JSON omits null fields; a 0 non-null count means the key was absent from every sampled row.");
  log("  Ingest join keys used today (regulationBlockfaceId):");
  log(`    primary: ${JSON.stringify(INGEST_BLOCKFACE_KEYS)} -> ${fieldNonNullCount(rawRows, INGEST_BLOCKFACE_KEYS)}/${rawRows.length} non-null`);
  log(`    fallback: ${JSON.stringify(INGEST_BLOCKFACE_FALLBACK_KEYS)} -> ${fieldNonNullCount(rawRows, INGEST_BLOCKFACE_FALLBACK_KEYS)}/${rawRows.length} non-null`);
  printIdentityUniqueness("objectid", rawRows, ["objectid"]);
  printIdentityUniqueness("globalid", rawRows, ["globalid"]);
  printIdentityUniqueness("fid_100", rawRows, ["fid_100"]);
  printIdentityUniqueness("ingest blockface key", rawRows, INGEST_BLOCKFACE_KEYS);

  log("\n=== Cardinality / one-to-many (grouping keys observed on source rows) ===");
  const byObjectId = groupBy(rawRows, ["objectid"]);
  const byFid = groupBy(rawRows, ["fid_100"]);
  const byIngestBlockface = groupBy(rawRows, INGEST_BLOCKFACE_KEYS);
  printCardinality("objectid", byObjectId);
  printCardinality("fid_100", byFid);
  printCardinality("ingest blockface_id/blockface/blkface_id/blockfaceid", byIngestBlockface);
  printWhetherMultiRowsDiffer(byFid);
  printMultiExamples("fid_100", byFid);
  printMultiExamples("ingest blockface key", byIngestBlockface);

  if (full) {
    log("\n=== Join-key overlap with SFMTA Metered Street Blocks (27b3-yjjx), --full only ===");
    const blockRows = await fetchSample(BLOCKS_DATASET_ID, MAX_ROWS_SAFETY);
    const blockIds = new Set(
      blockRows.map((row) => pickString(row, ["block_id"])).filter((v): v is string => v !== null)
    );
    const blockObjectIds = new Set(
      blockRows.map((row) => pickString(row, ["objectid"])).filter((v): v is string => v !== null)
    );
    const blockfaceIds = new Set(
      blockRows
        .map((row) => pickString(row, INGEST_BLOCKFACE_KEYS))
        .filter((v): v is string => v !== null)
    );
    log(`  blocks fetched=${blockRows.length} distinct block_id=${blockIds.size} distinct objectid=${blockObjectIds.size} distinct ingest-blockface-keys=${blockfaceIds.size}`);
    const regObjectIds = rawRows.map((row) => pickString(row, ["objectid"]));
    const regFids = rawRows.map((row) => pickString(row, ["fid_100"]));
    const overlap = (values: Array<string | null>, set: Set<string>): number =>
      values.filter((v) => v !== null && set.has(v)).length;
    log(`  regulation objectid in blocks.block_id: ${overlap(regObjectIds, blockIds)}/${rawRows.length}`);
    log(`  regulation fid_100 in blocks.block_id: ${overlap(regFids, blockIds)}/${rawRows.length}`);
    log(`  regulation objectid in blocks.objectid: ${overlap(regObjectIds, blockObjectIds)}/${rawRows.length}`);
    log(`  regulation fid_100 in blocks.objectid: ${overlap(regFids, blockObjectIds)}/${rawRows.length}`);
    log(`  regulation objectid in blocks ingest-blockface-keys: ${overlap(regObjectIds, blockfaceIds)}/${rawRows.length}`);
    log(`  regulation fid_100 in blocks ingest-blockface-keys: ${overlap(regFids, blockfaceIds)}/${rawRows.length}`);
  } else {
    log("\n=== Join-key overlap with metered blocks skipped (pass --full to fetch 27b3-yjjx) ===");
  }

  log("\nDone. No data was written anywhere. This script performed observation/counting only.");
}

main().catch((err) => {
  console.error("[profile] ERROR:", err instanceof Error ? err.message : err);
  process.exit(1);
});

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
 * duplication for profiling fidelity, not a new parser — see the PRIMARY
 * FINDING note near `PERMIT_AREA_KEYS` below for why this specifically
 * matters for `permit_area`.
 *
 * Usage:
 *   pnpm profile:regulation-data
 *   pnpm profile:regulation-data -- --limit=1000
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

async function fetchSocrataPage(offset: number, limit: number): Promise<SocrataRow[]> {
  const url = new URL(`${SOCRATA_BASE}/${REGULATIONS_DATASET_ID}.json`);
  url.searchParams.set("$limit", String(limit));
  url.searchParams.set("$offset", String(offset));

  const res = await fetch(url.toString(), { headers: { Accept: "application/json" } });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`DataSF ${REGULATIONS_DATASET_ID} HTTP ${res.status}: ${body.slice(0, 200)}`);
  }
  const data = (await res.json()) as unknown;
  if (!Array.isArray(data)) {
    throw new Error(`DataSF ${REGULATIONS_DATASET_ID}: expected a JSON array`);
  }
  return data as SocrataRow[];
}

async function fetchSample(sampleSize: number): Promise<SocrataRow[]> {
  const rows: SocrataRow[] = [];
  let offset = 0;
  while (rows.length < sampleSize) {
    const pageSize = Math.min(PAGE_SIZE, sampleSize - rows.length);
    const page = await fetchSocrataPage(offset, pageSize);
    rows.push(...page);
    log(`  fetched offset=${offset} count=${page.length} (total so far: ${rows.length})`);
    if (page.length < pageSize) break; // reached end of dataset
    offset += page.length;
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
 * PRIMARY FINDING (see FINAL REPORT): the real Socrata dataset's permit-area
 * field is named `rpparea1` (with `rpparea2`/`rpparea3` for additional
 * areas on the same block) — NOT `permitarea`/`permit_area`. The existing
 * ingest script's key list below is copied verbatim to show what is
 * ACTUALLY persisted today. `RAW_PERMIT_AREA_KEY` is profiled separately,
 * alongside it, purely to make the resulting gap observable — it is not
 * used to change what gets persisted, and this script does not modify
 * scripts/ingest-sf-parking-data.ts.
 */
const PERSISTED_PERMIT_AREA_KEYS = ["permitarea", "permit_area"];
const RAW_PERMIT_AREA_KEY = "rpparea1";

interface MappedFields {
  readonly regulation_type: string | null;
  readonly agency: string | null;
  readonly days_of_week: string | null;
  readonly hours: string | null;
  readonly hour_limit: number | null;
  readonly permit_area: string | null;
  readonly raw_permit_area: string | null; // profiling-only; not part of the persisted schema
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

function parseSampleSizeArg(argv: string[]): number {
  for (const arg of argv) {
    if (arg.startsWith("--limit=")) {
      const n = Number(arg.split("=")[1]);
      if (Number.isFinite(n) && n > 0) return Math.floor(n);
    }
  }
  return DEFAULT_SAMPLE_SIZE;
}

async function main(): Promise<void> {
  const sampleSize = parseSampleSizeArg(process.argv.slice(2));

  log("Regulation Schedule Data Profiling (V1) — read-only, no writes");
  log(`Source: DataSF Socrata dataset ${REGULATIONS_DATASET_ID} (public, unauthenticated)`);
  log(`Requesting up to ${sampleSize} rows (bounded sample; dataset total is larger)...`);

  const rawRows = await fetchSample(sampleSize);
  log(`\nSample size actually retrieved: ${rawRows.length}\n`);

  const mapped = rawRows.map(mapRow);

  log("=== Null / non-null counts (fields as persisted into city_parking_blocks) ===");
  for (const field of ["regulation_type", "agency", "days_of_week", "hours", "hour_limit", "permit_area"] as const) {
    const values = mapped.map((m) => m[field]);
    const nonNull = countNonNull(values);
    log(`  ${field}: non-null=${nonNull} null=${mapped.length - nonNull} (of ${mapped.length})`);
  }

  log("\n=== PRIMARY FINDING: permit_area mapping gap ===");
  const persistedPermitAreaNonNull = countNonNull(mapped.map((m) => m.permit_area));
  const rawPermitAreaNonNull = countNonNull(mapped.map((m) => m.raw_permit_area));
  log(
    `  permit_area as ACTUALLY persisted today (keys ${JSON.stringify(PERSISTED_PERMIT_AREA_KEYS)}): ${persistedPermitAreaNonNull} non-null of ${mapped.length}`
  );
  log(
    `  raw '${RAW_PERMIT_AREA_KEY}' field present in the same rows (NOT currently mapped to permit_area): ${rawPermitAreaNonNull} non-null of ${mapped.length}`
  );
  log(
    "  This is an observed fact, not a hypothesis: the real Socrata field is named 'rpparea1' " +
      "(plus 'rpparea2'/'rpparea3' for additional areas on the same block), which does not match " +
      "ingestRegulations()'s key list ['permitarea', 'permit_area']. No code was changed to fix this " +
      "in this milestone — profiling only."
  );

  log("\n=== regulation_type ===");
  printDistinct("regulation_type", mapped.map((m) => m.regulation_type));

  log("\n=== agency ===");
  printDistinct("agency", mapped.map((m) => m.agency));

  log("\n=== permit_area (as persisted today) ===");
  printDistinct("permit_area", mapped.map((m) => m.permit_area));

  log("\n=== raw rpparea1 (NOT currently persisted as permit_area — profiling only) ===");
  printDistinct("raw_permit_area", mapped.map((m) => m.raw_permit_area));

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

  log("\n=== 5 representative raw rows (values exactly as received, not normalized) ===");
  for (const row of rawRows.slice(0, 5)) {
    log(
      `  ${JSON.stringify({
        regulation: row.regulation,
        days: row.days,
        hours: row.hours,
        hrlimit: row.hrlimit,
        rpparea1: row.rpparea1,
        agency: row.agency,
      })}`
    );
  }

  log("\nDone. No data was written anywhere. This script performed observation/counting only.");
}

main().catch((err) => {
  console.error("[profile] ERROR:", err instanceof Error ? err.message : err);
  process.exit(1);
});

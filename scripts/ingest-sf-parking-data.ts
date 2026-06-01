/**
 * Smart Parking — DataSF city parking ingestion (prototype)
 *
 * Fetches public JSON from DataSF (Socrata) and upserts into:
 *   city_parking_sources, city_parking_blocks, city_parking_meters
 *
 * Does NOT read or write public.parking_spots.
 *
 * Requires migration 00005_city_parking_data.sql applied.
 *
 * Usage:
 *   pnpm ingest:sf-parking
 *   pnpm ingest:sf-parking -- --limit=500
 *   pnpm ingest:sf-parking -- --dry-run
 *   pnpm ingest:sf-parking -- --only=meters,blocks
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const SOCRATA_BASE = "https://data.sfgov.org/resource";
const PAGE_SIZE = 1000;
const MAX_ROWS_SAFETY = 100_000;

type DatasetKey = "blocks" | "meters" | "regulations";

const DATASETS: Record<
  DatasetKey,
  {
    sourceKey: string;
    displayName: string;
    datasetId: string;
    description: string;
  }
> = {
  blocks: {
    sourceKey: "datasf_metered_blocks",
    displayName: "SFMTA Metered Street Blocks",
    datasetId: "27b3-yjjx",
    description: "List of street blocks with parking meters (DataSF).",
  },
  meters: {
    sourceKey: "datasf_parking_meters",
    displayName: "Parking Meters",
    datasetId: "8vzz-qzz9",
    description: "SFMTA parking meter locations (DataSF).",
  },
  regulations: {
    sourceKey: "datasf_parking_regulations",
    displayName: "Parking Regulations (blockface map)",
    datasetId: "hi6h-neyh",
    description:
      "Parking regulations except non-metered color curb — merged onto blocks by blockface.",
  },
};

type SocrataRow = Record<string, unknown>;

function log(message: string): void {
  console.log(`[ingest] ${message}`);
}

function logError(message: string, err?: unknown): void {
  console.error(`[ingest] ERROR: ${message}`);
  if (err instanceof Error) {
    console.error(err.message);
    if (err.stack) console.error(err.stack);
  } else if (err !== undefined) {
    console.error(err);
  }
}

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

function parseArgs(argv: string[]): {
  dryRun: boolean;
  limit: number | null;
  only: Set<DatasetKey> | null;
} {
  let dryRun = false;
  let limit: number | null = null;
  let only: Set<DatasetKey> | null = null;

  for (const arg of argv) {
    if (arg === "--dry-run") dryRun = true;
    else if (arg.startsWith("--limit=")) {
      const n = Number(arg.split("=")[1]);
      if (!Number.isFinite(n) || n < 1) {
        throw new Error(`Invalid --limit value: ${arg}`);
      }
      limit = Math.min(n, MAX_ROWS_SAFETY);
    } else if (arg.startsWith("--only=")) {
      const parts = arg.split("=")[1]?.split(",").map((s) => s.trim()) ?? [];
      const set = new Set<DatasetKey>();
      for (const p of parts) {
        if (p !== "blocks" && p !== "meters" && p !== "regulations") {
          throw new Error(`Unknown dataset in --only: ${p}`);
        }
        set.add(p);
      }
      only = set;
    }
  }

  const envLimit = process.env.INGEST_LIMIT;
  if (limit === null && envLimit) {
    const n = Number(envLimit);
    if (Number.isFinite(n) && n > 0) limit = Math.min(n, MAX_ROWS_SAFETY);
  }

  return { dryRun, limit, only };
}

async function fetchSocrataPage(
  datasetId: string,
  offset: number,
  pageSize: number
): Promise<SocrataRow[]> {
  const url = new URL(`${SOCRATA_BASE}/${datasetId}.json`);
  url.searchParams.set("$limit", String(pageSize));
  url.searchParams.set("$offset", String(offset));

  const res = await fetch(url.toString(), {
    headers: { Accept: "application/json" },
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(
      `DataSF ${datasetId} HTTP ${res.status}: ${body.slice(0, 200)}`
    );
  }

  const data = (await res.json()) as unknown;
  if (!Array.isArray(data)) {
    throw new Error(`DataSF ${datasetId}: expected JSON array`);
  }
  return data as SocrataRow[];
}

async function fetchAllRows(
  datasetId: string,
  maxRows: number | null
): Promise<SocrataRow[]> {
  const rows: SocrataRow[] = [];
  let offset = 0;

  while (true) {
    const pageSize =
      maxRows === null
        ? PAGE_SIZE
        : Math.min(PAGE_SIZE, maxRows - rows.length);
    if (pageSize <= 0) break;

    const page = await fetchSocrataPage(datasetId, offset, pageSize);
    rows.push(...page);
    log(`  fetched ${datasetId} offset=${offset} count=${page.length}`);

    if (page.length < pageSize) break;
    offset += page.length;
    if (maxRows !== null && rows.length >= maxRows) break;
    if (rows.length >= MAX_ROWS_SAFETY) {
      log(`  safety cap ${MAX_ROWS_SAFETY} rows for ${datasetId}`);
      break;
    }
  }

  return maxRows !== null ? rows.slice(0, maxRows) : rows;
}

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v?.trim()) {
    throw new Error(
      `Missing ${name}. Set it in the environment or a root .env file (not committed).`
    );
  }
  return v.trim();
}

async function ensureSources(
  supabase: SupabaseClient,
  dryRun: boolean
): Promise<Record<string, string>> {
  const idByKey: Record<string, string> = {};

  for (const def of Object.values(DATASETS)) {
    const row = {
      source_key: def.sourceKey,
      display_name: def.displayName,
      provider: "DATASF" as const,
      dataset_id: def.datasetId,
      api_base_url: `${SOCRATA_BASE}/${def.datasetId}.json`,
      description: def.description,
      updated_at: new Date().toISOString(),
    };

    if (dryRun) {
      log(`[dry-run] would upsert source ${def.sourceKey}`);
      idByKey[def.sourceKey] = "00000000-0000-0000-0000-000000000000";
      continue;
    }

    const { data, error } = await supabase
      .from("city_parking_sources")
      .upsert(row, { onConflict: "source_key" })
      .select("id, source_key")
      .single();

    if (error) {
      throw new Error(`upsert source ${def.sourceKey}: ${error.message}`);
    }
    idByKey[data.source_key] = data.id;
    log(`source ready: ${def.sourceKey} (${data.id})`);
  }

  return idByKey;
}

function mapBlockRow(
  row: SocrataRow,
  sourceId: string,
  importedAt: string
): Record<string, unknown> {
  const blockfaceId = pickString(row, [
    "blockface_id",
    "blockface",
    "blockfaceid",
    "blkface_id",
  ]);
  const externalId =
    pickString(row, ["objectid", "object_id", "id", "globalid"]) ??
    blockfaceId ??
    `row-${pickString(row, [":id"]) ?? Math.random().toString(36).slice(2)}`;

  const lat =
    pickNumber(row, ["latitude", "lat", "y"]) ??
    (row.location as { latitude?: number } | undefined)?.latitude ??
    null;
  const lng =
    pickNumber(row, ["longitude", "lng", "long", "x"]) ??
    (row.location as { longitude?: number } | undefined)?.longitude ??
    null;

  return {
    source_id: sourceId,
    external_id: externalId,
    blockface_id: blockfaceId,
    street_name: pickString(row, ["street_name", "streetname", "street", "name"]),
    cross_street_from: pickString(row, [
      "from_street",
      "fromstreet",
      "cross_street_1",
    ]),
    cross_street_to: pickString(row, ["to_street", "tostreet", "cross_street_2"]),
    spaces_count: pickNumber(row, [
      "number_of_spaces",
      "spaces",
      "space_count",
      "num_spaces",
    ]),
    latitude: lat,
    longitude: lng,
    raw_payload: row,
    imported_at: importedAt,
    updated_at: importedAt,
  };
}

function mapMeterRow(
  row: SocrataRow,
  sourceId: string,
  importedAt: string,
  blockIdByBlockface: Map<string, string>
): Record<string, unknown> | null {
  const lat = pickNumber(row, ["latitude", "lat"]);
  const lng = pickNumber(row, ["longitude", "lng", "long"]);
  if (lat === null || lng === null) {
    return null;
  }

  const postId = pickString(row, ["post_id", "postid"]);
  const objectId = pickString(row, ["objectid", "object_id"]);
  const externalId = postId ?? objectId;
  if (!externalId) return null;

  const blockfaceId = pickString(row, ["blockface_id", "blockface"]);

  return {
    source_id: sourceId,
    external_id: externalId,
    post_id: postId,
    blockface_id: blockfaceId,
    block_id: blockfaceId ? blockIdByBlockface.get(blockfaceId) ?? null : null,
    street_name: pickString(row, ["street_name", "streetname"]),
    street_num: pickString(row, ["street_num", "streetnum", "street_number"]),
    latitude: lat,
    longitude: lng,
    meter_type: pickString(row, ["meter_type", "metertype"]),
    cap_color: pickString(row, ["cap_color", "capcolor"]),
    on_offstreet_type: pickString(row, [
      "on_offstreet_type",
      "on_off_str",
      "onoffstreet",
    ]),
    active_meter_flag: pickString(row, [
      "active_meter_flag",
      "active_meter",
      "active",
    ]),
    jurisdiction: pickString(row, ["jurisdiction"]),
    raw_payload: row,
    imported_at: importedAt,
    updated_at: importedAt,
  };
}

function regulationBlockfaceId(row: SocrataRow): string | null {
  return (
    pickString(row, ["blockface_id", "blockface", "blkface_id", "blockfaceid"]) ??
    pickString(row, ["name"])
  );
}

async function ingestBlocks(
  supabase: SupabaseClient,
  sourceId: string,
  dryRun: boolean,
  limit: number | null
): Promise<number> {
  const datasetId = DATASETS.blocks.datasetId;
  log(`ingesting blocks from ${datasetId}...`);
  const rows = await fetchAllRows(datasetId, limit);
  const importedAt = new Date().toISOString();
  const payload = rows.map((r) => mapBlockRow(r, sourceId, importedAt));

  if (dryRun) {
    log(`[dry-run] would upsert ${payload.length} blocks`);
    return payload.length;
  }

  let upserted = 0;
  for (let i = 0; i < payload.length; i += 200) {
    const chunk = payload.slice(i, i + 200);
    const { error } = await supabase
      .from("city_parking_blocks")
      .upsert(chunk, { onConflict: "source_id,external_id" });
    if (error) throw new Error(`blocks upsert: ${error.message}`);
    upserted += chunk.length;
    log(`  blocks upserted ${upserted}/${payload.length}`);
  }

  await supabase
    .from("city_parking_sources")
    .update({
      last_imported_at: importedAt,
      last_row_count: upserted,
      updated_at: importedAt,
    })
    .eq("id", sourceId);

  return upserted;
}

async function loadBlockfaceIndex(
  supabase: SupabaseClient
): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  const pageSize = 1000;
  let from = 0;

  while (true) {
    const { data, error } = await supabase
      .from("city_parking_blocks")
      .select("id, blockface_id")
      .not("blockface_id", "is", null)
      .range(from, from + pageSize - 1);

    if (error) throw new Error(`load blockface index: ${error.message}`);
    if (!data?.length) break;

    for (const row of data) {
      if (row.blockface_id) map.set(String(row.blockface_id), row.id);
    }
    if (data.length < pageSize) break;
    from += pageSize;
  }

  log(`blockface index: ${map.size} entries`);
  return map;
}

async function ingestMeters(
  supabase: SupabaseClient,
  sourceId: string,
  dryRun: boolean,
  limit: number | null
): Promise<number> {
  const datasetId = DATASETS.meters.datasetId;
  log(`ingesting meters from ${datasetId}...`);

  const blockIdByBlockface = dryRun
    ? new Map<string, string>()
    : await loadBlockfaceIndex(supabase);

  const rows = await fetchAllRows(datasetId, limit);
  const importedAt = new Date().toISOString();
  const payload: Record<string, unknown>[] = [];
  let skipped = 0;

  for (const row of rows) {
    const mapped = mapMeterRow(row, sourceId, importedAt, blockIdByBlockface);
    if (mapped) payload.push(mapped);
    else skipped += 1;
  }

  if (skipped > 0) log(`  skipped ${skipped} meters (missing id or coordinates)`);

  if (dryRun) {
    log(`[dry-run] would upsert ${payload.length} meters`);
    return payload.length;
  }

  let upserted = 0;
  for (let i = 0; i < payload.length; i += 200) {
    const chunk = payload.slice(i, i + 200);
    const { error } = await supabase
      .from("city_parking_meters")
      .upsert(chunk, { onConflict: "source_id,external_id" });
    if (error) throw new Error(`meters upsert: ${error.message}`);
    upserted += chunk.length;
    log(`  meters upserted ${upserted}/${payload.length}`);
  }

  await supabase
    .from("city_parking_sources")
    .update({
      last_imported_at: importedAt,
      last_row_count: upserted,
      updated_at: importedAt,
    })
    .eq("id", sourceId);

  return upserted;
}

async function ingestRegulations(
  supabase: SupabaseClient,
  sourceId: string,
  dryRun: boolean,
  limit: number | null
): Promise<{ matched: number; unmatched: number }> {
  const datasetId = DATASETS.regulations.datasetId;
  log(`ingesting regulations from ${datasetId} (merge onto blocks)...`);

  const blockIdByBlockface = dryRun
    ? new Map<string, string>()
    : await loadBlockfaceIndex(supabase);

  const rows = await fetchAllRows(datasetId, limit);
  const importedAt = new Date().toISOString();
  let matched = 0;
  let unmatched = 0;

  for (const row of rows) {
    const blockfaceId = regulationBlockfaceId(row);
    if (!blockfaceId) {
      unmatched += 1;
      continue;
    }

    const blockId = blockIdByBlockface.get(blockfaceId);
    if (!blockId) {
      unmatched += 1;
      continue;
    }

    const patch = {
      regulation_type: pickString(row, ["regulation", "regulation_type", "type"]),
      agency: pickString(row, ["agency"]),
      days_of_week: pickString(row, ["days", "days_of_week"]),
      hours: pickString(row, ["hours"]),
      hour_limit: pickNumber(row, ["hrlimit", "hr_limit", "hour_limit"]),
      permit_area: pickString(row, ["permitarea", "permit_area"]),
      imported_at: importedAt,
      updated_at: importedAt,
    };

    if (dryRun) {
      matched += 1;
      continue;
    }

    const { error } = await supabase
      .from("city_parking_blocks")
      .update(patch)
      .eq("id", blockId);

    if (error) {
      logError(`regulation update block ${blockId}`, error);
      unmatched += 1;
    } else {
      matched += 1;
    }
  }

  if (!dryRun) {
    await supabase
      .from("city_parking_sources")
      .update({
        last_imported_at: importedAt,
        last_row_count: matched,
        updated_at: importedAt,
      })
      .eq("id", sourceId);
  }

  log(`regulations: matched=${matched} unmatched=${unmatched}`);
  return { matched, unmatched };
}

async function main(): Promise<void> {
  const { dryRun, limit, only } = parseArgs(process.argv.slice(2));

  log("Smart Parking — DataSF ingestion prototype");
  log(`dryRun=${dryRun} limit=${limit ?? "none"} only=${only ? [...only].join(",") : "all"}`);

  if (!dryRun) {
    requireEnv("SUPABASE_URL");
    requireEnv("SUPABASE_SERVICE_ROLE_KEY");
  }

  const supabase = dryRun
    ? (null as unknown as SupabaseClient)
    : createClient(
        requireEnv("SUPABASE_URL"),
        requireEnv("SUPABASE_SERVICE_ROLE_KEY"),
        { auth: { persistSession: false, autoRefreshToken: false } }
      );

  const sourceIds = await ensureSources(supabase, dryRun);

  const run = (key: DatasetKey) => !only || only.has(key);

  if (run("blocks")) {
    await ingestBlocks(
      supabase,
      sourceIds[DATASETS.blocks.sourceKey],
      dryRun,
      limit
    );
  }

  if (run("meters")) {
    await ingestMeters(
      supabase,
      sourceIds[DATASETS.meters.sourceKey],
      dryRun,
      limit
    );
  }

  if (run("regulations")) {
    await ingestRegulations(
      supabase,
      sourceIds[DATASETS.regulations.sourceKey],
      dryRun,
      limit
    );
  }

  log("done.");
}

main().catch((err) => {
  logError("fatal", err);
  process.exit(1);
});

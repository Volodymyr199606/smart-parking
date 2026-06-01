/**
 * Smart Parking — Phase 2 city data normalization
 *
 * Reads city_parking_meters (+ source metadata) and upserts into
 * normalized_parking_locations. Does NOT touch parking_spots.
 *
 * Requires migrations 00005 and 00007 applied.
 *
 * Usage:
 *   pnpm normalize:city-parking
 *   pnpm normalize:city-parking -- --dry-run
 *   pnpm normalize:city-parking -- --limit=100
 */

import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const SOURCE_TYPE_METER = "datasf_parking_meter";
const DEFAULT_CITY = "San Francisco";
const PAGE_SIZE = 500;
const UPSERT_CHUNK = 200;

interface CityParkingSource {
  source_key: string;
  dataset_id: string;
  display_name: string;
  provider: string;
}

interface CityParkingMeterRow {
  id: string;
  external_id: string;
  post_id: string | null;
  blockface_id: string | null;
  street_name: string | null;
  street_num: string | null;
  latitude: number;
  longitude: number;
  meter_type: string | null;
  cap_color: string | null;
  on_offstreet_type: string | null;
  active_meter_flag: string | null;
  jurisdiction: string | null;
  imported_at: string;
  raw_payload: Record<string, unknown>;
  city_parking_sources: CityParkingSource | CityParkingSource[] | null;
}

interface NormalizeStats {
  read: number;
  skipped: number;
  upserted: number;
  skippedInvalidCoordinates: number;
  skippedMissingSourceId: number;
}

function log(message: string): void {
  console.log(`[normalize] ${message}`);
}

function logError(message: string, err?: unknown): void {
  console.error(`[normalize] ERROR: ${message}`);
  if (err instanceof Error) console.error(err.message);
  else if (err !== undefined) console.error(err);
}

function loadEnvFile(relativePath: string): void {
  const filePath = resolve(process.cwd(), relativePath);
  if (!existsSync(filePath)) return;

  for (const line of readFileSync(filePath, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = value;
  }
}

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v?.trim()) {
    throw new Error(`Missing ${name}. Set it in the environment or root .env (not committed).`);
  }
  return v.trim();
}

function parseArgs(argv: string[]): { dryRun: boolean; limit: number | null } {
  let dryRun = false;
  let limit: number | null = null;

  for (const arg of argv) {
    if (arg === "--dry-run") dryRun = true;
    else if (arg.startsWith("--limit=")) {
      const n = Number(arg.split("=")[1]);
      if (!Number.isFinite(n) || n < 1) throw new Error(`Invalid --limit: ${arg}`);
      limit = n;
    }
  }

  const envLimit = process.env.NORMALIZE_LIMIT;
  if (limit === null && envLimit) {
    const n = Number(envLimit);
    if (Number.isFinite(n) && n > 0) limit = n;
  }

  return { dryRun, limit };
}

function isValidCoordinate(lat: number, lng: number): boolean {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return false;
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return false;
  return true;
}

function buildAddress(row: CityParkingMeterRow): string | null {
  const street = row.street_name?.trim();
  const num = row.street_num?.trim();
  if (street && num) return `${num} ${street}, ${DEFAULT_CITY}, CA`;
  if (street) return `${street}, ${DEFAULT_CITY}, CA`;
  return null;
}

function normalizeActiveFlag(flag: string | null): boolean {
  if (!flag?.trim()) return true;
  const value = flag.trim().toUpperCase();
  if (["N", "NO", "INACTIVE", "0", "FALSE", "F"].includes(value)) return false;
  if (["Y", "YES", "A", "ACTIVE", "1", "TRUE", "T"].includes(value)) return true;
  // U = unknown/unclassified in DataSF — keep meter as active for normalization.
  return true;
}

function buildRestrictions(row: CityParkingMeterRow): string | null {
  const parts: string[] = [];
  if (row.cap_color) parts.push(`cap_color:${row.cap_color}`);
  if (row.on_offstreet_type) parts.push(`location:${row.on_offstreet_type}`);
  if (row.jurisdiction) parts.push(`jurisdiction:${row.jurisdiction}`);
  if (row.meter_type) parts.push(`meter_type:${row.meter_type}`);
  return parts.length ? parts.join("; ") : null;
}

function unwrapSource(
  source: CityParkingMeterRow["city_parking_sources"]
): CityParkingSource | null {
  if (!source) return null;
  return Array.isArray(source) ? source[0] ?? null : source;
}

function resolveSourceId(row: CityParkingMeterRow): string | null {
  return row.post_id?.trim() || row.external_id?.trim() || null;
}

function mapMeterToNormalized(
  row: CityParkingMeterRow,
  syncedAt: string
): Record<string, unknown> | null {
  const sourceId = resolveSourceId(row);
  if (!sourceId) return null;
  if (!isValidCoordinate(row.latitude, row.longitude)) return null;

  const source = unwrapSource(row.city_parking_sources);

  return {
    source_type: SOURCE_TYPE_METER,
    source_id: sourceId,
    latitude: row.latitude,
    longitude: row.longitude,
    address: buildAddress(row),
    parking_type: "METERED",
    time_limit: null,
    active: normalizeActiveFlag(row.active_meter_flag),
    restrictions: buildRestrictions(row),
    city: DEFAULT_CITY,
    raw_source: {
      city_table: "city_parking_meters",
      city_row_id: row.id,
      external_id: row.external_id,
      post_id: row.post_id,
      blockface_id: row.blockface_id,
      source_key: source?.source_key ?? null,
      dataset_id: source?.dataset_id ?? null,
      source_display_name: source?.display_name ?? null,
      provider: source?.provider ?? null,
      imported_at: row.imported_at,
    },
    last_synced_at: row.imported_at ?? syncedAt,
    updated_at: syncedAt,
  };
}

async function fetchMeterBatch(
  supabase: SupabaseClient,
  offset: number,
  pageSize: number
): Promise<CityParkingMeterRow[]> {
  const { data, error } = await supabase
    .from("city_parking_meters")
    .select(
      `
      id,
      external_id,
      post_id,
      blockface_id,
      street_name,
      street_num,
      latitude,
      longitude,
      meter_type,
      cap_color,
      on_offstreet_type,
      active_meter_flag,
      jurisdiction,
      imported_at,
      raw_payload,
      city_parking_sources (
        source_key,
        dataset_id,
        display_name,
        provider
      )
    `
    )
    .order("imported_at", { ascending: false })
    .range(offset, offset + pageSize - 1);

  if (error) {
    throw new Error(`read city_parking_meters: ${error.message}`);
  }

  return (data ?? []) as CityParkingMeterRow[];
}

async function normalizeMeters(
  supabase: SupabaseClient,
  dryRun: boolean,
  limit: number | null
): Promise<NormalizeStats> {
  const stats: NormalizeStats = {
    read: 0,
    skipped: 0,
    upserted: 0,
    skippedInvalidCoordinates: 0,
    skippedMissingSourceId: 0,
  };

  const syncedAt = new Date().toISOString();
  const payload: Record<string, unknown>[] = [];
  let offset = 0;

  while (true) {
    const remaining =
      limit === null ? PAGE_SIZE : Math.min(PAGE_SIZE, limit - stats.read);
    if (remaining <= 0) break;

    const batch = await fetchMeterBatch(supabase, offset, remaining);
    if (batch.length === 0) break;

    stats.read += batch.length;
    log(`read ${stats.read} meter row(s) from city_parking_meters`);

    for (const row of batch) {
      const sourceId = resolveSourceId(row);
      if (!sourceId) {
        stats.skipped += 1;
        stats.skippedMissingSourceId += 1;
        continue;
      }
      if (!isValidCoordinate(row.latitude, row.longitude)) {
        stats.skipped += 1;
        stats.skippedInvalidCoordinates += 1;
        continue;
      }

      const mapped = mapMeterToNormalized(row, syncedAt);
      if (mapped) payload.push(mapped);
    }

    offset += batch.length;
    if (batch.length < remaining) break;
    if (limit !== null && stats.read >= limit) break;
  }

  log(
    `mapped ${payload.length} normalized row(s); skipped=${stats.skipped} ` +
      `(invalid_coordinates=${stats.skippedInvalidCoordinates}, ` +
      `missing_source_id=${stats.skippedMissingSourceId})`
  );

  if (dryRun) {
    log(`[dry-run] would upsert ${payload.length} into normalized_parking_locations`);
    stats.upserted = payload.length;
    return stats;
  }

  for (let i = 0; i < payload.length; i += UPSERT_CHUNK) {
    const chunk = payload.slice(i, i + UPSERT_CHUNK);
    const { error } = await supabase
      .from("normalized_parking_locations")
      .upsert(chunk, { onConflict: "source_type,source_id" });

    if (error) {
      throw new Error(`upsert normalized_parking_locations: ${error.message}`);
    }

    stats.upserted += chunk.length;
    log(`upserted ${stats.upserted}/${payload.length}`);
  }

  log(
    `complete: read=${stats.read} skipped=${stats.skipped} upserted=${stats.upserted}`
  );

  return stats;
}

async function main(): Promise<void> {
  const { dryRun, limit } = parseArgs(process.argv.slice(2));

  log("Smart Parking — Phase 2 city parking normalization");
  log(`dryRun=${dryRun} limit=${limit ?? "all"}`);

  loadEnvFile(".env");
  loadEnvFile("apps/mobile/.env");

  const url =
    process.env.SUPABASE_URL ??
    process.env.EXPO_PUBLIC_SUPABASE_URL ??
    process.env.NEXT_PUBLIC_SUPABASE_URL;

  if (!url?.trim()) {
    throw new Error("Missing SUPABASE_URL (or EXPO_PUBLIC_SUPABASE_URL).");
  }

  const serviceRoleKey = dryRun
    ? process.env.SUPABASE_SERVICE_ROLE_KEY ??
      process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY
    : requireEnv("SUPABASE_SERVICE_ROLE_KEY");

  if (!serviceRoleKey?.trim()) {
    throw new Error(
      dryRun
        ? "Missing key for reads. Set SUPABASE_SERVICE_ROLE_KEY or EXPO_PUBLIC_SUPABASE_ANON_KEY."
        : "Missing SUPABASE_SERVICE_ROLE_KEY."
    );
  }

  const supabase = createClient(url.trim(), serviceRoleKey.trim(), {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  await normalizeMeters(supabase, dryRun, limit);
  log("done.");
}

main().catch((err) => {
  logError("fatal", err);
  process.exit(1);
});

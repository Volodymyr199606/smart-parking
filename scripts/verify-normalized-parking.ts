/**
 * Read-only verification for normalized_parking_locations (Phase 2).
 * Does NOT touch parking_spots or the mobile app.
 *
 * Usage:
 *   pnpm verify:normalized-parking
 */

import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { createClient } from "@supabase/supabase-js";

interface NormalizedRow {
  id: string;
  source_type: string;
  source_id: string;
  latitude: number;
  longitude: number;
  address: string | null;
  parking_type: string;
  active: boolean;
  restrictions: string | null;
  city: string;
  raw_source: Record<string, unknown> | null;
  last_synced_at: string | null;
}

function log(message: string): void {
  console.log(`[verify] ${message}`);
}

function logError(message: string): void {
  console.error(`[verify] ERROR: ${message}`);
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

function resolveReadConfig(): { url: string; key: string } {
  loadEnvFile(".env");
  loadEnvFile("apps/mobile/.env");
  loadEnvFile("apps/web/.env.local");

  const url =
    process.env.SUPABASE_URL ??
    process.env.EXPO_PUBLIC_SUPABASE_URL ??
    process.env.NEXT_PUBLIC_SUPABASE_URL;

  const key =
    process.env.SUPABASE_ANON_KEY ??
    process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ??
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url?.trim()) throw new Error("Missing Supabase URL.");
  if (!key?.trim()) throw new Error("Missing Supabase anon key.");

  return { url: url.trim(), key: key.trim() };
}

function isValidCoordinate(lat: number, lng: number): boolean {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return false;
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return false;
  return true;
}

function formatSample(row: NormalizedRow, index: number): string {
  return [
    `  ${index + 1}. ${row.source_type}/${row.source_id}`,
    `active=${row.active}`,
    `lat=${row.latitude}`,
    `lng=${row.longitude}`,
    `address=${row.address ?? "—"}`,
    `synced=${row.last_synced_at ?? "—"}`,
  ].join(" | ");
}

async function main(): Promise<void> {
  log("Phase 2 verification — normalized_parking_locations (read-only)");

  const { url, key } = resolveReadConfig();
  log(`Supabase URL: ${url}`);

  const supabase = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { count, error: countError } = await supabase
    .from("normalized_parking_locations")
    .select("*", { count: "exact", head: true });

  if (countError) {
    logError(countError.message);
    if (countError.message.includes("normalized_parking_locations")) {
      log(
        "Apply migrations 00005–00007, run ingest + normalize, then rerun this check."
      );
    }
    process.exit(1);
  }

  log(`row count: ${count ?? 0}`);

  if (!count) {
    log(
      "No normalized rows yet. Pipeline: apply 00007 → pnpm ingest:sf-parking:meters → pnpm normalize:city-parking"
    );
    return;
  }

  const { data: sample, error: sampleError } = await supabase
    .from("normalized_parking_locations")
    .select(
      "id, source_type, source_id, latitude, longitude, address, parking_type, active, restrictions, city, raw_source, last_synced_at"
    )
    .order("last_synced_at", { ascending: false })
    .limit(10);

  if (sampleError) {
    logError(`sample query failed: ${sampleError.message}`);
    process.exit(1);
  }

  log("first records (up to 10):");
  (sample as NormalizedRow[]).forEach((row, i) => console.log(formatSample(row, i)));

  const { data: allRows, error: allError } = await supabase
    .from("normalized_parking_locations")
    .select("source_type, source_id, latitude, longitude, active, raw_source, last_synced_at");

  if (allError) {
    logError(`validation scan failed: ${allError.message}`);
    process.exit(1);
  }

  const rows = (allRows ?? []) as NormalizedRow[];
  const invalidCoordinates = rows.filter(
    (r) => !isValidCoordinate(r.latitude, r.longitude)
  );
  const missingLastSynced = rows.filter((r) => !r.last_synced_at);
  const missingRawSource = rows.filter(
    (r) => !r.raw_source || Object.keys(r.raw_source).length === 0
  );
  const nonBooleanActive = rows.filter((r) => typeof r.active !== "boolean");

  const keyCounts = new Map<string, number>();
  for (const row of rows) {
    const key = `${row.source_type}::${row.source_id}`;
    keyCounts.set(key, (keyCounts.get(key) ?? 0) + 1);
  }
  const duplicateKeys = [...keyCounts.entries()].filter(([, n]) => n > 1);

  log(`invalid coordinates: ${invalidCoordinates.length}`);
  log(`missing last_synced_at: ${missingLastSynced.length}`);
  log(`missing raw_source: ${missingRawSource.length}`);
  log(`non-boolean active: ${nonBooleanActive.length}`);
  log(`duplicate (source_type, source_id) keys: ${duplicateKeys.length}`);

  if (duplicateKeys.length > 0) {
    log("duplicate examples:");
    duplicateKeys.slice(0, 5).forEach(([k, n]) => log(`  ${k} (${n} rows)`));
  }

  const failed =
    invalidCoordinates.length > 0 ||
    duplicateKeys.length > 0 ||
    missingLastSynced.length > 0 ||
    missingRawSource.length > 0 ||
    nonBooleanActive.length > 0;

  if (failed) {
    logError("validation failed — see counts above");
    process.exit(1);
  }

  log("validation passed.");
}

main().catch((err) => {
  logError(err instanceof Error ? err.message : String(err));
  process.exit(1);
});

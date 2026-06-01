/**
 * Smart Parking — read-only city parking data verification
 *
 * Queries city_parking_meters_clean (migration 00006) for local inspection.
 * Does NOT read or write parking_spots.
 *
 * Usage:
 *   pnpm check:city-parking
 *
 * Env (any one URL + key pair):
 *   SUPABASE_URL + SUPABASE_ANON_KEY
 *   EXPO_PUBLIC_SUPABASE_URL + EXPO_PUBLIC_SUPABASE_ANON_KEY
 *   NEXT_PUBLIC_SUPABASE_URL + NEXT_PUBLIC_SUPABASE_ANON_KEY
 *
 * Also loads apps/mobile/.env if present (Expo vars only).
 */

import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { createClient } from "@supabase/supabase-js";

const VIEW_NAME = "city_parking_meters_clean";

interface CleanMeterRow {
  meter_id: string | null;
  status: string | null;
  latitude: number | null;
  longitude: number | null;
  location_description: string | null;
  last_ingested_at: string | null;
  source_name: string | null;
}

function log(message: string): void {
  console.log(`[check] ${message}`);
}

function logError(message: string, err?: unknown): void {
  console.error(`[check] ERROR: ${message}`);
  if (err instanceof Error) {
    console.error(err.message);
  } else if (err !== undefined) {
    console.error(err);
  }
}

function loadEnvFile(relativePath: string): void {
  const filePath = resolve(process.cwd(), relativePath);
  if (!existsSync(filePath)) return;

  const content = readFileSync(filePath, "utf8");
  for (const line of content.split(/\r?\n/)) {
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
    if (process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}

function resolveSupabaseConfig(): { url: string; anonKey: string } {
  loadEnvFile(".env");
  loadEnvFile("apps/mobile/.env");
  loadEnvFile("apps/web/.env.local");

  const url =
    process.env.SUPABASE_URL ??
    process.env.EXPO_PUBLIC_SUPABASE_URL ??
    process.env.NEXT_PUBLIC_SUPABASE_URL;

  const anonKey =
    process.env.SUPABASE_ANON_KEY ??
    process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ??
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url?.trim()) {
    throw new Error(
      "Missing Supabase URL. Set SUPABASE_URL or EXPO_PUBLIC_SUPABASE_URL (e.g. in apps/mobile/.env)."
    );
  }
  if (!anonKey?.trim()) {
    throw new Error(
      "Missing Supabase anon key. Set SUPABASE_ANON_KEY or EXPO_PUBLIC_SUPABASE_ANON_KEY."
    );
  }

  return { url: url.trim(), anonKey: anonKey.trim() };
}

function hasValidCoordinates(row: CleanMeterRow): boolean {
  const { latitude: lat, longitude: lng } = row;
  if (lat === null || lng === null) return false;
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return false;
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return false;
  return true;
}

function formatRow(row: CleanMeterRow, index: number): string {
  return [
    `  ${index + 1}. meter_id=${row.meter_id ?? "—"}`,
    `status=${row.status ?? "—"}`,
    `lat=${row.latitude ?? "—"}`,
    `lng=${row.longitude ?? "—"}`,
    `location=${row.location_description ?? "—"}`,
    `source=${row.source_name ?? "—"}`,
    `ingested=${row.last_ingested_at ?? "—"}`,
  ].join(" | ");
}

function hintForError(message: string): string | null {
  if (message.includes("city_parking_meters_clean") || message.includes("PGRST205")) {
    return (
      "The view city_parking_meters_clean was not found. Apply migrations " +
      "00005_city_parking_data.sql and 00006_city_parking_views.sql in Supabase first."
    );
  }
  return null;
}

async function main(): Promise<void> {
  log("Smart Parking — city parking data verification (read-only)");

  const { url, anonKey } = resolveSupabaseConfig();
  log(`Supabase URL: ${url}`);

  const supabase = createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { count, error: countError } = await supabase
    .from(VIEW_NAME)
    .select("*", { count: "exact", head: true });

  if (countError) {
    const hint = hintForError(countError.message);
    logError(`count query failed: ${countError.message}`);
    if (hint) log(hint);
    process.exit(1);
  }

  log(`total rows: ${count ?? 0}`);

  if (!count) {
    log(
      "No ingested meter rows yet. Run migration 00005/00006, then: pnpm ingest:sf-parking:meters"
    );
    return;
  }

  const { data: latestRows, error: latestError } = await supabase
    .from(VIEW_NAME)
    .select("last_ingested_at")
    .order("last_ingested_at", { ascending: false })
    .limit(1);

  if (latestError) {
    logError(`latest ingest query failed: ${latestError.message}`);
    process.exit(1);
  }

  log(`latest last_ingested_at: ${latestRows?.[0]?.last_ingested_at ?? "—"}`);

  const { data: allCoords, error: coordsError } = await supabase
    .from(VIEW_NAME)
    .select("latitude, longitude");

  if (coordsError) {
    logError(`coordinate scan failed: ${coordsError.message}`);
    process.exit(1);
  }

  const missingCoordinates = (allCoords ?? []).filter(
    (row) => !hasValidCoordinates(row as CleanMeterRow)
  ).length;
  log(`records missing/invalid coordinates: ${missingCoordinates}`);

  const { data: sampleRows, error: sampleError } = await supabase
    .from(VIEW_NAME)
    .select(
      "meter_id, status, latitude, longitude, location_description, last_ingested_at, source_name"
    )
    .order("last_ingested_at", { ascending: false })
    .limit(20);

  if (sampleError) {
    logError(`sample query failed: ${sampleError.message}`);
    process.exit(1);
  }

  const validSample = (sampleRows ?? []).filter((row) =>
    hasValidCoordinates(row as CleanMeterRow)
  );

  log(`first ${Math.min(5, validSample.length)} valid records:`);
  if (validSample.length === 0) {
    log("  (none with valid coordinates)");
  } else {
    validSample.slice(0, 5).forEach((row, i) => {
      console.log(formatRow(row as CleanMeterRow, i));
    });
  }

  log("done.");
}

main().catch((err) => {
  logError("fatal", err);
  process.exit(1);
});

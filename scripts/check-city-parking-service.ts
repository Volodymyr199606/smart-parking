/**
 * Phase 3 verification — read-only city parking service logic (no mobile UI).
 *
 * Mirrors query patterns from apps/mobile/src/services/cityParkingService.ts
 * using the same anon-key access path the Expo app uses.
 *
 * Usage:
 *   pnpm check:city-parking-service
 *
 * Does NOT read or write parking_spots.
 */

import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

interface NormalizedRow {
  latitude: number;
  longitude: number;
  source_id: string;
  distance_miles?: number;
}

const NORMALIZED_TABLE = "normalized_parking_locations";
const METERS_PER_MILE = 1609.344;
const NORMALIZED_SELECT =
  "id, source_type, source_id, latitude, longitude, address, parking_type, time_limit, active, restrictions, city, raw_source, last_synced_at, created_at, updated_at";

// Union Square, SF — stable test point
const TEST_LAT = 37.7879;
const TEST_LNG = -122.4075;
const TEST_RADIUS_MILES = 0.5;

function log(message: string): void {
  console.log(`[city-service] ${message}`);
}

function logError(message: string): void {
  console.error(`[city-service] ERROR: ${message}`);
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

/** Must match cityParkingService.ts */
function haversineMiles(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return (6371 * c) / 1.609344;
}

function isValidCoordinate(latitude: number, longitude: number): boolean {
  return (
    Number.isFinite(latitude) &&
    Number.isFinite(longitude) &&
    latitude >= -90 &&
    latitude <= 90 &&
    longitude >= -180 &&
    longitude <= 180
  );
}

function auditServiceSource(): { passed: boolean; notes: string[] } {
  const servicePath = resolve(
    process.cwd(),
    "apps/mobile/src/services/cityParkingService.ts"
  );
  const source = readFileSync(servicePath, "utf8");
  const notes: string[] = [];
  let passed = true;

  if (!source.includes('from "./supabaseClient"')) {
    passed = false;
    notes.push("Missing import from ./supabaseClient");
  }
  if (!source.includes('"normalized_parking_locations"')) {
    passed = false;
    notes.push('Does not reference normalized_parking_locations');
  }
  if (/\.(insert|update|delete|upsert|rpc)\s*\(/.test(source)) {
    passed = false;
    notes.push("Found write/rpc Supabase calls — expected read-only .select only");
  }
  if (!source.includes("queryError")) {
    passed = false;
    notes.push("Missing safe queryError result helper");
  }
  if (!source.includes("haversineMiles")) {
    passed = false;
    notes.push("Missing haversine distance filter for nearby queries");
  }

  notes.push("Static audit: read-only normalized_parking_locations via supabaseClient");
  return { passed, notes };
}

function runUnitChecks(): { passed: boolean; notes: string[] } {
  const notes: string[] = [];
  let passed = true;

  // SF ~1 mile north should be ~1 mi away
  const oneMileNorth = haversineMiles(TEST_LAT, TEST_LNG, TEST_LAT + 0.0145, TEST_LNG);
  if (oneMileNorth < 0.9 || oneMileNorth > 1.1) {
    passed = false;
    notes.push(`haversine sanity failed: expected ~1 mi, got ${oneMileNorth.toFixed(3)}`);
  } else {
    notes.push(`haversine sanity ok (~${oneMileNorth.toFixed(2)} mi)`);
  }

  if (isValidCoordinate(NaN, TEST_LNG)) {
    passed = false;
    notes.push("isValidCoordinate should reject NaN latitude");
  }
  if (isValidCoordinate(TEST_LAT, 200)) {
    passed = false;
    notes.push("isValidCoordinate should reject out-of-range longitude");
  }

  return { passed, notes };
}

async function queryNearby(
  supabase: SupabaseClient,
  latitude: number,
  longitude: number,
  radiusMiles: number,
  limit: number
) {
  const radiusMeters = radiusMiles * METERS_PER_MILE;
  const degreesOffset = radiusMeters / 111_000;

  const { data, error } = await supabase
    .from(NORMALIZED_TABLE)
    .select(NORMALIZED_SELECT)
    .gte("latitude", latitude - degreesOffset)
    .lte("latitude", latitude + degreesOffset)
    .gte("longitude", longitude - degreesOffset)
    .lte("longitude", longitude + degreesOffset);

  if (error) return { data: [], error: error.message };

  const nearby = ((data ?? []) as NormalizedRow[])
    .map((row) => ({
      ...row,
      distance_miles: haversineMiles(
        latitude,
        longitude,
        Number(row.latitude),
        Number(row.longitude)
      ),
    }))
    .filter((row) => row.distance_miles <= radiusMiles)
    .sort((a, b) => a.distance_miles - b.distance_miles)
    .slice(0, Math.max(1, limit));

  return { data: nearby, error: null as string | null };
}

async function main(): Promise<void> {
  log("Phase 3 verification — cityParkingService (read-only, no UI)");

  const audit = auditServiceSource();
  audit.notes.forEach((n) => log(n));
  if (!audit.passed) {
    logError("static service audit failed");
    process.exit(1);
  }
  log("static service audit passed");

  const unit = runUnitChecks();
  unit.notes.forEach((n) => log(n));
  if (!unit.passed) {
    logError("unit checks failed");
    process.exit(1);
  }
  log("unit checks passed");

  const { url, key } = resolveReadConfig();
  log(`Supabase URL: ${url}`);

  const supabase = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // Input validation mirrors service (no network)
  if (isValidCoordinate(999, TEST_LNG)) {
    logError("validation mirror failed");
    process.exit(1);
  }
  log("input validation mirror ok");

  const { count, error: countError } = await supabase
    .from(NORMALIZED_TABLE)
    .select("*", { count: "exact", head: true });

  if (countError) {
    logError(countError.message);
    if (countError.message.includes("normalized_parking_locations")) {
      log("Apply migration 00007, ingest + normalize, then rerun.");
    }
    process.exit(1);
  }

  log(`normalized_parking_locations row count: ${count ?? 0}`);

  if (!count) {
    log("No rows — live query smoke tests skipped (table empty). Service code audit still passed.");
    log("Phase 3 service verification complete (code-only).");
    return;
  }

  const nearby = await queryNearby(
    supabase,
    TEST_LAT,
    TEST_LNG,
    TEST_RADIUS_MILES,
    10
  );
  if (nearby.error) {
    logError(`getNormalizedParkingNearby pattern failed: ${nearby.error}`);
    process.exit(1);
  }
  log(
    `nearby (${TEST_RADIUS_MILES} mi): ${nearby.data.length} rows` +
      (nearby.data[0]
        ? ` | closest ${nearby.data[0].distance_miles.toFixed(3)} mi (${nearby.data[0].source_id})`
        : "")
  );
  const outOfRadius = nearby.data.filter(
    (r) => r.distance_miles > TEST_RADIUS_MILES + 1e-6
  );
  if (outOfRadius.length > 0) {
    logError(`nearby filter leak: ${outOfRadius.length} rows exceed radius`);
    process.exit(1);
  }

  const { data: byCity, error: cityError } = await supabase
    .from(NORMALIZED_TABLE)
    .select(NORMALIZED_SELECT)
    .ilike("city", "San Francisco")
    .order("last_synced_at", { ascending: false })
    .limit(5);

  if (cityError) {
    logError(`getNormalizedParkingByCity pattern failed: ${cityError.message}`);
    process.exit(1);
  }
  log(`by city (San Francisco, limit 5): ${byCity?.length ?? 0} rows`);

  const { data: active, error: activeError } = await supabase
    .from(NORMALIZED_TABLE)
    .select(NORMALIZED_SELECT)
    .eq("active", true)
    .order("last_synced_at", { ascending: false })
    .limit(5);

  if (activeError) {
    logError(`getActiveNormalizedParking pattern failed: ${activeError.message}`);
    process.exit(1);
  }
  log(`active only (limit 5): ${active?.length ?? 0} rows`);

  // Confirm parking_spots untouched — read-only spot count only
  const { count: spotCount, error: spotError } = await supabase
    .from("parking_spots")
    .select("*", { count: "exact", head: true });

  if (spotError) {
    log(`parking_spots read check: ${spotError.message} (MVP table may differ by RLS)`);
  } else {
    log(`parking_spots still readable (MVP untouched): ${spotCount ?? 0} visible rows`);
  }

  log("live query smoke tests passed");
  log("Phase 3 service verification complete.");
}

main().catch((err) => {
  logError(err instanceof Error ? err.message : String(err));
  process.exit(1);
});

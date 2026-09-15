/**
 * Zero-dependency verification for Normalized City Regulation Storage V1.
 * Tests mapCityParkingRegulationRow only — no Supabase, no network.
 *
 * Usage:
 *   pnpm verify:regulation-storage
 */

import {
  mapCityParkingRegulationRow,
  slimRegulationRawSource,
} from "./map-city-parking-regulation";

function log(msg: string): void {
  console.log(`[verify] ${msg}`);
}

function fail(msg: string): never {
  console.error(`[verify] FAIL: ${msg}`);
  process.exit(1);
}

function assertEqual(label: string, actual: unknown, expected: unknown): void {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) fail(`${label}: expected ${e}, got ${a}`);
  log(`  ok ${label}`);
}

function assert(cond: boolean, label: string): void {
  if (!cond) fail(label);
  log(`  ok ${label}`);
}

const SOURCE_ID = "11111111-1111-1111-1111-111111111111";
const IMPORTED_AT = "2026-09-15T00:00:00.000Z";

function sampleRow(): Record<string, unknown> {
  return {
    objectid: "4918",
    regulation: "Time limited",
    agency: "SFMTA",
    days: "M-Sa",
    hours: "800-2200",
    hrlimit: "0.5",
    rpparea1: "EE",
    rpparea2: "S",
    rpparea3: "C",
    fid_100: "1245",
    exceptions: "except holidays",
    from_time: "8am",
    to_time: "10pm",
    hrs_begin: "800",
    hrs_end: "2200",
    shape: { type: "MultiLineString", coordinates: [[[-122.4, 37.7], [-122.41, 37.71]]] },
    the_geom: { type: "LineString", coordinates: [] },
    location: { latitude: 37.7, longitude: -122.4 },
  };
}

function main(): void {
  log("Normalized City Regulation Storage V1 — mapping checks");

  const mapped = mapCityParkingRegulationRow(sampleRow(), SOURCE_ID, IMPORTED_AT);

  assertEqual("external_id = objectid", mapped.external_id, "4918");
  assertEqual("source_id passed through", mapped.source_id, SOURCE_ID);
  assertEqual("block_id is null (no invented join)", mapped.block_id, null);
  assertEqual("regulation_type", mapped.regulation_type, "Time limited");
  assertEqual("agency", mapped.agency, "SFMTA");
  assertEqual("days_of_week", mapped.days_of_week, "M-Sa");
  assertEqual("hours", mapped.hours, "800-2200");
  assertEqual("hour_limit keeps 0.5 as source text", mapped.hour_limit, "0.5");
  assert(Number(mapped.hour_limit) === 0.5, "hour_limit numeric value is 0.5 not 0");
  assertEqual("rpparea1 separate", mapped.rpparea1, "EE");
  assertEqual("rpparea2 separate", mapped.rpparea2, "S");
  assertEqual("rpparea3 separate", mapped.rpparea3, "C");
  assert(
    !String(mapped.rpparea1).includes(",") &&
      mapped.rpparea1 !== mapped.rpparea2 &&
      mapped.rpparea2 !== mapped.rpparea3,
    "rpp fields stay three distinct values, not one concatenated string"
  );
  assertEqual("source_fid_100 stored, not used as identity", mapped.source_fid_100, "1245");
  assertEqual("imported_at", mapped.imported_at, IMPORTED_AT);

  assert(!("shape" in mapped.raw_source), "raw_source omits shape");
  assert(!("the_geom" in mapped.raw_source), "raw_source omits the_geom");
  assert(!("location" in mapped.raw_source), "raw_source omits location");
  assertEqual("raw_source keeps exceptions", mapped.raw_source.exceptions, "except holidays");
  assertEqual("raw_source keeps from_time", mapped.raw_source.from_time, "8am");
  assertEqual("raw_source keeps to_time", mapped.raw_source.to_time, "10pm");
  assertEqual("raw_source keeps objectid", mapped.raw_source.objectid, "4918");
  assertEqual("raw_source keeps fid_100", mapped.raw_source.fid_100, "1245");

  const slim = slimRegulationRawSource(sampleRow());
  assert(!("shape" in slim) && "exceptions" in slim, "slim helper drops geometry only");

  const fractional = mapCityParkingRegulationRow(
    { objectid: "9", hrlimit: "0.330000013" },
    SOURCE_ID,
    IMPORTED_AT
  );
  assertEqual("fractional hour_limit 0.330000013 preserved", fractional.hour_limit, "0.330000013");
  assert(!Number.isInteger(Number(fractional.hour_limit)), "fractional hour_limit is not truncated to int");

  const zeroLimit = mapCityParkingRegulationRow(
    { objectid: "10", hrlimit: "0" },
    SOURCE_ID,
    IMPORTED_AT
  );
  assertEqual("hour_limit 0 stored as 0 not null", zeroLimit.hour_limit, "0");

  const numericHr = mapCityParkingRegulationRow(
    { objectid: "11", hrlimit: 2 },
    SOURCE_ID,
    IMPORTED_AT
  );
  assertEqual("numeric hrlimit 2 kept as number", numericHr.hour_limit, 2);

  let threw = false;
  try {
    mapCityParkingRegulationRow({ regulation: "Time limited" }, SOURCE_ID, IMPORTED_AT);
  } catch {
    threw = true;
  }
  assert(threw, "missing objectid throws (no fetch-index identity)");

  const noFakeJoin = mapCityParkingRegulationRow(
    {
      objectid: "918",
      fid_100: "884",
      blockface_id: "should-not-become-block_id",
      name: "also-not-a-join",
    },
    SOURCE_ID,
    IMPORTED_AT
  );
  assertEqual("objectid collision value is identity only", noFakeJoin.external_id, "918");
  assertEqual("blockface-like fields do not set block_id", noFakeJoin.block_id, null);

  log("all regulation storage mapping checks passed");
}

main();

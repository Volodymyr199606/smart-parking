/** Offline query-builder/provider integration tests. Never imports the mobile Supabase singleton. */
import assert from "node:assert/strict";
import type { SupabaseClient } from "@supabase/supabase-js";
import { services } from "../packages/shared/src";
import type { domain } from "../packages/shared/src";
import { computeBoundingBoxDegrees } from "../apps/mobile/src/utils/geoBoundingBox";
import { createMobileParkingSearch } from "../apps/mobile/src/services/parkingSearchProviders";
import { createParkingSearchRepository } from "../apps/mobile/src/services/parkingSearchRepository";
import { COMMUNITY_REPORT_TTL_MS, MOBILE_SEARCH_LIMITS, MobileParkingSearchError } from "../apps/mobile/src/services/parkingSearchPolicy";

const arrival = "2026-09-24T17:00:00.000Z", ms = Date.parse(arrival);
const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const instant = (minutes: number) => new Date(ms + minutes * 60_000).toISOString();
const request: domain.ParkingSearchRequest = { origin: { latitude: 37.77, longitude: -122.42 }, arrivalTime: arrival, durationMinutes: 60, radiusMeters: 100 };
function destination(origin: domain.GeoPoint, meters: number, bearing: number): domain.GeoPoint {
  const r = Math.PI / 180, p = origin.latitude * r, l = origin.longitude * r, a = meters / 6371000, b = bearing * r;
  const lat = Math.asin(Math.sin(p) * Math.cos(a) + Math.cos(p) * Math.sin(a) * Math.cos(b));
  const lon = l + Math.atan2(Math.sin(b) * Math.sin(a) * Math.cos(p), Math.cos(a) - Math.sin(p) * Math.sin(lat));
  return { latitude: lat / r, longitude: ((lon / r + 540) % 360) - 180 };
}
type Row = Record<string, unknown>;
const spot = (id = 1, meters = 20, bearing = 0): Row => ({ id: uuid(id), street_name: "Synthetic", address: null,
  ...destination(request.origin, meters, bearing), status: "AVAILABLE", source: "MOCK", updated_at: instant(-1) });
const report = (id = 101, candidate = 1, status = "AVAILABLE", age = 1): Row => ({ id: uuid(id), parking_spot_id: uuid(candidate), status, created_at: instant(-age) });

class FakeDatabase {
  spots: Row[] = [spot()]; reports: Row[] = [];
  calls: { table: string; filters: [string, string, unknown][]; columns: string; exact: boolean; range: number[]; returned: Row[] }[] = [];
  errorTable = ""; rejectTable = ""; bypassFilters = ""; missingCount = false; serverCap = Infinity;
  from(table: string) {
    const db = this, call = { table, filters: [] as [string, string, unknown][], columns: "", exact: false, range: [0, Infinity], returned: [] as Row[] };
    assert(["parking_spots", "parking_reports"].includes(table));
    const query = {
      select(columns: string, options: { count: string }) { call.columns = columns; call.exact = options.count === "exact"; return query; },
      gte(column: string, value: unknown) { call.filters.push(["gte", column, value]); return query; },
      lte(column: string, value: unknown) { call.filters.push(["lte", column, value]); return query; },
      in(column: string, value: unknown) { call.filters.push(["in", column, value]); return query; },
      order(column: string) { assert.equal(column, "id"); return query; },
      range(first: number, last: number) { call.range = [first, last]; return query; },
      then(resolve: (value: unknown) => unknown, reject: (error: unknown) => unknown) {
        db.calls.push(call);
        if (db.rejectTable === table) return Promise.reject(new Error("fixture connection failure")).then(resolve, reject);
        let rows = table === "parking_spots" ? db.spots : db.reports;
        if (db.bypassFilters !== table) for (const [operation, column, value] of call.filters) {
          rows = rows.filter(row => {
            if (operation === "in") return (value as string[]).includes(row[column] as string);
            const left = column === "created_at" ? Date.parse(row[column] as string) : row[column] as number;
            const right = column === "created_at" ? Date.parse(value as string) : value as number;
            return operation === "gte" ? left >= right : left <= right;
          });
        }
        const sorted = [...rows].sort((a, b) => String(a.id) < String(b.id) ? -1 : 1);
        call.returned = sorted.slice(call.range[0], Math.min(call.range[1] + 1, db.serverCap));
        return Promise.resolve({ data: call.returned, count: db.missingCount ? null : rows.length,
          error: db.errorTable === table ? { message: "fixture database failure" } : null }).then(resolve, reject);
      },
    };
    return query;
  }
  search() { return createMobileParkingSearch(createParkingSearchRepository(this as unknown as Pick<SupabaseClient, "from">), () => arrival); }
}
const errorCode = (code: MobileParkingSearchError["code"]) => (e: unknown) => e instanceof MobileParkingSearchError && e.code === code;

async function main() {
  let checks = 0;
  const pass = (name: string) => { checks++; console.log(`PASS ${name}`); };
  const restore: (() => void)[] = [], fetch = globalThis.fetch;
  globalThis.fetch = () => { throw new Error("NETWORK FORBIDDEN"); }; restore.push(() => { globalThis.fetch = fetch; });
  for (const [module, methods] of [["node:http", ["request", "get"]], ["node:https", ["request", "get"]], ["node:net", ["connect", "createConnection"]], ["node:tls", ["connect"]]] as const) {
    const api = require(module); for (const method of methods) { const old = api[method]; api[method] = () => { throw new Error("NETWORK FORBIDDEN"); }; restore.push(() => { api[method] = old; }); }
  }
  try {
    let points = 0;
    for (const latitude of [37.7, 37.77, 37.84, 0, 80, -80, 89.99]) for (const longitude of [-122.42, 179.999, -179.999]) {
      for (const radius of [1, 10, 100, 2000, 10000]) for (const fraction of [0.25, 1]) {
        const origin = { latitude, longitude }, box = computeBoundingBoxDegrees(latitude, longitude, radius);
        for (let bearing = 0; bearing < 360; bearing += 5) {
          const p = destination(origin, radius * fraction, bearing);
          assert(p.latitude >= box.minLat && p.latitude <= box.maxLat && p.longitude >= box.minLng && p.longitude <= box.maxLng);
          assert(services.distanceMeters(origin, p) <= radius + 0.001); points++;
        }
      }
    }
    pass(`${points} bounding-box boundary/interior points: SF, small/large radius, cardinal/diagonal, poles and antimeridian`);
    const wrap = computeBoundingBoxDegrees(0, 179.999, 10000); assert.equal(wrap.minLng, -180); assert.equal(wrap.maxLng, 180);
    pass("antimeridian falls back to conservative full longitude band");
    for (const bad of [[91, 0, 1], [0, 181, 1], [0, 0, -1], [NaN, 0, 1], [0, 0, Infinity]]) assert.throws(() => computeBoundingBoxDegrees(...bad as [number, number, number]));
    pass("invalid geographic inputs rejected");
    const db = new FakeDatabase(); db.spots = [spot(), spot(2, 1000), spot(3, 130, 45)]; db.reports = [report(), report(102, 2), report(103, 3)];
    const result = await db.search()(request);
    assert.equal(result.length, 1); assert.equal(result[0].location.id, uuid(1)); assert.equal(result[0].availability.status, "AVAILABLE");
    assert.deepEqual(db.calls[0].returned.map(r => r.id), [uuid(1), uuid(3)]); pass("coarse box excludes distant rows; exact runtime radius excludes box corners");
    assert.deepEqual(db.calls[1].filters.find(f => f[0] === "in")![2], [uuid(1)]); pass("reports scoped only to exact-radius candidate IDs");
    assert.equal(db.calls[1].filters.find(f => f[0] === "gte")![2], instant(-5)); assert.equal(db.calls[1].filters.find(f => f[0] === "lte")![2], arrival);
    assert(db.calls.every(c => c.exact && c.range[0] === 0)); pass("exact counts, bounded ranges and TTL time horizon sent to query layer");
    assert.equal(result[0].availability.evidence?.externalId, uuid(101)); assert.equal(result[0].availability.evidence?.sourceCategory, "COMMUNITY");
    pass("report FK and report ID map to correct candidate/evidence");
    assert.equal(result[0].legality.status, "UNKNOWN"); assert.equal(result[0].legality.maxStayMinutes, null); assert.deepEqual(result[0].legality.restrictions, []);
    assert.deepEqual(await db.search()({ ...request, requireLegal: true }), []); pass("unassociated spot rules stay UNKNOWN; requireLegal remains strict");
    assert.deepEqual(await db.search()(request), result); pass("repeated fixed-clock searches are deterministic");
    const empty = new FakeDatabase(); empty.spots = []; assert.deepEqual(await empty.search()(request), []); assert.equal(empty.calls.length, 1); pass("zero candidates returns [] without report query");
    for (const state of ["AVAILABLE", "OCCUPIED"]) {
      const recent = new FakeDatabase(); recent.reports = [report(101, 1, state)]; assert.equal((await recent.search()(request))[0].availability.status, state);
      pass(`recent ${state} evidence remains independent of UNKNOWN legality`);
      recent.reports = [report(101, 1, state, 6)]; assert.equal((await recent.search()(request))[0].availability.status, "UNKNOWN"); pass(`expired ${state} report is UNKNOWN`);
    }
    const noReport = new FakeDatabase(); assert.equal((await noReport.search()(request))[0].availability.status, "UNKNOWN"); pass("cached spot AVAILABLE with no reports is UNKNOWN");
    const conflict = new FakeDatabase(); conflict.reports = [report(101, 1, "AVAILABLE"), report(102, 1, "OCCUPIED")];
    assert.equal((await conflict.search()(request))[0].availability.reasonCode, "CONFLICTING_OBSERVATIONS"); pass("equal-time report conflict delegated to shared resolver");
    conflict.reports[1] = report(102, 1, "OCCUPIED", 2); assert.equal((await conflict.search()(request))[0].availability.status, "AVAILABLE"); pass("newest report selected by shared resolver");
    const future = new FakeDatabase(); future.bypassFilters = "parking_reports"; future.reports = [report(101, 1, "AVAILABLE", -1)];
    assert.equal((await future.search()(request))[0].availability.status, "UNKNOWN"); pass("clock-skew future report rejected even if query returns it");
    const later = new FakeDatabase(); later.reports = [report()]; assert.equal((await later.search()({ ...request, arrivalTime: instant(30) }))[0].availability.status, "UNKNOWN");
    assert.equal(later.calls.length, 1); pass("future arrival beyond TTL does not predict occupancy or query an inverted horizon");
    const edge = new FakeDatabase(); edge.reports = [report(101, 1, "AVAILABLE", 5)]; assert.equal((await edge.search()(request))[0].availability.status, "UNKNOWN"); pass("five-minute expiry boundary is exclusive");
    edge.reports = [{ ...report(), created_at: "2026-09-24T16:59:00.123456Z" }]; const micro = (await edge.search()(request))[0].availability;
    assert.equal(micro.status, "AVAILABLE"); assert.equal(micro.evidence?.observedAt, "2026-09-24T16:59:00.124Z");
    assert.equal(micro.evidence?.expiresAt, "2026-09-24T17:04:00.123Z"); pass("Postgres microseconds normalize conservatively without extending TTL");
    edge.reports = [{ ...report(), created_at: "2026-09-24T09:59:00-07:00" }]; assert.equal((await edge.search()(request))[0].availability.status, "AVAILABLE"); pass("absolute offset timestamp equals UTC observation");
    const wrong = new FakeDatabase(); wrong.bypassFilters = "parking_reports"; wrong.reports = [report(101, 2)];
    await assert.rejects(() => wrong.search()(request), errorCode("DATA_ERROR")); pass("wrong foreign key is never attached");
    for (const row of [{ ...report(), created_at: "not-a-date" }, { ...report(), created_at: "2026-02-30T10:00:00Z" },
      { ...report(), status: "FREE" }, { ...report(), parking_spot_id: null }]) {
      const malformed = new FakeDatabase(); malformed.bypassFilters = "parking_reports"; malformed.reports = [row];
      await assert.rejects(() => malformed.search()(request), errorCode("DATA_ERROR"));
    }
    pass("malformed reports produce explicit data errors");
    for (const row of [{ ...spot(), latitude: NaN }, { ...spot(), status: "FREE" }, { ...spot(), id: "bad-id" }, { ...spot(), updated_at: "bad-time" }]) {
      const malformed = new FakeDatabase(); malformed.bypassFilters = "parking_spots"; malformed.spots = [row];
      await assert.rejects(() => malformed.search()(request), errorCode("DATA_ERROR"));
    }
    pass("malformed candidate rows produce explicit data errors");
    const duplicate = new FakeDatabase(); duplicate.spots = [spot(), spot()]; assert.equal((await duplicate.search()(request)).length, 1);
    duplicate.spots[1] = { ...spot(), status: "OCCUPIED" }; await assert.rejects(() => duplicate.search()(request), errorCode("DATA_ERROR")); pass("identical candidates collapse; conflicting identities fail");
    for (const table of ["parking_spots", "parking_reports"]) {
      const failure = new FakeDatabase(); failure.errorTable = table; await assert.rejects(() => failure.search()(request), errorCode("DATABASE_ERROR"));
      failure.errorTable = ""; failure.rejectTable = table; await assert.rejects(() => failure.search()(request), errorCode("DATABASE_ERROR"));
      pass(`${table} network/database errors are never empty results`);
    }
    const overflow = new FakeDatabase(); overflow.spots = Array.from({ length: 501 }, (_, n) => spot(n + 1));
    await assert.rejects(() => overflow.search()(request), errorCode("QUERY_LIMIT")); pass("candidate overflow fails instead of truncating nearest/ranked results");
    overflow.spots = [spot(), spot(2)]; overflow.serverCap = 1; await assert.rejects(() => overflow.search()(request), errorCode("QUERY_LIMIT")); pass("lower server page cap detected using exact count");
    const tooMany = new FakeDatabase(); tooMany.reports = Array.from({ length: 2001 }, (_, n) => report(1000 + n));
    await assert.rejects(() => tooMany.search()(request), errorCode("QUERY_LIMIT")); pass("report overflow fails before shared failure isolation");
    const batched = new FakeDatabase(); batched.spots = Array.from({ length: 51 }, (_, n) => spot(n + 1));
    await batched.search()(request); const batches = batched.calls.filter(c => c.table === "parking_reports");
    assert.deepEqual(batches.map(c => (c.filters.find(f => f[0] === "in")![2] as string[]).length), [50, 1]); pass("report IDs batched to bounded query URLs");
    batched.reports = [...Array.from({ length: 2000 }, (_, n) => report(1000 + n)), report(4000, 51)];
    await assert.rejects(() => batched.search()(request), errorCode("QUERY_LIMIT")); pass("report budget is global across batches");
    const counts = new FakeDatabase(); counts.missingCount = true; await assert.rejects(() => counts.search()(request), errorCode("DATA_ERROR")); pass("missing exact count cannot imply completeness");
    const city = new FakeDatabase(); city.spots = [{ ...spot(), source: "DATASF" }];
    assert.equal((await city.search()(request))[0].legality.coverage.reasonCode, "CITY_SOURCE_INCOMPLETE"); pass("CITY provenance cannot fabricate association or coverage");
    const invalid = new FakeDatabase();
    for (const query of [{ ...request, radiusMeters: 0.5 }, { ...request, radiusMeters: 10001 }, { ...request, maxResults: 101 }]) {
      await assert.rejects(() => invalid.search()(query), errorCode("UNSUPPORTED_REQUEST"));
    }
    assert.equal(invalid.calls.length, 0); pass("mobile radius/result budgets validated before queries");
    const limited = new FakeDatabase(); limited.spots = Array.from({ length: 101 }, (_, n) => spot(n + 1));
    assert.equal((await limited.search()(request)).length, 100); assert.equal(limited.calls[0].returned.length, 101); pass("final result limit follows complete candidate discovery/ranking");
    assert.equal(COMMUNITY_REPORT_TTL_MS, 300000); assert.equal(MOBILE_SEARCH_LIMITS.maxRadiusMeters, 10000);
    assert(!Object.keys(require.cache).some(p => /supabaseClient\.[tj]s$/.test(p))); pass("offline imports never initialize the mobile Supabase client; networking blocked");
    console.log(`${checks} mobile parking search checks passed; ${points} bounding-box points verified; no network calls.`);
  } finally { restore.reverse().forEach(f => f()); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });

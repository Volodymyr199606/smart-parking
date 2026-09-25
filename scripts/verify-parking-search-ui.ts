/** Offline UI controller/view-model tests; no React Native renderer, database client or network. */
import assert from "node:assert/strict";
import type { domain, services } from "../packages/shared/src";
import { createParkingSearchController } from "../apps/mobile/src/utils/parkingSearchController";
import { parkingSearchCardModel, parkingSearchEmptyMessage, type ParkingSearchInput } from "../apps/mobile/src/utils/parkingSearchViewModel";
import { resolveParkingSearchLocation } from "../apps/mobile/src/utils/parkingSearchLocation";
import { openParkingDirections } from "../apps/mobile/src/utils/parkingDirections";
import { submitParkingSearchReport } from "../apps/mobile/src/utils/parkingSearchReport";

const start = Date.parse("2026-09-24T17:00:00Z");
const input: ParkingSearchInput = { origin: { latitude: 37.77, longitude: -122.42 }, durationMinutes: 60, radiusMeters: 500, requireLegal: false };
function result(id: string, legality: domain.LegalityStatus = "UNKNOWN", availability: domain.AvailabilityStatus = "UNKNOWN", expiry = start + 300000): services.ParkingSearchResult {
  const evidence: domain.ParkingEvidence = { sourceCategory: "COMMUNITY", sourceDetail: "USER_REPORT", externalId: id,
    observedAt: new Date(start - 120000).toISOString(), retrievedAt: new Date(start - 120000).toISOString(), expiresAt: new Date(expiry).toISOString() };
  return { candidateId: `CURRENT_SPOTS:${id}`, sourceType: "CURRENT_SPOTS", location: { id, point: input.origin, address: "Test address", streetName: "Test street", city: null },
    distanceMeters: 150, legality: { status: legality, reason: null, reasonCode: null, evidence: null, maxStayMinutes: 120,
      coverage: { readiness: "INCOMPLETE", reasonCode: "NO_RULES", reason: "fixture" }, restrictions: [] },
    availability: { status: availability, freshness: availability === "UNKNOWN" ? "UNKNOWN" : "FRESH", evidence: availability === "UNKNOWN" ? null : evidence,
      evaluatedAt: new Date(start).toISOString(), ageMinutes: availability === "UNKNOWN" ? null : 2,
      reasonCode: availability === "UNKNOWN" ? "NO_VALID_OBSERVATION" : "CURRENT_OBSERVATION",
      observations: availability === "UNKNOWN" ? [] : [{ status: availability, evidence }] },
    provenance: [], rank: [1, 1, 2, null, 150, id], rankingReasons: ["LEGALITY_UNKNOWN", "AVAILABILITY_UNKNOWN"] };
}
class Harness {
  now = start; serial = 0; timers = new Map<number, { at: number; callback: () => void }>();
  calls: { request: domain.ParkingSearchRequest; resolve(value: services.ParkingSearchResult[]): void; reject(value: unknown): void }[] = [];
  controller = createParkingSearchController({ now: () => this.now,
    schedule: (callback, delay) => { const id = ++this.serial; this.timers.set(id, { callback, at: this.now + delay }); return () => { this.timers.delete(id); }; },
    search: request => new Promise((resolve, reject) => this.calls.push({ request, resolve, reject })),
  });
  advance(ms: number) { this.now += ms; for (const [id, task] of [...this.timers]) if (task.at <= this.now) { this.timers.delete(id); task.callback(); } }
}
const flush = async () => { await Promise.resolve(); await Promise.resolve(); };
async function main() {
  let checks = 0;
  const pass = (label: string) => { checks++; console.log(`PASS ${label}`); };
  const restore: (() => void)[] = [], fetch = globalThis.fetch;
  globalThis.fetch = () => { throw new Error("NETWORK FORBIDDEN"); }; restore.push(() => { globalThis.fetch = fetch; });
  for (const [module, methods] of [["node:http", ["request", "get"]], ["node:https", ["request", "get"]], ["node:net", ["connect", "createConnection"]], ["node:tls", ["connect"]]] as const) {
    const api = require(module); for (const method of methods) { const old = api[method]; api[method] = () => { throw new Error("NETWORK FORBIDDEN"); }; restore.push(() => { api[method] = old; }); }
  }
  try {
    const h = new Harness(); h.controller.configure(input); assert.equal(h.controller.getSnapshot().status, "loading"); assert.equal(h.calls.length, 0);
    h.advance(250); assert.equal(h.calls.length, 1); h.calls[0].resolve([result("one")]); await flush();
    assert.equal(h.controller.getSnapshot().status, "success"); assert.equal(h.controller.getSnapshot().results[0].location.id, "one"); pass("loading -> runtime results");
    assert.equal(h.calls[0].request.arrivalTime, new Date(start + 250).toISOString()); assert.equal(h.calls[0].request.durationMinutes, 60); pass("now arrival and selected controls passed unchanged");
    let positions = 0;
    const denied = await resolveParkingSearchLocation({ permission: async () => ({ status: "denied" }), position: async () => { positions++; return { coords: input.origin }; } });
    assert.deepEqual(denied, { status: "denied", point: null }); assert.equal(positions, 0); pass("permission denied has no fake/default origin");
    const failedLocation = await resolveParkingSearchLocation({ permission: async () => ({ status: "granted" }), position: async () => { throw new Error("fixture"); } });
    assert.deepEqual(failedLocation, { status: "error", point: null }); pass("location failure distinct from empty parking");
    assert.equal((await resolveParkingSearchLocation({ permission: async () => ({ status: "granted" }), position: async () => ({ coords: input.origin }) })).status, "granted"); pass("location retry can resolve real coordinates");
    h.controller.configure(null); h.advance(1000); assert.equal(h.calls.length, 1); assert.equal(h.controller.getSnapshot().status, "idle"); pass("no origin/inactive screen performs no search");
    h.controller.configure(input); h.advance(250); h.calls[1].resolve([]); await flush();
    assert.equal(h.controller.getSnapshot().status, "success"); assert.match(parkingSearchEmptyMessage(input), /No parking candidates found within 500 m/); pass("successful empty search has radius-specific copy");
    assert.match(parkingSearchEmptyMessage({ ...input, requireLegal: true }), /No verified legal parking found/); pass("verified-legal empty state explains incomplete rules");
    h.controller.refresh(); h.calls[2].reject({ code: "DATABASE_ERROR", message: "secret backend detail" }); await flush();
    assert.equal(h.controller.getSnapshot().status, "error"); assert(!h.controller.getSnapshot().error!.includes("secret")); assert.deepEqual(h.controller.getSnapshot().results, []); pass("provider error visible and sanitized; no stale results");
    h.controller.refresh(); h.calls[3].resolve([result("retry")]); await flush(); assert.equal(h.controller.getSnapshot().status, "success"); pass("retry reuses same runtime boundary");
    const race = new Harness(); race.controller.configure(input); race.advance(250); race.controller.configure({ ...input, radiusMeters: 1000 }); race.advance(250);
    race.calls[1].resolve([result("B")]); await flush(); race.calls[0].resolve([result("A")]); await flush();
    assert.equal(race.controller.getSnapshot().results[0].location.id, "B"); pass("late A success cannot overwrite newer B");
    race.controller.refresh(); race.controller.refresh(); race.calls[3].resolve([result("D")]); await flush(); race.calls[2].reject(new Error("old failure")); await flush();
    assert.equal(race.controller.getSnapshot().results[0].location.id, "D"); assert.equal(race.controller.getSnapshot().status, "success"); pass("late error cannot overwrite newer success");
    const order = [result("far"), { ...result("near"), distanceMeters: 1 }]; race.controller.refresh(); race.calls[4].resolve(order); await flush();
    assert.equal(race.controller.getSnapshot().results, order); pass("result identity/order preserved with no frontend ranking");
    for (const [state, label] of [["LEGAL", "Parking allowed"], ["ILLEGAL", "Parking not allowed for this stay"], ["UNKNOWN", "Parking rules not fully verified"]] as const) {
      assert.equal(parkingSearchCardModel(result("card", state)).legality, label); pass(`${state} legality has distinct text`);
    }
    for (const [state, label] of [["AVAILABLE", "Recently reported available"], ["OCCUPIED", "Recently reported occupied"], ["UNKNOWN", "Availability unknown"]] as const) {
      assert.equal(parkingSearchCardModel(result("card", "UNKNOWN", state)).availability, label); pass(`${state} availability is not a legality claim`);
    }
    assert.equal(parkingSearchCardModel(result("card", "LEGAL", "AVAILABLE")).freshness, "Report age at search: 2 min");
    assert.equal(parkingSearchCardModel(result("card")).freshness, null); pass("freshness comes from runtime age; UNKNOWN has no current-occupancy age");
    assert.equal(parkingSearchCardModel(result("card")).maxStay, "Known time limit: 120 min"); pass("known max stay labeled as a restriction");
    const urls: string[] = [], destination = { ...result("card").location.point, label: "Test street" };
    await openParkingDirections(destination, { platform: "ios", canOpenURL: async () => true, openURL: async url => { urls.push(url); }, onFailure: () => assert.fail() });
    assert.equal(urls[0], "maps:0,0?q=Test%20street@37.77,-122.42"); pass("directions uses runtime destination coordinates and existing Apple Maps path");
    await openParkingDirections(destination, { platform: "ios", canOpenURL: async () => false, openURL: async url => { urls.push(url); }, onFailure: () => assert.fail() });
    assert(urls[1].includes("destination=37.77,-122.42")); pass("existing Google Maps fallback preserved");
    const reportCalls: unknown[][] = [], reportHarness = new Harness(); reportHarness.controller.configure(input); reportHarness.advance(250);
    await submitParkingSearchReport(result("spot"), "user", "AVAILABLE", { report: async (...args) => { reportCalls.push(args); }, refresh: reportHarness.controller.refresh });
    assert.deepEqual(reportCalls, [["user", "spot", "AVAILABLE"]]); assert.equal(reportHarness.calls.length, 2); assert.equal(reportHarness.controller.getSnapshot().status, "loading"); pass("successful report refreshes facade without patching card status");
    let refreshed = false;
    await assert.rejects(() => submitParkingSearchReport(result("spot"), "user", "OCCUPIED", { report: async () => { throw new Error("fixture"); }, refresh: () => { refreshed = true; } }));
    assert.equal(refreshed, false); pass("failed report cannot fabricate updated availability");
    const expiry = new Harness(); expiry.controller.configure(input); expiry.advance(250); expiry.calls[0].resolve([result("expiring", "UNKNOWN", "AVAILABLE", start + 1000)]); await flush();
    assert.equal(expiry.timers.size, 1); expiry.advance(750); assert.equal(expiry.calls.length, 2); assert.equal(expiry.controller.getSnapshot().status, "loading");
    assert.deepEqual(expiry.controller.getSnapshot().results, []); expiry.calls[1].resolve([result("expiring")]); await flush();
    assert.equal(expiry.controller.getSnapshot().results[0].availability.status, "UNKNOWN"); pass("one expiry timer clears stale evidence and refreshes runtime");
    const late = new Harness(); late.controller.configure(input); late.advance(1000); late.calls[0].resolve([result("old", "UNKNOWN", "AVAILABLE", start + 500)]); await flush();
    assert.equal(late.controller.getSnapshot().status, "error"); assert.deepEqual(late.controller.getSnapshot().results, []); pass("evidence expiring during network wait is never rendered current");
    expiry.controller.refresh(); expiry.controller.configure(null); expiry.calls[2].resolve([result("old", "LEGAL", "AVAILABLE")]); await flush();
    assert.equal(expiry.controller.getSnapshot().status, "idle"); assert.equal(expiry.timers.size, 0); pass("deactivation/unmount invalidates requests and timers");
    expiry.controller.configure(input); expiry.advance(250); assert.equal(expiry.calls.length, 4); pass("foreground/focus return starts a fresh search");
    const debounce = new Harness(); debounce.controller.configure(input); debounce.controller.configure({ ...input, durationMinutes: 30 }); debounce.controller.configure({ ...input, durationMinutes: 120 });
    debounce.advance(250); assert.equal(debounce.calls.length, 1); assert.equal(debounce.calls[0].request.durationMinutes, 120); pass("rapid control changes debounce into one latest search");
    debounce.controller.invalidate(); debounce.controller.invalidate(); debounce.advance(250); assert.equal(debounce.calls.length, 2); pass("realtime events coalesce into runtime refresh");
    assert(!Object.keys(require.cache).some(p => /supabaseClient\.[tj]s$/.test(p))); pass("tests do not import Supabase singleton; networking blocked");
    console.log(`${checks} parking search UI/controller checks passed; no network calls.`);
  } finally { restore.reverse().forEach(f => f()); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });

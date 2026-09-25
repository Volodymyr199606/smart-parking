/** Offline runtime contract/ranking tests. No database, environment credentials or cloud clients. */
import assert from "node:assert/strict";
import { services, adapters } from "../packages/shared/src";
import type { domain } from "../packages/shared/src";

const arrival = "2026-09-24T17:00:00.000Z";
const request: domain.ParkingSearchRequest = { origin: { latitude: 37.77, longitude: -122.42 }, arrivalTime: arrival,
  durationMinutes: 60, radiusMeters: 1000 };
const instant = (minutes: number) => new Date(Date.parse(arrival) + minutes * 60_000).toISOString();
function evidence(category: domain.DataSourceCategory = "MOCK", age = 2, expiry = 10): domain.ParkingEvidence {
  return { sourceCategory: category, sourceDetail: category === "COMMUNITY" ? "USER_REPORT" : "synthetic",
    externalId: "report", observedAt: instant(-age), retrievedAt: instant(-age), expiresAt: instant(expiry) };
}
function observation(status: domain.AvailabilityStatus = "AVAILABLE", category: domain.DataSourceCategory = "COMMUNITY", age = 2, expiry = 10): domain.ParkingAvailability {
  return { status, evidence: evidence(category, age, expiry) };
}
function rule(cap = 120): domain.ParkingRule {
  return { id: `limit-${cap}`, kind: "TIME_LIMIT", schedule: { allDay: true, maxDurationMinutes: cap,
    daysOfWeek: null, timeWindow: null, timezone: null }, sourceRegulationType: null, agency: null, permitArea: null, rawText: null,
    evidence: evidence() };
}
function spot(id: string, meters = 100): adapters.ParkingSpotRow {
  return { id, street_name: "Synthetic", address: null, latitude: request.origin.latitude + meters / (6371000 * Math.PI / 180),
    longitude: request.origin.longitude, status: "UNKNOWN", source: "MOCK", updated_at: instant(-2) };
}
type Fixture = { row: adapters.ParkingSpotRow; rules: domain.ParkingRule[]; observations: domain.ParkingAvailability[] };
const fixture = (id: string, meters: number, status: domain.AvailabilityStatus, rules = [rule()]): Fixture =>
  ({ row: spot(id, meters), rules, observations: status === "UNKNOWN" ? [] : [observation(status)] });
function deps(fixtures: Fixture[]): services.ParkingSearchServiceDeps {
  return { fetchNearbySpots: async () => fixtures.map(f => f.row),
    fetchRulesForCandidate: async c => fixtures.find(f => f.row.id === c.location.id)!.rules,
    fetchAvailabilityForCandidate: async c => fixtures.find(f => f.row.id === c.location.id)!.observations,
    coverageDeclaration: "COMPLETE" };
}
const run = (fixtures: Fixture[], query = request, extra: Partial<services.ParkingSearchServiceDeps> = {}) =>
  new services.ParkingSearchService({ ...deps(fixtures), ...extra }).searchParking(query);

async function main() {
  let count = 0;
  const pass = (label: string) => { count++; console.log(`PASS ${label}`); };
  const restore: (() => void)[] = [], fetch = globalThis.fetch;
  globalThis.fetch = () => { throw new Error("NETWORK FORBIDDEN"); }; restore.push(() => { globalThis.fetch = fetch; });
  for (const [module, methods] of [["node:http", ["request", "get"]], ["node:https", ["request", "get"]], ["node:net", ["connect", "createConnection"]], ["node:tls", ["connect"]]] as const) {
    const api = require(module); for (const method of methods) { const old = api[method]; api[method] = () => { throw new Error("NETWORK FORBIDDEN"); }; restore.push(() => { api[method] = old; }); }
  }
  try {
    const fixtures = [fixture("legal-available", 200, "AVAILABLE"), fixture("legal-unknown", 100, "UNKNOWN"),
      fixture("legal-occupied", 50, "OCCUPIED"), fixture("unknown-available", 10, "AVAILABLE", []),
      fixture("illegal-available", 5, "AVAILABLE", [rule(30)]), fixture("outside", 2000, "AVAILABLE")];
    const before = JSON.stringify(fixtures), results = await run(fixtures);
    assert.deepEqual(results.map(r => r.location.id), ["legal-available", "legal-unknown", "legal-occupied", "unknown-available", "illegal-available"]);
    pass("explicit ordering: legality, availability, evidence, distance; available 200m beats unknown 100m");
    assert.deepEqual(results.map(r => [r.legality.status, r.availability.status]), [
      ["LEGAL", "AVAILABLE"], ["LEGAL", "UNKNOWN"], ["LEGAL", "OCCUPIED"], ["UNKNOWN", "AVAILABLE"], ["ILLEGAL", "AVAILABLE"]]);
    pass("all legality/availability combinations stay independent");
    assert.equal(JSON.stringify(fixtures), before); assert.deepEqual(JSON.parse(JSON.stringify(results)), results); pass("inputs unchanged and results JSON serializable");
    assert.equal(results[0].legality.maxStayMinutes, 120); assert.equal(results[0].legality.restrictions[0].applicability.status, "APPLIES");
    assert.equal(results[0].legality.coverage.readiness, "READY"); pass("known maximum, restrictions and synthetic coverage exposed");
    assert(results[0].provenance.some(e => e.sourceCategory === "COMMUNITY")); assert(results[0].rankingReasons.includes("LEGAL_CONFIRMED"));
    assert(results[0].rankingReasons.includes("AVAILABLE_RECENT_REPORT")); pass("provenance and structured ranking explanations retained");
    assert.deepEqual(await run([...fixtures].reverse()), results); pass("provider row order cannot change results");
    const legalOnly = await run(fixtures, { ...request, requireLegal: true });
    assert.deepEqual(legalOnly.map(r => r.location.id), ["legal-available", "legal-unknown", "legal-occupied"]); pass("requireLegal excludes ILLEGAL and UNKNOWN");
    assert.deepEqual(await run(fixtures, { ...request, maxResults: 2 }), results.slice(0, 2)); pass("limit applies after ranking");
    const exceeded = (await run([fixtures[0]], { ...request, durationMinutes: 121 }))[0];
    assert.equal(exceeded.legality.status, "ILLEGAL"); assert.equal(exceeded.legality.reasonCode, "EXCEEDS_MAX_DURATION"); pass("requested stay exceeding 120 minutes reuses violation semantics");
    assert.equal((await run([fixtures[0]], { ...request, durationMinutes: 120 }))[0].legality.status, "LEGAL"); pass("exact maximum is permitted by existing evaluator");
    assert.deepEqual(await run([]), []); pass("valid empty discovery returns []");
    assert.deepEqual(await run([fixtures[4]], { ...request, requireLegal: true }), []); pass("all illegal with requireLegal returns []");
    assert.equal((await run([fixtures[1]]))[0].availability.status, "UNKNOWN"); pass("all unknown availability remains a candidate");
    let lookedUpOutside = false;
    await run(fixtures, request, { fetchRulesForCandidate: async c => { if (c.location.id === "outside") lookedUpOutside = true; return []; } });
    assert.equal(lookedUpOutside, false); pass("radius filter precedes rule lookup");
    const exactDistance = services.distanceMeters(request.origin, fixtures[0].row);
    assert.equal((await run([fixtures[0]], { ...request, radiusMeters: exactDistance })).length, 1);
    assert.equal((await run([fixtures[0]], { ...request, radiusMeters: exactDistance - 0.001 })).length, 0); pass("inclusive exact Haversine radius boundary");
    const duplicate = await run([fixtures[0], fixtures[0]]); assert.equal(duplicate.length, 1); pass("duplicate same-source identity collapses");
    await assert.rejects(() => run([fixtures[0], { ...fixtures[0], row: { ...fixtures[0].row, status: "OCCUPIED" } }]), /Conflicting/);
    pass("conflicting duplicate provider rows fail explicitly");
    const city: adapters.NormalizedLocationRow = { id: fixtures[0].row.id, source_type: "datasf_parking_meter", source_id: "meter-1",
      latitude: fixtures[0].row.latitude, longitude: fixtures[0].row.longitude, address: null, city: "San Francisco", last_synced_at: instant(-2) };
    const mixed = await run([fixtures[0]], request, { fetchNearbyNormalizedLocations: async () => [city] });
    assert.equal(mixed.length, 2); assert.notEqual(mixed[0].candidateId, mixed[1].candidateId);
    assert.equal(mixed[1].legality.status, "UNKNOWN"); assert.equal(mixed[1].legality.coverage.reasonCode, "CITY_SOURCE_INCOMPLETE"); pass("table namespaces preserve identity; CITY cannot gain complete coverage");
    const cityOnly = await run([], request, { fetchNearbySpots: undefined, fetchNearbyNormalizedLocations: async () => [city],
      fetchRulesForCandidate: async () => [rule()], fetchAvailabilityForCandidate: undefined });
    assert.equal(cityOnly[0].availability.status, "UNKNOWN"); pass("city inventory is not live occupancy");
    const snapshot = { ...fixtures[0], row: { ...fixtures[0].row, status: "AVAILABLE" as const }, observations: [] };
    assert.equal((await run([snapshot]))[0].availability.status, "UNKNOWN"); pass("spot status without observation/expiry cannot claim current availability");
    const resolve = (o: domain.ParkingAvailability[]) => services.resolveParkingAvailability(o, arrival);
    assert.equal(resolve([observation("AVAILABLE", "COMMUNITY", 20, -1)]).freshness, "EXPIRED"); pass("expired report becomes UNKNOWN/EXPIRED");
    assert.equal(resolve([observation("AVAILABLE", "COMMUNITY", 20, 0)]).status, "UNKNOWN"); pass("expiry boundary is exclusive");
    assert.equal(resolve([observation("AVAILABLE"), observation("OCCUPIED")]).reasonCode, "CONFLICTING_OBSERVATIONS"); pass("equal-time equal-quality conflict becomes UNKNOWN");
    assert.deepEqual(resolve([observation("AVAILABLE"), observation("OCCUPIED")]), resolve([observation("OCCUPIED"), observation("AVAILABLE")])); pass("conflict resolution independent of report order");
    assert.equal(resolve([observation("OCCUPIED", "COMMUNITY", 5), observation("AVAILABLE")]).status, "AVAILABLE"); pass("newer observation dominates older report");
    assert.equal(resolve([observation("AVAILABLE", "COMMUNITY", 10, 20), observation("OCCUPIED", "COMMUNITY", 5, -1)]).status, "UNKNOWN"); pass("expired latest report never resurrects older availability");
    assert.equal(resolve([observation("AVAILABLE", "MOCK"), observation("OCCUPIED", "COMMUNITY")]).status, "OCCUPIED"); pass("COMMUNITY outranks MOCK at equal observation time");
    assert.equal(resolve([observation("AVAILABLE", "CITY")]).status, "UNKNOWN"); pass("CITY-sourced status cannot assert occupancy");
    for (const e of [{ ...evidence(), expiresAt: null }, { ...evidence(), expiresAt: "bad" }, { ...evidence(), observedAt: instant(1) },
      { ...evidence(), retrievedAt: instant(1) }, { ...evidence(), observedAt: null }, { ...evidence(), retrievedAt: instant(-5) }]) {
      assert.equal(resolve([{ status: "AVAILABLE", evidence: e }]).status, "UNKNOWN");
    }
    pass("missing expiry, malformed timestamps and future/impossible observations fail conservatively");
    assert.equal(resolve([observation("AVAILABLE", "COMMUNITY", 5), observation("UNKNOWN")]).status, "UNKNOWN"); pass("newer explicit UNKNOWN supersedes older AVAILABLE");
    const quality = [fixture("a-mock", 100, "AVAILABLE"), fixture("z-community", 100, "AVAILABLE")]; quality[0].observations = [observation("AVAILABLE", "MOCK")];
    assert.deepEqual((await run(quality)).map(r => r.location.id), ["z-community", "a-mock"]); pass("same distance ranks COMMUNITY evidence above MOCK");
    quality[0].observations = [observation("AVAILABLE", "COMMUNITY", 1)];
    assert.deepEqual((await run(quality)).map(r => r.location.id), ["a-mock", "z-community"]); pass("equal quality uses evidence recency");
    quality[0].observations = quality[1].observations;
    assert.deepEqual((await run([...quality].reverse())).map(r => r.location.id), ["a-mock", "z-community"]); pass("complete rank ties use locale-independent candidate ID");
    const scoped = (await run([fixtures[0]], request, { coverageDeclaration: undefined }))[0];
    assert.equal(scoped.legality.status, "UNKNOWN"); pass("undeclared coverage stays UNKNOWN even for safe known limits");
    let scheduled: domain.ParkingRule = { ...rule(), schedule: { ...rule().schedule!, allDay: false, daysOfWeek: ["THURSDAY"],
      timeWindow: { startLocalTime: "09:00", endLocalTime: "12:00" }, timezone: "America/Los_Angeles" } };
    const windowed = (await run([{ ...fixtures[0], rules: [scheduled] }]))[0];
    assert.equal(windowed.legality.status, "UNKNOWN"); assert.equal(windowed.legality.maxStayMinutes, 120); pass("parsed active window gives known cap without inventing LEGAL");
    scheduled = { ...scheduled, schedule: { ...scheduled.schedule!, timeWindow: { startLocalTime: "20:00", endLocalTime: "22:00" } } };
    assert.equal((await run([{ ...fixtures[0], rules: [scheduled] }]))[0].legality.maxStayMinutes, null); pass("inactive limit is not an applicable maximum");
    const noRules = await run([fixtures[0]], request, { fetchRulesForCandidate: async () => { throw new Error("fixture"); } });
    assert.equal(noRules[0].legality.status, "UNKNOWN"); pass("rule lookup failure follows existing conservative isolation");
    const noReports = await run([fixtures[0]], request, { fetchAvailabilityForCandidate: async () => { throw new Error("fixture"); } });
    assert.equal(noReports[0].availability.reasonCode, "LOOKUP_FAILED"); assert.equal(noReports[0].legality.status, "LEGAL"); pass("availability failure cannot alter legality");
    await assert.rejects(() => run([], request, { fetchNearbySpots: async () => { throw new Error("discovery failed"); } }), /discovery failed/); pass("discovery failures are not disguised as empty results");
    await assert.rejects(() => run([], request, { fetchNearbySpots: undefined }), /candidate fetcher/); pass("missing discovery configuration is explicit error");
    const invalid: unknown[] = [null, {}, { ...request, origin: { latitude: 91, longitude: 0 } }, { ...request, origin: { latitude: 0, longitude: 181 } },
      { ...request, origin: { latitude: NaN, longitude: 0 } }, { ...request, radiusMeters: 0 }, { ...request, radiusMeters: -1 }, { ...request, radiusMeters: Infinity },
      { ...request, durationMinutes: 0 }, { ...request, durationMinutes: -1 }, { ...request, durationMinutes: "60" }, { ...request, durationMinutes: Infinity },
      { ...request, arrivalTime: "2026-02-30T12:00:00Z" }, { ...request, arrivalTime: "2026-09-24" }, { ...request, maxResults: 0 },
      { ...request, maxResults: 1.5 }, { ...request, requireLegal: "yes" }];
    let calls = 0;
    const validateFirst = new services.ParkingSearchService({ fetchNearbySpots: async () => { calls++; return []; }, fetchRulesForCandidate: async () => [] });
    for (const query of invalid) await assert.rejects(() => validateFirst.searchParking(query as domain.ParkingSearchRequest), services.ParkingSearchValidationError);
    assert.equal(calls, 0); pass(`${invalid.length} invalid request cases rejected before providers`);
    const now = Date.now; Date.now = () => { throw new Error("IMPLICIT CLOCK FORBIDDEN"); };
    try { assert.deepEqual(await run(fixtures), results); } finally { Date.now = now; } pass("fixed request/evidence never depend on wall clock");
    const example = results[1]; console.log("Example:", JSON.stringify({ candidateId: example.candidateId, sourceType: example.sourceType,
      distanceMeters: example.distanceMeters, legality: { status: example.legality.status, maxStayMinutes: example.legality.maxStayMinutes, reasonCode: example.legality.reasonCode },
      availability: { status: example.availability.status, freshness: example.availability.freshness, evidence: example.availability.evidence },
      rank: example.rank, rankingReasons: example.rankingReasons }));
    console.log(`${count} parking search runtime checks passed; networking blocked.`);
  } finally { restore.reverse().forEach(f => f()); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });

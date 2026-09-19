/** Zero-network geometry/interval contract checks. No database, files, or test framework. */
import assert from "node:assert/strict";
import { FRAME, MEASUREMENT_MODEL, lineLengthMeters, lineMeasurement, pointAtFraction, projectPointOntoLine,
  intervalFromFractions, intervalFromProjectedBounds, serializeInterval, intervalDigest, checkIntervalSet,
  type LonLat, type IntervalReference, type CurbInterval, type ExtentEvidence } from "./curb-interval";

let checks = 0;
function check(name: string, run: () => void) { run(); checks++; console.log(`PASS ${name}`); }
const point = (x: number, y: number): LonLat => [FRAME.longitude + x / FRAME.xMetersPerDegree, FRAME.latitude + y / FRAME.yMetersPerDegree];
const line = (...positions: [number, number][]) => ({ type: "LineString", coordinates: positions.map(p => point(...p)) });
const straight = line([0, 0], [100, 0]);
const bent = line([0, 0], [20, 0], [20, 80]);
const version = "00000000-0000-4000-8000-000000000001"; // Synthetic fixture, never inserted.
const reference = (geometry: unknown): IntervalReference => ({ curb_version_id: version, geometry_sha256: lineMeasurement(geometry).geometry_sha256 });
const evidence: ExtentEvidence = { kind: "CONTIGUOUS_BOUNDS", evidence_reference: "synthetic-fixture:continuous", max_projection_distance_m: 2 };
function interval(from: string, to: string, ref = reference(straight)): CurbInterval {
  const r = intervalFromFractions(ref, from, to); assert.equal(r.status, "VALID_INTERVAL");
  if (r.status !== "VALID_INTERVAL") throw Error("Expected valid interval"); return r.interval;
}
function near(actual: LonLat, expected: LonLat) { assert(Math.abs(actual[0] - expected[0]) < 1e-10); assert(Math.abs(actual[1] - expected[1]) < 1e-10); }
function boundInterval(a: LonLat, b: LonLat, extent = evidence, geometry: unknown = straight) {
  return intervalFromProjectedBounds(geometry, reference(geometry), projectPointOntoLine(geometry, a), projectPointOntoLine(geometry, b), extent);
}
check("fraction zero returns exact first source coordinate", () => assert.deepEqual(pointAtFraction(straight, "0.000000000"), straight.coordinates[0]));
check("fraction one returns exact last source coordinate", () => assert.deepEqual(pointAtFraction(straight, "1.000000000"), straight.coordinates[1]));
check("straight midpoint and length", () => { near(pointAtFraction(straight, "0.500000000"), point(50, 0)); assert.equal(lineLengthMeters(straight), 100); });
check("unequal segment cumulative lengths, not vertex count", () => { assert.equal(lineLengthMeters(bent), 100); near(pointAtFraction(bent, "0.500000000"), point(20, 30)); near(pointAtFraction(bent, "0.200000000"), point(20, 0)); });
check("direction reversal changes fraction meaning and geometry identity", () => { const reversed = { ...bent, coordinates: [...bent.coordinates].reverse() }; near(pointAtFraction(bent, "0.300000000"), pointAtFraction(reversed, "0.700000000")); assert.notEqual(reference(bent).geometry_sha256, reference(reversed).geometry_sha256); });
check("nearest segment and projection distance", () => { const p = projectPointOntoLine(bent, point(21, 40)); assert.equal(p.status, "CLEAR"); assert.deepEqual(p.candidates[0].segment_indices, [1]); assert.equal(p.candidates[0].fraction, "0.600000000"); assert.equal(p.candidates[0].distance_m, 1); });
check("before-start projection clamps with evidence flag", () => { const p = projectPointOntoLine(straight, point(-10, 0)); assert.equal(p.status, "CLEAR"); assert.equal(p.candidates[0].fraction, "0.000000000"); assert(p.candidates[0].clamped); assert.equal(p.candidates[0].distance_m, 10); });
check("after-end projection clamps with evidence flag", () => { const p = projectPointOntoLine(straight, point(110, 0)); assert.equal(p.status, "CLEAR"); assert.equal(p.candidates[0].fraction, "1.000000000"); assert(p.candidates[0].clamped); });
check("exact shared vertex coalesces one cumulative position", () => { const p = projectPointOntoLine(bent, point(20, 0)); assert.equal(p.status, "CLEAR"); assert.deepEqual(p.candidates[0].segment_indices, [0, 1]); assert.equal(p.candidates[0].fraction, "0.200000000"); });
check("equal-distance distinct positions remain tied", () => { const p = projectPointOntoLine(line([0, 0], [10, 0], [10, 10], [0, 10]), point(5, 5)); assert.equal(p.status, "AMBIGUOUS"); assert.equal(p.candidates.length, 3); });
check("one-millimetre near-tie band", () => assert.equal(projectPointOntoLine(line([0, 0], [10, 0], [10, 10], [0, 10]), point(4, 5.0004)).status, "AMBIGUOUS"));
check("repeated coordinates skipped without rewriting geometry", () => { const g = line([0, 0], [0, 0], [100, 0]); assert.equal(lineLengthMeters(g), 100); assert.deepEqual(lineMeasurement(g).skipped_segment_indices, [0]); assert.notEqual(reference(g).geometry_sha256, reference(straight).geometry_sha256); near(pointAtFraction(g, "0.500000000"), point(50, 0)); });
check("malformed, multipart, 3D and out-of-domain lines rejected", () => { for (const g of [null, { type: "Point", coordinates: point(0, 0) }, { type: "MultiLineString", coordinates: [straight.coordinates] }, { type: "LineString", coordinates: [[0, 0], [1, 1]] }, { type: "LineString", coordinates: [[-122.44, NaN], [-122.43, 37.77]] }, { type: "LineString", coordinates: [[-122.44, 37.77, 0], [-122.43, 37.77, 0]] }, line([0, 0])]) assert.throws(() => lineLengthMeters(g)); });
check("zero total length rejected", () => assert.throws(() => lineLengthMeters(line([0, 0], [0, 0])), /Zero total/));
check("grid-collapsed distinct positions rejected", () => assert.throws(() => lineLengthMeters(line([0, 0], [0.0000001, 0])), /Zero total/));
check("valid canonical from/to", () => assert.equal(intervalFromFractions(reference(straight), "0.200000000", "0.800000000").status, "VALID_INTERVAL"));
check("direct reversed and collapsed fractions rejected", () => { assert.equal(intervalFromFractions(reference(straight), "0.800000000", "0.200000000").status, "INVALID"); assert.equal(intervalFromFractions(reference(straight), "0.200000000", "0.200000000").status, "INVALID"); });
check("noncanonical fraction encodings rejected", () => { for (const f of ["0", "0.5", "1.000000001", "-0.100000000", "5e-1", "0.5000000000"]) assert.throws(() => pointAtFraction(straight, f)); });
check("whole curb has one encoding", () => { const all = interval("0.000000000", "1.000000000"); assert.equal(all.component_index, 0); assert.equal(all.measurement_model, MEASUREMENT_MODEL); assert(!("whole_curb" in all)); });
check("serialization repeatability and fixed schema", () => { const a = interval("0.200000000", "0.800000000"); assert.equal(serializeInterval(a), serializeInterval(interval("0.200000000", "0.800000000"))); assert.equal(serializeInterval(a), `{"component_index":0,"curb_version_id":"${version}","from_fraction":"0.200000000","geometry_sha256":"${a.geometry_sha256}","measurement_model":"sf-curb-planar-um-v1","to_fraction":"0.800000000"}`); });
check("coordinate change affects measurements", () => assert.notEqual(lineLengthMeters(straight), lineLengthMeters(line([0, 0], [101, 0]))));
check("projection bounds make conditional interval", () => { const r = boundInterval(point(20, 1), point(80, 1)); assert.equal(r.status, "VALID_INTERVAL"); if (r.status === "VALID_INTERVAL") { assert.equal(r.interval.from_fraction, "0.200000000"); assert.equal(r.interval.to_fraction, "0.800000000"); } });
check("reversed bound order recorded; source geometry unchanged", () => { const r = boundInterval(point(80, 1), point(20, 1)); assert.equal(r.status, "VALID_INTERVAL"); if (r.status === "VALID_INTERVAL") { assert(r.bounds_reversed); assert.equal(r.interval.from_fraction, "0.200000000"); } });
check("collapsed projected bounds rejected", () => assert.equal(boundInterval(point(20, 1), point(20, -1)).status, "INVALID"));
check("distinct bounds collapsing at fraction scale rejected", () => { const g = line([0, 0], [5000, 0]); assert.equal(boundInterval(point(20, 0), point(20.000001, 0), evidence, g).status, "INVALID"); });
check("bounds alone, loops, crossings and uncertainty stay ambiguous", () => { for (const kind of ["BOUNDS_ONLY", "MULTIPLE_CROSSINGS", "LOOP_OR_DISCONNECTED", "UNCERTAIN"] as const) assert.equal(boundInterval(point(20, 0), point(80, 0), { ...evidence, kind }).status, "AMBIGUOUS"); });
check("longer source clamping cannot manufacture whole-curb scope", () => assert.equal(boundInterval(point(-1, 0), point(101, 0)).status, "AMBIGUOUS"));
check("distance policy and missing evidence gate construction", () => { assert.equal(boundInterval(point(20, 3), point(80, 3)).status, "AMBIGUOUS"); assert.equal(boundInterval(point(20, 0), point(80, 0), { ...evidence, evidence_reference: "" }).status, "AMBIGUOUS"); });
check("one tied bound makes whole construction ambiguous", () => { const g = line([0, 0], [10, 0], [10, 10], [0, 10]); assert.equal(boundInterval(point(5, 5), point(1, 0), evidence, g).status, "AMBIGUOUS"); });
check("self-intersection projections retain multiple chainages", () => assert.equal(projectPointOntoLine(line([0, 0], [10, 10], [0, 10], [10, 0]), point(5, 5)).status, "AMBIGUOUS"));
check("closed-line endpoint cannot choose start over end", () => assert.equal(projectPointOntoLine(line([0, 0], [10, 0], [10, 10], [0, 0]), point(0, 0)).status, "AMBIGUOUS"));
check("stale version or forged projection rejected", () => { const a = projectPointOntoLine(straight, point(20, 0)), b = projectPointOntoLine(straight, point(80, 0)); assert.equal(intervalFromProjectedBounds(bent, reference(bent), a, b, evidence).status, "INVALID"); if (a.status !== "INVALID") { const forged = { ...a, candidates: a.candidates.map(c => ({ ...c, fraction: "0.100000000" })) }; assert.equal(intervalFromProjectedBounds(straight, reference(straight), forged, b, evidence).status, "INVALID"); } });
check("two disjoint intervals remain separate", () => { const rows = [{ regulation_id: "R", interval: interval("0.100000000", "0.200000000") }, { regulation_id: "R", interval: interval("0.400000000", "0.500000000") }]; const result = checkIntervalSet(rows, "PUBLISHED"); assert.equal(result.status, "VALID_INTERVAL_SET"); assert.deepEqual(result.intervals, rows); });
check("adjacent intervals allowed without merging", () => { const result = checkIntervalSet([{ regulation_id: "R", interval: interval("0.000000000", "0.500000000") }, { regulation_id: "R", interval: interval("0.500000000", "1.000000000") }], "PUBLISHED"); assert.equal(result.status, "VALID_INTERVAL_SET"); assert.equal(result.intervals.length, 2); });
check("duplicates and overlap block publication; candidates retained", () => { const a = { regulation_id: "R", interval: interval("0.100000000", "0.600000000") }; const b = { regulation_id: "R", interval: interval("0.400000000", "0.800000000") }; assert.equal(checkIntervalSet([a, b], "CANDIDATE").status, "AMBIGUOUS"); assert.equal(checkIntervalSet([a, b], "PUBLISHED").status, "INVALID"); assert.equal(checkIntervalSet([a, a], "PUBLISHED").conflicts[0].kind, "DUPLICATE"); });
check("stacked regulations on the same interval allowed", () => assert.equal(checkIntervalSet([{ regulation_id: "R1", interval: interval("0.100000000", "0.600000000") }, { regulation_id: "R2", interval: interval("0.100000000", "0.600000000") }], "PUBLISHED").status, "VALID_INTERVAL_SET"));
check("multiple curb versions kept distinct", () => { const other = { ...reference(straight), curb_version_id: "00000000-0000-4000-8000-000000000002" }; assert.equal(checkIntervalSet([{ regulation_id: "R", interval: interval("0.100000000", "0.600000000") }, { regulation_id: "R", interval: interval("0.100000000", "0.600000000", other) }], "PUBLISHED").status, "VALID_INTERVAL_SET"); assert.notEqual(intervalDigest(interval("0.100000000", "0.600000000")), intervalDigest(interval("0.100000000", "0.600000000", other))); });
check("one UUID cannot claim different geometry digests", () => assert.equal(checkIntervalSet([{ regulation_id: "R1", interval: interval("0.100000000", "0.600000000") }, { regulation_id: "R2", interval: interval("0.100000000", "0.600000000", reference(bent)) }], "PUBLISHED").status, "INVALID"));
console.log(`Curb interval contract: ${checks} checks passed; zero network/database access, no files written.`);

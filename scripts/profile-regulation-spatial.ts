/**
 * Read-only spatial DESIGN diagnostics; never an association implementation.
 * Public DataSF GETs only. No Supabase, env, filesystem writes, exported matcher,
 * target selection, database UUIDs, or runtime imports. Output is aggregate evidence
 * plus bounded examples. Thresholds are experiments, NOT acceptance criteria.
 * Run: pnpm.cmd exec tsx scripts/profile-regulation-spatial.ts
 */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { fetchDataSfJson } from "./fetch-datasf-json";

type Row = Record<string, unknown>;
type Point = [number, number];
type Segment = [Point, Point];
type Box = [number, number, number, number];
interface Feature {
  row: Row; id: string; type: string; parts: Point[][]; polygons: Point[][][];
  segments: Segment[]; box: Box; length: number; fingerprint: string;
}
const DATASETS = {
  regulations: "hi6h-neyh", blocks: "27b3-yjjx", meters: "8vzz-qzz9",
  meteredFaces: "mk27-a5x2", curbs: "pep9-66vw",
} as const;
type Dataset = keyof typeof DATASETS;
const ID_FIELDS: Record<Dataset, string> = {
  regulations: "objectid", blocks: "block_id", meters: "post_id",
  meteredFaces: "blockface_id", curbs: "globalid",
};
const RAD = Math.PI / 180;
const R = 6_371_008.8;
const ORIGIN: Point = [-122.44, 37.77];
const SPACING = 5; // Approximate metre lengths in a fixed local equirectangular frame.
const THRESHOLDS = [3, 10, 25];
const log = (message: string) => console.log(`[spatial-profile] ${message}`);
const emit = (name: string, value: unknown) => console.log(`${name} ${JSON.stringify(value)}`);
const str = (value: unknown) => value == null ? "" : String(value);
const round = (value: number) => Number(value.toFixed(3));
const distance = (a: Point, b: Point) => Math.hypot(a[0] - b[0], a[1] - b[1]);
const project = (p: Point): Point => [(p[0] - ORIGIN[0]) * RAD * R * Math.cos(ORIGIN[1] * RAD), (p[1] - ORIGIN[1]) * RAD * R];
const hash = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
function pointSegment(p: Point, [a, b]: Segment): number {
  const dx = b[0] - a[0], dy = b[1] - a[1];
  const t = dx || dy ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / (dx * dx + dy * dy))) : 0;
  return distance(p, [a[0] + t * dx, a[1] + t * dy]);
}
function cross(a: Point, b: Point, c: Point): number {
  return (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
}
function segmentDistance(a: Segment, b: Segment): number {
  const ab1 = cross(a[0], a[1], b[0]), ab2 = cross(a[0], a[1], b[1]);
  const ba1 = cross(b[0], b[1], a[0]), ba2 = cross(b[0], b[1], a[1]);
  if (ab1 * ab2 < 0 && ba1 * ba2 < 0) return 0;
  return Math.min(pointSegment(a[0], b), pointSegment(a[1], b), pointSegment(b[0], a), pointSegment(b[1], a));
}
function lineDistance(a: Feature, b: Feature): number {
  let best = Infinity;
  for (const x of a.segments) for (const y of b.segments) best = Math.min(best, segmentDistance(x, y));
  return best;
}
function pointLine(p: Point, f: Feature): number {
  let best = Infinity;
  for (const segment of f.segments) best = Math.min(best, pointSegment(p, segment));
  return best;
}
function near(a: Box, b: Box, pad: number): boolean {
  return a[0] <= b[2] + pad && a[2] + pad >= b[0] && a[1] <= b[3] + pad && a[3] + pad >= b[1];
}
function inRing(p: Point, ring: Point[]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i], b = ring[j];
    if (pointSegment(p, [a, b]) < 1e-7) return true;
    if ((a[1] > p[1]) !== (b[1] > p[1]) && p[0] < (b[0] - a[0]) * (p[1] - a[1]) / (b[1] - a[1]) + a[0]) inside = !inside;
  }
  return inside;
}
function inPolygon(p: Point, f: Feature): boolean {
  return f.polygons.some(rings => inRing(p, rings[0]) && !rings.slice(1).some(ring => inRing(p, ring)));
}
// Midpoints of <=5 m subsegments, weighted by represented length. This is a
// buffered-overlap estimate, not a topological intersection length.
const sampleCache = new WeakMap<Feature, { point: Point; weight: number }[]>();
function samples(f: Feature) {
  let result = sampleCache.get(f);
  if (result) return result;
  result = [];
  for (const [a, b] of f.segments) {
    const length = distance(a, b), n = Math.max(1, Math.ceil(length / SPACING));
    for (let i = 0; i < n; i++) result.push({ point: [a[0] + (b[0] - a[0]) * (i + 0.5) / n, a[1] + (b[1] - a[1]) * (i + 0.5) / n] as Point, weight: length / n });
  }
  sampleCache.set(f, result);
  return result;
}
function coverage(a: Feature, b: Feature, tolerance: number): number {
  return a.length ? samples(a).reduce((sum, s) => sum + (pointLine(s.point, b) <= tolerance ? s.weight : 0), 0) / a.length : 0;
}
function directedDistance(a: Feature, b: Feature): number {
  return Math.max(...samples(a).map(s => pointLine(s.point, b)), ...a.parts.flat().map(p => pointLine(p, b)));
}
function endpoints(a: Feature, b: Feature): number | null {
  if (a.parts.length !== 1 || b.parts.length !== 1) return null;
  const x = a.parts[0], y = b.parts[0];
  return Math.min(Math.max(distance(x[0], y[0]), distance(x.at(-1)!, y.at(-1)!)), Math.max(distance(x[0], y.at(-1)!), distance(x.at(-1)!, y[0])));
}
function summarize(values: number[]) {
  const sorted = values.filter(Number.isFinite).sort((a, b) => a - b);
  const q = (p: number) => sorted.length ? round(sorted[Math.floor((sorted.length - 1) * p)]) : null;
  return { min: q(0), p10: q(.1), median: q(.5), p90: q(.9), p99: q(.99), max: q(1) };
}
function frequencies(values: string[]) {
  const map = new Map<string, number>();
  for (const value of values) map.set(value, (map.get(value) ?? 0) + 1);
  return Object.fromEntries([...map].sort((a, b) => b[1] - a[1]).slice(0, 16));
}
function groupBy<T>(values: T[], key: (value: T) => string): Map<string, T[]> {
  const map = new Map<string, T[]>();
  for (const value of values) { const k = key(value); const bucket = map.get(k) ?? []; bucket.push(value); map.set(k, bucket); }
  return map;
}
function feature(row: Row, index: number, dataset: Dataset): Feature | null {
  const shape = (row.shape ?? row.the_geom) as { type?: string; coordinates?: unknown } | undefined;
  if (!shape?.type || !shape.coordinates) return null;
  let geographic: Point[][], polygons: Point[][][] = [];
  switch (shape.type) {
    case "Point": geographic = [[shape.coordinates as Point]]; break;
    case "LineString": geographic = [shape.coordinates as Point[]]; break;
    case "MultiLineString": geographic = shape.coordinates as Point[][]; break;
    case "Polygon": polygons = [shape.coordinates as Point[][]]; geographic = polygons.flat(); break;
    case "MultiPolygon": polygons = shape.coordinates as Point[][][]; geographic = polygons.flat(); break;
    default: throw new Error(`Unsupported geometry type ${shape.type}`);
  }
  const vertices = geographic.flat();
  if (!vertices.length || vertices.some(p => !Array.isArray(p) || !Number.isFinite(p[0]) || !Number.isFinite(p[1]) || p[0] < -123 || p[0] > -122 || p[1] < 37 || p[1] > 38.5)) return null;
  if (shape.type !== "Point" && geographic.some(part => part.length < 2)) return null;
  const canonical = geographic.map(part => [JSON.stringify(part), JSON.stringify([...part].reverse())].sort()[0]).sort();
  const parts = geographic.map(part => part.map(project));
  const flat = parts.flat();
  const segments = parts.flatMap(part => part.slice(1).map((p, i) => [part[i], p] as Segment));
  return { row, id: str(row[ID_FIELDS[dataset]]) || `diagnostic-row-${index}`, type: shape.type, parts, polygons: polygons.map(poly => poly.map(ring => ring.map(project))), segments,
    box: [Math.min(...flat.map(p => p[0])), Math.min(...flat.map(p => p[1])), Math.max(...flat.map(p => p[0])), Math.max(...flat.map(p => p[1]))],
    length: segments.reduce((sum, s) => sum + distance(...s), 0), fingerprint: hash(canonical) };
}
async function fetchDataset(dataset: Dataset): Promise<Feature[]> {
  const id = DATASETS[dataset];
  const meta = await fetchDataSfJson(`https://data.sfgov.org/api/views/${id}.json`, log) as { name: string; rowsUpdatedAt?: number; columns: { fieldName: string; dataTypeName: string; description?: string }[] };
  const rows: Row[] = [];
  let complete = false;
  for (let offset = 0; offset < 100_000;) {
    const url = new URL(`https://data.sfgov.org/resource/${id}.json`);
    url.searchParams.set("$limit", "1000"); url.searchParams.set("$offset", String(offset));
    const page = await fetchDataSfJson(url.toString(), log);
    if (!Array.isArray(page)) throw new Error(`${id}: expected array`);
    rows.push(...page);
    if (offset % 5000 === 0 || page.length < 1000) log(`${id} offset=${offset} fetched=${rows.length}`);
    if (page.length < 1000) { complete = true; break; }
    offset += page.length;
    await new Promise(resolve => setTimeout(resolve, 400));
  }
  if (!complete) throw new Error(`${id}: safety cap, incomplete source`);
  const endMeta = await fetchDataSfJson(`https://data.sfgov.org/api/views/${id}.json`, log) as typeof meta;
  if (endMeta.rowsUpdatedAt !== meta.rowsUpdatedAt) throw new Error(`${id}: upstream changed during pagination`);
  const features = rows.map((row, index) => feature(row, index, dataset)).filter((f): f is Feature => f !== null);
  const duplicateIds = [...groupBy(features, f => f.id).values()].filter(group => group.length > 1);
  const unique = [...groupBy(features, f => `${f.id}:${f.fingerprint}`).values()].map(group => group[0]);
  emit(`SOURCE_${dataset}`, { dataset: id, rows: rows.length, validGeometryRows: features.length, missingOrInvalidGeometry: rows.length - features.length,
    distinctIds: new Set(features.map(f => f.id)).size, duplicateIdGroups: duplicateIds.length,
    conflictingGeometryIdGroups: duplicateIds.filter(group => new Set(group.map(f => f.fingerprint)).size > 1).length,
    distinctIdGeometryPairs: unique.length, types: frequencies(features.map(f => f.type)), components: frequencies(features.map(f => String(f.parts.length))),
    lengthOrPerimeterMeters: summarize(features.map(f => f.length)), rowsUpdatedAt: meta.rowsUpdatedAt,
    geometryFields: meta.columns.filter(c => ["shape", "the_geom", "location"].includes(c.fieldName)),
    sideFields: meta.columns.filter(c => /orientation|parity|side|addr|cnn|street_name|street_nam|blockface|sfpark|globalid/.test(c.fieldName)),
    sideValues: Object.fromEntries(["blockface_orientation", "str_num_parity", "str_seg_orientation", "orientation", "parity_digit_position"].map(key => [key, frequencies(rows.map(row => str(row[key]) || "<missing>"))])),
    coordinateBounds: features.length ? {
      minLongitude: round(Math.min(...features.map(f => f.box[0])) / (RAD * R * Math.cos(ORIGIN[1] * RAD)) + ORIGIN[0]),
      maxLongitude: round(Math.max(...features.map(f => f.box[2])) / (RAD * R * Math.cos(ORIGIN[1] * RAD)) + ORIGIN[0]),
      minLatitude: round(Math.min(...features.map(f => f.box[1])) / (RAD * R) + ORIGIN[1]),
      maxLatitude: round(Math.max(...features.map(f => f.box[3])) / (RAD * R) + ORIGIN[1]),
    } : null,
    identityGeometryDigest: hash(unique.map(f => `${f.id}:${f.fingerprint}`).sort()),
  });
  return unique;
}
type Tally = { zero: number; one: number; multiple: number };
const tally = (): Tally => ({ zero: 0, one: 0, multiple: 0 });
function record(t: Tally, count: number) { t[count === 0 ? "zero" : count === 1 ? "one" : "multiple"] += 1; }
function exactProfile(regs: Feature[], targets: Feature[], name: string) {
  const groups = groupBy(targets, f => f.fingerprint), counts = tally();
  for (const reg of regs) record(counts, groups.get(reg.fingerprint)?.length ?? 0);
  emit(`EXACT_${name}`, { denominator: regs.length, ...counts });
}
function lineProfile(regs: Feature[], targets: Feature[], name: string) {
  const counts: Record<string, Tally> = {};
  for (const d of THRESHOLDS) { counts[`within${d}m`] = tally(); counts[`coverage80pctWithin${d}m`] = tally(); }
  counts.hausdorff5m = tally(); counts.endpoints5m = tally(); counts.intersects = tally();
  let cornerLikePairs = 0, oppositeSideCandidateCases = 0;
  const examples: unknown[] = [], directed: number[] = [];
  for (const reg of regs) {
    const nearby = targets.filter(t => t !== reg && near(reg.box, t.box, 25));
    const pairs = nearby.map(t => ({ t, min: lineDistance(reg, t), coverage: THRESHOLDS.map(d => coverage(reg, t, d)) }));
    for (const d of THRESHOLDS) {
      record(counts[`within${d}m`], pairs.filter(p => p.min <= d).length);
      record(counts[`coverage80pctWithin${d}m`], pairs.filter(p => p.coverage[THRESHOLDS.indexOf(d)] >= .8).length);
    }
    const close = pairs.filter(p => p.min <= 5);
    const hd = close.map(p => ({ ...p, distance: Math.max(directedDistance(reg, p.t), directedDistance(p.t, reg)) }));
    record(counts.hausdorff5m, hd.filter(p => p.distance <= 5).length);
    record(counts.endpoints5m, close.filter(p => { const d = endpoints(reg, p.t); return d !== null && d <= 5; }).length);
    record(counts.intersects, pairs.filter(p => p.min <= 1e-7).length);
    if (hd.length) directed.push(Math.min(...hd.map(p => p.distance)));
    cornerLikePairs += pairs.filter(p => p.min <= 3 && p.coverage[0] < .2).length;
    const candidates = pairs.filter(p => p.min <= 25);
    if (candidates.some((a, i) => candidates.slice(i + 1).some(b => opposite(a.t, b.t)))) oppositeSideCandidateCases += 1;
    const broad = pairs.filter(p => p.coverage[0] >= .8);
    if (broad.length >= 2 && examples.length < 3) examples.push({ regulation: reg.id, lengthMeters: round(reg.length), targets: broad.slice(0, 4).map(p => ({ id: p.t.id, coverage: round(p.coverage[0]), side: p.t.row.blockface_orientation ?? null })) });
  }
  emit(`SPATIAL_${name}`, { denominator: regs.length, counts, cornerLikePairs, oppositeSideCandidateCases, nearestSampledHausdorffMetersAmongWithin5m: summarize(directed), ambiguousExamples: examples });
}
function polygonProfile(regs: Feature[], blocks: Feature[]) {
  const intersection = tally(), eightyPercentInside = tally(); const examples: unknown[] = [];
  for (const reg of regs) {
    const hits = blocks.filter(b => near(reg.box, b.box, 0) && (lineDistance(reg, b) <= 1e-7 || reg.parts.flat().some(p => inPolygon(p, b))));
    record(intersection, hits.length);
    record(eightyPercentInside, hits.filter(b => reg.length > 0 && samples(reg).reduce((sum, s) => sum + (inPolygon(s.point, b) ? s.weight : 0), 0) / reg.length >= .8).length);
    if (hits.length > 1 && examples.length < 5) examples.push({ regulation: reg.id, lengthMeters: round(reg.length), blockIds: hits.map(b => b.id).slice(0, 8) });
  }
  emit("SPATIAL_blocks", { denominator: regs.length, intersection, eightyPercentInside, multiBlockExamples: examples });
}
function opposite(a: Feature, b: Feature): boolean {
  const pairs: Record<string, string> = { N: "S", S: "N", E: "W", W: "E", NE: "SW", SW: "NE", NW: "SE", SE: "NW" };
  return Boolean(a.row.block_id && a.row.block_id === b.row.block_id && a.row.street_id === b.row.street_id && pairs[str(a.row.blockface_orientation)] === str(b.row.blockface_orientation));
}
function sideProfile(faces: Feature[]) {
  const distances: number[] = [], examples: unknown[] = [];
  for (const group of groupBy(faces, f => str(f.row.block_id)).values()) for (let i = 0; i < group.length; i++) for (const b of group.slice(i + 1)) {
    const a = group[i]; if (!opposite(a, b)) continue;
    const min = lineDistance(a, b); distances.push(min);
    if (min <= 25 && examples.length < 4) examples.push({ block: a.row.block_id, faces: [a.id, b.id], orientation: [a.row.blockface_orientation, b.row.blockface_orientation], parity: [a.row.str_num_parity, b.row.str_num_parity], minimumDistanceMeters: round(min) });
  }
  emit("OPPOSITE_CURBS", { metadataLabelledPairs: distances.length, within10m: distances.filter(d => d <= 10).length, within25m: distances.filter(d => d <= 25).length, distancesMeters: summarize(distances), examples });
}
function meterProfile(regs: Feature[], meters: Feature[]) {
  const eligible = meters.filter(m => m.row.on_offstreet_type === "ON" && ["M", "T"].includes(str(m.row.active_meter_flag)) && m.row.blockface_id && m.row.blockface_id !== "0");
  const counts: Record<string, Tally> = Object.fromEntries(THRESHOLDS.map(d => [`faceGroupsWithin${d}m`, tally()]));
  counts.threeMetersSameFaceWithin3m = tally();
  for (const reg of regs) {
    const nearby = eligible.filter(m => near(reg.box, m.box, 25)).map(m => ({ m, distance: pointLine(m.parts[0][0], reg) }));
    for (const d of THRESHOLDS) record(counts[`faceGroupsWithin${d}m`], new Set(nearby.filter(p => p.distance <= d).map(p => str(p.m.row.blockface_id))).size);
    const groups = groupBy(nearby.filter(p => p.distance <= 3), p => str(p.m.row.blockface_id));
    record(counts.threeMetersSameFaceWithin3m, [...groups.values()].filter(g => new Set(g.map(p => p.m.id)).size >= 3).length);
  }
  emit("SPATIAL_meters", { denominator: regs.length, eligibleActiveOnStreetPoints: eligible.length, counts });
}
function overlaps(regs: Feature[]) {
  const signatures = (f: Feature) => JSON.stringify([f.row.regulation, f.row.days, f.row.hours, f.row.hrlimit, f.row.rpparea1, f.row.rpparea2, f.row.rpparea3]);
  const repeated = [...groupBy(regs, f => f.fingerprint).values()].filter(g => g.length > 1);
  const differentRules = repeated.filter(g => new Set(g.map(signatures)).size > 1);
  emit("REGULATION_GEOMETRY_DUPLICATES", { groups: repeated.length, rows: repeated.reduce((n, g) => n + g.length, 0), maxGroup: Math.max(0, ...repeated.map(g => g.length)), groupsWithDifferentRuleAttributes: differentRules.length, examples: differentRules.slice(0, 3).map(g => g.slice(0, 3).map(f => ({ id: f.id, regulation: f.row.regulation, days: f.row.days, hours: f.row.hours, fid_100: f.row.fid_100 }))) });
  const fidGroups = groupBy(regs.filter(f => f.row.fid_100 && f.row.fid_100 !== "0"), f => str(f.row.fid_100));
  let pairs = 0, exactPairs = 0, overlap80Within3mPairs = 0, separatedOver25mPairs = 0;
  const repeatedFids = [...fidGroups.values()].filter(g => g.length > 1);
  for (const group of repeatedFids) for (let i = 0; i < group.length; i++) for (const b of group.slice(i + 1)) {
    const a = group[i]; pairs += 1;
    if (a.fingerprint === b.fingerprint) exactPairs += 1;
    if (near(a.box, b.box, 3) && Math.max(coverage(a, b, 3), coverage(b, a, 3)) >= .8) overlap80Within3mPairs += 1;
    if (!near(a.box, b.box, 25) || lineDistance(a, b) > 25) separatedOver25mPairs += 1;
  }
  emit("FID_GEOMETRY", { missing: regs.filter(f => !f.row.fid_100).length, zeroSentinelRows: regs.filter(f => f.row.fid_100 === "0").length, repeatedNonzeroGroups: repeatedFids.length, repeatedNonzeroRows: repeatedFids.reduce((n, g) => n + g.length, 0), pairs, exactPairs, overlap80Within3mPairs, separatedOver25mPairs });
}
function selfCheck() {
  assert.equal(pointSegment([5, 3], [[0, 0], [10, 0]]), 3);
  assert.equal(segmentDistance([[0, 0], [10, 10]], [[0, 10], [10, 0]]), 0);
  assert.equal(segmentDistance([[0, 0], [1, 0]], [[2, 0], [3, 0]]), 1);
  assert.equal(segmentDistance([[0, 0], [2, 0]], [[1, 0], [3, 0]]), 0);
  assert.equal(inRing([5, 5], [[0, 0], [10, 0], [10, 10], [0, 10], [0, 0]]), true);
  assert.equal(inRing([15, 5], [[0, 0], [10, 0], [10, 10], [0, 10], [0, 0]]), false);
  const f = feature({ objectid: "test", shape: { type: "LineString", coordinates: [[-122.44, 37.77], [-122.439, 37.77]] } }, 0, "regulations")!;
  assert(Math.abs(samples(f).reduce((n, s) => n + s.weight, 0) - f.length) < 1e-8);
  assert(Math.abs(coverage(f, f, 0.001) - 1) < 1e-8);
  log("diagnostic arithmetic self-checks passed");
}
async function main() {
  selfCheck();
  if (process.argv.includes("--self-check")) return;
  emit("METHOD", { timestamp: new Date().toISOString(), scope: "read-only design; no accepted associations", projection: "local equirectangular", origin: ORIGIN, sampleSpacingMeters: SPACING, thresholdsMeters: THRESHOLDS, pagination: "existing DataSF limit/offset; unchanged rowsUpdatedAt checked; identical ID/geometry duplicates collapsed and reported" });
  const data = {} as Record<Dataset, Feature[]>;
  for (const name of Object.keys(DATASETS) as Dataset[]) data[name] = await fetchDataset(name);
  const regs = [...data.regulations].sort((a, b) => a.id.localeCompare(b.id, "en", { numeric: true }));
  const byLength = [...regs].sort((a, b) => a.length - b.length);
  const sample = [...new Set([
    ...Array.from({ length: Math.min(256, regs.length) }, (_, i) => regs[Math.floor(i * regs.length / Math.min(256, regs.length))]),
    ...byLength.slice(0, 5), ...byLength.slice(-5), ...regs.filter(f => f.parts.length > 1).slice(0, 5),
  ])];
  emit("SAMPLE", { count: sample.length, selection: "256 systematic numeric objectid positions plus shortest/longest five and first five multipart rows; purposive, not random", idsDigest: hash(sample.map(f => f.id).sort()), shortest: byLength.slice(0, 5).map(f => ({ id: f.id, meters: round(f.length) })), longest: byLength.slice(-5).map(f => ({ id: f.id, meters: round(f.length) })), under20m: regs.filter(f => f.length < 20).length, over300m: regs.filter(f => f.length > 300).length });
  overlaps(regs);
  for (const name of ["meteredFaces", "curbs"] as const) { exactProfile(regs, data[name], name); lineProfile(sample, data[name], name); }
  polygonProfile(sample, data.blocks);
  lineProfile(sample, regs, "otherRegulations");
  meterProfile(sample, data.meters);
  sideProfile(data.meteredFaces);
  emit("LONG_SEGMENTS", byLength.slice(-5).map(reg => ({ regulation: reg.id, lengthMeters: round(reg.length), intersectedBlocks: data.blocks.filter(b => near(reg.box, b.box, 0) && (lineDistance(reg, b) <= 1e-7 || reg.parts.flat().some(p => inPolygon(p, b)))).map(b => b.id) })));
  log("Completed. No target chosen; no database connection or writes; CITY readiness unchanged.");
}
main().catch(error => { console.error("[spatial-profile] ERROR:", error instanceof Error ? error.message : String(error)); process.exitCode = 1; });

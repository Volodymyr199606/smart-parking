/**
 * Read-only spatial DESIGN diagnostics; never an association implementation.
 * Public DataSF GETs only. No Supabase, env, filesystem writes, exported matcher,
 * accepted target selection, database UUIDs, or runtime imports. Output is aggregate
 * evidence plus bounded examples. Thresholds are experiments, NOT acceptance criteria.
 * Run: pnpm.cmd exec tsx scripts/profile-regulation-spatial.ts
 * V2 full competition: add --v2; add --evidence for complete pair evidence on stdout.
 * Curb storage research only: --curb-storage (public pep9-66vw, no regulations).
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
const sourceCounts: Partial<Record<Dataset, { rows: number; usable: number }>> = {};
const meaningful = (v: unknown) => v != null && !["", "null", "<null>", "none"].includes(str(v).trim().toLowerCase());
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
  if (process.argv.includes("--curb-storage") && dataset === "curbs") curbStorageProfile(rows, meta);
  const features = rows.map((row, index) => feature(row, index, dataset)).filter((f): f is Feature => f !== null);
  const duplicateIds = [...groupBy(features, f => f.id).values()].filter(group => group.length > 1);
  const unique = [...groupBy(features, f => `${f.id}:${f.fingerprint}`).values()].map(group => group[0]);
  sourceCounts[dataset] = { rows: rows.length, usable: features.length };
  if (process.argv.includes("--v2")) {
    if (duplicateIds.length || unique.some(f => f.id.startsWith("diagnostic-row-"))) throw new Error(`${id}: V2 requires complete unique source identities`);
    emit(`METADATA_${dataset}`, { description: (meta as typeof meta & { description?: string }).description,
      columns: meta.columns.filter(c => !c.fieldName.startsWith(":" )).map(c => ({ field: c.fieldName, type: c.dataTypeName, description: c.description ?? "", populated: rows.filter(r => meaningful(r[c.fieldName])).length })),
      textExamples: Object.fromEntries(["regdetails", "mtab_reso_text", "street_nam", "name", "popupinfo"].map(k => [k, [...new Set(rows.map(r => str(r[k])).filter(meaningful))].slice(0, 4).map(v => v.slice(0, 240))])),
    });
  }
  emit(`SOURCE_${dataset}`, { dataset: id, rows: rows.length, validGeometryRows: features.length, missingOrInvalidGeometry: rows.length - features.length,
    distinctIds: new Set(features.map(f => f.id)).size, duplicateIdGroups: duplicateIds.length,
    conflictingGeometryIdGroups: duplicateIds.filter(group => new Set(group.map(f => f.fingerprint)).size > 1).length,
    distinctIdGeometryPairs: unique.length, types: frequencies(features.map(f => f.type)), components: frequencies(features.map(f => String(f.parts.length))),
    lengthOrPerimeterMeters: summarize(features.map(f => f.length)), rowsUpdatedAt: meta.rowsUpdatedAt,
    geometryFields: meta.columns.filter(c => ["shape", "the_geom", "location"].includes(c.fieldName)).map(c => ({ field: c.fieldName, type: c.dataTypeName, description: c.description })),
    sideFields: meta.columns.filter(c => /orientation|parity|side|addr|cnn|street_name|street_nam|blockface|sfpark|globalid/.test(c.fieldName)).map(c => ({ field: c.fieldName, type: c.dataTypeName, description: c.description })),
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
// V2 remains a research profiler: no accepted associations or runtime exports.
// Grid cells contain complete feature bboxes, including negative coordinates.
class DiagnosticGrid {
  private cells = new Map<string, Feature[]>();
  constructor(features: Feature[], private size = 100) {
    for (const f of features) for (const key of this.keys(f.box, 0)) {
      const bucket = this.cells.get(key) ?? []; bucket.push(f); this.cells.set(key, bucket);
    }
  }
  private *keys(box: Box, pad: number) {
    for (let x = Math.floor((box[0] - pad) / this.size); x <= Math.floor((box[2] + pad) / this.size); x++)
      for (let y = Math.floor((box[1] - pad) / this.size); y <= Math.floor((box[3] + pad) / this.size); y++) yield `${x}:${y}`;
  }
  query(box: Box, pad: number) {
    const found = new Set<Feature>();
    for (const key of this.keys(box, pad)) for (const f of this.cells.get(key) ?? []) if (near(box, f.box, pad)) found.add(f);
    return [...found];
  }
}
const SEARCH = 50; // Complete within this distance in the diagnostic metric only.
function axis(f: Feature): number | null {
  if (f.parts.length !== 1) return null;
  const a = f.parts[0][0], b = f.parts[0].at(-1)!;
  if (distance(a, b) < .01) return null;
  return (Math.atan2(b[1] - a[1], b[0] - a[0]) / RAD + 180) % 180;
}
function angleDifference(a: Feature, b: Feature): number | null {
  const x = axis(a), y = axis(b); if (x === null || y === null) return null;
  const delta = Math.abs(x - y); return Math.min(delta, 180 - delta);
}
function endPoints(f: Feature): Point[] { return f.parts.flatMap(p => [p[0], p.at(-1)!]); }
function endpointGap(a: Feature, b: Feature) { return Math.min(...endPoints(a).flatMap(x => endPoints(b).map(y => distance(x, y)))); }
function longitudinalOverlap(a: Feature, b: Feature): number {
  const theta = axis(a); if (theta === null) return 0;
  const projectAxis = (p: Point) => p[0] * Math.cos(theta * RAD) + p[1] * Math.sin(theta * RAD);
  const x = a.parts.flat().map(projectAxis), y = b.parts.flat().map(projectAxis);
  const loA = Math.min(...x), hiA = Math.max(...x), loB = Math.min(...y), hiB = Math.max(...y);
  const shorter = Math.min(hiA - loA, hiB - loB);
  return shorter > 0 ? Math.max(0, Math.min(hiA, hiB) - Math.max(loA, loB)) / shorter : 0;
}
interface PairEvidence {
  target: Feature; minimum: number; endpoint: number | null; hausdorff: number;
  coverage: number[]; reverseCoverage3: number; ratio: number; angle: number | null;
}
function measurePair(reg: Feature, target: Feature, minimum: number): PairEvidence {
  const ds = samples(reg).map(s => ({ d: pointLine(s.point, target), weight: s.weight }));
  const reverse = samples(target).map(s => ({ d: pointLine(s.point, reg), weight: s.weight }));
  return { target, minimum, endpoint: endpoints(reg, target),
    hausdorff: Math.max(...ds.map(s => s.d), ...reverse.map(s => s.d), ...reg.parts.flat().map(p => pointLine(p, target)), ...target.parts.flat().map(p => pointLine(p, reg))),
    coverage: [3, 5, 10].map(d => reg.length ? ds.reduce((sum, s) => sum + (s.d <= d ? s.weight : 0), 0) / reg.length : 0),
    reverseCoverage3: target.length ? reverse.reduce((sum, s) => sum + (s.d <= 3 ? s.weight : 0), 0) / target.length : 0,
    ratio: target.length ? reg.length / target.length : Infinity, angle: angleDifference(reg, target),
  };
}
function strongGeometry(p: PairEvidence) {
  return p.hausdorff <= 5 && p.endpoint !== null && p.endpoint <= 5 && p.coverage[0] >= .8 && p.reverseCoverage3 >= .8 && p.ratio >= .8 && p.ratio <= 1.25 && p.angle !== null && p.angle <= 10;
}
function pairOutput(p: PairEvidence) {
  return { target: p.target.id, minimumMeters: p.minimum, endpointMeters: p.endpoint, sampledHausdorffMeters: p.hausdorff,
    regulationCoverage3_5_10: p.coverage, targetCoverage3: p.reverseCoverage3, regulationToTargetLength: p.ratio,
    axisDifferenceDegrees: p.angle, strongGeometry: strongGeometry(p), independentCorroboration: "UNVERIFIED" };
}
function textEvidence(f: Feature) {
  const fields = ["regulation", "days", "hours", "hrlimit", "regdetails", "mtab_reso_text", "exceptions", "fid_100", "rpparea1", "rpparea2", "rpparea3", "analysis_neighborhood", "supervisor_district", "name", "popupinfo", "street_nam", "sfpark_id", "cnn_id", "blockface_", "street_name", "blockface_orientation", "str_num_parity", "str_seg_orientation", "fm_addr_no", "to_addr_no"];
  return Object.fromEntries(fields.filter(k => meaningful(f.row[k])).map(k => [k, str(f.row[k]).slice(0, 600)]));
}
function geographicEndpoints(f: Feature) {
  return endPoints(f).map(p => [round(p[0] / (RAD * R * Math.cos(ORIGIN[1] * RAD)) * 1e5) / 1e5 + ORIGIN[0], round(p[1] / (RAD * R) * 1e5) / 1e5 + ORIGIN[1]]);
}
interface RowEvidence {
  reg: Feature; pairs: PairEvidence[]; strong: PairEvidence[]; marginPass: boolean; gap: number | null;
  parallel: string[]; labelledOpposite: string[]; corner: boolean; multiCurb: boolean; fragments: string[];
  geometryScreen: boolean;
}
function fullCompetition(regs: Feature[], curbs: Feature[], faces: Feature[]) {
  const grid = new DiagnosticGrid(curbs), faceIds = groupBy(faces, f => str(f.row.blockface_id));
  const counts = Object.fromEntries(["within3m", "within5m", "within10m", "within25m", "within50m", "coverage80Within3m", "coverage80Within5m", "coverage80Within10m", "hausdorff5m", "endpoints5m", "strongGeometry"].map(k => [k, tally()]));
  const rows: RowEvidence[] = [];
  let prefilteredPairs = 0, measuredPairs = 0;
  // Independent brute-force bbox comparison guards against omitted grid candidates.
  for (const reg of regs.filter((_, i) => i % 97 === 0)) assert.deepEqual(grid.query(reg.box, SEARCH).map(f => f.id).sort(), curbs.filter(f => near(reg.box, f.box, SEARCH)).map(f => f.id).sort());
  for (const [index, reg] of regs.entries()) {
    const prefilter = grid.query(reg.box, SEARCH); prefilteredPairs += prefilter.length;
    const pairs = prefilter.map(target => ({ target, minimum: lineDistance(reg, target) })).filter(p => p.minimum <= SEARCH)
      .map(p => measurePair(reg, p.target, p.minimum)).sort((a, b) => a.hausdorff - b.hausdorff || a.target.id.localeCompare(b.target.id));
    measuredPairs += pairs.length;
    for (const d of [3, 5, 10, 25, 50]) record(counts[`within${d}m`], pairs.filter(p => p.minimum <= d).length);
    for (const [i, d] of [3, 5, 10].entries()) record(counts[`coverage80Within${d}m`], pairs.filter(p => p.coverage[i] >= .8).length);
    record(counts.hausdorff5m, pairs.filter(p => p.hausdorff <= 5).length);
    record(counts.endpoints5m, pairs.filter(p => p.endpoint !== null && p.endpoint <= 5).length);
    const strong = pairs.filter(strongGeometry); record(counts.strongGeometry, strong.length);
    const [best, second] = pairs;
    // Missing second is right-censored: excluded targets have min distance >50m,
    // hence Hausdorff >50m. Do not report Infinity as a measured second distance.
    const gap = best && second ? second.hausdorff - best.hausdorff : null;
    const marginPass = Boolean(best && (second?.hausdorff ?? SEARCH) >= 15 && (second?.hausdorff ?? SEARCH) - best.hausdorff >= 10);
    const parallel: string[] = [], labelledOpposite: string[] = [];
    if (best) for (const other of pairs.slice(1)) {
      const theta = angleDifference(best.target, other.target), separation = lineDistance(best.target, other.target);
      if (theta !== null && theta <= 15 && separation >= 3 && separation <= 30 && longitudinalOverlap(best.target, other.target) >= .5) parallel.push(other.target.id);
      const a = faceIds.get(str(best.target.row.sfpark_id)), b = faceIds.get(str(other.target.row.sfpark_id));
      if (a?.length === 1 && b?.length === 1 && opposite(a[0], b[0]) && separation <= 30) labelledOpposite.push(other.target.id);
    }
    // Endpoint-junction proxy, not authoritative intersection topology.
    const corner = endPoints(reg).some(endpoint => {
      const touching = pairs.filter(p => endPoints(p.target).some(e => distance(e, endpoint) <= 10));
      return touching.some((a, i) => touching.slice(i + 1).some(b => { const theta = angleDifference(a.target, b.target); return theta !== null && theta >= 25 && endpointGap(a.target, b.target) <= 10; }));
    });
    const fragments = pairs.filter(p => p.coverage[0] >= .1 && p.coverage[0] < .8 && p.reverseCoverage3 >= .8 && p.ratio > 1.1 && p.angle !== null && p.angle <= 20);
    const unionCoverage = fragments.length >= 2 && reg.length > 0 ? samples(reg).reduce((sum, s) => sum + (fragments.some(p => pointLine(s.point, p.target) <= 3) ? s.weight : 0), 0) / reg.length : 0;
    const multiCurb = fragments.length >= 2 && unionCoverage >= .8 && fragments.some((a, i) => fragments.slice(i + 1).some(b => endpointGap(a.target, b.target) <= 10));
    const geometryScreen = strong.length === 1 && strong[0] === best && marginPass && !parallel.length && !labelledOpposite.length && !corner && !multiCurb && reg.length >= 20 && reg.length <= 300;
    const row = { reg, pairs, strong, marginPass, gap, parallel, labelledOpposite, corner, multiCurb, fragments: fragments.map(p => p.target.id), geometryScreen };
    rows.push(row);
    if (process.argv.includes("--evidence")) emit("V2_ROW", { regulation: reg.id, geometryDigest: reg.fingerprint, regulationLengthMeters: reg.length, metadata: textEvidence(reg),
      candidates: pairs.map(pairOutput), secondBestGapMeters: gap, secondBestLowerBoundMetersIfAbsent: best && !second ? SEARCH : null,
      parallelCompetitors: parallel, labelledOppositeCompetitors: labelledOpposite, cornerProxy: corner, fragmentCandidates: row.fragments, fragmentUnionCoverage3: unionCoverage,
      multiCurbProxy: multiCurb, geometryScreen, independentCorroboration: "UNVERIFIED", acceptedAssociation: null });
    if (index % 1000 === 0) log(`V2 regulations=${index + 1}/${regs.length} measuredPairs=${measuredPairs}`);
  }
  const bestRows = rows.filter(r => r.pairs.length), strongRows = rows.filter(r => r.strong.length > 0);
  const count = (predicate: (r: RowEvidence) => boolean) => rows.filter(predicate).length;
  const hasNarrativeSide = (r: RowEvidence) => /\b(north|south|east|west|northeast|northwest|southeast|southwest)\s+side\b/i.test(`${str(r.reg.row.regdetails)} ${str(r.reg.row.mtab_reso_text)}`);
  const strict = count(r => r.geometryScreen);
  // No raw geometry measurement here supplies independent side/extent truth.
  const unmatched = count(r => r.pairs.length === 0), ambiguous = regs.length - unmatched;
  emit("V2_SUMMARY", { denominator: regs.length, sourceRows: sourceCounts.regulations?.rows, excludedGeometry: (sourceCounts.regulations?.rows ?? 0) - regs.length,
    curbs: curbs.length, meteredFaces: faces.length, naivePairs: regs.length * curbs.length, prefilteredPairs, measuredPairs, searchMeters: SEARCH, gridMeters: 100,
    counts, bestHausdorff: summarize(bestRows.map(r => r.pairs[0].hausdorff)), secondHausdorff: summarize(rows.filter(r => r.pairs[1]).map(r => r.pairs[1].hausdorff)),
    secondBestGap: summarize(rows.flatMap(r => r.gap === null ? [] : [r.gap])), strongSecondBestGap: summarize(strongRows.flatMap(r => r.gap === null ? [] : [r.gap])),
    absentSecond: count(r => r.pairs.length === 1), marginPass: count(r => r.marginPass), strongMarginPass: strongRows.filter(r => r.marginPass).length,
    gapUnder2m: count(r => r.gap !== null && r.gap < 2), strongGapUnder2m: strongRows.filter(r => r.gap !== null && r.gap < 2).length,
    parallelCases: count(r => r.parallel.length > 0), strongParallelCases: strongRows.filter(r => r.parallel.length > 0).length,
    labelledOppositeCases: count(r => r.labelledOpposite.length > 0), strongLabelledOppositeCases: strongRows.filter(r => r.labelledOpposite.length > 0).length,
    cornerCases: count(r => r.corner), strongCornerCases: strongRows.filter(r => r.corner).length,
    bestLengthRatio: summarize(bestRows.map(r => r.pairs[0].ratio)), bestRegLessThanHalfCurb: count(r => Boolean(r.pairs[0] && r.pairs[0].ratio < .5)), bestRegMoreThanTwiceCurb: count(r => Boolean(r.pairs[0] && r.pairs[0].ratio > 2)),
    multiCurbCases: count(r => r.multiCurb), shortUnder20m: count(r => r.reg.length < 20), longOver300m: count(r => r.reg.length > 300),
    narrativeSideRows: count(hasNarrativeSide), strongNarrativeSideRows: strongRows.filter(hasNarrativeSide).length,
    geometryScreenOnly: strict, potentialVerifiedWithCurrentIndependentEvidence: 0,
    classification: { VERIFIED_UNIQUE_SPATIAL: 0, AMBIGUOUS: ambiguous, UNMATCHED: unmatched },
    percentagesOfUsable: { VERIFIED_UNIQUE_SPATIAL: 0, AMBIGUOUS: round(ambiguous / regs.length * 100), UNMATCHED: round(unmatched / regs.length * 100), geometryScreenOnly: round(strict / regs.length * 100) },
    note: "UNMATCHED means no candidate within 50m; geometric screen is not verified; source side/extent remains unverified even for narrative rows" });

  const exactGroups = [...groupBy(rows, r => r.reg.fingerprint).values()].filter(g => g.length > 1);
  const sameBest = (g: RowEvidence[]) => g.every(r => r.pairs[0]) && new Set(g.map(r => r.pairs[0].target.id)).size === 1;
  const regGrid = new DiagnosticGrid(regs), rowMap = new Map(rows.map(r => [r.reg, r]));
  let nearPairs = 0, nearSameBest = 0;
  for (const reg of regs) for (const other of regGrid.query(reg.box, 2)) {
    if (reg.id.localeCompare(other.id) >= 0 || reg.fingerprint === other.fingerprint || lineDistance(reg, other) > 2) continue;
    const p = measurePair(reg, other, 0);
    if (p.hausdorff <= 2) { nearPairs++; if (sameBest([rowMap.get(reg)!, rowMap.get(other)!])) nearSameBest++; }
  }
  const bestGroups = [...groupBy(bestRows, r => r.pairs[0].target.id).values()].filter(g => g.length > 1);
  emit("V2_STACKED", { exactGeometryGroups: exactGroups.length, exactRows: exactGroups.reduce((n, g) => n + g.length, 0), exactGroupsSameDiagnosticBest: exactGroups.filter(sameBest).length,
    nearNonExactPairsHausdorff2m: nearPairs, nearPairsSameDiagnosticBest: nearSameBest, curbsWithMultipleDiagnosticBestRegulations: bestGroups.length,
    examples: exactGroups.slice(0, 3).map(g => ({ regulations: g.map(r => r.reg.id), bestCurbs: g.map(r => r.pairs[0]?.target.id ?? null), rules: g.map(r => textEvidence(r.reg)) })) });

  const stacked = new Set(exactGroups.flatMap(g => g.map(r => r.reg.id)));
  const ordered = [...rows].sort((a, b) => Number(Boolean(b.strong.length)) - Number(Boolean(a.strong.length)) || (a.pairs[0]?.hausdorff ?? Infinity) - (b.pairs[0]?.hausdorff ?? Infinity) || a.reg.id.localeCompare(b.reg.id));
  const categories: [string, (r: RowEvidence) => boolean][] = [
    ["downtown-neighborhood-proxy", r => /Financial District|Tenderloin|South of Market/.test(str(r.reg.row.analysis_neighborhood))],
    ["residential-area-proxy", r => /Sunset|Richmond|West of Twin Peaks/.test(str(r.reg.row.analysis_neighborhood))],
    ["angled", r => { const a = axis(r.reg); return a !== null && Math.min(a, Math.abs(a - 90), 180 - a) >= 20; }],
    ["short", r => r.reg.length < 20], ["long", r => r.reg.length > 300], ["corner-proxy", r => r.corner],
    ["opposite-curb-proxy", r => r.parallel.length > 0 || r.labelledOpposite.length > 0], ["stacked", r => stacked.has(r.reg.id)],
    ["narrative-side", hasNarrativeSide], ["multi-curb-proxy", r => r.multiCurb],
  ];
  for (const [category, predicate] of categories) {
    const selected = ordered.filter(predicate).slice(0, 2);
    emit("V2_MANUAL_SAMPLE", { category, available: rows.filter(predicate).length, cases: selected.map(r => ({ regulation: r.reg.id,
      regulationMetadata: textEvidence(r.reg), regulationEndpointsLonLat: geographicEndpoints(r.reg), lengthMeters: r.reg.length, axisDegrees: axis(r.reg),
      candidateCount: r.pairs.length, candidateIds: r.pairs.map(p => p.target.id), gapMeters: r.gap, parallelIds: r.parallel, labelledOppositeIds: r.labelledOpposite,
      cornerProxy: r.corner, multiCurbProxy: r.multiCurb, geometryScreenOnly: r.geometryScreen, humanValidated: false,
      topCandidates: r.pairs.slice(0, 3).map(p => ({ ...pairOutput(p), metadata: textEvidence(p.target), endpointsLonLat: geographicEndpoints(p.target),
        meterFaceMetadata: (faceIds.get(str(p.target.row.sfpark_id)) ?? []).slice(0, 2).map(textEvidence) })) })) });
  }
}
function curbGeometryIssue(value: unknown): "missing" | "malformed" | "unsupported" | null {
  if (value == null) return "missing";
  if (typeof value !== "object" || Array.isArray(value)) return "malformed";
  const g = value as { type?: unknown; coordinates?: unknown };
  if (g.type !== "LineString" && g.type !== "MultiLineString") return "unsupported";
  const parts = g.type === "LineString" ? [g.coordinates] : g.coordinates;
  if (!Array.isArray(parts) || !parts.length || parts.some(part => !Array.isArray(part) || part.length < 2 || part.some(p =>
    !Array.isArray(p) || p.length < 2 || !p.every(v => typeof v === "number" && Number.isFinite(v)) || p[0] < -180 || p[0] > 180 || p[1] < -90 || p[1] > 90))) return "malformed";
  return null;
}
function curbStorageProfile(rows: Row[], metadata: unknown) {
  const meta = metadata as { createdAt?: number; rowsUpdatedAt?: number; viewLastModified?: number; publicationDate?: number; description?: string; columns: { fieldName: string; dataTypeName: string; description?: string }[] };
  const columns = meta.columns.filter(c => !c.fieldName.startsWith(":" )).map(c => ({ field: c.fieldName, type: c.dataTypeName, description: c.description ?? "" }));
  emit("CURB_METADATA", { createdAt: meta.createdAt, rowsUpdatedAt: meta.rowsUpdatedAt, viewLastModified: meta.viewLastModified, publicationDate: meta.publicationDate,
    description: meta.description, columns, rowDateFields: columns.filter(c => /date|time|updated|created|modified|version/.test(c.field) || /date|time/.test(c.type)),
    schemaDescriptorDiagnosticDigest: hash(columns) });
  for (const key of ["globalid", "objectid", "id", "name", "sfpark_id", "blockface_", "cnn_id"]) {
    const missing = rows.filter(r => r[key] == null).length;
    const values = rows.map(r => str(r[key])).filter(meaningful);
    const groups = [...groupBy(values, v => v).entries()], repeated = groups.filter(([, g]) => g.length > 1);
    emit("CURB_IDENTITY", { field: key, total: rows.length, missingOrNull: missing, blankOrNullPlaceholder: rows.length - missing - values.length,
      meaningful: values.length, distinct: groups.length, duplicateGroups: repeated.length, rowsInDuplicateGroups: repeated.reduce((n, [, g]) => n + g.length, 0),
      extraDuplicateRows: values.length - groups.length, examples: repeated.slice(0, 4).map(([value, g]) => ({ value, rows: g.length })) });
  }
  const issues = rows.map(r => curbGeometryIssue(r.shape));
  const syntacticallyUsable = rows.filter((_, i) => issues[i] === null);
  const features = syntacticallyUsable.map((r, i) => feature(r, i, "curbs")).filter((f): f is Feature => f !== null);
  const exactOrdered = [...groupBy(features, f => hash(f.row.shape)).values()].filter(g => g.length > 1);
  const reverseEqual = [...groupBy(features, f => f.fingerprint).values()].filter(g => g.length > 1);
  const grid = new DiagnosticGrid(features), nearIds = new Set<string>();
  let bboxPairs = 0, measuredPairs = 0, nearPairs = 0, nearQuarterMeter = 0;
  const nearExamples: unknown[] = [];
  for (const [i, a] of features.entries()) {
    if (i % 997 === 0) assert.deepEqual(grid.query(a.box, 2).map(f => f.id).sort(), features.filter(f => near(a.box, f.box, 2)).map(f => f.id).sort());
    for (const b of grid.query(a.box, 2)) {
      if (a.id.localeCompare(b.id) >= 0) continue;
      bboxPairs++;
      if (a.fingerprint === b.fingerprint || lineDistance(a, b) > 2) continue;
      measuredPairs++;
      const hd = Math.max(directedDistance(a, b), directedDistance(b, a));
      if (hd > 2) continue;
      nearPairs++; if (hd <= .25) nearQuarterMeter++;
      nearIds.add(a.id); nearIds.add(b.id);
      if (nearExamples.length < 4) nearExamples.push({ ids: [a.id, b.id], sampledHausdorffM: hd, lengthsM: [a.length, b.length], sfparkIds: [a.row.sfpark_id ?? null, b.row.sfpark_id ?? null] });
    }
  }
  const repeatedIds = [...groupBy(features.filter(f => meaningful(f.row.sfpark_id)), f => str(f.row.sfpark_id)).entries()].filter(([, g]) => g.length > 1);
  emit("CURB_GEOMETRY", { rows: rows.length, nullOrMissing: issues.filter(x => x === "missing").length,
    malformed: issues.filter(x => x === "malformed").length, unsupported: issues.filter(x => x === "unsupported").length,
    outsideDiagnosticBounds: syntacticallyUsable.length - features.length, usable: features.length, types: frequencies(features.map(f => f.type)), components: frequencies(features.map(f => String(f.parts.length))),
    exactOrderedDuplicateGroups: exactOrdered.length, exactOrderedDuplicateRows: exactOrdered.reduce((n, g) => n + g.length, 0),
    reverseInsensitiveDuplicateGroups: reverseEqual.length, reverseInsensitiveDuplicateRows: reverseEqual.reduce((n, g) => n + g.length, 0),
    maxExactGroup: Math.max(0, ...reverseEqual.map(g => g.length)), exactExamples: reverseEqual.slice(0, 4).map(g => g.map(f => ({ id: f.id, sfparkId: f.row.sfpark_id ?? null }))),
    nearNonExactPairsWithin2m: nearPairs, nearNonExactPairsWithinQuarterMeter: nearQuarterMeter, nearDistinctRows: nearIds.size, nearExamples, bboxPairs, measuredPairs,
    lengthMeters: summarize(features.map(f => f.length)), zeroLength: features.filter(f => f.length <= 1e-9).length,
    under1m: features.filter(f => f.length < 1).length, under5m: features.filter(f => f.length < 5).length, over300m: features.filter(f => f.length > 300).length, over500m: features.filter(f => f.length > 500).length,
    longest: [...features].sort((a, b) => b.length - a.length).slice(0, 3).map(f => ({ id: f.id, meters: f.length })),
    repeatedSfpark: repeatedIds.map(([id, g]) => ({ id, rows: g.map(f => ({ globalid: f.id, geometryFingerprint: f.fingerprint, lengthM: f.length })) })),
    note: "read-only diagnostic; no topology repair, identity merging, canonicalizer, association, or database access" });
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
  const shifted = (id: string, dx: number, dy: number) => ({ ...f, id, box: [f.box[0] + dx, f.box[1] + dy, f.box[2] + dx, f.box[3] + dy] as Box });
  const boxes = [f, shifted("negative", -250, -100), shifted("boundary", 100, 100), shifted("far", 1000, 1000)];
  const grid = new DiagnosticGrid(boxes);
  for (const box of boxes) for (const pad of [0, 3, 50, 250]) assert.deepEqual(grid.query(box.box, pad).map(x => x.id).sort(), boxes.filter(x => near(box.box, x.box, pad)).map(x => x.id).sort());
  const reversed = feature({ objectid: "reverse", shape: { type: "LineString", coordinates: [[-122.439, 37.77], [-122.44, 37.77]] } }, 0, "regulations")!;
  assert.equal(angleDifference(f, reversed), 0);
  assert.equal(endpoints(f, reversed), 0);
  assert(strongGeometry(measurePair(f, reversed, 0)));
  assert.equal(curbGeometryIssue(null), "missing");
  assert.equal(curbGeometryIssue({ type: "LineString", coordinates: [[-122, 37], [-122, 38]] }), null);
  assert.equal(curbGeometryIssue({ type: "LineString", coordinates: [[-122, 37]] }), "malformed");
  assert.equal(curbGeometryIssue({ type: "LineString", coordinates: [[-122, 37], [NaN, 38]] }), "malformed");
  assert.equal(curbGeometryIssue({ type: "MultiLineString", coordinates: [] }), "malformed");
  assert.equal(curbGeometryIssue({ type: "Point", coordinates: [-122, 37] }), "unsupported");
  log("diagnostic arithmetic self-checks passed");
}
async function main() {
  selfCheck();
  if (process.argv.includes("--self-check")) return;
  if (process.argv.includes("--curb-storage")) {
    emit("CURB_STORAGE_METHOD", { timestamp: new Date().toISOString(), source: DATASETS.curbs, sampleSpacingMeters: SPACING, projection: "V1 local equirectangular", nearDuplicateMeters: 2 });
    await fetchDataset("curbs");
    log("Curb storage profile complete: public GETs only; no ingestion, database access, or associations.");
    return;
  }
  if (process.argv.includes("--v2")) {
    emit("V2_METHOD", { timestamp: new Date().toISOString(), searchMeters: SEARCH, gridMeters: 100, sampleSpacingMeters: SPACING,
      projection: "local equirectangular; same V1 diagnostic metric", thresholds: "experimental only", writes: false,
      evidence: process.argv.includes("--evidence"), postgis: "not queried; record user SQL result separately" });
    const regs = await fetchDataset("regulations"), curbs = await fetchDataset("curbs"), faces = await fetchDataset("meteredFaces");
    overlaps(regs); exactProfile(regs, curbs, "curbs"); fullCompetition(regs, curbs, faces);
    log("V2 complete: no accepted associations, database connection, writes, or runtime changes.");
    return;
  }
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

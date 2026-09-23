/** Pure offline interval measurement. No fetch, database, matching or runtime integration. */
import { canonicalJson, digest, jsonObject } from "./canonicalize-curb-snapshot-v1";

export const MEASUREMENT_MODEL = "sf-curb-planar-um-v1";
export const FRAME = Object.freeze({ longitude: -122.44, latitude: 37.77,
  xMetersPerDegree: 87897.02238670301, yMetersPerDegree: 111195.08023353292 });
const MICRO = 1_000_000n;
const SCALE = 1_000_000_000n;
const TIE_UM = 1000n; // 1 mm arithmetic near-tie band; not source-position accuracy.
export type LonLat = readonly [number, number];
type XY = readonly [bigint, bigint];
interface Segment { index: number; a: XY; b: XY; squared: bigint; length: bigint; start: bigint; }
interface MeasuredLine { coordinates: LonLat[]; segments: Segment[]; total: bigint; geometrySha256: string; skipped: number[]; }

const roundDiv = (n: bigint, d: bigint): bigint => { // nearest integer, ties toward +infinity
  if (d <= 0n) throw new Error("Invalid divisor");
  if (n < 0n) return -((-n + (d - 1n) / 2n) / d);
  return (2n * n + d) / (2n * d);
};
function integerSqrt(n: bigint): bigint {
  if (n < 0n) throw new Error("Negative square root");
  if (n < 2n) return n;
  let x = 1n << BigInt(Math.ceil(n.toString(2).length / 2));
  while (true) { const next = (x + n / x) / 2n; if (next >= x) return x; x = next; }
}
function roundedSqrt(n: bigint, d = 1n): bigint {
  const floor = integerSqrt(n / d);
  return 4n * n >= (2n * floor + 1n) ** 2n * d ? floor + 1n : floor;
}
function coordinate(input: unknown): LonLat {
  if (!Array.isArray(input) || input.length !== 2 || !input.every(n => typeof n === "number" && Number.isFinite(n))) throw new Error("Expected finite 2D lon/lat");
  const [lon, lat] = input;
  if (lon < -122.6 || lon > -122.3 || lat < 37.65 || lat > 37.85) throw new Error("Outside SF measurement domain");
  return [lon, lat];
}
function xy(point: LonLat): XY {
  // Fixed binary64 constants, operation order, then signed half-up integer grid.
  return [BigInt(Math.floor(((point[0] - FRAME.longitude) * FRAME.xMetersPerDegree) * 1e6 + 0.5)),
    BigInt(Math.floor(((point[1] - FRAME.latitude) * FRAME.yMetersPerDegree) * 1e6 + 0.5))];
}
function lonLat(x: number, y: number): LonLat {
  return [x / FRAME.xMetersPerDegree + FRAME.longitude, y / FRAME.yMetersPerDegree + FRAME.latitude];
}
function measure(input: unknown): MeasuredLine {
  const geometry = jsonObject(input);
  if (geometry.type !== "LineString" || !Array.isArray(geometry.coordinates) || geometry.coordinates.length < 2 || geometry.coordinates.length > 10_000) throw new Error("Expected LineString with 2..10000 positions");
  const coordinates = geometry.coordinates.map(coordinate), points = coordinates.map(xy);
  const segments: Segment[] = [], skipped: number[] = [];
  let total = 0n;
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i], b = points[i + 1], squared = (b[0] - a[0]) ** 2n + (b[1] - a[1]) ** 2n;
    if (squared === 0n) { skipped.push(i); continue; }
    const length = roundedSqrt(squared);
    segments.push({ index: i, a, b, squared, length, start: total }); total += length;
  }
  if (total === 0n) throw new Error("Zero total line length on measurement grid");
  if (total > 10_000n * MICRO) throw new Error("Line exceeds 10 km measurement limit");
  return { coordinates, segments, total, skipped, geometrySha256: digest("geometry", { presence: "VALUE", value: geometry }) };
}
export function lineLengthMeters(line: unknown): number { return Number(measure(line).total) / 1e6; }
export function lineMeasurement(line: unknown) {
  const m = measure(line);
  return { measurement_model: MEASUREMENT_MODEL, geometry_sha256: m.geometrySha256, length_um: m.total.toString(), length_m: Number(m.total) / 1e6, skipped_segment_indices: m.skipped };
}
function formatFraction(units: bigint): string {
  if (units < 0n || units > SCALE) throw new Error("Fraction outside [0,1]");
  return `${units / SCALE}.${(units % SCALE).toString().padStart(9, "0")}`;
}
function fractionUnits(input: string): bigint {
  if (typeof input !== "string" || !/^(?:0\.\d{9}|1\.000000000)$/.test(input)) throw new Error("Expected canonical nine-decimal fraction");
  return BigInt(input.replace(".", ""));
}
export function pointAtFraction(line: unknown, fraction: string): LonLat {
  const m = measure(line), units = fractionUnits(fraction);
  if (units === 0n) return [...m.coordinates[0]];
  if (units === SCALE) return [...m.coordinates[m.coordinates.length - 1]];
  const target = m.total * units;
  const s = m.segments.find(s => target <= (s.start + s.length) * SCALE)!;
  const numerator = target - s.start * SCALE, denominator = s.length * SCALE;
  const t = Number(numerator) / Number(denominator);
  return lonLat((Number(s.a[0]) + t * Number(s.b[0] - s.a[0])) / 1e6, (Number(s.a[1]) + t * Number(s.b[1] - s.a[1])) / 1e6);
}

export interface ProjectionCandidate {
  segment_indices: number[];
  fraction: string;
  distance_m: number;
  distance_um: string;
  along_m: number;
  along_numerator: string;
  along_denominator: string;
  point: LonLat;
  clamped: boolean;
}
export type ProjectionResult =
  | { status: "INVALID"; reason: string }
  | { status: "CLEAR" | "AMBIGUOUS"; measurement_model: string; geometry_sha256: string; input_point: LonLat; candidates: ProjectionCandidate[] };

export function projectPointOntoLine(line: unknown, input: unknown): ProjectionResult {
  try {
    const m = measure(line), point = coordinate(input), p = xy(point);
    const candidates = m.segments.map(s => {
      const dx = s.b[0] - s.a[0], dy = s.b[1] - s.a[1];
      const px = p[0] - s.a[0], py = p[1] - s.a[1];
      const dot = px * dx + py * dy;
      const t = dot < 0n ? 0n : dot > s.squared ? s.squared : dot;
      const distanceSquaredNumerator = (px * px + py * py) * s.squared - 2n * t * dot + t * t;
      const distance = roundedSqrt(distanceSquaredNumerator, s.squared);
      const along = s.start * s.squared + s.length * t;
      const candidate: ProjectionCandidate = { segment_indices: [s.index], fraction: formatFraction(roundDiv(along * SCALE, s.squared * m.total)),
        distance_m: Number(distance) / 1e6, distance_um: distance.toString(), along_m: Number(along) / Number(s.squared) / 1e6,
        along_numerator: along.toString(), along_denominator: s.squared.toString(),
        point: lonLat((Number(s.a[0]) + Number(t) / Number(s.squared) * Number(dx)) / 1e6,
          (Number(s.a[1]) + Number(t) / Number(s.squared) * Number(dy)) / 1e6), clamped: dot < 0n || dot > s.squared };
      return candidate;
    });
    const best = candidates.reduce((n, c) => BigInt(c.distance_um) < n ? BigInt(c.distance_um) : n, BigInt(candidates[0].distance_um));
    const groups: ProjectionCandidate[] = [];
    for (const c of candidates.filter(c => BigInt(c.distance_um) <= best + TIE_UM)) {
      // Coalesce only identical cumulative positions (e.g. a shared vertex).
      const same = groups.find(g => BigInt(g.along_numerator) * BigInt(c.along_denominator) === BigInt(c.along_numerator) * BigInt(g.along_denominator));
      if (same) { same.segment_indices.push(...c.segment_indices); same.clamped = same.clamped && c.clamped; }
      else groups.push({ ...c, segment_indices: [...c.segment_indices] });
    }
    return { status: groups.length === 1 ? "CLEAR" : "AMBIGUOUS", measurement_model: MEASUREMENT_MODEL, geometry_sha256: m.geometrySha256, input_point: point, candidates: groups };
  } catch (error) { return { status: "INVALID", reason: error instanceof Error ? error.message : "Invalid projection input" }; }
}

export interface IntervalReference { curb_version_id: string; geometry_sha256: string; }
export interface CurbInterval extends IntervalReference { measurement_model: string; component_index: 0; from_fraction: string; to_fraction: string; }
export type IntervalResult =
  | { status: "INVALID" | "AMBIGUOUS"; reason: string }
  | { status: "VALID_INTERVAL"; interval: CurbInterval; bounds_reversed: boolean };
function validateReference(reference: IntervalReference): void {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(reference.curb_version_id) || !/^[0-9a-f]{64}$/.test(reference.geometry_sha256)) throw new Error("Invalid internal UUID or geometry digest");
}
/** Structural encoding only; the reference must be resolved/verified by future trusted tooling. */
export function intervalFromFractions(reference: IntervalReference, from: string, to: string): IntervalResult {
  try {
    validateReference(reference);
    if (fractionUnits(from) >= fractionUnits(to)) throw new Error("Interval must have from < to; collapse/reversal rejected");
    return { status: "VALID_INTERVAL", bounds_reversed: false, interval: { curb_version_id: reference.curb_version_id, geometry_sha256: reference.geometry_sha256,
      measurement_model: MEASUREMENT_MODEL, component_index: 0, from_fraction: from, to_fraction: to } };
  } catch (error) { return { status: "INVALID", reason: error instanceof Error ? error.message : "Invalid interval" }; }
}
export interface ExtentEvidence {
  kind: "CONTIGUOUS_BOUNDS" | "BOUNDS_ONLY" | "MULTIPLE_CROSSINGS" | "LOOP_OR_DISCONNECTED" | "UNCERTAIN";
  evidence_reference: string;
  max_projection_distance_m: number; // Run-specific evidence policy; no default acceptance radius.
}
/** A valid result is a conditional measurement, never a verified regulation association. */
export function intervalFromProjectedBounds(line: unknown, reference: IntervalReference, a: ProjectionResult, b: ProjectionResult, extent: ExtentEvidence): IntervalResult {
  try {
    const m = measure(line); validateReference(reference);
    if (reference.geometry_sha256 !== m.geometrySha256) throw new Error("Version geometry digest mismatch");
    if (a.status === "INVALID" || b.status === "INVALID") throw new Error("Invalid bound projection");
    for (const bound of [a, b]) {
      if (canonicalJson(projectPointOntoLine(line, bound.input_point)) !== canonicalJson(bound)) throw new Error("Projection is stale, altered, or bound to another geometry/model");
    }
    if (!Number.isFinite(extent.max_projection_distance_m) || extent.max_projection_distance_m < 0) throw new Error("Explicit finite projection-distance policy required");
    if (a.status !== "CLEAR" || b.status !== "CLEAR") return { status: "AMBIGUOUS", reason: "Projection tie or near tie" };
    const first = a.candidates[0], last = b.candidates[0];
    if (first.fraction === last.fraction) return { status: "INVALID", reason: "Bounds collapse at canonical fraction precision" };
    if (first.clamped || last.clamped) return { status: "AMBIGUOUS", reason: "Clamped bounds require separate extent review" };
    if (first.distance_m > extent.max_projection_distance_m || last.distance_m > extent.max_projection_distance_m) return { status: "AMBIGUOUS", reason: "Projection exceeds declared distance policy" };
    if (extent.kind !== "CONTIGUOUS_BOUNDS" || !extent.evidence_reference.trim()) return { status: "AMBIGUOUS", reason: "Contiguous extent not established by endpoint projection" };
    const reversed = fractionUnits(first.fraction) > fractionUnits(last.fraction);
    const result = intervalFromFractions(reference, reversed ? last.fraction : first.fraction, reversed ? first.fraction : last.fraction);
    return result.status === "VALID_INTERVAL" ? { ...result, bounds_reversed: reversed } : result;
  } catch (error) { return { status: "INVALID", reason: error instanceof Error ? error.message : "Invalid bounds" }; }
}
export function serializeInterval(interval: CurbInterval): string {
  const validated = intervalFromFractions(interval, interval.from_fraction, interval.to_fraction);
  if (validated.status !== "VALID_INTERVAL" || interval.measurement_model !== MEASUREMENT_MODEL || interval.component_index !== 0 || canonicalJson(validated.interval) !== canonicalJson(interval)) throw new Error("Invalid canonical interval");
  return canonicalJson(interval);
}
export function intervalDigest(interval: CurbInterval): string { return digest("interval", JSON.parse(serializeInterval(interval))); }

/** One assessment/release at a time. Never merge or drop input intervals. */
export function checkIntervalSet(rows: readonly { regulation_id: string; interval: CurbInterval }[], stage: "CANDIDATE" | "PUBLISHED") {
  const conflicts: { first: number; second: number; kind: "DUPLICATE" | "OVERLAP" | "VERSION_DIGEST_CONFLICT" }[] = [];
  rows.forEach(row => { if (!row.regulation_id.trim()) throw new Error("Missing regulation identity"); serializeInterval(row.interval); });
  for (let i = 0; i < rows.length; i++) for (let j = i + 1; j < rows.length; j++) {
    const a = rows[i], b = rows[j];
    if (a.interval.curb_version_id !== b.interval.curb_version_id) continue;
    if (a.interval.geometry_sha256 !== b.interval.geometry_sha256) { conflicts.push({ first: i, second: j, kind: "VERSION_DIGEST_CONFLICT" }); continue; }
    if (a.regulation_id !== b.regulation_id) continue; // Stacked rules allowed.
    const af = fractionUnits(a.interval.from_fraction), at = fractionUnits(a.interval.to_fraction);
    const bf = fractionUnits(b.interval.from_fraction), bt = fractionUnits(b.interval.to_fraction);
    if (af === bf && at === bt) conflicts.push({ first: i, second: j, kind: "DUPLICATE" });
    else if (af < bt && bf < at) conflicts.push({ first: i, second: j, kind: "OVERLAP" });
  }
  return { status: conflicts.length ? (stage === "PUBLISHED" ? "INVALID" : "AMBIGUOUS") : "VALID_INTERVAL_SET", conflicts, intervals: rows.map(row => ({ regulation_id: row.regulation_id, interval: { ...row.interval } })) };
}

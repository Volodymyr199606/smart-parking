/**
 * DataSF Regulation-to-Block Join Discovery (V1) — READ-ONLY.
 *
 * Empirically tests whether a deterministic identifier join exists between
 * Parking Regulations (hi6h-neyh) and the datasets this repo already
 * ingests (27b3-yjjx blocks, 8vzz-qzz9 meters), plus a bounded look at
 * nearby DataSF datasets that metadata/search suggested as intermediates.
 *
 * Does NOT write to Supabase, does NOT invent joins, does NOT implement
 * spatial matching. Geometry is summarized (bbox / presence) only.
 *
 * Usage:
 *   pnpm profile:regulation-join
 */

import { fetchDataSfJson } from "./fetch-datasf-json";

const SOCRATA_BASE = "https://data.sfgov.org/resource";
const VIEWS_BASE = "https://data.sfgov.org/api/views";
const PAGE_SIZE = 1000;
const MAX_ROWS_SAFETY = 100_000;

const PRODUCTION = {
  regulations: "hi6h-neyh",
  blocks: "27b3-yjjx",
  meters: "8vzz-qzz9",
} as const;

/** Nearby DataSF datasets inspected as possible hops — not ingested by this repo. */
const CANDIDATE_INTERMEDIATE = {
  blockfaces: "pep9-66vw",
  blockfacesWithMeters: "mk27-a5x2",
  mapOfRegulations: "qbyz-te2i",
} as const;

type SocrataRow = Record<string, unknown>;

function log(message: string): void {
  console.log(`[join-profile] ${message}`);
}

function omitGeometry(row: SocrataRow): SocrataRow {
  const out: SocrataRow = { ...row };
  delete out.shape;
  delete out.the_geom;
  delete out.location;
  return out;
}

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchJson(url: string): Promise<unknown> {
  return fetchDataSfJson(url, log);
}

interface ViewColumn {
  fieldName: string;
  name?: string;
  dataTypeName?: string;
  description?: string;
}

interface ViewMeta {
  id: string;
  name: string;
  description?: string;
  columns: ViewColumn[];
}

async function fetchViewMeta(datasetId: string): Promise<ViewMeta> {
  const raw = (await fetchJson(`${VIEWS_BASE}/${datasetId}.json`)) as {
    id?: string;
    name?: string;
    description?: string;
    columns?: ViewColumn[];
  };
  return {
    id: raw.id ?? datasetId,
    name: raw.name ?? datasetId,
    description: raw.description ?? "",
    columns: raw.columns ?? [],
  };
}

function printMeta(meta: ViewMeta): void {
  log(`\n=== META ${meta.id} — ${meta.name} ===`);
  const desc = (meta.description ?? "").replace(/\s+/g, " ").trim();
  log(`  description: ${desc ? desc.slice(0, 400) : "(empty)"}`);
  for (const col of meta.columns) {
    const d = (col.description ?? "").replace(/\s+/g, " ").trim();
    log(
      `  ${col.fieldName}  type=${col.dataTypeName ?? "?"}  name=${JSON.stringify(col.name ?? "")}${d ? `  desc=${JSON.stringify(d.slice(0, 160))}` : ""}`
    );
  }
}

async function fetchSocrataPage(datasetId: string, offset: number, limit: number, slim: boolean): Promise<SocrataRow[]> {
  const url = new URL(`${SOCRATA_BASE}/${datasetId}.json`);
  url.searchParams.set("$limit", String(limit));
  url.searchParams.set("$offset", String(offset));
  const data = (await fetchJson(url.toString())) as unknown;
  if (!Array.isArray(data)) throw new Error(`${datasetId}: expected array`);
  const rows = data as SocrataRow[];
  return slim ? rows.map(omitGeometry) : rows;
}

async function fetchAllSlim(datasetId: string): Promise<SocrataRow[]> {
  const rows: SocrataRow[] = [];
  let offset = 0;
  while (rows.length < MAX_ROWS_SAFETY) {
    const page = await fetchSocrataPage(datasetId, offset, PAGE_SIZE, true);
    rows.push(...page);
    log(`  fetched ${datasetId} offset=${offset} page=${page.length} total=${rows.length}`);
    if (page.length < PAGE_SIZE) break;
    offset += page.length;
    await sleep(400);
  }
  return rows;
}

function pick(row: SocrataRow, key: string): string | null {
  const v = row[key];
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  return s.length > 0 ? s : null;
}

interface FieldStats {
  key: string;
  nonNull: number;
  distinct: number;
  sentinelZero: number;
  maxShare: number;
  maxShareValue: string | null;
}

function fieldStats(rows: readonly SocrataRow[], key: string): FieldStats {
  const counts = new Map<string, number>();
  let nonNull = 0;
  let sentinelZero = 0;
  for (const row of rows) {
    const v = pick(row, key);
    if (v === null) continue;
    nonNull += 1;
    if (v === "0") sentinelZero += 1;
    counts.set(v, (counts.get(v) ?? 0) + 1);
  }
  let maxShare = 0;
  let maxShareValue: string | null = null;
  for (const [value, count] of counts) {
    if (count > maxShare) {
      maxShare = count;
      maxShareValue = value;
    }
  }
  return {
    key,
    nonNull,
    distinct: counts.size,
    sentinelZero,
    maxShare,
    maxShareValue,
  };
}

function valueSet(rows: readonly SocrataRow[], key: string, excludeSentinelZero = false): Set<string> {
  const out = new Set<string>();
  for (const row of rows) {
    const v = pick(row, key);
    if (v === null) continue;
    if (excludeSentinelZero && v === "0") continue;
    out.add(v);
  }
  return out;
}

function printJoin(
  leftName: string,
  leftKey: string,
  leftRows: readonly SocrataRow[],
  rightName: string,
  rightKey: string,
  rightRows: readonly SocrataRow[],
  excludeZero: boolean
): { intersection: number; leftOnly: number; rightOnly: number } {
  const left = valueSet(leftRows, leftKey, excludeZero);
  const right = valueSet(rightRows, rightKey, excludeZero);
  let intersection = 0;
  for (const v of left) if (right.has(v)) intersection += 1;
  const leftPct = left.size === 0 ? 0 : (100 * intersection) / left.size;
  const rightPct = right.size === 0 ? 0 : (100 * intersection) / right.size;
  log(
    `  ${leftName}.${leftKey} ∩ ${rightName}.${rightKey}${excludeZero ? " (excluding 0)" : ""}: leftDistinct=${left.size} rightDistinct=${right.size} intersection=${intersection} leftMatched=${leftPct.toFixed(2)}% rightMatched=${rightPct.toFixed(2)}%`
  );
  return { intersection, leftOnly: left.size - intersection, rightOnly: right.size - intersection };
}

function sampleOverlapRows(
  leftRows: readonly SocrataRow[],
  leftKey: string,
  rightRows: readonly SocrataRow[],
  rightKey: string,
  limit: number
): Array<{ value: string; left: SocrataRow; right: SocrataRow }> {
  const rightBy = new Map<string, SocrataRow>();
  for (const row of rightRows) {
    const v = pick(row, rightKey);
    if (v && v !== "0" && !rightBy.has(v)) rightBy.set(v, row);
  }
  const out: Array<{ value: string; left: SocrataRow; right: SocrataRow }> = [];
  const seen = new Set<string>();
  for (const left of leftRows) {
    const v = pick(left, leftKey);
    if (!v || v === "0" || seen.has(v)) continue;
    const right = rightBy.get(v);
    if (!right) continue;
    seen.add(v);
    out.push({ value: v, left, right });
    if (out.length >= limit) break;
  }
  return out;
}

function slimRow(row: SocrataRow, keys: string[]): Record<string, string | null> {
  const out: Record<string, string | null> = {};
  for (const key of keys) out[key] = pick(row, key);
  return out;
}

interface BBox {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  pointCount: number;
}

function walkCoords(node: unknown, bbox: BBox): void {
  if (!Array.isArray(node) || node.length === 0) return;
  if (typeof node[0] === "number" && typeof node[1] === "number") {
    const x = node[0];
    const y = node[1];
    bbox.minX = Math.min(bbox.minX, x);
    bbox.maxX = Math.max(bbox.maxX, x);
    bbox.minY = Math.min(bbox.minY, y);
    bbox.maxY = Math.max(bbox.maxY, y);
    bbox.pointCount += 1;
    return;
  }
  for (const child of node) walkCoords(child, bbox);
}

function shapeBBox(shape: unknown): BBox | null {
  if (!shape || typeof shape !== "object") return null;
  const coords = (shape as { coordinates?: unknown }).coordinates;
  if (!coords) return null;
  const bbox: BBox = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity, pointCount: 0 };
  walkCoords(coords, bbox);
  return bbox.pointCount > 0 ? bbox : null;
}

function bboxesOverlap(a: BBox, b: BBox, pad = 0.0005): boolean {
  return !(a.maxX + pad < b.minX || b.maxX + pad < a.minX || a.maxY + pad < b.minY || b.maxY + pad < a.minY);
}

async function summarizeGeometry(datasetId: string, n: number): Promise<BBox[]> {
  const page = await fetchSocrataPage(datasetId, 0, n, false);
  const boxes: BBox[] = [];
  let withShape = 0;
  let types = new Map<string, number>();
  for (const row of page) {
    const shape = row.shape ?? row.the_geom;
    if (shape && typeof shape === "object") {
      withShape += 1;
      const t = String((shape as { type?: string }).type ?? "?");
      types.set(t, (types.get(t) ?? 0) + 1);
      const bbox = shapeBBox(shape);
      if (bbox) boxes.push(bbox);
    }
  }
  log(
    `  ${datasetId} geometry sample n=${page.length} withShape=${withShape} types=${JSON.stringify(Object.fromEntries(types))} bboxCount=${boxes.length}`
  );
  if (boxes[0]) {
    log(
      `    first bbox lon[${boxes[0].minX.toFixed(5)},${boxes[0].maxX.toFixed(5)}] lat[${boxes[0].minY.toFixed(5)},${boxes[0].maxY.toFixed(5)}] points=${boxes[0].pointCount}`
    );
  }
  return boxes;
}

async function probeIntermediate(datasetId: string): Promise<SocrataRow[]> {
  log(`\n=== probe intermediate ${datasetId} ===`);
  try {
    const meta = await fetchViewMeta(datasetId);
    printMeta(meta);
    const rows = await fetchAllSlim(datasetId);
    log(`  rows=${rows.length} keys=${Object.keys(rows[0] ?? {}).sort().join(",")}`);
    return rows;
  } catch (err) {
    log(`  SKIP ${datasetId}: ${err instanceof Error ? err.message : String(err)}`);
    return [];
  }
}

async function catalogSearch(q: string): Promise<void> {
  const url = `https://data.sfgov.org/api/catalog/v1?q=${encodeURIComponent(q)}&limit=8`;
  try {
    const raw = (await fetchJson(url)) as {
      results?: Array<{ resource?: { id?: string; name?: string; description?: string } }>;
    };
    log(`\n=== catalog search ${JSON.stringify(q)} ===`);
    for (const hit of raw.results ?? []) {
      const r = hit.resource;
      if (!r) continue;
      log(`  ${r.id}  ${r.name}  ${(r.description ?? "").replace(/\s+/g, " ").slice(0, 140)}`);
    }
  } catch (err) {
    log(`  catalog search failed: ${err instanceof Error ? err.message : String(err)}`);
  }
}

async function main(): Promise<void> {
  log("DataSF Regulation-to-Block Join Discovery V1 — read-only, no writes");

  await catalogSearch("fid_100");
  await catalogSearch("parking regulations blockface");
  await catalogSearch("blockfaces with meters");

  printMeta(await fetchViewMeta(PRODUCTION.regulations));
  printMeta(await fetchViewMeta(PRODUCTION.blocks));
  printMeta(await fetchViewMeta(PRODUCTION.meters));

  log("\n=== fetch production datasets (geometry omitted) ===");
  const regs = await fetchAllSlim(PRODUCTION.regulations);
  const blocks = await fetchAllSlim(PRODUCTION.blocks);
  const meters = await fetchAllSlim(PRODUCTION.meters);
  log(`counts regs=${regs.length} blocks=${blocks.length} meters=${meters.length}`);

  const regKeys = ["objectid", "fid_100", "globalid", "blockface_id", "name", "street_id", "cnn", "id"];
  const blockKeys = ["objectid", "block_id", "street_id", "associated_block_id", "block_num", "blockface_id"];
  const meterKeys = [
    "objectid",
    "post_id",
    "blockface_id",
    "street_id",
    "street_seg_ctrln_id",
    "pm_district_id",
    "block_id",
  ];

  log("\n=== field coverage / uniqueness ===");
  for (const [label, rows, keys] of [
    ["regs", regs, regKeys],
    ["blocks", blocks, blockKeys],
    ["meters", meters, meterKeys],
  ] as const) {
    log(`  -- ${label} n=${rows.length} --`);
    for (const key of keys) {
      const s = fieldStats(rows, key);
      if (s.nonNull === 0 && !["objectid", "fid_100", "block_id", "blockface_id", "street_id", "street_seg_ctrln_id"].includes(key)) {
        continue;
      }
      log(
        `    ${key}: nonNull=${s.nonNull}/${rows.length} distinct=${s.distinct} zero=${s.sentinelZero} maxShare=${s.maxShare}${s.maxShareValue ? ` value=${JSON.stringify(s.maxShareValue)}` : ""}`
      );
    }
  }

  log("\n=== identifier intersections (a join requires more than overlap) ===");
  const pairs: Array<[string, string, SocrataRow[], string, string, SocrataRow[]]> = [
    ["regs", "objectid", regs, "blocks", "objectid", blocks],
    ["regs", "objectid", regs, "blocks", "block_id", blocks],
    ["regs", "objectid", regs, "meters", "objectid", meters],
    ["regs", "objectid", regs, "meters", "blockface_id", meters],
    ["regs", "objectid", regs, "meters", "street_id", meters],
    ["regs", "objectid", regs, "meters", "street_seg_ctrln_id", meters],
    ["regs", "fid_100", regs, "blocks", "objectid", blocks],
    ["regs", "fid_100", regs, "blocks", "block_id", blocks],
    ["regs", "fid_100", regs, "meters", "objectid", meters],
    ["regs", "fid_100", regs, "meters", "blockface_id", meters],
    ["regs", "fid_100", regs, "meters", "street_id", meters],
    ["regs", "fid_100", regs, "meters", "street_seg_ctrln_id", meters],
    ["regs", "fid_100", regs, "meters", "post_id", meters],
    ["blocks", "block_id", blocks, "meters", "blockface_id", meters],
    ["blocks", "block_id", blocks, "meters", "street_id", meters],
    ["blocks", "street_id", blocks, "meters", "street_id", meters],
    ["blocks", "objectid", blocks, "meters", "objectid", meters],
  ];
  for (const [ln, lk, lr, rn, rk, rr] of pairs) {
    printJoin(ln, lk, lr, rn, rk, rr, false);
  }
  log("  -- fid_100 excluding sentinel 0 --");
  printJoin("regs", "fid_100", regs, "blocks", "block_id", blocks, true);
  printJoin("regs", "fid_100", regs, "meters", "blockface_id", meters, true);
  printJoin("regs", "fid_100", regs, "meters", "street_id", meters, true);
  printJoin("regs", "fid_100", regs, "meters", "street_seg_ctrln_id", meters, true);

  log("\n=== representative apparent matches (objectid ∩ blocks.block_id) ===");
  const accidental = sampleOverlapRows(regs, "objectid", blocks, "block_id", 5);
  if (accidental.length === 0) log("  none");
  for (const hit of accidental) {
    log(
      `  value=${hit.value} REG=${JSON.stringify(slimRow(hit.left, ["objectid", "fid_100", "regulation", "analysis_neighborhood", "supervisor_district", "length_ft"]))} BLOCK=${JSON.stringify(slimRow(hit.right, ["objectid", "block_id", "street_name", "street_id", "fm_addr_no", "to_addr_no", "analysis_neighborhood"]))}`
    );
  }

  log("\n=== representative apparent matches (fid_100 ∩ blocks.block_id, excluding 0) ===");
  const fidHits = sampleOverlapRows(regs, "fid_100", blocks, "block_id", 5);
  if (fidHits.length === 0) log("  none");
  for (const hit of fidHits) {
    log(
      `  value=${hit.value} REG=${JSON.stringify(slimRow(hit.left, ["objectid", "fid_100", "regulation", "analysis_neighborhood", "length_ft"]))} BLOCK=${JSON.stringify(slimRow(hit.right, ["objectid", "block_id", "street_name", "fm_addr_no", "to_addr_no", "analysis_neighborhood"]))}`
    );
  }

  const pep = await probeIntermediate(CANDIDATE_INTERMEDIATE.blockfaces);
  const meteredFaces = await probeIntermediate(CANDIDATE_INTERMEDIATE.blockfacesWithMeters);
  await probeIntermediate(CANDIDATE_INTERMEDIATE.mapOfRegulations);

  log("\n=== representative apparent matches (fid_100 ∩ meters.street_id, excluding 0) ===");
  const streetHits = sampleOverlapRows(regs, "fid_100", meters, "street_id", 5);
  if (streetHits.length === 0) log("  none");
  for (const hit of streetHits) {
    log(
      `  value=${hit.value} REG=${JSON.stringify(slimRow(hit.left, ["objectid", "fid_100", "regulation", "analysis_neighborhood", "length_ft"]))} METER=${JSON.stringify(slimRow(hit.right, ["post_id", "street_id", "street_name", "street_num", "blockface_id", "analysis_neighborhood"]))}`
    );
  }

  log("\n=== representative apparent matches (objectid ∩ meters.street_id) ===");
  const oidStreetHits = sampleOverlapRows(regs, "objectid", meters, "street_id", 5);
  if (oidStreetHits.length === 0) log("  none");
  for (const hit of oidStreetHits) {
    log(
      `  value=${hit.value} REG=${JSON.stringify(slimRow(hit.left, ["objectid", "fid_100", "regulation", "analysis_neighborhood"]))} METER=${JSON.stringify(slimRow(hit.right, ["post_id", "street_id", "street_name", "analysis_neighborhood"]))}`
    );
  }

  const hopKeys = [
    "objectid",
    "fid_100",
    "blockface_id",
    "blockface_",
    "block_id",
    "cnn",
    "cnn_id",
    "street_id",
    "sfpark_id",
    "name",
    "id",
  ];
  for (const [name, rows] of [
    ["pep9-66vw", pep],
    ["mk27-a5x2", meteredFaces],
  ] as const) {
    if (rows.length === 0) continue;
    log(`\n=== hop intersections via ${name} ===`);
    const allKeys = new Set<string>();
    for (const row of rows) for (const key of Object.keys(row)) allKeys.add(key);
    log(`  slim keys present: ${[...allKeys].sort().join(",")}`);
    log(`  -- ${name} field stats --`);
    for (const key of hopKeys) {
      const s = fieldStats(rows, key);
      if (s.nonNull === 0) continue;
      log(
        `    ${key}: nonNull=${s.nonNull}/${rows.length} distinct=${s.distinct} zero=${s.sentinelZero} maxShare=${s.maxShare}`
      );
    }
    for (const key of hopKeys) {
      if (fieldStats(rows, key).nonNull === 0) continue;
      printJoin("regs", "objectid", regs, name, key, rows, false);
      printJoin("regs", "fid_100", regs, name, key, rows, true);
      printJoin("blocks", "block_id", blocks, name, key, rows, false);
      printJoin("blocks", "street_id", blocks, name, key, rows, false);
      printJoin("meters", "blockface_id", meters, name, key, rows, false);
      printJoin("meters", "street_id", meters, name, key, rows, false);
    }
  }

  log("\n=== geometry feasibility (bounded sample, not a join) ===");
  const regBoxes = await summarizeGeometry(PRODUCTION.regulations, 8);
  const blockBoxes = await summarizeGeometry(PRODUCTION.blocks, 8);
  const meterPage = await fetchSocrataPage(PRODUCTION.meters, 0, 8, true);
  const metersWithCoords = meterPage.filter((row) => pick(row, "latitude") && pick(row, "longitude")).length;
  log(`  meters sample with lat/lng: ${metersWithCoords}/${meterPage.length}`);
  let overlapPairs = 0;
  for (const rb of regBoxes) {
    for (const bb of blockBoxes) {
      if (bboxesOverlap(rb, bb, 0.002)) overlapPairs += 1;
    }
  }
  log(
    `  sampled bbox overlap pairs (8x8, pad~200m, NOT a join): ${overlapPairs}. Coarse overlap is expected in a dense city and does not prove identity.`
  );

  log("\nDone. No data was written. No join was implemented.");
}

main().catch((err) => {
  console.error("[join-profile] ERROR:", err instanceof Error ? err.message : err);
  process.exit(1);
});

export {};

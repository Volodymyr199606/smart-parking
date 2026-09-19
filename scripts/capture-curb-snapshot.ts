/** Bounded public DataSF capture / offline archive verification. Never database ingestion.
 * --compare --out=<NEW absolute directory> captures exactly twice.
 * --verify=<capture directory> reconstructs from retained bytes with zero network.
 */
import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { isAbsolute, join } from "node:path";
import { fetchDataSfJson } from "./fetch-datasf-json";
import { canonicalDataset, canonicalJson, CONTRACT, digest, jsonObject, parseSourceJson, schemaDigest, sha256, SOURCE, supportedLineString } from "./canonicalize-curb-snapshot";

const ENDPOINT = "https://data.sfgov.org/resource/pep9-66vw.json";
const METADATA = "https://data.sfgov.org/api/views/pep9-66vw.json";
const PAGE_SIZE = 1000;
const TOOL = "curb-capture-v1";
interface Artifact { path: string; url: string; bytes: number; sha256: string; retrieved_at: string; status: number; headers: Record<string, string>; }
export type CaptureState = "CONSISTENT" | "POSSIBLY_CHANGED_DURING_CAPTURE" | "INVALID";
export function captureState(input: { valid: boolean; beforeCount: number; afterCount: number; rows: number; metadataEqual: boolean; schemaEqual: boolean; ordered: boolean }): CaptureState {
  if (!input.valid || ![input.beforeCount, input.afterCount, input.rows].every(n => Number.isSafeInteger(n) && n >= 0)) return "INVALID";
  if (input.beforeCount !== input.afterCount || input.rows !== input.beforeCount || !input.metadataEqual || !input.schemaEqual || !input.ordered) return "POSSIBLY_CHANGED_DURING_CAPTURE";
  return "CONSISTENT"; // Observed agreement only, never transactional isolation.
}
function pageUrl(offset: number): string {
  const url = new URL(ENDPOINT);
  url.searchParams.set("$select", "*"); url.searchParams.set("$order", "globalid ASC");
  url.searchParams.set("$limit", String(PAGE_SIZE)); url.searchParams.set("$offset", String(offset));
  return url.toString();
}
function countUrl(): string {
  const url = new URL(ENDPOINT); url.searchParams.set("$select", "count(*) as n"); return url.toString();
}
function count(value: unknown): number {
  if (!Array.isArray(value) || value.length !== 1) throw new Error("Invalid count response");
  const raw = jsonObject(value[0]).n;
  if (typeof raw !== "string" || !/^\d+$/.test(raw) || !Number.isSafeInteger(Number(raw))) throw new Error("Invalid source count");
  return Number(raw);
}
export function summarizeCapture(rows: unknown[], before: unknown, after: unknown, beforeCount: number, afterCount: number) {
  const dataset = canonicalDataset(rows);
  const ids = rows.map(r => jsonObject(r).globalid as string);
  const ordered = ids.every((id, i) => i === 0 || ids[i - 1] < id);
  const schema_before = schemaDigest(before), schema_after = schemaDigest(after);
  const metadata_before = digest("metadata", before), metadata_after = digest("metadata", after);
  const usable = rows.filter(supportedLineString).length;
  const state = captureState({ valid: true, beforeCount, afterCount, rows: rows.length, metadataEqual: metadata_before === metadata_after, schemaEqual: schema_before === schema_after, ordered });
  return { state, row_count: rows.length, distinct_external_id_count: dataset.features.length, usable_geometry_count: usable,
    ordered, count_before: beforeCount, count_after: afterCount, schema_before, schema_after, metadata_before, metadata_after,
    dataset_sha256: dataset.dataset_sha256, identity_geometry_sha256: dataset.identity_geometry_sha256, external_ids_sha256: dataset.external_ids_sha256,
    locally_eligible: state === "CONSISTENT" && rows.length > 0 && usable === rows.length };
}

async function capture(directory: string) {
  await mkdir(directory); await mkdir(join(directory, "pages"));
  const started = new Date().toISOString(), artifacts: Artifact[] = [], retries: string[] = [];
  async function get(url: string, path: string) {
    let body: Uint8Array | undefined, selectedHeaders: Record<string, string> = {}, status = 0;
    const value = await fetchDataSfJson(url, message => { retries.push(message); console.log(message); }, {
      fetch: async (input, init) => {
        const response = await fetch(input, { ...init, signal: AbortSignal.timeout(45_000) });
        if (response.ok) {
          body = new Uint8Array(await response.clone().arrayBuffer());
          status = response.status;
          selectedHeaders = Object.fromEntries(["content-type", "content-encoding", "etag", "last-modified", "date"].flatMap(k => {
            const v = response.headers.get(k); return v === null ? [] : [[k, v]];
          }));
        }
        return response;
      },
    });
    if (!body) throw new Error("Successful response body not retained");
    await writeFile(join(directory, path), body, { flag: "wx" });
    artifacts.push({ path, url, bytes: body.length, sha256: sha256(body), retrieved_at: new Date().toISOString(), status, headers: selectedHeaders });
    const strict = parseSourceJson(body);
    assert.equal(canonicalJson(strict), canonicalJson(value));
    await new Promise(resolve => setTimeout(resolve, 300));
    return strict;
  }
  try {
    const before = await get(METADATA, "metadata-before.json");
    const beforeCount = count(await get(countUrl(), "count-before.json"));
    if (beforeCount > 100_000) throw new Error("Source exceeds capture safety cap");
    const rows: unknown[] = [];
    let ended = false;
    for (let offset = 0; offset <= 100_000; offset += PAGE_SIZE) {
      const page = await get(pageUrl(offset), `pages/${String(offset).padStart(6, "0")}.json`);
      if (!Array.isArray(page) || page.length > PAGE_SIZE || rows.length + page.length > 100_000) throw new Error("Invalid or excessive page");
      rows.push(...page);
      if (offset % 5000 === 0 || page.length < PAGE_SIZE) console.log(`curb capture ${directory}: ${rows.length} rows`);
      if (page.length < PAGE_SIZE) { ended = true; break; }
    }
    if (!ended) throw new Error("Incomplete capture");
    const afterCount = count(await get(countUrl(), "count-after.json"));
    const after = await get(METADATA, "metadata-after.json");
    const summary = summarizeCapture(rows, before, after, beforeCount, afterCount);
    const pages = artifacts.filter(a => a.path.startsWith("pages/"));
    const manifest = { format_version: "curb-snapshot-v1", canonicalization_version: CONTRACT, ...SOURCE,
      source_key: "datasf_citywide_curbs", api_endpoint: ENDPOINT, captured_at_start: started, captured_at_end: new Date().toISOString(),
      query: { select: "*", order: "globalid ASC", page_size: PAGE_SIZE, offset_step: PAGE_SIZE, filter: null },
      fetch_tool_version: TOOL, tool_sources_sha256: await toolDigest(), node_version: process.version,
      retry_events: retries, retry_count: retries.filter(s => s.startsWith("transient ")).length,
      body_representation: "HTTP entity bytes after fetch content decoding; not compressed wire bytes",
      artifacts, raw_pages_sha256: digest("raw-pages", pages.map(a => [a.path, a.bytes, a.sha256])), summary };
    const bytes = canonicalJson(manifest) + "\n";
    await writeFile(join(directory, "manifest.json"), bytes, { flag: "wx" });
    await writeFile(join(directory, "manifest.sha256"), sha256(bytes) + "\n", { flag: "wx" });
    console.log(JSON.stringify({ capture: directory, ...summary, retry_count: manifest.retry_count }));
    return await verifyArchive(directory);
  } catch (error) {
    await writeFile(join(directory, "failure.json"), canonicalJson({ state: "INVALID", captured_at_start: started, captured_at_end: new Date().toISOString(), artifacts, retry_events: retries,
      reason: error instanceof Error ? error.message : "Capture failed" }) + "\n", { flag: "wx" });
    throw error;
  }
}
async function toolDigest() {
  // Resolve relative to this script, not the caller's working directory.
  const { dirname } = await import("node:path");
  const base = dirname(__filename);
  return digest("tool-sources", await Promise.all(["capture-curb-snapshot.ts", "canonicalize-curb-snapshot.ts", "fetch-datasf-json.ts"].map(async name => [name, sha256(await readFile(join(base, name)))])));
}

export async function verifyArchive(directory: string) {
  const bytes = await readFile(join(directory, "manifest.json"));
  assert.equal(sha256(bytes), (await readFile(join(directory, "manifest.sha256"), "utf8")).trim());
  const m = jsonObject(parseSourceJson(bytes));
  assert.equal(m.format_version, "curb-snapshot-v1"); assert.equal(m.canonicalization_version, CONTRACT);
  assert.equal(m.dataset_id, SOURCE.dataset_id); assert.equal(m.provider, SOURCE.provider);
  assert.equal(m.api_endpoint, ENDPOINT);
  assert.equal(canonicalJson(m.query), canonicalJson({ select: "*", order: "globalid ASC", page_size: PAGE_SIZE, offset_step: PAGE_SIZE, filter: null }));
  if (!Array.isArray(m.artifacts)) throw new Error("Missing artifact descriptors");
  const values = new Map<string, unknown>(), pages: Artifact[] = [], rows: unknown[] = [];
  let terminal = false;
  for (const input of m.artifacts) {
    const a = jsonObject(input);
    if (typeof a.path !== "string" || !/^(?:metadata-(?:before|after)|count-(?:before|after)|pages\/\d{6})\.json$/.test(a.path) || values.has(a.path)) throw new Error("Invalid/duplicate artifact path");
    const raw = await readFile(join(directory, a.path));
    assert.equal(raw.length, a.bytes); assert.equal(sha256(raw), a.sha256); assert.equal(a.status, 200);
    const parsed = parseSourceJson(raw); values.set(a.path, parsed);
    if (a.path.startsWith("pages/")) {
      const offset = pages.length * PAGE_SIZE;
      assert.equal(a.path, `pages/${String(offset).padStart(6, "0")}.json`); assert.equal(a.url, pageUrl(offset));
      assert(!terminal && Array.isArray(parsed) && parsed.length <= PAGE_SIZE);
      rows.push(...parsed); terminal = parsed.length < PAGE_SIZE;
      pages.push(a as unknown as Artifact);
    } else assert.equal(a.url, a.path.startsWith("metadata") ? METADATA : countUrl());
  }
  assert(terminal && rows.length <= 100_000); assert.equal(values.size, pages.length + 4);
  assert.equal(m.raw_pages_sha256, digest("raw-pages", pages.map(a => [a.path, a.bytes, a.sha256])));
  const summary = summarizeCapture(rows, values.get("metadata-before.json"), values.get("metadata-after.json"), count(values.get("count-before.json")), count(values.get("count-after.json")));
  assert.equal(canonicalJson(summary), canonicalJson(m.summary));
  console.log(`Offline archive reconstruction passed: ${directory}`);
  return { summary, features: canonicalDataset(rows).features };
}

async function main() {
  const args = process.argv.slice(2);
  if (args.length === 1 && args[0].startsWith("--verify=")) { await verifyArchive(args[0].slice(9)); return; }
  const out = args.find(a => a.startsWith("--out="))?.slice(6);
  if (args.length !== 2 || !args.includes("--compare") || !out || !isAbsolute(out)) throw new Error("Use --compare --out=<NEW absolute directory> or --verify=<capture directory>");
  await mkdir(out); // Must not exist: no overwrites, no destructive cleanup.
  const a = await capture(join(out, "capture-1"));
  const b = await capture(join(out, "capture-2"));
  const comparison = { captures: 2, row_counts: [a.summary.row_count, b.summary.row_count], states: [a.summary.state, b.summary.state],
    external_ids_equal: a.summary.external_ids_sha256 === b.summary.external_ids_sha256,
    schema_equal: a.summary.schema_after === b.summary.schema_after,
    dataset_equal: a.summary.dataset_sha256 === b.summary.dataset_sha256,
    feature_digests_equal: canonicalJson(a.features) === canonicalJson(b.features),
    metadata_equal_between_captures: a.summary.metadata_after === b.summary.metadata_before };
  await writeFile(join(out, "comparison.json"), canonicalJson(comparison) + "\n", { flag: "wx" });
  console.log(JSON.stringify(comparison));
}
if (require.main === module) main().catch(error => { console.error(error instanceof Error ? error.message : "Capture failed"); process.exitCode = 1; });

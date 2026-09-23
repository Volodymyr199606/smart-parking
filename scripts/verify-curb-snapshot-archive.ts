/** Offline V2 archive replay. Imports only filesystem/crypto and pure contract code.
 * No capture module, SDK, environment loading, network, or database operations.
 */
import { lstat, mkdir, readFile, readdir, realpath, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import { canonicalDataset, canonicalFeature, canonicalJson, CONTRACT, digest, Json, jsonObject,
  LosslessJsonNumber, parseSourceJson, schemaDigest, sha256, SOURCE, supportedLineString } from "./canonicalize-curb-snapshot";
import { curbDbEligibility, DB_ELIGIBILITY } from "./curb-db-eligibility";

export const ARCHIVE_VERIFIER = "curb-archive-verify-v1";
export const PACKAGE_CONTRACT = "curb-artifact-package-v1";
const SNAPSHOT = "curb-snapshot-v2";
const ENDPOINT = "https://data.sf.gov/resource/pep9-66vw.json";
const METADATA = "https://data.sf.gov/api/views/pep9-66vw.json";
const QUERY = { select: "*", order: "globalid ASC", page_size: 1000, offset_step: 1000, filter: null };
const MAX_BODY = 32 * 1024 * 1024, MAX_TOTAL = 256 * 1024 * 1024;
const HASH = /^[0-9a-f]{64}$/;
export type FeatureInput = ReturnType<typeof canonicalFeature>;
type FileEvidence = { path: string; bytes: number; sha256: string };
export type Expectations = { artifactSha256?: string; manifestSha256?: string };

export class ArchiveError extends Error {
  constructor(readonly artifact: string, detail: string) { super(`${artifact}: ${detail}`); }
}
function requireValue(condition: unknown, path: string, detail: string): asserts condition {
  if (!condition) throw new ArchiveError(path, detail);
}
function same(actual: unknown, expected: unknown, path: string) {
  requireValue(actual !== undefined && expected !== undefined && canonicalJson(actual) === canonicalJson(expected), path, "value does not match recomputed/required contract");
}
function atArtifact<T>(path: string, read: () => T): T {
  try { return read(); }
  catch (error) {
    if (error instanceof ArchiveError) throw error;
    throw new ArchiveError(path, "invalid response structure");
  }
}
// Only metadata controls cross this exact integer conversion boundary.
function controls(value: Json): any {
  if (value instanceof LosslessJsonNumber) return value.toSafeInteger();
  if (Array.isArray(value)) return value.map(controls);
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, controls(v)]));
  return value;
}
function parsed(bytes: Buffer, path: string): Json {
  try { return parseSourceJson(bytes); }
  catch { throw new ArchiveError(path, "invalid lossless JSON (syntax, duplicate key, Unicode or numeric bound)"); }
}
async function file(root: string, path: string, limit: number): Promise<Buffer> {
  // Callers use fixed names or paths validated against the fixed page sequence.
  try {
    const target = join(root, path), stat = await lstat(target);
    requireValue(stat.isFile() && !stat.isSymbolicLink(), path, "must be a regular file, not a link");
    requireValue(stat.size <= limit, path, "file exceeds byte limit");
    const bytes = await readFile(target);
    requireValue(bytes.length === stat.size && bytes.length <= limit, path, "file changed while reading or exceeds limit");
    return bytes;
  } catch (error) {
    if (error instanceof ArchiveError) throw error;
    throw new ArchiveError(path, "cannot read required artifact");
  }
}
function count(value: Json, path: string): number {
  requireValue(Array.isArray(value) && value.length === 1, path, "expected one count row");
  const n = atArtifact(path, () => jsonObject(value[0]).n);
  requireValue(typeof n === "string" && /^\d+$/.test(n) && Number.isSafeInteger(Number(n)) && Number(n) <= 100_000,
    path, "invalid or excessive source count");
  return Number(n);
}
function urlFor(path: string, offset: number) {
  if (path.startsWith("metadata-")) return METADATA;
  const url = new URL(ENDPOINT);
  if (path.startsWith("count-")) url.searchParams.set("$select", "count(*) as n");
  else {
    url.searchParams.set("$select", "*"); url.searchParams.set("$order", "globalid ASC");
    url.searchParams.set("$limit", "1000"); url.searchParams.set("$offset", String(offset));
  }
  return url.toString();
}

/** No DB UUIDs: exact UTF-8 hex identity ordering aligns with the later DB seal. */
export function archiveContentSeal(features: readonly FeatureInput[]): string {
  const tuples = features.map(f => [Buffer.from(f.external_id, "utf8").toString("hex"), f.geometry_sha256, f.attributes_sha256, f.content_sha256]);
  tuples.sort((a, b) => a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0);
  requireValue(new Set(tuples.map(t => t[0])).size === tuples.length, "content-seal", "duplicate identity");
  return sha256("city-curb/archive-content/v1\n" + canonicalJson({ ...SOURCE, source_key: "datasf_citywide_curbs",
    canonicalization_version: CONTRACT, snapshot_version: SNAPSHOT, features: tuples }));
}

export async function verifyFullArchive(directory: string, expected: Expectations = {}) {
  const root = resolve(directory);
  for (const [name, value] of Object.entries(expected)) requireValue(HASH.test(value), "expectations", `invalid ${name}`);
  for (const name of ["", "pages"]) {
    let stat;
    try { stat = await lstat(join(root, name)); } catch { throw new ArchiveError(name || ".", "missing archive directory"); }
    requireValue(stat.isDirectory() && !stat.isSymbolicLink(), name || ".", "must be a directory, not a link");
  }
  const manifestBytes = await file(root, "manifest.json", 1024 * 1024);
  const manifestSha = sha256(manifestBytes);
  same((await file(root, "manifest.sha256", 65)).toString("utf8"), manifestSha + "\n", "manifest.sha256");
  if (expected.manifestSha256) same(manifestSha, expected.manifestSha256, "expected manifest checksum");
  let m: any;
  try { m = controls(parsed(manifestBytes, "manifest.json")); jsonObject(m); }
  catch { throw new ArchiveError("manifest.json", "invalid control metadata"); }
  for (const [key, value] of Object.entries({ format_version: SNAPSHOT, canonicalization_version: CONTRACT, ...SOURCE,
    source_key: "datasf_citywide_curbs", api_endpoint: ENDPOINT, fetch_tool_version: "curb-capture-v2",
    body_representation: "HTTP entity bytes after fetch content decoding; not compressed wire bytes", query: QUERY })) {
    requireValue(Object.hasOwn(m, key), `manifest.json/${key}`, "missing required field"); same(m[key], value, `manifest.json/${key}`);
  }
  const timestamp = (v: unknown) => typeof v === "string" && /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(v) && Number.isFinite(Date.parse(v));
  requireValue(timestamp(m.captured_at_start) && timestamp(m.captured_at_end) && m.captured_at_start <= m.captured_at_end,
    "manifest.json", "invalid capture timestamps");
  requireValue(typeof m.tool_sources_sha256 === "string" && HASH.test(m.tool_sources_sha256) && typeof m.node_version === "string",
    "manifest.json", "missing capture implementation declarations");
  requireValue(Array.isArray(m.retry_events) && m.retry_events.every((s: unknown) => typeof s === "string"), "manifest.json/retry_events", "invalid retry declarations");
  same(m.retry_count, m.retry_events.filter((s: string) => s.startsWith("transient ")).length, "manifest.json/retry_count");
  requireValue(Array.isArray(m.artifacts) && m.artifacts.length >= 5 && m.artifacts.length <= 105, "manifest.json/artifacts", "invalid artifact count");
  const pageCount = m.artifacts.length - 4;
  const paths = ["metadata-before.json", "count-before.json", ...Array.from({ length: pageCount }, (_, i) => `pages/${String(i * 1000).padStart(6, "0")}.json`),
    "count-after.json", "metadata-after.json"];
  // Complete inventory: hidden/undeclared files and duplicate page copies cannot hide outside the manifest.
  same((await readdir(root)).sort(), ["manifest.json", "manifest.sha256", "pages", "metadata-before.json", "count-before.json", "count-after.json", "metadata-after.json"].sort(), ". inventory");
  same((await readdir(join(root, "pages"))).sort(), paths.filter(p => p.startsWith("pages/")).map(p => p.slice(6)).sort(), "pages inventory");
  const evidence: FileEvidence[] = [], rows: Json[] = [], featurePaths: string[] = [];
  const values = new Map<string, Json>();
  let totalBytes = manifestBytes.length, terminal = false, lastRetrieved = m.captured_at_start;
  for (let i = 0; i < paths.length; i++) {
    const path = paths[i], a = m.artifacts[i];
    requireValue(a && typeof a === "object", `manifest.json/artifacts/${i}`, "invalid descriptor");
    same(a.path, path, `manifest.json/artifacts/${i}/path`);
    same(a.url, urlFor(path, (i - 2) * 1000), `${path}/url`); same(a.status, 200, `${path}/status`);
    requireValue(timestamp(a.retrieved_at) && a.retrieved_at >= lastRetrieved && a.retrieved_at <= m.captured_at_end, path, "invalid retrieval chronology");
    lastRetrieved = a.retrieved_at;
    requireValue(Number.isSafeInteger(a.bytes) && a.bytes >= 0 && a.bytes <= MAX_BODY && typeof a.sha256 === "string" && HASH.test(a.sha256), path, "invalid byte/checksum declaration");
    const raw = await file(root, path, MAX_BODY);
    totalBytes += raw.length; requireValue(totalBytes <= MAX_TOTAL, path, "archive exceeds 256 MiB");
    same(raw.length, a.bytes, `${path}/bytes`); same(sha256(raw), a.sha256, `${path}/sha256`);
    evidence.push({ path, bytes: raw.length, sha256: sha256(raw) });
    const value = parsed(raw, path);
    if (path.startsWith("pages/")) {
      requireValue(!terminal && Array.isArray(value) && value.length <= 1000 && rows.length + value.length <= 100_000, path, "invalid/excessive page or page after terminal");
      terminal = value.length < 1000;
      rows.push(...value); featurePaths.push(...value.map((_, row) => `${path}/${row}`));
    } else values.set(path, value);
  }
  requireValue(terminal, "pages", "missing terminal short page");
  for (const name of ["metadata-before.json", "metadata-after.json"]) {
    same(atArtifact(name, () => jsonObject(values.get(name)).id), SOURCE.dataset_id, `${name}/id`);
  }
  const before = values.get("metadata-before.json")!, after = values.get("metadata-after.json")!;
  const beforeCount = count(values.get("count-before.json")!, "count-before.json"), afterCount = count(values.get("count-after.json")!, "count-after.json");
  const features: FeatureInput[] = [], seen = new Set<string>();
  let eligible = 0, previous: string | undefined;
  const reasonCounts: Record<string, number> = {}, rejectionSamples: { artifact: string; code: string; path: string }[] = [];
  for (let i = 0; i < rows.length; i++) {
    let f: FeatureInput;
    try { f = canonicalFeature(rows[i]); } catch { throw new ArchiveError(featurePaths[i], "invalid feature/globalid"); }
    requireValue(!seen.has(f.external_id), featurePaths[i], "duplicate globalid");
    requireValue(previous === undefined || previous < f.external_id, featurePaths[i], "globalid is not strictly increasing");
    previous = f.external_id; seen.add(f.external_id); features.push(f);
    const result = curbDbEligibility(rows[i]);
    if (result.state === "ELIGIBLE") eligible++;
    for (const rejection of result.reasons) {
      reasonCounts[rejection.code] = (reasonCounts[rejection.code] ?? 0) + 1;
      if (rejectionSamples.length < 16) rejectionSamples.push({ artifact: featurePaths[i], code: rejection.code, path: rejection.path.slice(0, 256) });
    }
  }
  const dataset = canonicalDataset(rows);
  const schemaBefore = atArtifact("metadata-before.json", () => schemaDigest(before));
  const schemaAfter = atArtifact("metadata-after.json", () => schemaDigest(after));
  const metadataBefore = digest("metadata", before), metadataAfter = digest("metadata", after);
  const consistent = beforeCount === afterCount && rows.length === beforeCount && schemaBefore === schemaAfter && metadataBefore === metadataAfter;
  const usable = rows.filter(supportedLineString).length;
  const summary = { state: consistent ? "CONSISTENT" : "POSSIBLY_CHANGED_DURING_CAPTURE", row_count: rows.length,
    distinct_external_id_count: seen.size, usable_geometry_count: usable, ordered: true, count_before: beforeCount, count_after: afterCount,
    schema_before: schemaBefore, schema_after: schemaAfter, metadata_before: metadataBefore, metadata_after: metadataAfter,
    dataset_sha256: dataset.dataset_sha256, identity_geometry_sha256: dataset.identity_geometry_sha256, external_ids_sha256: dataset.external_ids_sha256,
    locally_eligible: consistent && rows.length > 0 && usable === rows.length };
  requireValue(m.summary && typeof m.summary === "object", "manifest.json/summary", "missing summary");
  for (const [key, value] of Object.entries(summary)) same(m.summary[key], value, `manifest.json/summary/${key}`);
  same(m.summary, summary, "manifest.json/summary");
  const rawPagesSha = digest("raw-pages", evidence.filter(a => a.path.startsWith("pages/")).map(a => [a.path, a.bytes, a.sha256]));
  same(m.raw_pages_sha256, rawPagesSha, "manifest.json/raw_pages_sha256");
  // Logical package checksum, not SHA-256 of a tar/zip encoding. No host paths in this preimage.
  const artifactSha = sha256("city-curb/artifact-package/v1\n" + canonicalJson({ contract: PACKAGE_CONTRACT,
    manifest: { path: "manifest.json", bytes: manifestBytes.length, sha256: manifestSha }, raw: evidence }));
  if (expected.artifactSha256) same(artifactSha, expected.artifactSha256, "expected artifact checksum");
  const implementationSha = sha256(canonicalJson(await Promise.all([
    "verify-curb-snapshot-archive.ts", "canonicalize-curb-snapshot.ts", "lossless-json-number.ts", "curb-db-eligibility.ts",
  ].map(async name => [name, sha256(await readFile(join(__dirname, name)))]))));
  const report = { verifier_contract_version: ARCHIVE_VERIFIER, implementation_version: "1.0.0", implementation_sha256: implementationSha,
    verified_at: new Date().toISOString(), status: consistent && rows.length > 0 && eligible === rows.length ? "PASS" : "FAIL",
    source: { ...SOURCE, source_key: "datasf_citywide_curbs", api_endpoint: ENDPOINT }, snapshot_contract: SNAPSHOT, canonicalization_contract: CONTRACT,
    artifact_contract: PACKAGE_CONTRACT, artifact_sha256: artifactSha, manifest_sha256: manifestSha, raw_pages_sha256: rawPagesSha,
    external_expectations_checked: { artifact: !!expected.artifactSha256, manifest: !!expected.manifestSha256 },
    raw_file_count: evidence.length, page_count: pageCount, raw_byte_count: evidence.reduce((sum, f) => sum + f.bytes, 0),
    row_count: rows.length, distinct_external_id_count: seen.size, duplicate_id_count: 0, missing_id_count: 0, ordered: true,
    capture_consistency: summary.state, count_before: beforeCount, count_after: afterCount, schema_sha256: schemaAfter,
    metadata_before_sha256: metadataBefore, metadata_after_sha256: metadataAfter, external_ids_sha256: dataset.external_ids_sha256,
    eligibility_version: DB_ELIGIBILITY, eligible_row_count: eligible, ineligible_row_count: rows.length - eligible,
    rejection_reason_counts: reasonCounts, rejection_samples: rejectionSamples,
    dataset_sha256: dataset.dataset_sha256, identity_geometry_sha256: dataset.identity_geometry_sha256,
    archive_content_seal_version: "curb-archive-content-v1", archive_content_sha256: archiveContentSeal(features),
    database_membership_seal: null, database_attestation_ready: false };
  return { report, members: features };
}

/** Outputs never enter or overwrite retained evidence. Parent must already exist. */
export async function writeVerificationOutput(archive: string, output: string, result: unknown, members?: FeatureInput[]) {
  const archiveReal = await realpath(archive), target = resolve(await realpath(dirname(resolve(output))), resolve(output).split(/[\\/]/).pop()!);
  const rel = relative(archiveReal, target);
  requireValue(rel !== "" && (rel === ".." || rel.startsWith("..\\") || rel.startsWith("../") || isAbsolute(rel)), "output", "must be outside the archive");
  await mkdir(target); // Exclusive new directory: no replacement of previous evidence/reports.
  await writeFile(join(target, "verification-report.json"), canonicalJson(result) + "\n", { flag: "wx" });
  if (members) await writeFile(join(target, "membership-inputs.json"), canonicalJson({ contract: "curb-archive-content-v1", members }) + "\n", { flag: "wx" });
}
async function main() {
  const options = new Map<string, string>();
  for (const arg of process.argv.slice(2)) {
    const match = /^--(archive|out|expected-artifact-sha256|expected-manifest-sha256)=(.+)$/.exec(arg);
    requireValue(match && !options.has(match[1]), "arguments", "use unique --archive=DIR [--out=NEW_DIR] [--expected-artifact-sha256=HEX --expected-manifest-sha256=HEX]");
    options.set(match[1], match[2]);
  }
  const archive = options.get("archive"), out = options.get("out");
  requireValue(archive, "arguments", "--archive is required");
  try {
    const result = await verifyFullArchive(archive, { ...(options.has("expected-artifact-sha256") ? { artifactSha256: options.get("expected-artifact-sha256")! } : {}),
      ...(options.has("expected-manifest-sha256") ? { manifestSha256: options.get("expected-manifest-sha256")! } : {}) });
    if (out) await writeVerificationOutput(archive, out, result.report, result.members);
    console.log(canonicalJson(result.report));
    if (result.report.status !== "PASS") process.exitCode = 1;
  } catch (error) {
    const report = { verifier_contract_version: ARCHIVE_VERIFIER, implementation_version: "1.0.0", verified_at: new Date().toISOString(), status: "FAIL",
      artifact: error instanceof ArchiveError ? error.artifact.slice(0, 256) : "archive", reason: error instanceof ArchiveError ? error.message.slice(0, 512) : "invalid archive structure" };
    if (out) await writeVerificationOutput(archive, out, report);
    console.log(canonicalJson(report)); process.exitCode = 1;
  }
}
if (require.main === module) main().catch(error => { console.error(error instanceof ArchiveError ? error.message : "Archive verification/output failed"); process.exitCode = 1; });

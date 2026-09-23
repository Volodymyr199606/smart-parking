/** Generated synthetic archives only. No cloud, DB or source access. */
import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { canonicalDataset, canonicalJson, CONTRACT, digest, parseSourceJson, schemaDigest, sha256, SOURCE, supportedLineString } from "./canonicalize-curb-snapshot";
import { archiveContentSeal, ArchiveError, verifyFullArchive, writeVerificationOutput } from "./verify-curb-snapshot-archive";

const coordinate = "-122.37952207229336";
const row = (i: number, extra = "") => `{"globalid":"fixture-${String(i).padStart(4, "0")}","shape":{"type":"LineString","coordinates":[[${coordinate},37.732536608656226],[-122.37952207229335,37.743691137180925]]}${extra}}`;
type Fixture = { files: Map<string, Buffer>; manifest: any };
function fixture(texts = Array.from({ length: 1001 }, (_, i) => row(i))): Fixture {
  const files = new Map<string, Buffer>();
  const metadata = '{"id":"pep9-66vw","columns":[{"fieldName":"globalid","dataTypeName":"text"},{"fieldName":"shape","dataTypeName":"line"}]}';
  files.set("metadata-before.json", Buffer.from(metadata));
  files.set("count-before.json", Buffer.from(`[{"n":"${texts.length}"}]`));
  for (let i = 0; i <= texts.length; i += 1000) files.set(`pages/${String(i).padStart(6, "0")}.json`, Buffer.from("[" + texts.slice(i, i + 1000).join(",") + "]"));
  files.set("count-after.json", Buffer.from(`[{"n":"${texts.length}"}]`));
  files.set("metadata-after.json", Buffer.from(metadata));
  const rows = texts.map(t => parseSourceJson(t)), meta = parseSourceJson(metadata), dataset = canonicalDataset(rows);
  const artifacts = [...files].map(([path, bytes]) => {
    const url = new URL(path.startsWith("metadata") ? "https://data.sf.gov/api/views/pep9-66vw.json" : "https://data.sf.gov/resource/pep9-66vw.json");
    if (path.startsWith("count")) url.searchParams.set("$select", "count(*) as n");
    else if (path.startsWith("pages/")) {
      url.searchParams.set("$select", "*"); url.searchParams.set("$order", "globalid ASC");
      url.searchParams.set("$limit", "1000"); url.searchParams.set("$offset", String(Number(path.slice(6, 12))));
    }
    return { path, bytes: bytes.length, sha256: sha256(bytes), url: url.toString(), status: 200, headers: {}, retrieved_at: "2026-09-22T00:00:01.000Z" };
  });
  const manifest = { format_version: "curb-snapshot-v2", canonicalization_version: CONTRACT, ...SOURCE, source_key: "datasf_citywide_curbs",
    api_endpoint: "https://data.sf.gov/resource/pep9-66vw.json", captured_at_start: "2026-09-22T00:00:00.000Z", captured_at_end: "2026-09-22T00:00:02.000Z",
    query: { select: "*", order: "globalid ASC", page_size: 1000, offset_step: 1000, filter: null }, fetch_tool_version: "curb-capture-v2",
    tool_sources_sha256: "a".repeat(64), node_version: process.version, retry_events: [], retry_count: 0,
    body_representation: "HTTP entity bytes after fetch content decoding; not compressed wire bytes", artifacts,
    raw_pages_sha256: digest("raw-pages", artifacts.filter(a => a.path.startsWith("pages/")).map(a => [a.path, a.bytes, a.sha256])),
    summary: { state: "CONSISTENT", row_count: texts.length, distinct_external_id_count: texts.length,
      usable_geometry_count: rows.filter(supportedLineString).length, ordered: true, count_before: texts.length, count_after: texts.length,
      schema_before: schemaDigest(meta), schema_after: schemaDigest(meta), metadata_before: digest("metadata", meta), metadata_after: digest("metadata", meta),
      dataset_sha256: dataset.dataset_sha256, identity_geometry_sha256: dataset.identity_geometry_sha256, external_ids_sha256: dataset.external_ids_sha256,
      locally_eligible: texts.length > 0 && rows.every(supportedLineString) } };
  return { files, manifest };
}
function clone(f: Fixture): Fixture { return { files: new Map([...f.files].map(([p, b]) => [p, Buffer.from(b)])), manifest: JSON.parse(JSON.stringify(f.manifest)) }; }
function edit(f: Fixture, path: string, fn: (text: string) => string, refresh = false) {
  const bytes = Buffer.from(fn(f.files.get(path)!.toString("utf8"))); f.files.set(path, bytes);
  if (refresh) {
    const a = f.manifest.artifacts.find((a: any) => a.path === path); a.bytes = bytes.length; a.sha256 = sha256(bytes);
    f.manifest.raw_pages_sha256 = digest("raw-pages", f.manifest.artifacts.filter((a: any) => a.path.startsWith("pages/")).map((a: any) => [a.path, a.bytes, a.sha256]));
  }
}
async function main() {
  const args = process.argv.slice(2);
  assert(args.every(a => /^--(real-archive|real-out)=.+$/.test(a)), "Use optional --real-archive=DIR --real-out=NEW_DIR");
  const realArchive = args.find(a => a.startsWith("--real-archive="))?.slice(15);
  const realOut = args.find(a => a.startsWith("--real-out="))?.slice(11);
  assert(!realOut || realArchive, "--real-out requires --real-archive");
  // Any accidental networking in the offline implementation becomes a test failure.
  const denied = () => { throw new Error("NETWORK FORBIDDEN during archive verification"); };
  const restore: (() => void)[] = [];
  const savedFetch = globalThis.fetch; globalThis.fetch = denied; restore.push(() => { globalThis.fetch = savedFetch; });
  for (const [module, names] of [["node:net", ["connect", "createConnection"]], ["node:http", ["request", "get"]],
    ["node:https", ["request", "get"]], ["node:dns", ["lookup", "resolve"]], ["node:tls", ["connect"]]] as const) {
    const api = require(module);
    for (const name of names) { const saved = api[name]; api[name] = denied; restore.push(() => { api[name] = saved; }); }
  }
  const root = await mkdtemp(join(tmpdir(), "curb-archive-tests-"));
  let checks = 0, serial = 0;
  const pass = (name: string) => { checks++; console.log(`PASS ${name}`); };
  async function materialize(f: Fixture) {
    const dir = join(root, String(serial++)); await mkdir(dir); await mkdir(join(dir, "pages"));
    for (const [path, bytes] of f.files) await writeFile(join(dir, path), bytes);
    const manifest = canonicalJson(f.manifest) + "\n";
    await writeFile(join(dir, "manifest.json"), manifest); await writeFile(join(dir, "manifest.sha256"), sha256(manifest) + "\n");
    return dir;
  }
  try {
    const original = fixture(), first = await materialize(original), verified = await verifyFullArchive(first);
    assert.equal(verified.report.status, "PASS"); assert.equal(verified.report.eligible_row_count, 1001); assert.equal(verified.report.page_count, 2);
    pass("complete multi-page reconstruction with networking disabled");
    const twice = await verifyFullArchive(first);
    assert.deepEqual({ ...verified.report, verified_at: "" }, { ...twice.report, verified_at: "" }); assert.deepEqual(verified.members, twice.members);
    pass("double replay deterministic except verified_at");
    const moved = await verifyFullArchive(await materialize(original));
    assert.deepEqual({ ...verified.report, verified_at: "" }, { ...moved.report, verified_at: "" }); pass("host filesystem path excluded from identity");
    const anchored = await verifyFullArchive(first, { artifactSha256: verified.report.artifact_sha256, manifestSha256: verified.report.manifest_sha256 });
    assert(anchored.report.external_expectations_checked.artifact && anchored.report.external_expectations_checked.manifest); pass("external artifact and manifest anchors verified");
    for (const expectations of [{ artifactSha256: "0".repeat(64) }, { manifestSha256: "0".repeat(64) }, { artifactSha256: "invalid" }]) {
      await assert.rejects(() => verifyFullArchive(first, expectations), ArchiveError); pass("wrong external checksum rejected");
    }
    const bad = async (name: string, mutate: (f: Fixture) => void, path: RegExp) => {
      const f = clone(original); mutate(f);
      await assert.rejects(() => materialize(f).then(dir => verifyFullArchive(dir)), error => error instanceof ArchiveError && path.test(error.message)); pass(name);
    };
    for (const key of ["row_count", "distinct_external_id_count", "count_before", "count_after", "usable_geometry_count"]) {
      await bad(`lying ${key}`, f => { f.manifest.summary[key]++; }, new RegExp(key));
    }
    for (const key of ["dataset_sha256", "identity_geometry_sha256", "external_ids_sha256", "schema_before", "metadata_after"]) {
      await bad(`lying ${key}`, f => { f.manifest.summary[key] = "0".repeat(64); }, new RegExp(key));
    }
    for (const [key, value] of [["canonicalization_version", "curb-jcs-v1"], ["format_version", "curb-snapshot-v1"],
      ["source_key", "other"], ["dataset_id", "other"], ["provider", "other"], ["api_endpoint", "https://data.sfgov.org/resource/pep9-66vw.json"]]) {
      await bad(`wrong ${key}`, f => { f.manifest[key] = value; }, new RegExp(key));
    }
    await bad("page checksum lie", f => { f.manifest.artifacts[2].sha256 = "0".repeat(64); }, /pages\/000000.json\/sha256/);
    await bad("artifact byte length lie", f => { f.manifest.artifacts[2].bytes++; }, /pages\/000000.json\/bytes/);
    await bad("reordered page declaration", f => { [f.manifest.artifacts[2], f.manifest.artifacts[3]] = [f.manifest.artifacts[3], f.manifest.artifacts[2]]; }, /artifacts\/2\/path/);
    await bad("missing page declaration", f => { f.manifest.artifacts.splice(2, 1); }, /pages inventory/);
    await bad("duplicate page declaration", f => { f.manifest.artifacts[3] = f.manifest.artifacts[2]; }, /artifacts\/3\/path/);
    await bad("path traversal declaration", f => { f.manifest.artifacts[2].path = "../secret"; }, /artifacts\/2\/path/);
    await bad("changed coordinate digit", f => edit(f, "pages/000000.json", s => s.replace(coordinate, "-122.37952207229337")), /pages\/000000.json\/sha256/);
    await bad("single page byte changed", f => edit(f, "pages/000000.json", s => " " + s.slice(1)), /pages\/000000.json\/sha256/);
    await bad("page deleted", f => { f.files.delete("pages/000000.json"); }, /pages inventory/);
    await bad("undeclared duplicate page", f => { f.files.set("pages/copy.json", f.files.get("pages/000000.json")!); }, /pages inventory/);
    await bad("page bytes duplicated", f => { f.files.set("pages/001000.json", f.files.get("pages/000000.json")!); }, /pages\/001000.json/);
    await bad("page bytes swapped", f => { const a = f.files.get("pages/000000.json")!; f.files.set("pages/000000.json", f.files.get("pages/001000.json")!); f.files.set("pages/001000.json", a); }, /pages\/000000.json/);
    await bad("page truncated", f => edit(f, "pages/000000.json", s => s.slice(0, -1)), /pages\/000000.json/);
    await bad("metadata altered", f => edit(f, "metadata-before.json", s => s.replace("globalid", "globxlid")), /metadata-before.json/);
    await bad("count altered", f => edit(f, "count-before.json", s => s.replace("1001", "1002")), /count-before.json/);
    await bad("globalid altered", f => edit(f, "pages/000000.json", s => s.replace("fixture-0000", "fixture-xxxx")), /pages\/000000.json/);
    await bad("rehashed duplicate globalid", f => edit(f, "pages/000000.json", s => s.replace("fixture-0001", "fixture-0000"), true), /pages\/000000.json\/1: duplicate/);
    await bad("rehashed missing globalid", f => edit(f, "pages/000000.json", s => s.replace('"globalid"', '"unknown"'), true), /pages\/000000.json\/0: invalid/);
    await bad("rehashed unordered IDs", f => edit(f, "pages/000000.json", s => s.replace("fixture-0000", "fixture-xxxx"), true), /strictly increasing/);
    await bad("rehashed coordinate still fails logical digest", f => edit(f, "pages/000000.json", s => s.replace(coordinate, "-122.37952207229337"), true), /summary\/dataset_sha256/);
    await bad("rehashed raw metadata identity lie", f => edit(f, "metadata-before.json", s => s.replace("pep9-66vw", "other-id"), true), /metadata-before.json\/id/);
    await bad("rehashed malformed metadata structure names artifact", f => edit(f, "metadata-before.json", s => s.replace('"columns"', '"unknown"'), true), /metadata-before.json: invalid response structure/);
    await bad("rehashed malformed count structure names artifact", f => edit(f, "count-before.json", () => "[null]", true), /count-before.json: invalid response structure/);
    await bad("rehashed count still independently parsed", f => edit(f, "count-before.json", s => s.replace("1001", "1002"), true), /summary\/state/);
    await bad("rehashed malformed page", f => edit(f, "pages/000000.json", s => s.slice(0, -1), true), /pages\/000000.json: invalid lossless/);
    await bad("rehashed duplicate JSON keys", f => edit(f, "pages/000000.json", s => s.replace('"globalid":', '"globalid":"duplicate","globalid":'), true), /pages\/000000.json: invalid lossless/);
    await bad("malicious query filter", f => { f.manifest.query.filter = "anything"; }, /query/);
    const fractional = await materialize(original);
    const fractionalBytes = (await readFile(join(fractional, "manifest.json"), "utf8")).replace('"retry_count":0', '"retry_count":0.5');
    await writeFile(join(fractional, "manifest.json"), fractionalBytes); await writeFile(join(fractional, "manifest.sha256"), sha256(fractionalBytes) + "\n");
    await assert.rejects(() => verifyFullArchive(fractional), /manifest.json: invalid control metadata/); pass("manifest fractional control rejected losslessly");
    const ineligible = await verifyFullArchive(await materialize(fixture([row(0, ',"extra":1e8192')])));
    assert.equal(ineligible.report.status, "FAIL"); assert.equal(ineligible.report.eligible_row_count, 0); assert.equal(ineligible.report.ineligible_row_count, 1);
    assert.equal(ineligible.report.rejection_reason_counts.NUMERIC_TOKEN_TOO_LONG, 1); pass("full eligibility replay retains ineligible evidence and reasons");
    const empty = await verifyFullArchive(await materialize(fixture([]))); assert.equal(empty.report.status, "FAIL"); pass("empty capture cannot PASS");
    const exact = await verifyFullArchive(await materialize(fixture(Array.from({ length: 1000 }, (_, i) => row(i)))));
    assert.equal(exact.report.page_count, 2); assert.equal(exact.report.status, "PASS"); pass("exact page-size multiple requires empty terminal page");
    assert.equal(archiveContentSeal(verified.members), archiveContentSeal([...verified.members].reverse())); pass("archive seal uses deterministic identity ordering");
    const changed = verified.members.map(f => ({ ...f })); changed[0].geometry_sha256 = "0".repeat(64);
    assert.notEqual(archiveContentSeal(changed), verified.report.archive_content_sha256); pass("archive seal binds geometry hashes");
    assert(verified.members.every(f => !Object.hasOwn(f, "id"))); assert.equal(verified.report.database_membership_seal, null); pass("archive never invents DB version UUIDs or membership seals");
    const out = join(root, "reports"); await writeVerificationOutput(first, out, verified.report, verified.members);
    assert.equal(JSON.parse(await readFile(join(out, "verification-report.json"), "utf8")).status, "PASS"); pass("bounded machine report and member inputs written separately");
    await assert.rejects(() => writeVerificationOutput(first, out, verified.report)); pass("existing output is never overwritten");
    await assert.rejects(() => writeVerificationOutput(first, join(first, "report"), verified.report), /outside the archive/); pass("reports cannot mutate archive inventory");
    if (realArchive) {
      const a = await verifyFullArchive(realArchive), b = await verifyFullArchive(realArchive);
      assert.equal(a.report.status, "PASS"); assert.equal(a.report.row_count, 18355); assert.equal(a.report.distinct_external_id_count, 18355);
      assert.equal(a.report.eligible_row_count, 18355); assert.equal(a.report.ineligible_row_count, 0);
      assert.equal(a.report.dataset_sha256, "f536717d946b36d19bfcb9ae2d7ca0e753fe09e4e08e3bde1356ad0c6c5216a2");
      assert.equal(a.report.identity_geometry_sha256, "3051d88c0c71122a0945903c268a4db07431dc258d93aa575366fcc9e13202c6");
      assert.deepEqual({ ...a.report, verified_at: "" }, { ...b.report, verified_at: "" }); assert.deepEqual(a.members, b.members);
      pass("retained 18,355-row archive: two full offline replays, expected digests/eligibility, complete deterministic outputs");
      if (realOut) {
        await mkdir(realOut);
        await writeVerificationOutput(realArchive, join(realOut, "first"), a.report, a.members);
        await writeVerificationOutput(realArchive, join(realOut, "second"), b.report, b.members);
      }
      console.log(canonicalJson(a.report));
    }
    console.log(`${checks} archive checks passed; networking disabled; synthetic fixtures removed on exit.`);
  } finally {
    restore.reverse().forEach(fn => fn());
    assert.equal(dirname(resolve(root)), resolve(tmpdir())); assert(basename(root).startsWith("curb-archive-tests-"));
    await rm(root, { recursive: true, force: true });
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });

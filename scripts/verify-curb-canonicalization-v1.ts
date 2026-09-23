/** Deterministic zero-network contract verification. No test framework or database. */
import assert from "node:assert/strict";
import { canonicalJson, parseSourceJson, canonicalFeature, canonicalDataset, schemaDigest, sha256, supportedLineString, digest, CONTRACT, SOURCE } from "./canonicalize-curb-snapshot-v1";
import { captureState, summarizeCapture as summarizeCurrent, verifyArchive } from "./capture-curb-snapshot";
const summarizeCapture = (rows: unknown[], before: unknown, after: unknown, beforeCount: number, afterCount: number) => summarizeCurrent(rows, before, after, beforeCount, afterCount, CONTRACT);
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

let checks = 0;
function check(name: string, run: () => void) { run(); checks++; console.log(`PASS ${name}`); }
const shape = { type: "LineString", coordinates: [[-122.44, 37.77], [-122.439, 37.771]] };
const row = { globalid: "{A}", shape, name: "Café", sfpark_id: null };
const f = canonicalFeature(row);
check("SHA-256 known vector", () => assert.equal(sha256("abc"), "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"));
check("recursive key order and integer-looking keys", () => assert.equal(canonicalJson({ "2": 2, "10": 10, z: { b: true, a: null } }), '{"10":10,"2":2,"z":{"a":null,"b":true}}'));
check("whitespace and escaped spelling", () => assert.equal(canonicalJson(parseSourceJson(' { "b":1.00, "a":"\\u0061" } ')), '{"a":"a","b":1}'));
check("same geometry with reordered keys", () => assert.equal(canonicalFeature({ ...row, shape: { coordinates: shape.coordinates, type: shape.type } }).geometry_sha256, f.geometry_sha256));
check("fixed geometry envelope and hash domain", () => assert.equal(f.geometry_sha256, sha256('city-curb/geometry/v1\n{"presence":"VALUE","value":{"coordinates":[[-122.44,37.77],[-122.439,37.771]],"type":"LineString"}}')));
check("reversal changes geometry and content", () => { const other = canonicalFeature({ ...row, shape: { ...shape, coordinates: [...shape.coordinates].reverse() } }); assert.notEqual(other.geometry_sha256, f.geometry_sha256); assert.notEqual(other.content_sha256, f.content_sha256); });
check("coordinate mutation", () => assert.notEqual(canonicalFeature({ ...row, shape: { ...shape, coordinates: [[-122.440001, 37.77], shape.coordinates[1]] } }).geometry_sha256, f.geometry_sha256));
check("added point", () => assert.notEqual(canonicalFeature({ ...row, shape: { ...shape, coordinates: [...shape.coordinates, [-122.438, 37.772]] } }).geometry_sha256, f.geometry_sha256));
check("removed point", () => assert.notEqual(canonicalFeature({ ...row, shape: { ...shape, coordinates: [shape.coordinates[0]] } }).geometry_sha256, f.geometry_sha256));
check("attribute order", () => assert.deepEqual(canonicalFeature({ sfpark_id: null, name: "Café", shape, globalid: "{A}" }), f));
check("attribute change leaves geometry alone", () => { const other = canonicalFeature({ ...row, name: "New" }); assert.equal(other.geometry_sha256, f.geometry_sha256); assert.notEqual(other.attributes_sha256, f.attributes_sha256); assert.notEqual(other.content_sha256, f.content_sha256); });
check("missing attribute differs from null", () => assert.notEqual(canonicalFeature({ globalid: row.globalid, name: row.name, shape }).attributes_sha256, f.attributes_sha256));
check("absent/null/value geometry differ", () => assert.equal(new Set([{ globalid: "A" }, { globalid: "A", shape: null }, { globalid: "A", shape }].map(x => canonicalFeature(x).geometry_sha256)).size, 3));
check("unknown source and geometry members retained", () => { assert.notEqual(canonicalFeature({ ...row, future: true }).content_sha256, f.content_sha256); assert.notEqual(canonicalFeature({ ...row, shape: { ...shape, future: true } }).geometry_sha256, f.geometry_sha256); });
check("dataset row order and inputs preserved", () => { const rows = [row, { ...row, globalid: "{B}" }]; const original = JSON.stringify(rows); assert.equal(canonicalDataset(rows).dataset_sha256, canonicalDataset([...rows].reverse()).dataset_sha256); assert.equal(JSON.stringify(rows), original); });
check("duplicate identities including changed content rejected", () => assert.throws(() => canonicalDataset([row, { ...row, name: "Other" }]), /Duplicate external_id/));
check("missing/invalid identities rejected", () => { for (const globalid of [undefined, null, 1, "", " ", "NULL"]) assert.throws(() => canonicalFeature({ globalid, shape })); });
check("new external ID does not reuse content identity", () => { const other = canonicalFeature({ ...row, globalid: "{B}" }); assert.equal(other.geometry_sha256, f.geometry_sha256); assert.notEqual(other.content_sha256, f.content_sha256); });
check("decoded duplicate JSON keys and prototype keys", () => { assert.throws(() => parseSourceJson('{"a":1,"\\u0061":2}'), /Duplicate JSON/); assert.equal(canonicalJson(parseSourceJson('{"__proto__":{"a":1}}')), '{"__proto__":{"a":1}}'); });
check("Unicode UTF-16 sorting and no normalization", () => { assert.equal(canonicalJson({ "\ue000": 1, "😀": 2, a: 3 }), '{"a":3,"😀":2,"":1}'); assert.notEqual(canonicalJson("é"), canonicalJson("e\u0301")); });
check("Unicode/UTF-8 rejection", () => { for (const s of ['"\\ud800"', '"\\udc00"', '{"\\ud800":0}']) assert.throws(() => parseSourceJson(s)); assert.throws(() => parseSourceJson(new Uint8Array([0xc0, 0xaf]))); assert.throws(() => parseSourceJson(new Uint8Array([0xef, 0xbb, 0xbf, 0x30]))); });
check("numeric serialization boundaries", () => assert.equal(canonicalJson([-0, 1e-7, 1e-6, 1e20, 1e21, Number.MIN_VALUE]), '[0,1e-7,0.000001,100000000000000000000,1e+21,5e-324]'));
check("source decimal precision guard", () => { for (const s of ["9007199254740993", "0.10000000000000001", "1e400", "1e-400"]) assert.throws(() => parseSourceJson(s), /precision/); for (const s of ["0.1", "-122.440000", "1.000e2", "-0", "5e-324"]) assert.equal(canonicalJson(parseSourceJson(s)), JSON.stringify(Number(s))); });
check("invalid JSON grammar", () => { for (const s of ['{"a":1,}', '[1,]', '01', 'true false', '"\n"', '', '[', 'NaN']) assert.throws(() => parseSourceJson(s)); });
check("non-JSON JS values and cycles rejected", () => { const cycle: unknown[] = []; cycle.push(cycle); for (const v of [undefined, NaN, Infinity, 1n, new Date(), [, 1], { a: undefined }, { get a() { throw Error("getter ran"); } }, cycle]) assert.throws(() => canonicalJson(v)); });
check("schema ordering stable; schema change visible", () => { const columns = [{ fieldName: "shape", dataTypeName: "line" }, { fieldName: "globalid", dataTypeName: "text" }]; assert.equal(schemaDigest({ columns }), schemaDigest({ columns: [...columns].reverse() })); assert.notEqual(schemaDigest({ columns }), schemaDigest({ columns: [...columns, { fieldName: "new", dataTypeName: "text" }] })); });
check("geometry publication gate is separate from hashing", () => { assert(supportedLineString(row)); for (const invalid of [null, { type: "MultiLineString", coordinates: [shape.coordinates] }, { ...shape, coordinates: [[0, 0], [0, 0]] }, { ...shape, coordinates: [[181, 0], [0, 0]] }]) { assert(!supportedLineString({ ...row, shape: invalid })); assert(canonicalFeature({ ...row, shape: invalid }).content_sha256); } });
check("capture agreement does not mask drift or invalid input", () => {
  const baseline = { valid: true, beforeCount: 2, afterCount: 2, rows: 2, metadataEqual: true, schemaEqual: true, ordered: true };
  assert.equal(captureState(baseline), "CONSISTENT");
  for (const change of [{ afterCount: 3 }, { rows: 1 }, { metadataEqual: false }, { schemaEqual: false }, { ordered: false }]) {
    assert.equal(captureState({ ...baseline, ...change }), "POSSIBLY_CHANGED_DURING_CAPTURE");
  }
  assert.equal(captureState({ ...baseline, valid: false }), "INVALID");
  assert.equal(captureState({ ...baseline, beforeCount: NaN }), "INVALID");
});
async function archiveChecks() {
  const directory = await mkdtemp(join(tmpdir(), "curb-contract-fixture-"));
  await mkdir(join(directory, "pages"));
  const endpoint = "https://data.sfgov.org/resource/pep9-66vw.json";
  const countUrl = new URL(endpoint); countUrl.searchParams.set("$select", "count(*) as n");
  const pageUrl = new URL(endpoint);
  for (const [key, value] of [["$select", "*"], ["$order", "globalid ASC"], ["$limit", "1000"], ["$offset", "0"]]) pageUrl.searchParams.set(key, value);
  const metadata = { columns: [{ fieldName: "globalid", dataTypeName: "text" }, { fieldName: "shape", dataTypeName: "line" }], rowsUpdatedAt: 1 };
  const bodies = [
    ["metadata-before.json", "https://data.sfgov.org/api/views/pep9-66vw.json", JSON.stringify(metadata)],
    ["count-before.json", countUrl.toString(), '[{"n":"1"}]'],
    ["pages/000000.json", pageUrl.toString(), JSON.stringify([row])],
    ["count-after.json", countUrl.toString(), '[{"n":"1"}]'],
    ["metadata-after.json", "https://data.sfgov.org/api/views/pep9-66vw.json", JSON.stringify(metadata)],
  ];
  const artifacts = await Promise.all(bodies.map(async ([path, url, bytes]) => {
    await writeFile(join(directory, path), bytes, { flag: "wx" });
    return { path, url, bytes: Buffer.byteLength(bytes), sha256: sha256(bytes), retrieved_at: "2026-01-01T00:00:00.000Z", status: 200, headers: {} };
  }));
  const manifest = { format_version: "curb-snapshot-v1", canonicalization_version: CONTRACT, ...SOURCE, api_endpoint: endpoint,
    query: { select: "*", order: "globalid ASC", page_size: 1000, offset_step: 1000, filter: null }, artifacts,
    raw_pages_sha256: digest("raw-pages", artifacts.filter(a => a.path.startsWith("pages/")).map(a => [a.path, a.bytes, a.sha256])),
    summary: summarizeCapture([row], metadata, metadata, 1, 1) };
  async function saveManifest(value: unknown) {
    const bytes = canonicalJson(value) + "\n";
    await writeFile(join(directory, "manifest.json"), bytes);
    await writeFile(join(directory, "manifest.sha256"), sha256(bytes) + "\n");
  }
  await saveManifest(manifest);
  assert.equal((await verifyArchive(directory)).summary.dataset_sha256, canonicalDataset([row]).dataset_sha256);
  checks++; console.log("PASS offline archive reconstruction from raw bodies");
  await writeFile(join(directory, "pages/000000.json"), bodies[2][2] + " ");
  await assert.rejects(() => verifyArchive(directory)); checks++; console.log("PASS raw artifact corruption rejected");
  await writeFile(join(directory, "pages/000000.json"), bodies[2][2]);
  await saveManifest({ ...manifest, query: { ...manifest.query, order: "name ASC" } });
  await assert.rejects(() => verifyArchive(directory)); checks++; console.log("PASS wrong capture query rejected");
  await saveManifest({ ...manifest, summary: { ...manifest.summary, dataset_sha256: "0".repeat(64) } });
  await assert.rejects(() => verifyArchive(directory)); checks++; console.log("PASS manifest content disagreement rejected");
  await saveManifest(manifest); // Leave a valid, synthetic fixture for independent offline replay.
  const currentHostManifest = { ...manifest, api_endpoint: endpoint.replace("data.sfgov.org", "data.sf.gov"),
    artifacts: artifacts.map(a => ({ ...a, url: a.url.replace("data.sfgov.org", "data.sf.gov") })) };
  await saveManifest(currentHostManifest);
  assert.equal((await verifyArchive(directory)).summary.dataset_sha256, manifest.summary.dataset_sha256);
  checks++; console.log("PASS current DataSF host reconstructs identically to legacy archives");
  await saveManifest({ ...currentHostManifest, artifacts });
  await assert.rejects(() => verifyArchive(directory)); checks++; console.log("PASS mixed legacy/current artifact endpoints rejected");
  await saveManifest(currentHostManifest);
  console.log(`Curb canonicalization: ${checks} checks passed; zero network or database access. Synthetic fixture: ${directory}`);
}
export const legacyVerification = archiveChecks();
if (require.main === module) legacyVerification.catch(error => { console.error(error); process.exitCode = 1; });

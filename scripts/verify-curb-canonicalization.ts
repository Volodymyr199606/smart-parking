/** Offline V2 conformance plus preserved V1 replay. No network or database. */
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { canonicalJson, parseSourceJson, canonicalFeature, canonicalDataset, sha256, supportedLineString, digest, CONTRACT, SOURCE, LosslessJsonNumber, toDiagnosticNumber } from "./canonicalize-curb-snapshot";
import * as v1 from "./canonicalize-curb-snapshot-v1";
import { summarizeCapture, verifyArchive } from "./capture-curb-snapshot";
import { fetchDataSfJson } from "./fetch-datasf-json";
import { legacyVerification } from "./verify-curb-canonicalization-v1";

let checks = 0;
function check(name: string, action: () => void) { action(); checks++; console.log(`PASS V2 ${name}`); }
const number = LosslessJsonNumber.fromToken;
const realTokens = ["-122.37952207229336", "37.732536608656226", "37.743691137180925", "-122.43840032071572", "-122.45281351125684", "37.711929941578966", "-122.40468496538819", "37.768428921166255"];
const rawRow = '{"globalid":"{A}","shape":{"type":"LineString","coordinates":[[-122.37952207229336,37.732536608656226],[-122.37951983978475,37.7325411169665]]},"large":9007199254740993,"precise":0.10000000000000001,"exponent":1.2300e2,"future":{"n":1e-400},"nullable":null}';
const row = parseSourceJson(rawRow), feature = canonicalFeature(row);
const replace = (from: string, to: string) => parseSourceJson(rawRow.replace(from, to));

async function main() {
  await legacyVerification;
  for (const [input, expected] of [
    ["1", "1"], ["1.0", "1"], ["1.00", "1"], ["1e0", "1"], ["1E+0", "1"],
    ["0.10", "0.1"], ["0.100", "0.1"], ["-0", "0"], ["-0.0", "0"], ["0e999999", "0"],
    ["1.23e2", "123"], ["1.2300e+2", "123"], ["123", "123"], ["12300e-2", "123"],
    ["9007199254740993", "9007199254740993"], ["0.10000000000000001", "0.10000000000000001"],
    ["1e-400", "1e-400"], ["1e400", "1e400"], ["1e-6", "0.000001"], ["1e-7", "1e-7"],
    ["1e20", "100000000000000000000"], ["1e21", "1e21"], ["-123.4500e-10", "-1.2345e-8"],
    ["1e1000000", "1e1000000"], ["1e-1000000", "1e-1000000"], ["-0e-1000000", "0"],
  ]) check(`canonical decimal ${input}`, () => { assert.equal(canonicalJson(parseSourceJson(input)), expected); assert.equal(canonicalJson(parseSourceJson(expected)), expected); });
  for (const token of realTokens) check(`real DataSF lexeme ${token}`, () => { assert.equal(canonicalJson(parseSourceJson(token)), token); assert.throws(() => v1.parseSourceJson(token), /precision/); });
  for (const token of ["01", "-01", "+1", ".1", "1.", "1e", "1e+", "1e-", "--1", "NaN", "Infinity", "0x10", "1_000", "1 2", "1\n", " 1", "", "1e1000001", "1e-1000001", "0e1000001", "1".repeat(4097)])
    check(`token grammar/bound rejects ${token.slice(0, 24)}`, () => assert.throws(() => number(token)));
  check("4096-character integer stays exact without exponent expansion", () => { const n = number("9".repeat(4096)); assert.equal(n.compare(number(n.canonical)), 0); assert(n.canonical.length < 4110); });
  check("parsed source has no native numbers", () => { const walk = (v: unknown): void => { assert.notEqual(typeof v, "number"); if (v instanceof LosslessJsonNumber) { assert(Object.isFrozen(v)); return; } if (v && typeof v === "object") Object.values(v).forEach(walk); }; walk(row); });
  check("implicit coercion and native JSON serialization reject", () => { const n = number("1.1"); assert.throws(() => Number(n)); assert.throws(() => String(n)); assert.throws(() => JSON.stringify({ n })); });
  check("native fractional/unsafe Number cannot enter hashes", () => { for (const n of [1.1, -122.37952207229336, Number.MAX_SAFE_INTEGER + 1, NaN, Infinity]) assert.throws(() => canonicalJson(n)); });
  check("even native safe integers are forbidden in source feature payloads", () => assert.throws(() => canonicalFeature({ globalid: "A", source_value: 1 }), /lossless tokens/));
  check("exact safe control conversion", () => { assert.equal(number("123e0").toSafeInteger(), 123); for (const n of ["1.1", "9007199254740993", "1e400"]) assert.throws(() => number(n).toSafeInteger()); });
  check("diagnostic approximation cannot mutate source identity", () => { const n = number(realTokens[0]), before = digest("test", n); assert.equal(String(toDiagnosticNumber(n)), "-122.37952207229335"); assert.equal(n.canonical, realTokens[0]); assert.equal(digest("test", n), before); });
  check("diagnostic overflow/underflow reject", () => { for (const n of ["1e400", "1e-400"]) assert.throws(() => toDiagnosticNumber(number(n))); });
  check("numeric attributes emit unquoted exact tokens", () => { const s = canonicalJson(row); assert(s.includes('"large":9007199254740993')); assert(s.includes('"precise":0.10000000000000001')); assert(s.includes('"exponent":123')); });
  check("number versus string hashes differ", () => assert.notEqual(feature.content_sha256, canonicalFeature(replace('"large":9007199254740993', '"large":"9007199254740993"')).content_sha256));
  check("equivalent attribute spellings agree", () => assert.deepEqual(feature, canonicalFeature(replace("1.2300e2", "123"))));
  check("precise attribute digit changes attributes/content only", () => { const f = canonicalFeature(replace("0.10000000000000001", "0.10000000000000002")); assert.notEqual(f.attributes_sha256, feature.attributes_sha256); assert.notEqual(f.content_sha256, feature.content_sha256); assert.equal(f.geometry_sha256, feature.geometry_sha256); });
  check("binary64-neighbor coordinate hashes differ", () => assert.notEqual(feature.geometry_sha256, canonicalFeature(replace(realTokens[0], "-122.37952207229335")).geometry_sha256));
  check("final coordinate digit changes geometry", () => assert.notEqual(feature.geometry_sha256, canonicalFeature(replace(realTokens[1], "37.732536608656227")).geometry_sha256));
  const object = row as { [key: string]: any }, geometry = object.shape;
  for (const coords of [[...geometry.coordinates].reverse(), [geometry.coordinates[0]], [...geometry.coordinates, geometry.coordinates[0]]])
    check("reversed/removed/added vertex changes hash", () => assert.notEqual(feature.geometry_sha256, canonicalFeature({ ...object, shape: { ...geometry, coordinates: coords } }).geometry_sha256));
  check("key reorder preserves hashes", () => assert.deepEqual(feature, canonicalFeature(Object.fromEntries(Object.entries(object).reverse()))));
  check("row reorder preserves dataset digest", () => { const b = replace('"{A}"', '"{B}"'); assert.equal(canonicalDataset([row, b]).dataset_sha256, canonicalDataset([b, row]).dataset_sha256); });
  check("duplicate/missing/blank IDs reject", () => { assert.throws(() => canonicalDataset([row, row])); for (const id of [null, "", " ", "NULL", number("1")]) assert.throws(() => canonicalFeature({ ...object, globalid: id })); });
  check("unknown source/geometry members retained", () => { assert.notEqual(canonicalFeature({ ...object, future2: number("1e400") }).attributes_sha256, feature.attributes_sha256); assert.notEqual(canonicalFeature({ ...object, shape: { ...geometry, future: number("1e400") } }).geometry_sha256, feature.geometry_sha256); });
  check("missing attribute differs from null", () => { const { nullable, ...without } = object; assert.notEqual(canonicalFeature(without).attributes_sha256, feature.attributes_sha256); });
  check("exact geometry bounds and nonzero comparison", () => {
    assert(supportedLineString(row));
    for (const coords of ['[[180.00000000000000001,0],[0,1]]', '[[0,-90.00000000000000001],[0,1]]', '[[0,0],[0.0,-0]]']) assert(!supportedLineString(parseSourceJson('{"shape":{"type":"LineString","coordinates":' + coords + '}}')));
    assert(supportedLineString(parseSourceJson('{"shape":{"type":"LineString","coordinates":[[180,90],[179.99999999999999999999,90]]}}')));
  });
  check("decimal comparison signs, zero and exponent extremes", () => { const tokens = ["-1e400", "-123", "-0.1", "0", "1e-400", "0.1", "123", "1e400"]; for (let i = 0; i < tokens.length; i++) for (let j = 0; j < tokens.length; j++) assert.equal(Math.sign(number(tokens[i]).compare(number(tokens[j]))) || 0, Math.sign(i - j)); });
  check("generated equivalent integer/exponent forms", () => { for (let n = -100; n <= 100; n++) { const token = String(n); assert.equal(number(token).compare(number(n === 0 ? "0e-1" : token + "0e-1")) || 0, 0); assert.equal(number(token).canonical, number(token + ".000e0").canonical); } });
  for (const text of ['{"a":1,"\\u0061":2}', '[1,]', '{"a":1,}', '01', '1e', 'true false', '"\\ud800"', '"\\udc00"', '"\n"', '\ufeff0'])
    check("strict structural/Unicode rejection", () => assert.throws(() => parseSourceJson(text)));
  check("invalid UTF-8 rejects", () => assert.throws(() => parseSourceJson(new Uint8Array([0xc0, 0xaf]))));
  check("UTF-16 key order and Unicode remain unchanged", () => { assert.equal(canonicalJson(parseSourceJson('{"\ue000":1,"😀":2,"a":3}')), '{"a":3,"😀":2,"\ue000":1}'); assert.notEqual(canonicalJson("é"), canonicalJson("e\u0301")); });
  check("prototype keys and numeric-looking strings remain data", () => assert.equal(canonicalJson(parseSourceJson('{"__proto__":1,"n":"1e400"}')), '{"__proto__":1,"n":"1e400"}'));
  check("sparse/accessor/cyclic/non-JSON objects reject", () => { const cycle: unknown[] = []; cycle.push(cycle); for (const v of [undefined, 1n, new Date(), [, 1], { get x() { throw Error("getter"); } }, cycle]) assert.throws(() => canonicalJson(v)); });
  check("all logical hashes use V2 namespace", () => { assert.equal(CONTRACT, "curb-decimal-v2"); assert.equal(digest("test", number("1")), sha256("city-curb/test/v2\n1")); assert.notEqual(digest("test", number("1")), v1.digest("test", 1)); });
  const response = new Response(rawRow); response.json = async () => { throw Error("response.json must never parse authoritative source bytes"); };
  const fetched = await fetchDataSfJson("https://data.sf.gov/resource/pep9-66vw.json", () => {}, { fetch: async () => response, readBody: async r => new Uint8Array(await r.arrayBuffer()) });
  check("byte fetch bypasses response.json and retains exact hashes", () => assert.deepEqual(canonicalFeature(parseSourceJson(fetched as Uint8Array)), feature));
  await archiveChecks();
  console.log(`V2 canonicalization: ${checks} checks passed; plus 34 preserved V1 checks. Zero network/database access.`);
}

async function archiveChecks() {
  const dir = await mkdtemp(join(tmpdir(), "curb-decimal-v2-fixture-")); await mkdir(join(dir, "pages"));
  const endpoint = "https://data.sf.gov/resource/pep9-66vw.json";
  const countUrl = new URL(endpoint); countUrl.searchParams.set("$select", "count(*) as n");
  const pageUrl = new URL(endpoint); for (const [k, v] of [["$select", "*"], ["$order", "globalid ASC"], ["$limit", "1000"], ["$offset", "0"]]) pageUrl.searchParams.set(k, v);
  const rawMetadata = '{"columns":[{"fieldName":"globalid","dataTypeName":"text"},{"fieldName":"shape","dataTypeName":"line"}],"unknownPreciseStatistic":0.10000000000000001}';
  const rawPage = '[' + rawRow + ',' + rawRow.replace('"{A}"', '"{B}"') + ']';
  const bodies = [["metadata-before.json", "https://data.sf.gov/api/views/pep9-66vw.json", rawMetadata], ["count-before.json", countUrl.toString(), '[{"n":"2"}]'], ["pages/000000.json", pageUrl.toString(), rawPage], ["count-after.json", countUrl.toString(), '[{"n":"2"}]'], ["metadata-after.json", "https://data.sf.gov/api/views/pep9-66vw.json", rawMetadata]];
  const artifacts = await Promise.all(bodies.map(async ([path, url, body]) => { await writeFile(join(dir, path), body, { flag: "wx" }); return { path, url, bytes: Buffer.byteLength(body), sha256: sha256(body), status: 200 }; }));
  const rows = parseSourceJson(rawPage) as unknown[], metadata = parseSourceJson(rawMetadata);
  const manifest = { format_version: "curb-snapshot-v2", canonicalization_version: CONTRACT, ...SOURCE, api_endpoint: endpoint, query: { select: "*", order: "globalid ASC", page_size: 1000, offset_step: 1000, filter: null }, artifacts, raw_pages_sha256: digest("raw-pages", artifacts.filter(a => a.path.startsWith("pages/")).map(a => [a.path, a.bytes, a.sha256])), summary: summarizeCapture(rows, metadata, metadata, 2, 2) };
  const save = async (m: unknown) => { const bytes = canonicalJson(m) + "\n"; await writeFile(join(dir, "manifest.json"), bytes); await writeFile(join(dir, "manifest.sha256"), sha256(bytes) + "\n"); };
  await save(manifest);
  const restored = await verifyArchive(dir);
  check("raw archive recreates all feature/geometry/dataset digests", () => { assert.deepEqual(restored.features, canonicalDataset(rows).features); assert.equal(restored.summary.dataset_sha256, manifest.summary.dataset_sha256); assert.equal(restored.summary.identity_geometry_sha256, manifest.summary.identity_geometry_sha256); assert.equal(restored.summary.state, "CONSISTENT"); });
  await writeFile(join(dir, "pages/000000.json"), rawPage.replace(realTokens[0], "-122.37952207229335"));
  await assert.rejects(() => verifyArchive(dir)); checks++; console.log("PASS V2 corrupted source coordinate bytes rejected");
  await writeFile(join(dir, "pages/000000.json"), rawPage);
  await save({ ...manifest, summary: { ...manifest.summary, dataset_sha256: "0".repeat(64) } });
  await assert.rejects(() => verifyArchive(dir)); checks++; console.log("PASS V2 false manifest dataset digest rejected");
  await save({ ...manifest, canonicalization_version: "curb-decimal-v99" });
  await assert.rejects(() => verifyArchive(dir)); checks++; console.log("PASS V2 unsupported version rejects");
  await save(manifest);
  console.log(`V2 synthetic raw archive retained: ${dir}`);
}
main().catch(error => { console.error(error); process.exitCode = 1; });

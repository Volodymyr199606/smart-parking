/** Offline conformance and optional complete retained V2 archive eligibility/profile. */
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { canonicalFeature, canonicalJson, CONTRACT, jsonObject, LosslessJsonNumber, parseSourceJson } from "./canonicalize-curb-snapshot";
import { verifyArchive } from "./capture-curb-snapshot";
import { curbDbEligibility, decimalMetrics, MAX_DB_JSON_BYTES } from "./curb-db-eligibility";

export const preciseFeature = '{"globalid":"fixture-a","shape":{"type":"LineString","coordinates":[[-122.37952207229336,37.732536608656226],[-122.37952207229335,37.743691137180925]]}}';
export const withNumeric = (token: string) => parseSourceJson(preciseFeature.slice(0, -1) + ',"extra":{"array":[' + token + ']}}');
export async function profileArchive(directory: string) {
  const verified = await verifyArchive(directory);
  const manifest = jsonObject(parseSourceJson(await readFile(join(directory, "manifest.json"))));
  assert.equal(manifest.canonicalization_version, CONTRACT);
  assert.equal(verified.summary.state, "CONSISTENT");
  let total = 0, eligible = 0, numericCount = 0, maxLexeme = 0, maxCanonical = 0, maxPrecision = 0;
  let maxPlain = 0n, maxFraction = 0n, maxIntegerDigits = 0n;
  let positiveExponent: bigint | null = null, negativeExponent: bigint | null = null;
  let maxOrder: bigint | null = null, minOrder: bigint | null = null;
  let integerMagnitude: LosslessJsonNumber | null = null, absoluteMagnitude: LosslessJsonNumber | null = null;
  let maxFeatureBytes = 0n;
  const reasonCounts: Record<string, number> = {};
  const firstRejections: { external_id: unknown; reasons: unknown }[] = [];
  for (const artifact of manifest.artifacts as unknown[]) {
    const a = jsonObject(artifact);
    if (typeof a.path !== "string" || !a.path.startsWith("pages/")) continue;
    const text = await readFile(join(directory, a.path), "utf8");
    const rows = parseSourceJson(text); assert(Array.isArray(rows));
    for (const row of rows) {
      total++;
      const result = curbDbEligibility(row);
      if (result.state === "ELIGIBLE") eligible++;
      else {
        for (const r of result.reasons) reasonCounts[r.code] = (reasonCounts[r.code] ?? 0) + 1;
        if (firstRejections.length < 5) firstRejections.push({ external_id: jsonObject(row).globalid, reasons: result.reasons });
      }
      const size = BigInt(result.postgresTextBytes ?? "0");
      if (size > maxFeatureBytes) maxFeatureBytes = size;
    }
    // Scan already-validated original bytes, skipping JSON strings. Numeric strings are not numbers.
    const numeric = /-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/y;
    for (let i = 0; i < text.length;) {
      if (text[i] === '"') {
        i++; while (i < text.length) { if (text[i] === "\\") { i += 2; continue; } if (text[i++] === '"') break; }
      } else if (text[i] === "-" || /[0-9]/.test(text[i])) {
        numeric.lastIndex = i; const token = numeric.exec(text)![0]; i += token.length; numericCount++;
        const value = LosslessJsonNumber.fromToken(token), m = decimalMetrics(value);
        maxLexeme = Math.max(maxLexeme, token.length); maxCanonical = Math.max(maxCanonical, m.token.length);
        maxPrecision = Math.max(maxPrecision, m.significantDigits);
        if (m.plainLength > maxPlain) maxPlain = m.plainLength;
        if (m.fractionalDigits > maxFraction) maxFraction = m.fractionalDigits;
        if (m.integerDigits > maxIntegerDigits) maxIntegerDigits = m.integerDigits;
        if (maxOrder === null || m.order > maxOrder) maxOrder = m.order;
        if (minOrder === null || m.order < minOrder) minOrder = m.order;
        const exp = BigInt(/[eE]([+-]?\d+)$/.exec(token)?.[1] ?? "0");
        if (exp > 0n && (positiveExponent === null || exp > positiveExponent)) positiveExponent = exp;
        if (exp < 0n && (negativeExponent === null || exp < negativeExponent)) negativeExponent = exp;
        const magnitude = LosslessJsonNumber.fromToken(m.token.replace(/^-/, ""));
        if (!absoluteMagnitude || magnitude.compare(absoluteMagnitude) > 0) absoluteMagnitude = magnitude;
        if (m.integral && (!integerMagnitude || magnitude.compare(integerMagnitude) > 0)) integerMagnitude = magnitude;
      } else i++;
    }
  }
  assert.equal(total, verified.summary.row_count);
  return { total, eligible, ineligible: total - eligible, reasonCounts, firstRejections,
    numericCount, longestSourceToken: maxLexeme, longestCanonicalToken: maxCanonical,
    largestExplicitPositiveExponent: positiveExponent?.toString() ?? null, smallestExplicitNegativeExponent: negativeExponent?.toString() ?? null,
    largestNormalizedExponent: maxOrder?.toString(), smallestNormalizedExponent: minOrder?.toString(),
    largestIntegerMagnitude: integerMagnitude?.canonical ?? null, largestAbsoluteNumericValue: absoluteMagnitude?.canonical,
    maxIntegerDigits: maxIntegerDigits.toString(), maxSignificantDigits: maxPrecision, maxFractionalDigits: maxFraction.toString(),
    maxExpandedTokenLength: maxPlain.toString(), maxPostgresFeatureBytes: maxFeatureBytes.toString(), dataset_sha256: verified.summary.dataset_sha256 };
}

async function main() {
  let checks = 0;
  const check = (name: string, f: () => void) => { f(); checks++; console.log(`PASS ${name}`); };
  for (const token of ["-122.37952207229336", "37.732536608656226", "37.743691137180925", "-122.43840032071572", "-122.45281351125684", "37.711929941578966", "-122.40468496538819", "37.768428921166255", "9007199254740993", "1e8191", "-1e8190", "1e-8190", "-1e-8189", "1e-400", "1e400", "-0", "1.2300e2", "9".repeat(4096)])
    check(`eligible exact numeric ${token.length > 40 ? "4096 significant digits" : token}`, () => assert.equal(curbDbEligibility(withNumeric(token)).state, "ELIGIBLE"));
  for (const [token, code] of [["1e8192", "NUMERIC_TOKEN_TOO_LONG"], ["-1e8191", "NUMERIC_TOKEN_TOO_LONG"], ["1e-8191", "NUMERIC_TOKEN_TOO_LONG"], ["-1e-8190", "NUMERIC_TOKEN_TOO_LONG"], ["1e131072", "NUMERIC_OUT_OF_POSTGRES_RANGE"], ["1e-16384", "NUMERIC_OUT_OF_POSTGRES_RANGE"]])
    check(`ineligible ${token}`, () => {
      const row = withNumeric(token), before = canonicalFeature(row);
      const r = curbDbEligibility(row); assert.equal(r.state, "INELIGIBLE");
      assert.equal(r.reasons[0].path, "/extra/array/0"); assert.equal(r.reasons[0].code, code);
      assert.deepEqual(canonicalFeature(row), before, "capture hashes remain valid and unchanged");
    });
  check("unsupported version", () => assert.equal(curbDbEligibility(parseSourceJson(preciseFeature), "curb-jcs-v1").reasons[0].code, "UNSUPPORTED_CANONICALIZATION_VERSION"));
  check("native Number fails capture guard", () => assert.equal(curbDbEligibility(JSON.parse(preciseFeature)).reasons[0].code, "INVALID_CAPTURE_VALUE"));
  for (const shape of [undefined, null, { type: "Point", coordinates: [] }]) check("missing/null/non-LineString rejected", () => {
    const row = jsonObject(parseSourceJson(preciseFeature)); delete row.shape; if (shape !== undefined) row.shape = shape;
    assert.equal(curbDbEligibility(row).reasons[0].code, "INVALID_FEATURE_SHAPE");
  });
  check("unknown attributes, arrays, precise nested numbers and numeric strings retained", () => assert.equal(curbDbEligibility(withNumeric("9007199254740993")).state, "ELIGIBLE"));
  check("deterministic multiple reasons and escaped JSON pointer", () => {
    const row = jsonObject(parseSourceJson(preciseFeature)); row["a/~"] = [LosslessJsonNumber.fromToken("1e131072"), "\0"];
    const expected = [{ path: "/a~1~0/0", code: "NUMERIC_OUT_OF_POSTGRES_RANGE" }, { path: "/a~1~0/0", code: "NUMERIC_TOKEN_TOO_LONG" }, { path: "/a~1~0/1", code: "POSTGRES_UNSUPPORTED_STRING" }];
    assert.deepEqual(curbDbEligibility(row).reasons, expected);
    assert.deepEqual(curbDbEligibility(Object.fromEntries(Object.entries(row).reverse())).reasons, expected);
  });
  check("NUL object key is JSONB-ineligible", () => { const row = jsonObject(parseSourceJson(preciseFeature)); row["bad\0key"] = null; assert.equal(curbDbEligibility(row).reasons[0].code, "POSTGRES_UNSUPPORTED_STRING"); });
  check("expanded document budget", () => { const row = jsonObject(parseSourceJson(preciseFeature)); row.extra = "a".repeat(MAX_DB_JSON_BYTES); assert.equal(curbDbEligibility(row).reasons.at(-1)?.code, "DOCUMENT_TOO_LARGE"); });
  console.log(`${checks} offline eligibility checks passed.`);
  const args = process.argv.slice(2);
  assert(args.length === 0 || (args.length === 1 && args[0].startsWith("--archive=")));
  if (args.length) { const result = await profileArchive(args[0].slice(10)); console.log(JSON.stringify(result, null, 2)); assert.equal(result.ineligible, 0, "Retained source contains ineligible features"); }
}
if (require.main === module) main().catch(e => { console.error(e instanceof Error ? e.message : "Eligibility verification failed"); process.exitCode = 1; });

/** Pure, narrower storage domain. Does not alter capture-valid curb-decimal-v2. */
import { canonicalFeature, canonicalJson, CONTRACT, Json, LosslessJsonNumber, supportedLineString } from "./canonicalize-curb-snapshot";

export const DB_ELIGIBILITY = "curb-db-eligibility-v1";
export const MAX_DB_JSON_BYTES = 1_048_576;
export type Reason = "INVALID_CAPTURE_VALUE" | "UNSUPPORTED_CANONICALIZATION_VERSION" | "INVALID_FEATURE_SHAPE" |
  "NUMERIC_OUT_OF_POSTGRES_RANGE" | "NUMERIC_TOKEN_TOO_LONG" | "POSTGRES_UNSUPPORTED_STRING" | "DOCUMENT_TOO_LARGE";
export type Rejection = { path: string; code: Reason };

/** All value arithmetic is exact bigint/string arithmetic; lengths are control integers. */
export function decimalMetrics(value: LosslessJsonNumber) {
  const token = value.canonical;
  const m = /^(-?)(\d+)(?:\.(\d+))?(?:e(-?\d+))?$/.exec(token)!;
  let digits = (m[2] + (m[3] ?? "")).replace(/^0+/, "");
  let scale = BigInt(m[4] ?? "0") - BigInt((m[3] ?? "").length);
  if (!digits) { digits = "0"; scale = 0n; }
  else { const trimmed = digits.replace(/0+$/, ""); scale += BigInt(digits.length - trimmed.length); digits = trimmed; }
  const order = BigInt(digits.length - 1) + scale;
  const integerDigits = order >= 0n ? order + 1n : 0n;
  const fractionalDigits = scale < 0n ? -scale : 0n;
  const plainLength = BigInt(m[1].length) + (integerDigits || 1n) + (fractionalDigits ? fractionalDigits + 1n : 0n);
  return { token, significantDigits: digits.length, order, integerDigits, fractionalDigits, plainLength, integral: scale >= 0n };
}

export function curbDbEligibility(input: unknown, version: string = CONTRACT): {
  state: "ELIGIBLE" | "INELIGIBLE"; reasons: Rejection[]; postgresTextBytes: string | null;
} {
  const reasons: Rejection[] = [];
  const reject = (path: string, code: Reason) => reasons.push({ path, code });
  if (version !== CONTRACT) reject("", "UNSUPPORTED_CANONICALIZATION_VERSION");
  let canonical: string;
  try { canonicalFeature(input); canonical = canonicalJson(input); }
  catch { reject("", "INVALID_CAPTURE_VALUE"); return { state: "INELIGIBLE", reasons, postgresTextBytes: null }; }
  if (!supportedLineString(input)) reject("/shape", "INVALID_FEATURE_SHAPE");
  const pointer = (key: string) => key.replaceAll("~", "~0").replaceAll("/", "~1");
  const stringBytes = (v: string, path: string): bigint => {
    if (v.includes("\0")) reject(path, "POSTGRES_UNSUPPORTED_STRING");
    return BigInt(Buffer.byteLength(JSON.stringify(v), "utf8"));
  };
  // PostgreSQL JSONB text adds one space after each colon/comma and expands numbers.
  function walk(value: Json, path: string): bigint {
    if (value instanceof LosslessJsonNumber) {
      const m = decimalMetrics(value);
      if (m.integerDigits > 131072n || m.fractionalDigits > 16383n) reject(path, "NUMERIC_OUT_OF_POSTGRES_RANGE");
      if (m.plainLength > 8192n || m.token.length > 8192) reject(path, "NUMERIC_TOKEN_TOO_LONG");
      return m.plainLength;
    }
    if (typeof value === "string") return stringBytes(value, path);
    if (value === null || typeof value === "boolean") return BigInt(JSON.stringify(value).length);
    if (Array.isArray(value)) return 2n + BigInt(Math.max(0, value.length - 1) * 2) + value.reduce((n, v, i) => n + walk(v, `${path}/${i}`), 0n);
    const keys = Object.keys(value).sort();
    return 2n + BigInt(Math.max(0, keys.length - 1) * 2) + keys.reduce((n, k) => {
      const child = `${path}/${pointer(k)}`;
      return n + stringBytes(k, child) + 2n + walk(value[k], child);
    }, 0n);
  }
  const bytes = walk(input as Json, "");
  if (bytes > BigInt(MAX_DB_JSON_BYTES) || Buffer.byteLength(canonical, "utf8") > MAX_DB_JSON_BYTES) reject("", "DOCUMENT_TOO_LARGE");
  return { state: reasons.length ? "INELIGIBLE" : "ELIGIBLE", reasons, postgresTextBytes: bytes.toString() };
}

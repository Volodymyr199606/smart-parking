/** Offline curb-jcs-v1 contract. No network, environment loading, or database access. */
import { createHash } from "node:crypto";

export type Json = null | boolean | number | string | Json[] | { [key: string]: Json };
export const CONTRACT = "curb-jcs-v1";
export const SOURCE = { provider: "datasf", dataset_id: "pep9-66vw" } as const;
const MAX_DEPTH = 100;

function validString(value: string): void {
  for (let i = 0; i < value.length; i++) {
    const c = value.charCodeAt(i);
    if (c >= 0xd800 && c <= 0xdbff) {
      const next = value.charCodeAt(++i);
      if (!(next >= 0xdc00 && next <= 0xdfff)) throw new Error("Unpaired Unicode surrogate");
    } else if (c >= 0xdc00 && c <= 0xdfff) throw new Error("Unpaired Unicode surrogate");
  }
}

/** JCS ordering is unsigned UTF-16 code-unit order, never localeCompare. */
export function canonicalJson(value: unknown, depth = 0): string {
  if (depth > MAX_DEPTH) throw new Error("JSON nesting limit exceeded");
  if (value === null || typeof value === "boolean") return JSON.stringify(value);
  if (typeof value === "string") { validString(value); return JSON.stringify(value); }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new Error("Non-finite JSON number");
    return JSON.stringify(value); // ECMAScript binary64 serialization; -0 becomes 0.
  }
  if (typeof value !== "object") throw new Error("Unsupported JSON value");
  const descriptors = Object.getOwnPropertyDescriptors(value);
  if (Object.getOwnPropertySymbols(value).length || Object.values(descriptors).some(d => d.get || d.set)) {
    throw new Error("JSON must contain data properties only");
  }
  if (Array.isArray(value)) {
    if (Object.keys(value).length !== value.length || Object.keys(descriptors).length !== value.length + 1) {
      throw new Error("Sparse or decorated JSON array");
    }
    return "[" + Array.from(value, v => canonicalJson(v, depth + 1)).join(",") + "]";
  }
  if (![Object.prototype, null].includes(Object.getPrototypeOf(value))) throw new Error("Non-plain JSON object");
  if (Object.values(descriptors).some(d => !d.enumerable)) throw new Error("Non-enumerable JSON property");
  return "{" + Object.keys(value).sort().map(key => {
    validString(key);
    return JSON.stringify(key) + ":" + canonicalJson(descriptors[key].value, depth + 1);
  }).join(",") + "}";
}

// Decimal identity for checking that parsing did not silently round source tokens.
// It compares decimal values, not IEEE-754's exact binary expansion (e.g. 0.1 is valid).
function decimalIdentity(token: string): string {
  const [mantissa, exponent = "0"] = token.toLowerCase().split("e");
  const negative = mantissa.startsWith("-");
  const unsigned = negative ? mantissa.slice(1) : mantissa;
  const [integer, fraction = ""] = unsigned.split(".");
  let digits = (integer + fraction).replace(/^0+/, "");
  if (!digits) return "0";
  let scale = BigInt(exponent) - BigInt(fraction.length);
  while (digits.endsWith("0")) { digits = digits.slice(0, -1); scale++; }
  return `${negative ? "-" : ""}${digits}e${scale}`;
}

/** Parse original UTF-8 bodies, rejecting duplicate keys BEFORE they can be lost.
 * The decimal round-trip restriction is deliberately stricter than generic JCS.
 */
export function parseSourceJson(input: string | Uint8Array): Json {
  const text = typeof input === "string" ? input : new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(input);
  if (Buffer.byteLength(text, "utf8") > 32 * 1024 * 1024) throw new Error("JSON body exceeds 32 MiB");
  let i = 0;
  const ws = () => { while (/[\x20\t\r\n]/.test(text[i] ?? "x")) i++; };
  function string(): string {
    const start = i++;
    while (i < text.length) {
      if (text[i] === "\\") { i += 2; continue; }
      if (text[i++] === '"') {
        const value: string = JSON.parse(text.slice(start, i));
        validString(value); return value;
      }
    }
    throw new Error("Unterminated JSON string");
  }
  function value(depth: number): Json {
    if (depth > MAX_DEPTH) throw new Error("JSON nesting limit exceeded");
    ws();
    if (text[i] === '"') return string();
    if (text[i] === "{" || text[i] === "[") {
      const object = text[i++] === "{";
      const close = object ? "}" : "]";
      const result: { [key: string]: Json } = Object.create(null);
      const array: Json[] = [];
      ws();
      if (text[i] === close) { i++; return object ? result : array; }
      while (true) {
        ws();
        if (object) {
          if (text[i] !== '"') throw new Error("Expected JSON object key");
          const key = string(); ws();
          if (Object.hasOwn(result, key)) throw new Error("Duplicate JSON object key");
          if (text[i++] !== ":") throw new Error("Expected JSON colon");
          result[key] = value(depth + 1);
        } else array.push(value(depth + 1));
        ws();
        if (text[i] === close) { i++; return object ? result : array; }
        if (text[i++] !== ",") throw new Error("Expected JSON comma");
      }
    }
    for (const [literal, parsed] of [["null", null], ["true", true], ["false", false]] as const) {
      if (text.startsWith(literal, i)) { i += literal.length; return parsed; }
    }
    const token = /^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/.exec(text.slice(i))?.[0];
    if (!token || token.length > 256) throw new Error("Invalid JSON number/value");
    i += token.length;
    const number = Number(token);
    if (!Number.isFinite(number) || decimalIdentity(token) !== decimalIdentity(JSON.stringify(number))) {
      throw new Error("Source number loses decimal precision in binary64 serialization");
    }
    return number;
  }
  const parsed = value(0); ws();
  if (i !== text.length) throw new Error("Trailing JSON input");
  return parsed;
}

export function sha256(bytes: string | Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}
export function digest(domain: string, value: unknown): string {
  return sha256(`city-curb/${domain}/v1\n` + canonicalJson(value));
}
export function jsonObject(value: unknown): { [key: string]: Json } {
  if (value === null || typeof value !== "object" || Array.isArray(value)) throw new Error("Expected JSON object");
  canonicalJson(value); // Reject coercion, accessors and non-JSON values on pure-function input.
  return value as { [key: string]: Json };
}

export function canonicalFeature(input: unknown) {
  const row = jsonObject(input);
  const external_id = row.globalid;
  if (typeof external_id !== "string" || !external_id.trim() || /^(null|<null>|none)$/i.test(external_id.trim())) {
    throw new Error("Missing or invalid globalid");
  }
  const attributes = Object.fromEntries(Object.entries(row).filter(([key]) => key !== "shape"));
  const geometry = !Object.hasOwn(row, "shape") ? { presence: "ABSENT" } :
    row.shape === null ? { presence: "NULL" } : { presence: "VALUE", value: row.shape };
  const geometry_sha256 = digest("geometry", geometry);
  const attributes_sha256 = digest("attributes", attributes);
  const content_sha256 = digest("content", { ...SOURCE, external_id, canonicalization_version: CONTRACT, geometry_sha256, attributes_sha256 });
  return { external_id, geometry_sha256, attributes_sha256, content_sha256 };
}

export function canonicalDataset(rows: readonly unknown[]) {
  const features = rows.map(canonicalFeature).sort((a, b) => a.external_id < b.external_id ? -1 : a.external_id > b.external_id ? 1 : 0);
  if (features.some((f, i) => i > 0 && f.external_id === features[i - 1].external_id)) throw new Error("Duplicate external_id");
  const envelope = { ...SOURCE, canonicalization_version: CONTRACT };
  return {
    features,
    dataset_sha256: digest("dataset", { ...envelope, features: features.map(f => [f.external_id, f.content_sha256]) }),
    identity_geometry_sha256: digest("identity-geometry", { ...envelope, features: features.map(f => [f.external_id, f.geometry_sha256]) }),
    external_ids_sha256: digest("external-ids", { ...envelope, external_ids: features.map(f => f.external_id) }),
  };
}

export function schemaDigest(metadata: unknown): string {
  const meta = jsonObject(metadata);
  if (!Array.isArray(meta.columns)) throw new Error("Missing metadata columns");
  const fields = meta.columns.map(jsonObject).filter(c => typeof c.fieldName === "string" && !c.fieldName.startsWith(":"))
    .map(c => {
      if (typeof c.dataTypeName !== "string") throw new Error("Missing field type");
      return [c.fieldName as string, c.dataTypeName];
    }).sort((a, b) => a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0);
  if (!fields.length || new Set(fields.map(f => f[0])).size !== fields.length) throw new Error("Invalid schema fields");
  return digest("schema", { ...SOURCE, fields, geometry_field: "shape", crs: "OGC:CRS84", axes: "longitude,latitude" });
}

/** Publication eligibility only; never repairs or excludes a source row from hashing. */
export function supportedLineString(input: unknown): boolean {
  const row = jsonObject(input), g = row.shape;
  if (!g || typeof g !== "object" || Array.isArray(g) || g.type !== "LineString" || !Array.isArray(g.coordinates)) return false;
  const p = g.coordinates;
  return p.length >= 2 && p.every(c => Array.isArray(c) && c.length === 2 &&
    c.every(n => typeof n === "number" && Number.isFinite(n)) &&
    (c[0] as number) >= -180 && (c[0] as number) <= 180 && (c[1] as number) >= -90 && (c[1] as number) <= 90) &&
    p.some(c => canonicalJson(c) !== canonicalJson(p[0]));
}

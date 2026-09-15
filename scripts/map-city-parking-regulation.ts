/**
 * Maps one DataSF Parking Regulations (hi6h-neyh) JSON row to a
 * city_parking_regulations insert/upsert payload.
 *
 * Identity is objectid only. block_id is always null here — join discovery
 * found no verified identifier association (docs/DATASF_REGULATION_JOIN.md).
 * Geometry is omitted from raw_source (too large for V1 storage).
 */

export type SocrataRow = Record<string, unknown>;

export interface CityParkingRegulationInsert {
  source_id: string;
  external_id: string;
  block_id: null;
  regulation_type: string | null;
  agency: string | null;
  days_of_week: string | null;
  hours: string | null;
  hour_limit: number | string | null;
  rpparea1: string | null;
  rpparea2: string | null;
  rpparea3: string | null;
  source_fid_100: string | null;
  raw_source: Record<string, unknown>;
  imported_at: string;
  updated_at: string;
}

const GEOMETRY_KEYS = new Set(["shape", "the_geom", "location"]);

function pickString(row: SocrataRow, keys: string[]): string | null {
  for (const key of keys) {
    const v = row[key];
    if (v !== null && v !== undefined && String(v).trim() !== "") {
      return String(v).trim();
    }
  }
  return null;
}

/** Preserve source decimal text when present so numeric(0.5) is not coerced to 0. */
function pickNumeric(row: SocrataRow, keys: string[]): number | string | null {
  for (const key of keys) {
    const v = row[key];
    if (v === null || v === undefined || v === "") continue;
    if (typeof v === "number" && Number.isFinite(v)) return v;
    const s = String(v).trim();
    if (s !== "" && Number.isFinite(Number(s))) return s;
  }
  return null;
}

export function slimRegulationRawSource(row: SocrataRow): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(row)) {
    if (GEOMETRY_KEYS.has(key)) continue;
    out[key] = value;
  }
  return out;
}

export function mapCityParkingRegulationRow(
  row: SocrataRow,
  sourceId: string,
  importedAt: string
): CityParkingRegulationInsert {
  const externalId = pickString(row, ["objectid"]);
  if (!externalId) {
    throw new Error(
      "regulation row missing objectid; refusing to invent an identity"
    );
  }

  return {
    source_id: sourceId,
    external_id: externalId,
    block_id: null,
    regulation_type: pickString(row, ["regulation", "regulation_type", "type"]),
    agency: pickString(row, ["agency"]),
    days_of_week: pickString(row, ["days", "days_of_week"]),
    hours: pickString(row, ["hours"]),
    hour_limit: pickNumeric(row, ["hrlimit", "hr_limit", "hour_limit"]),
    rpparea1: pickString(row, ["rpparea1"]),
    rpparea2: pickString(row, ["rpparea2"]),
    rpparea3: pickString(row, ["rpparea3"]),
    source_fid_100: pickString(row, ["fid_100"]),
    raw_source: slimRegulationRawSource(row),
    imported_at: importedAt,
    updated_at: importedAt,
  };
}

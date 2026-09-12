/**
 * Pure mapping function: `city_parking_blocks` DATABASE ROW -> `ParkingRule[]`.
 *
 * Like packages/shared/src/adapters/parking.ts, this file — not
 * packages/shared/src/domain/ — is the only place that should know about
 * the shape of a `city_parking_blocks` row. Dependencies point one way
 * only: adapters (this file) -> domain.
 *
 * NOT YET WIRED to any live Supabase query. apps/mobile does not currently
 * fetch `city_parking_blocks` anywhere — only `city_parking_meters`, via
 * scripts/normalize-city-parking.ts -> normalized_parking_locations, and
 * apps/mobile/src/services/cityParkingService.ts, which only ever reads
 * `normalized_parking_locations`. `city_parking_blocks`'s regulation
 * columns (`regulation_type`, `agency`, `days_of_week`, `hours`,
 * `hour_limit`, `permit_area`) are ingested by
 * scripts/ingest-sf-parking-data.ts but never read by the normalization
 * script or any mobile fetcher today — this is exactly the "regulation
 * data currently lost during normalization" gap documented in
 * docs/CITY_DATA_PLAN.md. This adapter exists so a future milestone can
 * wire a `city_parking_blocks` fetcher without inventing the mapping
 * logic at that point; it does not itself add a fetcher, service call, or
 * migration.
 *
 * IMPORTANT — METERED is NOT produced here (corrected; see "Regulation
 * Model V1 review" in docs/CITY_DATA_PLAN.md for the prior mistake). This
 * file maps REGULATIONS ("a payment/time regulation applies under certain
 * conditions"), not METER INVENTORY ("there is a meter at this location").
 * Those are different concepts: `city_parking_blocks` has no verified,
 * structured field proving a block is metered — the only way to know
 * which DataSF dataset a row came from is `source_id`, a UUID foreign key
 * to `city_parking_sources` that this row type deliberately does not
 * require a join to resolve. Inferring METERED purely from "this row
 * exists in this table" is an inference about the ingestion pipeline, not
 * a fact verified on the row itself — that is exactly the kind of
 * unverified inference this module must not make. `city_parking_meters`
 * is the structurally reliable meter-inventory source (see
 * `ParkingRuleKind` doc comment); a future, separate meter adapter over
 * that table is where `"METERED"` belongs, if/when one is built.
 */
import type { ParkingRule } from "../domain/rule";
import type { ParkingEvidence } from "../domain/evidence";

/**
 * `city_parking_blocks` has no `source_type`/`source_key` text column of
 * its own (unlike `normalized_parking_locations`) — it links to
 * `city_parking_sources` via a `source_id` UUID foreign key, which this
 * adapter's row type deliberately does not require (no join needed to
 * map deterministically). This constant names the table itself as the
 * evidence detail, which is honest without requiring a join just to
 * populate a string.
 */
const CITY_BLOCK_SOURCE_DETAIL = "city_parking_blocks";

/** Structural mirror of the fields this adapter reads from a `city_parking_blocks` row (see supabase/migrations/00005_city_parking_data.sql). */
export interface CityParkingBlockRow {
  readonly id: string;
  readonly external_id: string;
  readonly blockface_id: string | null;
  readonly regulation_type: string | null;
  readonly agency: string | null;
  readonly days_of_week: string | null;
  readonly hours: string | null;
  readonly hour_limit: number | null;
  readonly permit_area: string | null;
  readonly imported_at: string;
}

/**
 * Combines the raw `days_of_week` / `hours` text fields into one
 * preservable string. Deliberately NOT parsed into `ParkingRuleSchedule`
 * fields — see the module doc comment and docs/CITY_DATA_PLAN.md: DataSF's
 * `hi6h-neyh` regulations dataset does not document a fixed, confirmed
 * format for either field, and guessing one would risk fabricating a
 * schedule the source data doesn't actually support.
 */
function buildRawScheduleText(row: CityParkingBlockRow): string | null {
  const parts: string[] = [];
  if (row.days_of_week) parts.push(`days:${row.days_of_week}`);
  if (row.hours) parts.push(`hours:${row.hours}`);
  return parts.length > 0 ? parts.join("; ") : null;
}

function hasText(value: string | null): value is string {
  return value !== null && value.trim().length > 0;
}

/**
 * Type guard: true only when `hour_limit` is a real, positive, finite
 * number. Treats `null`, `0`, negative values, and non-finite values
 * (defensive — the DB column is a Postgres `integer`, but this function
 * does not trust that a caller's row object was actually validated at
 * that boundary) all the same way: "not a known time limit", never
 * "unrestricted". `0`/`null` must never be read as "no limit" — they mean
 * the limit is simply not known from this field.
 */
function hasValidHourLimit(
  row: CityParkingBlockRow
): row is CityParkingBlockRow & { hour_limit: number } {
  return row.hour_limit !== null && Number.isFinite(row.hour_limit) && row.hour_limit > 0;
}

/**
 * True when the row carries any regulation-descriptive field this adapter
 * does not attempt to classify into a specific `ParkingRuleKind`
 * (`regulation_type`, `agency`, `permit_area`, `days_of_week`, `hours`).
 * Used only to decide whether an `"OTHER"` rule should be emitted so this
 * information isn't silently discarded — never to infer what the
 * regulation actually means.
 */
function hasUnclassifiedRegulationInfo(row: CityParkingBlockRow): boolean {
  return (
    hasText(row.regulation_type) ||
    hasText(row.agency) ||
    hasText(row.permit_area) ||
    hasText(row.days_of_week) ||
    hasText(row.hours)
  );
}

/**
 * Maps a `city_parking_blocks` row to zero or more `ParkingRule`s.
 *
 * Returns an array, not a single rule or a guaranteed-non-empty one:
 *
 *  - A `"TIME_LIMIT"` rule is produced only when `hour_limit` is a real,
 *    positive, finite number (see `hasValidHourLimit`) — a structured
 *    integer column, not a text parse. `hour_limit` (hours) is converted
 *    to `schedule.maxDurationMinutes` (minutes) via plain arithmetic; no
 *    text parsing is involved in that conversion. `schedule.daysOfWeek`
 *    and `schedule.timeWindow` stay `null` — a numeric hour limit says
 *    nothing about which days or hours it applies on.
 *  - An `"OTHER"` rule is produced whenever the row carries any
 *    regulation-descriptive field this adapter does not safely classify
 *    (`regulation_type`, `agency`, `permit_area`, `days_of_week`,
 *    `hours` — see `hasUnclassifiedRegulationInfo`). This can happen
 *    alongside a `"TIME_LIMIT"` rule for the same row (a numeric hour
 *    limit does not "explain" or consume those other fields) or on its
 *    own. `schedule` is `null` on this rule — nothing structural is known
 *    about when/how it applies, only that a regulation of some
 *    unclassified kind exists.
 *  - If a row has neither a valid `hour_limit` nor any other
 *    regulation-descriptive field set, this function returns an EMPTY
 *    array — there is nothing meaningful to represent, so no rule is
 *    fabricated.
 *
 * `regulation_type`, `agency`, and `permit_area` are preserved verbatim on
 * every returned rule (never classified into `kind`) — see
 * `ParkingRule.sourceRegulationType` / `.agency` / `.permitArea`. The raw
 * `days_of_week` / `hours` strings are preserved via `rawText`
 * (`buildRawScheduleText`) rather than parsed into `schedule.daysOfWeek` /
 * `schedule.timeWindow`, which both remain `null` (unknown, not guessed).
 *
 * Does NOT produce `"METERED"` — see the module doc comment.
 */
export function mapCityRegulationRowToParkingRules(
  row: CityParkingBlockRow
): ParkingRule[] {
  const evidence: ParkingEvidence = {
    sourceCategory: "CITY",
    sourceDetail: CITY_BLOCK_SOURCE_DETAIL,
    externalId: row.blockface_id ?? row.external_id,
    observedAt: null, // city_parking_blocks does not record a separate physical-observation timestamp
    retrievedAt: row.imported_at,
    expiresAt: null,
  };

  const rawText = buildRawScheduleText(row);
  const rules: ParkingRule[] = [];

  if (hasValidHourLimit(row)) {
    rules.push({
      id: `${row.id}:TIME_LIMIT`,
      kind: "TIME_LIMIT",
      schedule: {
        daysOfWeek: null, // days_of_week free text not safely parsed in V1 — see buildRawScheduleText
        timeWindow: null, // hours free text not safely parsed in V1 — see buildRawScheduleText
        allDay: null,
        maxDurationMinutes: row.hour_limit * 60,
        timezone: null, // not modeled in V1; see ParkingRuleSchedule.timezone doc comment
      },
      sourceRegulationType: row.regulation_type,
      agency: row.agency,
      permitArea: row.permit_area,
      rawText,
      evidence,
    });
  }

  if (hasUnclassifiedRegulationInfo(row)) {
    rules.push({
      id: `${row.id}:OTHER`,
      kind: "OTHER",
      schedule: null,
      sourceRegulationType: row.regulation_type,
      agency: row.agency,
      permitArea: row.permit_area,
      rawText,
      evidence,
    });
  }

  return rules;
}

/**
 * Legal-conclusion readiness / regulation coverage (V1).
 *
 * Answers a different question from `ParkingLegality`:
 *
 *   coverage  — "do we know enough about the regulations at this location
 *                to even permit a positive LEGAL conclusion?"
 *   legality  — "given the rules we currently have, what verdict follows?"
 *
 * This is categorical completeness of rule-category/evidence, NOT a
 * confidence score, probability, or AI judgment. Do not add
 * `confidence`, `legalConfidence`, `coveragePercentage`, or any 0–100
 * numeric score here.
 *
 * READY means: the known rule set is an explicitly complete, synthetic
 * TIME_LIMIT-only regulation picture for this location, so
 * `evaluateParkingLegalConclusion` may return LEGAL if no rule is violated.
 *
 * INCOMPLETE means: a positive LEGAL conclusion would be unsafe. It does
 * NOT prevent a confirmed ILLEGAL result — coverage only gates LEGAL.
 * This module does not itself call `evaluateParkingLegality`; V1 only
 * classifies coverage. See packages/shared/src/services/regulationCoverage.ts.
 *
 * Real CITY candidates cannot currently be READY. The live lookup cannot
 * prove that associated `city_parking_blocks` rows capture every relevant
 * restriction (street sweeping is not ingested; permit/meter/no-parking
 * categories are unresolved; unmatched source rows are dropped; one block
 * row is a singular overwrite, not a complete set). See
 * docs/CITY_DATA_PLAN.md "Regulation coverage / legal-conclusion readiness".
 */

/**
 * Whether regulation evidence is sufficient to permit a LEGAL conclusion.
 *
 * READY      — coverage is complete enough that LEGAL would be safe if no
 *              known rule is violated. V1: only explicitly declared
 *              synthetic/MOCK TIME_LIMIT-only fixtures.
 * INCOMPLETE — LEGAL would be unsafe. ILLEGAL remains possible from a
 *              confirmed applicable violation of a known rule.
 */
export type LegalConclusionReadiness = "READY" | "INCOMPLETE";

/**
 * Explicit assertion about whether `ParkingRule[]` is the complete
 * regulation set for a location.
 *
 * COMPLETE   — the caller asserts this fixture IS the full set. Only
 *              synthetic/MOCK tests should pass this. The live CITY
 *              lookup has no source field that can honestly produce it.
 * UNDECLARED — default. Returned rules were found, not proven complete.
 */
export type RegulationCoverageDeclaration = "COMPLETE" | "UNDECLARED";

/**
 * Machine-readable reason for a coverage result. Kept small — only codes
 * that correspond to a real evaluator branch. Not a score.
 *
 *  - "SYNTHETIC_COMPLETE"     → READY; explicit complete TIME_LIMIT-only fixture
 *  - "NO_RULES"               → no associated/known rules
 *  - "UNDECLARED_COVERAGE"    → rules exist but completeness was not asserted
 *  - "CITY_SOURCE_INCOMPLETE" → CITY provenance; live source coverage is unproven
 *  - "NON_SYNTHETIC_SOURCE"   → COMMUNITY (or any non-MOCK non-CITY) provenance
 *  - "UNPARSED_RESTRICTION"   → an OTHER-kind rule is present
 *  - "METERED_UNRESOLVED"     → a METERED placeholder is present (no payment eval)
 *  - "UNSUPPORTED_SCHEDULE"   → a TIME_LIMIT schedule is missing or only partially known
 */
export type CoverageReasonCode =
  | "SYNTHETIC_COMPLETE"
  | "NO_RULES"
  | "UNDECLARED_COVERAGE"
  | "CITY_SOURCE_INCOMPLETE"
  | "NON_SYNTHETIC_SOURCE"
  | "UNPARSED_RESTRICTION"
  | "METERED_UNRESOLVED"
  | "UNSUPPORTED_SCHEDULE";

/**
 * Coverage result for one candidate/rule set. Separate from
 * `ParkingLegality` — do not fold this into that type.
 */
export interface LegalConclusionCoverage {
  readonly readiness: LegalConclusionReadiness;
  readonly reasonCode: CoverageReasonCode;
  readonly reason: string;
}

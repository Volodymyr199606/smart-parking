/**
 * Coverage-gated parking legal conclusion (V1).
 *
 * Composes two existing pure evaluators without mixing their concerns:
 *
 *   evaluateParkingLegality(rules, interval)              → known-rule legality
 *   evaluateLegalConclusionReadiness({ candidate, rules,
 *     coverageDeclaration })                              → coverage READY | INCOMPLETE
 *
 * This is the final legal conclusion a caller should use when they have
 * a candidate (or null), rules, and an interval. It does NOT replace
 * `evaluateParkingLegality`, which remains the known-rule engine and
 * still does not accept a ParkingCandidate.
 *
 * ============================================================================
 * PRECEDENCE
 * ============================================================================
 * 1. Known-rule status is ILLEGAL → final ILLEGAL, unchanged.
 *    Incomplete coverage never weakens a confirmed violation.
 * 2. Known-rule status is UNKNOWN → final UNKNOWN, unchanged.
 *    READY coverage cannot turn unresolved rule semantics into LEGAL.
 * 3. Known-rule status is LEGAL:
 *      coverage READY      → final LEGAL (the known-rule result)
 *      coverage INCOMPLETE → final UNKNOWN / INSUFFICIENT_RULE_DATA
 *
 * Production CITY lookup must leave coverageDeclaration UNDECLARED (or
 * omit it). COMPLETE is only for synthetic/MOCK fixtures. CITY provenance
 * is still INCOMPLETE even if a caller passes COMPLETE.
 */

import type { ParkingCandidate } from "../domain/candidate";
import type { RegulationCoverageDeclaration } from "../domain/coverage";
import type { ParkingLegality, ParkingRequestedInterval } from "../domain/legality";
import type { ParkingRule } from "../domain/rule";
import { evaluateParkingLegality } from "./legality";
import { evaluateLegalConclusionReadiness } from "./regulationCoverage";

export interface EvaluateParkingLegalConclusionInput {
  /** Candidate under review. Null is allowed for rules-only synthetic fixtures. */
  readonly candidate: ParkingCandidate | null;
  readonly rules: readonly ParkingRule[];
  readonly interval: ParkingRequestedInterval;
  /**
   * Explicit completeness assertion forwarded to coverage evaluation.
   * Omit or pass "UNDECLARED" for live lookup. Never infer COMPLETE from
   * the presence of rules, a successful association, or CITY data.
   */
  readonly coverageDeclaration?: RegulationCoverageDeclaration;
}

function coverageGatedUnknown(): ParkingLegality {
  return {
    status: "UNKNOWN",
    reasonCode: "INSUFFICIENT_RULE_DATA",
    reason:
      "Known rules would permit LEGAL, but regulation coverage is incomplete, so a positive legal conclusion is unsafe.",
    evidence: null,
  };
}

/**
 * Final legal conclusion after known-rule evaluation and coverage gating.
 * See this file's top comment for precedence. Reuses `ParkingLegality`.
 */
export function evaluateParkingLegalConclusion(
  input: EvaluateParkingLegalConclusionInput
): ParkingLegality {
  const known = evaluateParkingLegality(input.rules, input.interval);

  if (known.status !== "LEGAL") {
    return known;
  }

  const coverage = evaluateLegalConclusionReadiness({
    candidate: input.candidate,
    rules: input.rules,
    coverageDeclaration: input.coverageDeclaration,
  });

  if (coverage.readiness === "READY") {
    return known;
  }

  return coverageGatedUnknown();
}

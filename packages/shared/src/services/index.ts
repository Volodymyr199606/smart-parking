/**
 * Deterministic parking services (V1).
 *
 * These depend on ../domain and ../adapters but add no Supabase, React, or
 * LLM dependency of their own — see parking.ts for why dependency
 * injection is used instead of a database client.
 */

export type {
  ParkingDataSourceKind,
  FetchParkingSpotRows,
  FetchNormalizedLocationRows,
  ParkingCandidateServiceDeps,
} from "./parking";
export { findParkingCandidates } from "./parking";

export type {
  FetchCityParkingBlockRowsForLocation,
  ParkingRuleServiceDeps,
} from "./regulation";
export { findParkingRulesForLocation } from "./regulation";

export { evaluateParkingLegality } from "./legality";

export type { ScheduleApplicabilityStatus, ScheduleApplicabilityResult } from "./scheduleApplicability";
export { evaluateScheduleApplicability } from "./scheduleApplicability";

export type {
  FetchRulesForCandidate,
  FindAndEvaluateParkingCandidatesRequest,
  FindAndEvaluateParkingCandidatesDeps,
  EvaluatedParkingCandidate,
} from "./orchestration";
export { findAndEvaluateParkingCandidates } from "./orchestration";

export { distanceMeters } from "./distance";

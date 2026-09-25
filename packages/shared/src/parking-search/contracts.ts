import type { FreshnessStatus, LegalConclusionCoverage, ParkingAvailability, ParkingCandidate, ParkingEvidence,
  ParkingLegality, ParkingLocation, ParkingRule, RegulationCoverageDeclaration } from "../domain";
import type { ParkingDataSourceKind } from "../services/parking";
import type { FindAndEvaluateParkingCandidatesDeps } from "../services/orchestration";
import type { ScheduleApplicabilityResult } from "../services/scheduleApplicability";

export type AvailabilityReasonCode = "CURRENT_OBSERVATION" | "EXPIRED_OBSERVATION" | "NO_VALID_OBSERVATION"
  | "EXPIRY_UNKNOWN" | "CONFLICTING_OBSERVATIONS" | "REPORTED_UNKNOWN" | "LOOKUP_FAILED";

export interface ParkingSearchAvailability extends ParkingAvailability {
  readonly freshness: FreshnessStatus;
  readonly evaluatedAt: string;
  readonly ageMinutes: number | null;
  readonly reasonCode: AvailabilityReasonCode;
  /** Original observations retained for inspection, including rejected/expired evidence. */
  readonly observations: readonly ParkingAvailability[];
}

export type ParkingRankingReason = "LEGAL_CONFIRMED" | "LEGALITY_UNKNOWN" | "ILLEGAL_KNOWN"
  | "AVAILABLE_RECENT_REPORT" | "OCCUPIED_RECENT_REPORT" | "AVAILABILITY_UNKNOWN"
  | "COMMUNITY_EVIDENCE" | "MOCK_EVIDENCE" | "FRESH_EVIDENCE" | "DISTANCE_TIEBREAKER";

/** Ascending lexicographic order. Null age sorts after any known age. */
export type ParkingRankTuple = readonly [legality: number, availability: number, evidenceQuality: number,
  evidenceAgeMinutes: number | null, distanceMeters: number, candidateId: string];

export interface ParkingSearchResult {
  /** Namespaced by the existing discovery source; location.id stays the original database/source ID. */
  readonly candidateId: string;
  readonly sourceType: ParkingDataSourceKind;
  readonly location: ParkingLocation;
  readonly distanceMeters: number;
  readonly legality: ParkingLegality & {
    readonly coverage: LegalConclusionCoverage;
    /** Tightest confirmed-applicable TIME_LIMIT, not a promise that the entire stay is legal. */
    readonly maxStayMinutes: number | null;
    readonly restrictions: readonly { readonly rule: ParkingRule; readonly applicability: ScheduleApplicabilityResult }[];
  };
  readonly availability: ParkingSearchAvailability;
  readonly provenance: readonly ParkingEvidence[];
  readonly rank: ParkingRankTuple;
  readonly rankingReasons: readonly ParkingRankingReason[];
}

/** Existing row fetchers and rule lookup are reused; no database/client dependency is added. */
export interface ParkingSearchServiceDeps extends FindAndEvaluateParkingCandidatesDeps {
  /** Optional observations, already scoped to this candidate. No rows from another spot may be returned. */
  readonly fetchAvailabilityForCandidate?: (candidate: ParkingCandidate, sourceType: ParkingDataSourceKind) => Promise<readonly ParkingAvailability[]>;
  /** Synthetic/MOCK fixtures only; live callers must omit. Existing coverage logic still rejects CITY/COMMUNITY. */
  readonly coverageDeclaration?: RegulationCoverageDeclaration;
}

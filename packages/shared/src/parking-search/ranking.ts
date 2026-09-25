import type { LegalityStatus } from "../domain";
import { compareText, evidenceQuality } from "./availability";
import type { ParkingRankingReason, ParkingRankTuple, ParkingSearchAvailability, ParkingSearchResult } from "./contracts";

export function rankParkingResult(candidateId: string, distanceMeters: number, legality: LegalityStatus, availability: ParkingSearchAvailability)
  : { rank: ParkingRankTuple; rankingReasons: ParkingRankingReason[] } {
  const known = availability.status !== "UNKNOWN" && availability.freshness === "FRESH";
  const rank: ParkingRankTuple = [ { LEGAL: 0, UNKNOWN: 1, ILLEGAL: 2 }[legality],
    { AVAILABLE: 0, UNKNOWN: 1, OCCUPIED: 2 }[availability.status], known ? evidenceQuality(availability.evidence) : 2,
    known ? availability.ageMinutes : null, distanceMeters, candidateId ];
  const rankingReasons: ParkingRankingReason[] = [legality === "LEGAL" ? "LEGAL_CONFIRMED" : legality === "UNKNOWN" ? "LEGALITY_UNKNOWN" : "ILLEGAL_KNOWN",
    availability.status === "AVAILABLE" ? "AVAILABLE_RECENT_REPORT" : availability.status === "OCCUPIED" ? "OCCUPIED_RECENT_REPORT" : "AVAILABILITY_UNKNOWN"];
  if (known) rankingReasons.push(availability.evidence?.sourceCategory === "COMMUNITY" ? "COMMUNITY_EVIDENCE" : "MOCK_EVIDENCE", "FRESH_EVIDENCE");
  rankingReasons.push("DISTANCE_TIEBREAKER");
  return { rank, rankingReasons };
}

export function compareParkingSearchResults(a: ParkingSearchResult, b: ParkingSearchResult): number {
  for (let i = 0; i < 5; i++) {
    const left = a.rank[i] ?? Infinity, right = b.rank[i] ?? Infinity;
    if (left !== right) return (left as number) < (right as number) ? -1 : 1;
  }
  return compareText(a.candidateId, b.candidateId);
}

/** V1 manual point-observation policy; no occupancy prediction or reservation. */
export const COMMUNITY_REPORT_TTL_MS = 5 * 60_000;
export const MOBILE_SEARCH_LIMITS = Object.freeze({ minRadiusMeters: 1, maxRadiusMeters: 10_000,
  maxCandidateRows: 500, maxReportRows: 2000, reportIdBatchSize: 50, maxResults: 100 });

export class MobileParkingSearchError extends Error {
  constructor(readonly code: "DATABASE_ERROR" | "DATA_ERROR" | "QUERY_LIMIT" | "UNSUPPORTED_REQUEST", message: string) {
    super(message); this.name = "MobileParkingSearchError";
  }
}

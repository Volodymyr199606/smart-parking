import type { domain, services } from "@smart-parking/shared";
import { nextParkingEvidenceExpiry, searchErrorMessage, type ParkingSearchInput } from "./parkingSearchViewModel";

export interface ParkingSearchState { status: "idle" | "loading" | "success" | "error"; results: services.ParkingSearchResult[]; error: string | null }
export interface ParkingSearchControllerDeps {
  search(request: domain.ParkingSearchRequest): Promise<services.ParkingSearchResult[]>;
  now(): number;
  schedule(callback: () => void, delay: number): () => void;
  onError?(error: unknown): void;
}
/** Framework-free hook controller. Generation checks cover success, error, timers and deactivation. */
export function createParkingSearchController(deps: ParkingSearchControllerDeps) {
  let state: ParkingSearchState = { status: "idle", results: [], error: null };
  let input: ParkingSearchInput | null = null, generation = 0, cancel: (() => void) | null = null;
  const listeners = new Set<() => void>();
  const publish = (value: ParkingSearchState) => { state = value; listeners.forEach(listener => listener()); };
  const invalidate = () => { generation++; cancel?.(); cancel = null; };
  async function execute(version: number) {
    if (!input || version !== generation) return;
    const request = { ...input, origin: { ...input.origin }, arrivalTime: new Date(deps.now()).toISOString(), maxResults: 100 };
    try {
      const results = await deps.search(request);
      if (version !== generation) return;
      const now = deps.now();
      // A long request must not reintroduce a known-status report whose deadline already passed.
      if (results.some(r => r.availability.status !== "UNKNOWN" && r.availability.evidence?.expiresAt
        && Date.parse(r.availability.evidence.expiresAt) <= now)) throw new Error("Evidence expired during search");
      publish({ status: "success", results, error: null });
      const expiry = nextParkingEvidenceExpiry(results, now);
      if (expiry !== null) cancel = deps.schedule(() => { if (version === generation) refresh(); }, Math.max(1, expiry - now));
    } catch (error) {
      if (version !== generation) return;
      deps.onError?.(error);
      publish({ status: "error", results: [], error: searchErrorMessage(error) });
    }
  }
  function refresh(delay = 0) {
    invalidate();
    if (!input) return;
    publish({ status: "loading", results: [], error: null }); // Never label old evidence as current during retry.
    const version = generation;
    if (delay) cancel = deps.schedule(() => { cancel = null; void execute(version); }, delay);
    else void execute(version);
  }
  return {
    getSnapshot: () => state,
    subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; },
    configure(value: ParkingSearchInput | null) {
      input = value ? { ...value, origin: { ...value.origin } } : null;
      if (input) refresh(250);
      else { invalidate(); publish({ status: "idle", results: [], error: null }); }
    },
    refresh: () => refresh(),
    invalidate: () => refresh(250),
  };
}

import type { services } from "@smart-parking/shared";
export async function submitParkingSearchReport(result: services.ParkingSearchResult, userId: string, status: "AVAILABLE" | "OCCUPIED", deps: {
  report(userId: string, spotId: string, status: "AVAILABLE" | "OCCUPIED"): Promise<void>; refresh(): void;
}) {
  if (!userId || result.sourceType !== "CURRENT_SPOTS") throw new Error("Reporting requires a signed-in user and a current parking spot");
  await deps.report(userId, result.location.id, status);
  deps.refresh();
}

/** Synchronous lock: two taps before React renders still submit only once. */
export function createParkingReportGuard() {
  let pending = false;
  return async (action: () => Promise<void>) => {
    if (pending) return;
    pending = true;
    try { await action(); } finally { pending = false; }
  };
}

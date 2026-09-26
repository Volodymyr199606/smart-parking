import type { domain } from "@smart-parking/shared";
export type ParkingSearchLocation = { status: "loading" | "denied" | "error"; point: null } | { status: "granted"; point: domain.GeoPoint };
export async function resolveParkingSearchLocation(deps: {
  permission(): Promise<{ status: string }>;
  position(): Promise<{ coords: domain.GeoPoint }>;
  servicesEnabled?(): Promise<boolean>;
  schedule?(callback: () => void, delay: number): () => void;
}, signal?: AbortSignal): Promise<ParkingSearchLocation> {
  let cancelTimer: (() => void) | undefined;
  let cancelAbort: (() => void) | undefined;
  try {
    if (signal?.aborted) return { status: "error", point: null };
    const cancelled = new Promise<never>((_, reject) => {
      const abort = () => reject(new Error("Location cancelled"));
      signal?.addEventListener("abort", abort, { once: true });
      cancelAbort = () => signal?.removeEventListener("abort", abort);
    });
    const lookup = async (): Promise<ParkingSearchLocation> => {
      if ((await deps.permission()).status !== "granted") return { status: "denied", point: null };
      if (signal?.aborted) return { status: "error", point: null };
      if (deps.servicesEnabled && !await deps.servicesEnabled()) return { status: "error", point: null };
      if (signal?.aborted) return { status: "error", point: null };
      // Native location promises can remain pending indoors/with services unavailable.
      // Bound retrieval only; do not time out the user's permission prompt.
      const schedule = deps.schedule ?? ((callback, delay) => { const timer = setTimeout(callback, delay); return () => clearTimeout(timer); });
      const timeout = new Promise<never>((_, reject) => {
        cancelTimer = schedule(() => reject(new Error("Location timed out")), 20000);
      });
      const { latitude, longitude } = (await Promise.race([deps.position(), timeout])).coords;
      if (!Number.isFinite(latitude) || Math.abs(latitude) > 90 || !Number.isFinite(longitude) || Math.abs(longitude) > 180) throw new Error("Invalid location");
      return { status: "granted", point: { latitude, longitude } };
    };
    return await Promise.race([lookup(), cancelled]);
  } catch { return { status: "error", point: null }; }
  finally { cancelTimer?.(); cancelAbort?.(); }
}

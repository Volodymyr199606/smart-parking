import type { domain } from "@smart-parking/shared";
export type ParkingSearchLocation = { status: "loading" | "denied" | "error"; point: null } | { status: "granted"; point: domain.GeoPoint };
export async function resolveParkingSearchLocation(deps: {
  permission(): Promise<{ status: string }>;
  position(): Promise<{ coords: domain.GeoPoint }>;
}): Promise<ParkingSearchLocation> {
  try {
    if ((await deps.permission()).status !== "granted") return { status: "denied", point: null };
    const { latitude, longitude } = (await deps.position()).coords;
    if (!Number.isFinite(latitude) || Math.abs(latitude) > 90 || !Number.isFinite(longitude) || Math.abs(longitude) > 180) throw new Error("Invalid location");
    return { status: "granted", point: { latitude, longitude } };
  } catch { return { status: "error", point: null }; }
}

import type { ParkingSpot } from "../shared";

/**
 * Insert or replace a spot by id. New spots are prepended; existing rows are updated in place.
 */
export function upsertSpotById(
  spots: ParkingSpot[],
  incoming: ParkingSpot
): ParkingSpot[] {
  const index = spots.findIndex((s) => s.id === incoming.id);
  if (index === -1) return [incoming, ...spots];

  const next = [...spots];
  next[index] = incoming;
  return next;
}

/**
 * Replace a spot by id when present. Realtime UPDATE must not append duplicates.
 */
export function replaceSpotById(
  spots: ParkingSpot[],
  incoming: ParkingSpot
): ParkingSpot[] {
  const index = spots.findIndex((s) => s.id === incoming.id);
  if (index === -1) return spots;

  const next = [...spots];
  next[index] = incoming;
  return next;
}

/** Remove a spot by id. */
export function removeSpotById(spots: ParkingSpot[], id: string): ParkingSpot[] {
  return spots.filter((s) => s.id !== id);
}

/** Existing Apple Maps preference / Google Maps fallback, injectable for offline verification. */
export async function openParkingDirections(destination: { latitude: number; longitude: number; label: string }, deps: {
  platform: string; canOpenURL(url: string): Promise<boolean>; openURL(url: string): Promise<unknown>; onFailure(): void;
}) {
  const { latitude, longitude } = destination, label = encodeURIComponent(destination.label);
  const appleMapsUrl = `maps:0,0?q=${label}@${latitude},${longitude}`;
  const googleMapsUrl = `https://www.google.com/maps/dir/?api=1&destination=${latitude},${longitude}&destination_place_id=${label}`;
  try {
    if (deps.platform === "ios" && await deps.canOpenURL(appleMapsUrl)) { await deps.openURL(appleMapsUrl); return; }
    await deps.openURL(googleMapsUrl);
  } catch { deps.onFailure(); }
}

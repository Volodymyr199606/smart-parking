/** Existing Apple Maps preference / Google Maps fallback, injectable for offline verification. */
export async function openParkingDirections(destination: { latitude: number; longitude: number; label: string }, deps: {
  platform: string; canOpenURL(url: string): Promise<boolean>; openURL(url: string): Promise<unknown>; onFailure(): void;
}) {
  const { latitude, longitude } = destination, label = encodeURIComponent(destination.label);
  const appleMapsUrl = `https://maps.apple.com/?daddr=${latitude},${longitude}&dirflg=d&ll=${latitude},${longitude}&q=${label}`;
  const googleMapsUrl = `https://www.google.com/maps/dir/?api=1&destination=${latitude},${longitude}`;
  try {
    if (deps.platform === "ios") {
      try {
        if (await deps.canOpenURL(appleMapsUrl)) { await deps.openURL(appleMapsUrl); return; }
      } catch { /* Try the existing Google fallback if Apple Maps cannot open. */ }
    }
    await deps.openURL(googleMapsUrl);
  } catch { deps.onFailure(); }
}

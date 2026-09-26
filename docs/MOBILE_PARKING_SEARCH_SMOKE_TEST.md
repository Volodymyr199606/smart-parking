# Mobile parking search: physical iPhone smoke test

Status: device execution is **not yet performed**. Offline checks do not establish visual, permission-dialog, Maps-app or real report-write behavior. Record those results below.

## Setup and launch

- This repo uses Expo SDK **54** (`expo ~54.0.37`), React Native **0.81.5**, React **19.1.0**. Use an SDK-54-compatible Expo Go. Expo's [current iPhone compatibility instructions](https://docs.expo.dev/troubleshooting/expo-go-version-mismatch/) identify an App Store path for SDK 54. Check the installed app's SDK compatibility before diagnosing a version mismatch as a parking defect.
- No custom native build is required for this list. Foreground [Expo Location is included in Expo Go](https://docs.expo.dev/versions/v54.0.0/sdk/location/). `expo-dev-client` is installed for the existing optional development-build path, but `start` explicitly selects Expo Go. No map is initialized by the current route; no Google Maps API key is required.
- Use an approved **development/test Supabase project and test account**, with existing schema and test parking spots near your real location. This checklist does not authorize production test writes. An account alone does not ensure nearby candidates exist. Do not add fake coordinates to bypass an empty result.
- Set `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_ANON_KEY` in **apps/mobile/.env**. The second accepts the project's anon/public JWT or publishable key. Never use a service-role or secret key. Do not copy the repo-root server `.env` into mobile or paste values into logs/screenshots. Missing/invalid URL or missing key must show **Configuration required** before importing the authenticated client tree.
- iPhone and computer should share a reachable LAN. Allow the development server through the local firewall when prompted. No iOS simulator is provided by Windows.

From the repository root, in PowerShell:

```powershell
pnpm.cmd --filter smart-parking-mobile start --clear
```

Open the Expo Go link/QR shown by Expo CLI on the iPhone (Camera can open an `exp://` QR into Expo Go). If LAN routing fails, the existing alternative is `pnpm.cmd --filter smart-parking-mobile start:tunnel`; tunnel setup may require internet access/tool installation. Restart Expo after changing environment configuration. Do not use bare `expo start`, which can select the installed development client instead of Expo Go. If using an already installed matching development build, the existing command is `pnpm.cmd --filter smart-parking-mobile start:dev`; no build is created by this task.

## Manual cases

Test while stationary. Reports must describe what you actually see, against the approved test project. Record SKIP with a reason if no suitable test candidate exists; do not record an unexercised action as PASS.

| # | Action | Expected behavior |
|---|---|---|
| 1 | Launch through the command/QR above. | Expo Go loads without missing-native-module/red-screen errors. Missing mobile config instead shows the two required variable names, never their values. |
| 2 | Sign in with the test account. | Authentication completes; no permanent auth spinner. |
| 3 | Open the authenticated Map route. | It displays **Parking nearby**, Profile/Settings and the own-report disclosure; no native map or legacy map probe. |
| 4 | Allow foreground location. | Permission requested only for foreground use. Loading becomes search progress, then results/empty/error. No invented fallback origin. A position request lasting over 20 seconds becomes a retryable location error. |
| 5 | Observe results or empty state; pull to refresh. | Cards preserve runtime order and distinguish unverified rules from availability. Empty copy describes candidates within the radius; data/network errors offer retry. Refresh clears old cards while checking. |
| 6 | Change radius, then tap several radii quickly. | Selected chip changes visually and for accessibility; one debounced request for the final input. Old responses cannot replace the final search. |
| 7 | Change stay duration. | 30 min/1/2/4 hours select correctly; results reevaluate for arrival now and selected stay. Selecting the same value does not retrigger a search. |
| 8 | Turn **Verified legal only** on, then off. | Optional filter follows the runtime. No verified legal results is expected with current rule coverage; turning it off restores eligible candidates. It is not an availability filter. |
| 9 | Expand a result, scroll through actions, close it. | Correct card expands; long text wraps. Directions/report/close stay reachable on a small screen and with larger text. No competing raw-spot selection. |
| 10 | Tap **Get directions**. | Apple Maps opens directions to the result coordinates. If Apple cannot open, Google Maps/web fallback is attempted; total failure shows an alert. Return to the app and verify fresh results. |
| 11 | Submit AVAILABLE for a suitable test spot; also try two quick taps. | One in-flight report, disabled/busy buttons, no optimistic card availability. No duplicate submission from rapid taps. |
| 12 | Observe report completion. | Success triggers the same search facade and a new result. RLS-visible fresh evidence may say **Recently reported available**; UNKNOWN remains possible for rejected/conflicting evidence. Failure shows a message without manufacturing status. |
| 13 | Submit OCCUPIED only if appropriate. | Same guarded report flow, original spot ID, refreshed runtime status; no invented occupancy. |
| 14 | Revoke location permission in iOS Settings, return, tap **Update my location** or retry; then grant it and retry. Also try Location Services off, and dismiss a permission prompt if iOS offers dismissal. | Denial/dismissal never supplies an origin; unavailable service/position failure shows retry. Re-enabling permission/services and retrying recovers. Expo Go owns the permission in Go; a development build uses Smart Parking's permission. iOS can remember denial and require Settings instead of another prompt. |
| 15 | Background and foreground the app; for a recent report also wait past its five-minute expiry. | Search timers/subscription stop while inactive. Return queries again. While active, the next evidence expiry clears stale cards and refreshes once. Expired responses permit one delayed retry, then error rather than a loop. |
| 16 | Navigate to Profile/Settings, then back. | Navigation works while search is loading. Returning runs a fresh search and restores one active spot subscription; leaving cancels pending search timers. |
| 17 | Repeat navigation, rapid control changes and refresh; observe Metro/device console. | No duplicate subscriptions, repeated requests without input/events, unmounted-state warnings or refresh storm. Spot event bursts debounce; report realtime is intentionally absent. |

Also check VoiceOver labels/selected and expanded states; large text; portrait small-screen scrolling; readable loading/error text; and login keyboard behavior. The parking screen has no keyboard input or fixed-height expanded card. The app root now supplies safe-area context, including the configuration-error path.

## Expected limitations

- Legality commonly remains **UNKNOWN**: no verified parking-spot-to-curb rule association exists. CITY stays INCOMPLETE. A known time limit is not blanket permission to park.
- Availability reflects reports readable under current RLS (currently the user's own reports). It is not a complete or authoritative live community feed, reservation or guarantee. Five minutes is the existing report evidence policy; the UI displays runtime age **at search**.
- There is no native map in this milestone. Legacy favorites/amenity/available-only filters are not part of this search screen.
- Empty candidates do not prove no physical parking exists. Inventory coverage, real device position, radius and verified-legal filtering matter. An infrastructure/query-budget failure is a visible error, not an empty success.
- Native position retrieval cannot be cancelled by Expo's one-shot API; cancelled/timed-out results are ignored, timers are cleared, and no stale origin can update the UI.
- No device result has been claimed from TypeScript tests or a Metro export. Maps app behavior, permissions and real report writes require this manual pass.

## Tooling and warning classification

- **BLOCKING, fixed:** eager Supabase creation bypassed the missing-config screen. Auth/navigation imports now occur after validation, with safe-area context available.
- **DEVICE-RISK, fixed:** legacy map-screen barrel import; indefinite native position wait; same-render double report taps; post-unmount report feedback; inactive spot subscriptions; narrow toggle/button layout; coordinate directions/fallback handling.
- **BENIGN:** Expo's offline dependency check warns that validation is less reliable offline; online Expo Doctor additionally passed all 18 checks. Disabling bytecode for an inspectable export emits a performance warning; it is a diagnostic flag only, not a changed app setting. Git may warn about LF-to-CRLF conversion.
- **ENVIRONMENT:** sandbox `spawn EPERM`/pnpm cache restrictions require permitted local tooling reruns; they are not app failures.
- **UNVERIFIED:** physical-device runtime, layout and accessibility. Record any additional console/native warnings here; do not classify an unseen runtime warning as resolved.

Automated checks use mocks or dummy local URLs with `EXPO_NO_DOTENV=1`; no production Supabase, AWS or DataSF requests are needed. Metro export compiles the iOS graph without launching it. Expo Doctor contacts Expo/package metadata services only. No migrations or test records are created by automated verification.

## Device test log

Device/model: ___  iOS: ___  Expo Go/dev-build version and SDK: ___

Timestamp/timezone: ___  Git revision: ___  Test project alias (no keys): ___

| Case | PASS / FAIL / SKIP | Screenshot or sanitized log reference | Notes |
|---|---|---|---|
| ___ | ___ | ___ | ___ |

Do not include tokens, passwords or environment values in attachments. Record untested report actions and unavailable test data as SKIP. Finish with outstanding defects and whether another device pass is needed.

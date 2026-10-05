# Mobile Expo SDK 54 to 57 upgrade

Validation date: October 5, 2026. Upgraded sequentially, validating each SDK before the next dependency change. Node 24.21.0; pnpm 10.22.0; Windows. No production resource changes, database migrations, commits, pushes, or remote builds.

## Stage results

| SDK | Expo | React Native | React | pnpm install | Root typecheck | Offline suites | Expo Doctor | iOS / Android Hermes export |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 55 | 55.0.31 | 0.83.10 | 19.2.0 | PASS | PASS | 12/12 PASS | 20/20 PASS | PASS / PASS |
| 56 | 56.0.23 | 0.85.3 | 19.2.3 | PASS | PASS after removing deprecated baseUrl | 12/12 PASS | 21/22: upstream Hermes regression | PASS / PASS |
| 57 | 57.0.26 | 0.86.3 | 19.2.3 | PASS | PASS | 12/12 PASS | 21/21 PASS | PASS / PASS |

Expo Doctor 1.20.4 was used without exclusions or warning suppression. `expo install --check` passed on all three SDKs. SDK 56's initial typecheck failure and successful rerun are both retained in local validation logs.

## SDK 56 upstream exception

SDK 56 Doctor detected Hermes V1 `250829098.0.10` and its known memory regression. This was the only failed Doctor check; it was not suppressed. The app does not directly depend on Reanimated or Worklets, but that does not establish immunity to engine regressions.

The [SDK 56 release notes](https://expo.dev/changelog/sdk-56#known-regressions) recommend SDK 57. The [SDK 57 release notes](https://expo.dev/changelog/sdk-57#known-regressions) identify the memory fix in Expo 57.0.9 / React Native 0.86.2 and the development-startup fix in Expo 57.0.17 / React Native 0.86.3. The final Expo 57.0.26 / React Native 0.86.3 installation includes Hermes V1 `250829098.0.17`, above Doctor's first-fixed memory-regression version `250829098.0.16`. SDK 57's Hermes check passes. This supported upgrade resolves the intermediate exception; no custom Hermes override was used.

## Compatibility changes

- Each stage used `pnpm --filter smart-parking-mobile exec expo install 'expo@~<stage-version>' --fix --pnpm`, followed by `pnpm install`. Expo selected compatible dependencies; no engine overrides or package-validation exclusions were added.
- SDK 56's installer required the `expo-status-bar` plugin in the dynamic `app.config.js`. Added it with default options; the existing runtime dark status bar is unchanged.
- SDK 57 initially retained the SDK 56 auto-installed `@expo/dom-webview` peer, incompatible with `@expo/log-box@57`. Explicitly installed Expo's recommended `@expo/dom-webview ~57.0.1` to resolve the native peer mismatch.
- Expo selected TypeScript 6.0.3 for SDK 56. Removed deprecated mobile `compilerOptions.baseUrl`; `@/*` still maps to the existing relative `./src/*`. No deprecation suppression was added.
- SDK 55 and later require the New Architecture. SDK 56 and later require iOS 16.4+ and Xcode 26.4+ for native iOS builds; see the respective Expo release notes.
- SDK 56 changes the default fetch implementation to `expo/fetch`. Auth, requests, cancellation and realtime still require physical-device verification with the upgraded native runtime.
- If later building with Xcode 27 / iOS 27 SDK, follow Expo's SDK 57 scene-support opt-in instructions in the linked release notes. This upgrade did not configure or test that optional native-build path.

The root, web and shared package manifests are unchanged. pnpm emitted transitive deprecation notices, its existing ignored-build-script notice for esbuild/sharp, and a web `@types/react-dom` / `@types/react` peer warning during resolution. These were not hidden; the unrelated web dependency versions were not upgraded. Root typecheck and native exports passed with the final installation.

## Verification scope

Every stage runs these existing offline scripts, with no production database or AWS access:

| Script (`pnpm verify:<name>`) | Result at each of SDK 55, 56 and 57 |
| --- | --- |
| parking-search | 42 checks PASS |
| mobile-parking-search | 38 checks + 15,120 bounding-box points PASS |
| parking-search-ui | 42 checks PASS, including device-readiness helpers and startup config guards |
| legality-engine | 33 checks PASS |
| orchestration | All cases PASS |
| schedule-parser | 49 checks PASS |
| schedule-applicability | 30 checks PASS |
| regulation-association | 7 checks PASS |
| regulation-coverage | 18 checks PASS |
| legal-conclusion | 12 checks PASS |
| regulation-storage | All mapping checks PASS |
| datasf-retry | 40 mocked cases PASS |

Database/cloud/ingestion utilities are outside this mobile upgrade's verification scope and were not executed. Existing verifier limitations still apply: pure adapter/controller checks do not prove native UI rendering or live database access.

Local logs and export artifacts are retained under ignored `node_modules/.cache/expo-upgrade/sdk55`, `sdk56`, and `sdk57`. The SDK 56 corrected typecheck is `typecheck-fixed.log`; the initial `results.json` records the initial failure. These artifacts are disposable, not source files.

From `apps/mobile`, each export uses:

```powershell
pnpm.cmd exec expo export --platform ios --platform android --output-dir ../../node_modules/.cache/expo-upgrade/sdk57/export --clear
```

Exports compile production Hermes bundles for both platforms. They do not compile, install, or launch an iOS/Android native binary.

Final bundles: `sdk57/export/_expo/static/js/ios/*.hbc` and `sdk57/export/_expo/static/js/android/*.hbc`, plus export metadata/assets. All generated artifacts remain ignored.

## Preserved behavior and manual device gate

Application runtime, shared parking logic, adapters, UI, authentication, location handling and verifiers are unchanged. The authenticated `Map` route still renders `ParkingSearchScreen` through direct imports; legacy map screens remain outside the active path. Legality and availability stay separate; UNKNOWN remains UNKNOWN; no city regulation coverage or occupancy is inferred.

Use an SDK-57-compatible Expo Go or rebuild the existing development client. An SDK 54/55/56 client cannot validate SDK 57 native modules. Run the [physical-device smoke checklist](MOBILE_PARKING_SEARCH_SMOKE_TEST.md) against an approved test Supabase project, and repeat the relevant cases on Android: startup config, login/session persistence, foreground location grant/deny/retry, search and filters, expiry, refresh/foreground/realtime, directions, guarded reports and sign-out. Native maps stay deferred. No physical-device pass is claimed by this upgrade.

## Files changed

- `apps/mobile/package.json`: Expo-compatible dependency versions and explicit native webview peer.
- `pnpm-lock.yaml`: resolved mobile dependency graph.
- `apps/mobile/app.config.js`: status-bar plugin.
- `apps/mobile/tsconfig.json`: remove deprecated baseUrl.
- `README.md`: mobile stack version.
- `apps/mobile/README.md`: SDK 57 client requirements and validation links.
- `docs/MOBILE_PARKING_SEARCH_SMOKE_TEST.md`: upgraded client requirements and Android retest reminder.
- `docs/EXPO_SDK_57_UPGRADE.md`: this stage-by-stage evidence and compatibility report.

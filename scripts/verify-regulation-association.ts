/**
 * Zero-dependency verification for Regulation Association Hardening V1.
 * Pure in-memory test cases — no Supabase, no network, no env vars.
 * Follows the existing scripts/verify-*.ts convention.
 *
 * SCOPE NOTE — why this only tests the pure helper, not the full Supabase
 * lookup functions:
 * `apps/mobile/src/services/regulationService.ts` (and, transitively,
 * `candidateService.ts`) import `./supabaseClient`, which constructs a
 * real Supabase client at MODULE-LOAD time via
 * `createClient(ENV.SUPABASE_URL, ENV.SUPABASE_ANON_KEY, ...)`. Confirmed
 * by direct test in this environment: `createClient("", "", {})` throws
 * "supabaseUrl is required" — so simply importing regulationService.ts
 * (even just to reach a pure helper it re-exports) crashes a bare
 * Node/tsx script when EXPO_PUBLIC_SUPABASE_URL is unset, as it is here.
 * Refactoring regulationService.ts to inject the Supabase client would be
 * a larger change than this milestone calls for (see its task
 * instructions: "do not over-engineer it... extract the smallest pure
 * helper necessary"). Accordingly:
 *  - The exact ambiguity DECISION (0/1/2+ rows -> [] / row / []) was
 *    extracted to `apps/mobile/src/services/regulationAssociation.ts`,
 *    which has NO imports at all — safe to import here — and IS fully
 *    verified below.
 *  - The PRIMARY (foreign-key) path and the NON-CITY provenance gate are
 *    UNCHANGED by this milestone (no code in either was modified) and are
 *    confirmed correct by code inspection in the final report, not by a
 *    new runtime test here — introducing Supabase mocking machinery
 *    solely to re-prove already-unchanged behavior would be exactly the
 *    kind of over-engineering this milestone is scoped to avoid.
 *
 * Usage:
 *   pnpm verify:regulation-association
 */

import { resolveExactFallbackMatches } from "../apps/mobile/src/services/regulationAssociation";

function log(msg: string): void {
  console.log(`[verify] ${msg}`);
}
function fail(msg: string): void {
  console.error(`[verify] FAIL: ${msg}`);
}

let passed = 0;
let failed = 0;

function assertRows<T>(label: string, actual: readonly T[], expected: readonly T[]): void {
  const ok =
    actual.length === expected.length && expected.every((v, i) => actual[i] === v);
  if (ok) {
    log(`PASS: ${label} → [${actual.length} row(s)]`);
    passed++;
  } else {
    fail(`${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
    failed++;
  }
}

// ===========================================================================
// FALLBACK — resolveExactFallbackMatches: 0 / 1 / 2+ matches
// ===========================================================================

log("\n=== FALLBACK: 0 exact blockface matches -> [] ===");
assertRows("resolveExactFallbackMatches([])", resolveExactFallbackMatches([]), []);

log("\n=== FALLBACK: exactly 1 exact blockface match -> that row ===");
{
  const row = { id: "block-1", blockface_id: "BF-100" };
  const result = resolveExactFallbackMatches([row]);
  assertRows("resolveExactFallbackMatches([oneRow])", result, [row]);
  // Confirm it's literally the same row object, not a copy/reconstruction.
  if (result[0] === row) {
    log("PASS: returned row is referentially the same object (not reconstructed)");
    passed++;
  } else {
    fail("returned row should be referentially identical to the input row");
    failed++;
  }
}

log("\n=== FALLBACK: 2 exact blockface matches (ambiguous) -> [] ===");
{
  const rowA = { id: "block-1", blockface_id: "BF-100" };
  const rowB = { id: "block-2", blockface_id: "BF-100" };
  assertRows("resolveExactFallbackMatches([rowA, rowB])", resolveExactFallbackMatches([rowA, rowB]), []);
}

log("\n=== FALLBACK: 3+ exact blockface matches (ambiguous) -> [] ===");
{
  const rows = [
    { id: "block-1", blockface_id: "BF-100" },
    { id: "block-2", blockface_id: "BF-100" },
    { id: "block-3", blockface_id: "BF-100" },
  ];
  assertRows("resolveExactFallbackMatches([3 rows])", resolveExactFallbackMatches(rows), []);
}

log("\n=== FALLBACK: does NOT pick the first row when ambiguous ===");
{
  const rowA = { id: "block-FIRST" };
  const rowB = { id: "block-SECOND" };
  const result = resolveExactFallbackMatches([rowA, rowB]);
  const pickedFirst = result.length === 1 && result[0] === rowA;
  if (!pickedFirst && result.length === 0) {
    log("PASS: ambiguous input did not degrade into picking the first row");
    passed++;
  } else {
    fail("ambiguous input incorrectly picked a row instead of resolving to []");
    failed++;
  }
}

log("\n=== FALLBACK: does NOT combine/union ambiguous rows ===");
{
  const rowA = { id: "block-A" };
  const rowB = { id: "block-B" };
  const result = resolveExactFallbackMatches([rowA, rowB]);
  if (result.length === 0) {
    log("PASS: ambiguous input was discarded, not combined into a multi-row result");
    passed++;
  } else {
    fail(`ambiguous input should resolve to [], got ${result.length} row(s)`);
    failed++;
  }
}

// ===========================================================================
// Summary
// ===========================================================================

log(`\n=== Summary: ${passed} passed, ${failed} failed ===`);
log(
  "\nNOTE: PRIMARY (foreign-key) path behavior and the NON-CITY provenance " +
    "gate are unchanged by this milestone — verified by code inspection " +
    "(see final report), not by a runtime test here. See this file's top " +
    "comment for why (Supabase client construction at module-load time " +
    "makes regulationService.ts/candidateService.ts unsafe to import from " +
    "a bare Node/tsx script without env vars configured)."
);

if (failed > 0) {
  process.exit(1);
}

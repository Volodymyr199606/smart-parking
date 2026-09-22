/** LOCAL ONLY: behavior tests via psql in the already-running Supabase Docker DB.
 * No dotenv, hosted API, dependencies, migrations, reset, or production credentials.
 * Negative/shadow tests roll back. Positive synthetic history is intentionally retained
 * (append-only guards prohibit cleanup); reruns use new capture keys and timestamps.
 * Clear it only with an explicitly authorized disposable local Supabase reset.
 * URL is an endpoint assertion, not a credential: transport is the local Docker pipe.
 */
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { canonicalDataset, canonicalFeature, sha256 } from "./canonicalize-curb-snapshot";

const forbidden = "pffznlpmgtrpsejayicj";
const container = "supabase_db_smart-parking";
const pipe = "npipe:////./pipe/dockerDesktopLinuxEngine";
const source = "00000000-0000-4000-8000-000000000012";
const marker = "LOCAL SYNTHETIC curb publication verification V1";
const runId = randomUUID();
function localTarget(raw: string) {
  assert(!decodeURIComponent(raw).toLowerCase().includes(forbidden), "Production target refused");
  const url = new URL(raw);
  assert(["postgresql:", "postgres:"].includes(url.protocol) && ["127.0.0.1", "localhost", "[::1]"].includes(url.hostname), "Non-local target refused");
  assert(url.port === "54322" && url.pathname === "/postgres" && url.username === "postgres" && !url.password && !url.search && !url.hash, "Only the password-free local endpoint assertion is supported");
  return url;
}
const q = (s: string) => "'" + s.replaceAll("'", "''") + "'";
const value = (v: unknown): string => v === null ? "NULL" : typeof v === "object" ? q(JSON.stringify(v)) + "::jsonb" : typeof v === "number" ? String(v) : q(String(v));
const insert = (table: string, row: Record<string, unknown>) => {
  assert(/^[a-z_][a-z0-9_]*$/.test(table) && Object.keys(row).every(k => /^[a-z_][a-z0-9_]*$/.test(k)));
  return `INSERT INTO public.${table} (${Object.keys(row).join(",")}) VALUES (${Object.values(row).map(value).join(",")});`;
};
type Result = { code: number; out: string; error: string };
function docker(args: string[], input = "", hold = false) {
  const child = spawn("docker", ["--host", pipe, ...args], { windowsHide: true, stdio: "pipe" });
  let out = "", error = "";
  const finished = new Promise<Result>((resolve, reject) => {
    const timeout = setTimeout(() => { child.kill(); reject(new Error("Local Docker/psql timeout")); }, 60000);
    child.stdout.on("data", b => { out += b.toString(); });
    child.stderr.on("data", b => { error += b.toString(); });
    child.on("error", e => { clearTimeout(timeout); reject(e); });
    child.on("close", code => { clearTimeout(timeout); resolve({ code: code ?? -1, out: out.trim(), error: error.trim() }); });
  });
  if (hold) child.stdin.write(input); else child.stdin.end(input);
  return { child, finished, output: () => out };
}
const psqlArgs = ["exec", "-i", container, "psql", "-X", "-qAt", "-U", "supabase_admin", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-v", "VERBOSITY=verbose"];
function startSql(sql: string, role = "postgres", rollback = false, hold = false, app = "curb-test") {
  assert(["postgres", "anon", "authenticated", "service_role", "curb_artifact_verifier"].includes(role));
  return docker(psqlArgs, `BEGIN; SET LOCAL statement_timeout='20s'; SET LOCAL lock_timeout='15s'; SET LOCAL application_name=${q(app)}; SET LOCAL ROLE ${role};\n${sql}\n${hold ? "" : rollback ? "ROLLBACK;" : "COMMIT;"}\n`, hold);
}
async function sql(text: string, role = "postgres", rollback = false): Promise<string> {
  const r = await startSql(text, role, rollback).finished;
  assert.equal(r.code, 0, `Unexpected PostgreSQL error:\n${r.error}\nStatement:\n${text}`);
  return r.out;
}
async function json<T = any>(text: string): Promise<T> { return JSON.parse(await sql(text)); }
let checks = 0;
async function check(name: string, action: () => Promise<void>) {
  try { await action(); checks++; console.log(`PASS ${name}`); }
  catch (e) { throw new Error(`FAIL ${name}`, { cause: e }); }
}
const tables = ["city_parking_source_snapshots", "city_parking_curb_versions", "city_parking_curb_snapshot_features", "city_parking_curb_publications"];
async function state() {
  return sql("SELECT jsonb_build_array(" + tables.map(t => `(SELECT coalesce(jsonb_agg(to_jsonb(t) ORDER BY to_jsonb(t)::text),'[]'::jsonb) FROM public.${t} t)`).join(",") + ")::text;");
}
async function rejected(name: string, text: string, code: string, message: string, role = "postgres") {
  await check(name, async () => {
    const before = await state();
    const r = await startSql(text, role, true).finished;
    assert.notEqual(r.code, 0, "Operation unexpectedly succeeded");
    assert(r.error.includes(code) && r.error.includes(message), `Unexpected rejection: ${r.error}\nStatement: ${text}`);
    assert.equal(await state(), before, "Rejected operation changed persisted curb state");
  });
}
type Snapshot = { id: string; seal: string; manifestHash: string; row: Record<string, any> };
type Version = { id: string; external_id: string; geometry_sha256: string; attributes_sha256: string; content_sha256: string };
let versions: Version[] = [];
let captureClock = Date.now();
const line = { type: "LineString", coordinates: [[-122.44, 37.77], [-122.4399, 37.7701]] };
const rawRows = [1, 2, 3].map(n => ({ globalid: `test-curb-00${n}-${runId}`, name: marker, shape: line }));
function seal(vs: Version[]) {
  return sha256("city-curb/db-membership/v1\n" + vs.map(v => ({ ...v, key: Buffer.from(v.external_id).toString("hex") }))
    .sort((a, b) => a.key < b.key ? -1 : a.key > b.key ? 1 : 0)
    .map(v => `${v.key}:${v.id}:${v.geometry_sha256}:${v.attributes_sha256}:${v.content_sha256}`).join("\n"));
}
function snapshot(name: string, overrides: Record<string, unknown> = {}, summary: Record<string, unknown> = {}): Snapshot {
  captureClock += 10000;
  const start = new Date(captureClock).toISOString(), end = new Date(captureClock + 1000).toISOString();
  const dataset = canonicalDataset(rawRows.slice(0, 2));
  const schema = sha256("synthetic schema V1");
  const manifest = {
    format_version: "curb-snapshot-v1", canonicalization_version: "curb-jcs-v1", provider: "datasf", dataset_id: "pep9-66vw",
    source_key: "datasf_citywide_curbs", api_endpoint: "https://data.sfgov.org/resource/pep9-66vw.json",
    fetch_tool_version: "synthetic-db-test-v1", captured_at_start: start, captured_at_end: end,
    query: { select: "*", order: "globalid ASC", page_size: 1000, offset_step: 1000, filter: null },
    summary: { state: "CONSISTENT", ordered: true, count_before: 2, count_after: 2, row_count: 2, distinct_external_id_count: 2,
      usable_geometry_count: 2, schema_before: schema, schema_after: schema, dataset_sha256: dataset.dataset_sha256,
      identity_geometry_sha256: dataset.identity_geometry_sha256, ...summary },
  };
  const manifestHash = sha256(JSON.stringify(manifest));
  const row = { id: randomUUID(), source_id: source, capture_key: `test:${runId}:${name}`, retrieval_started_at: start, retrieval_completed_at: end,
    canonicalization_version: "curb-jcs-v1", fetch_tool_version: "synthetic-db-test-v1", consistency_state: "CONSISTENT", row_count: 2,
    schema_sha256: schema, source_content_sha256: dataset.dataset_sha256, identity_geometry_sha256: dataset.identity_geometry_sha256,
    artifact_uri: `test://curb/${runId}/artifact`, artifact_sha256: sha256("synthetic retained bytes"),
    manifest_uri: `test://curb/${runId}/manifest`, manifest_sha256: manifestHash, manifest, ...overrides };
  return { id: row.id, row, manifestHash, seal: seal(versions.slice(0, 2)) };
}
const membership = (s: Snapshot, v: Version, overrides: Record<string, unknown> = {}) => insert("city_parking_curb_snapshot_features", {
  snapshot_id: s.id, source_id: source, external_id: v.external_id, curb_version_id: v.id, ...overrides,
});
async function stage(s: Snapshot, vs = versions.slice(0, 2)) {
  await sql(insert("city_parking_source_snapshots", s.row) + vs.map(v => membership(s, v)).join("\n"), "service_role");
  return s;
}
const validate = (s: Snapshot, hash: string | null = s.manifestHash, memberSeal: string | null = s.seal, verifier: string | null = "curb-artifact-verify-v1") =>
  `SELECT public.validate_city_parking_curb_snapshot(${q(source)},${q(s.id)},${value(hash)},${value(memberSeal)},${value(verifier)});`;
const publish = (s: Snapshot, expected: string | null) => `SELECT public.publish_city_parking_curb_snapshot(${q(source)},${q(s.id)},${value(expected)});`;
const fail = (s: Snapshot, reason: string | null = "synthetic test failure") => `SELECT public.fail_city_parking_curb_snapshot(${q(source)},${q(s.id)},${value(reason)});`;
async function validated(name: string) { const s = await stage(snapshot(name)); assert.equal(await sql(validate(s), "curb_artifact_verifier"), "VALIDATED"); return s; }
const readSnapshot = (s: Snapshot) => json(`SELECT to_jsonb(s) FROM public.city_parking_source_snapshots s WHERE id=${q(s.id)};`);
const pointer = () => json(`SELECT coalesce((SELECT to_jsonb(p) FROM public.city_parking_curb_publications p WHERE source_id=${q(source)}),'null'::jsonb);`);
async function until(predicate: () => Promise<boolean>, message: string) {
  const deadline = Date.now() + 10000;
  while (Date.now() < deadline) { if (await predicate()) return; await new Promise(r => setTimeout(r, 100)); }
  throw new Error(message);
}

async function main() {
  const args = process.argv.slice(2);
  assert(args.length === 1 && args[0].startsWith("--database-url="), "Supply exactly --database-url=postgresql://postgres@127.0.0.1:54322/postgres");
  const raw = args[0].slice("--database-url=".length);
  const url = localTarget(raw);
  await check("target guard rejects production, remote hosts and endpoint overrides before Docker", async () => {
    for (const target of [`postgresql://postgres@${forbidden}.supabase.co:54322/postgres`, "postgresql://postgres@example.invalid:54322/postgres", "postgresql://postgres@localhost.evil:54322/postgres", "postgresql://postgres@127.0.0.1:54323/postgres", "postgresql://postgres@127.0.0.1:54322/postgres?host=example.invalid"])
      assert.throws(() => localTarget(target));
  });
  const info = await docker(["inspect", "--format", '{{json .NetworkSettings.Ports}}', container]).finished;
  assert.equal(info.code, 0, "Local container unavailable");
  const ports = JSON.parse(info.out);
  assert(ports["5432/tcp"].some((p: { HostPort: string }) => p.HostPort === url.port), "Local DB port mismatch");
  console.log("LOCAL TARGET VERIFIED: Docker Desktop pipe; supabase_db_smart-parking; 127.0.0.1:54322; production ref absent");
  console.log("Synthetic history retained; negative/temporary tests roll back. No reset or migration application.");
  await check("PostgreSQL/migration baseline and synthetic-only scope", async () => {
    const baseline = await json(`SELECT jsonb_build_object('version',current_setting('server_version'),'migration',(SELECT count(*) FROM supabase_migrations.schema_migrations WHERE version='00012'),'other_sources',(SELECT count(*) FROM public.city_parking_sources WHERE id<>${q(source)} OR display_name<>${q(marker)}),'other_captures',(SELECT count(*) FROM public.city_parking_source_snapshots WHERE capture_key NOT LIKE 'test:%'));`);
    assert.equal(baseline.migration, 1); assert.equal(baseline.other_sources, 0); assert.equal(baseline.other_captures, 0);
    console.log(`PostgreSQL ${baseline.version}`);
    await sql(insert("city_parking_sources", { id: source, source_key: "datasf_citywide_curbs", display_name: marker, provider: "DATASF", dataset_id: "pep9-66vw", api_base_url: "https://data.sfgov.org/resource" }).replace(/;$/, " ON CONFLICT (id) DO NOTHING;"));
    captureClock = Math.max(captureClock, Number(await sql("SELECT coalesce(extract(epoch FROM max(retrieval_completed_at))*1000,0)::bigint FROM public.city_parking_source_snapshots;")));
  });
  await check("service_role creates canonical synthetic versions", async () => {
    for (const row of rawRows) {
      const hashes = canonicalFeature(row), id = randomUUID();
      await sql(insert("city_parking_curb_versions", { id, source_id: source, ...hashes, canonicalization_version: "curb-jcs-v1", geometry_presence: "VALUE", geometry_geojson: row.shape,
        raw_source: { globalid: row.globalid, name: row.name }, geometry_state: "USABLE", validation_version: "curb-geometry-v1", validation_reasons: [] }), "service_role");
      versions.push({ id, ...hashes });
    }
  });
  const initialPointer = await pointer();
  const first = await stage(snapshot("first"));
  await check("STAGING membership and independent seal agree", async () => {
    assert.equal(await sql(`SELECT curb_private.membership_seal(${q(first.id)});`), first.seal);
    assert.equal((await readSnapshot(first)).lifecycle, "STAGING");
  });
  await rejected("direct service lifecycle UPDATE", `UPDATE public.city_parking_source_snapshots SET lifecycle='VALIDATED' WHERE id=${q(first.id)};`, "42501", "permission denied", "service_role");
  await check("validation happy path records attestation and freezes unchanged membership", async () => {
    const before = await sql(`SELECT jsonb_agg(to_jsonb(m) ORDER BY external_id) FROM public.city_parking_curb_snapshot_features m WHERE snapshot_id=${q(first.id)};`);
    assert.equal(await sql(validate(first), "curb_artifact_verifier"), "VALIDATED");
    const s = await readSnapshot(first);
    assert.equal(s.lifecycle, "VALIDATED"); assert(s.validated_at && s.artifact_verified_at);
    assert.equal(s.artifact_verified_by, "supabase_admin"); assert.equal(s.artifact_verification_version, "curb-artifact-verify-v1"); assert.equal(s.membership_sha256, first.seal);
    assert.equal(await sql(`SELECT jsonb_agg(to_jsonb(m) ORDER BY external_id) FROM public.city_parking_curb_snapshot_features m WHERE snapshot_id=${q(first.id)};`), before);
    const stable = await state(); assert.equal(await sql(validate(first), "curb_artifact_verifier"), "ALREADY_VALIDATED"); assert.equal(await state(), stable);
  });
  for (const field of ["artifact_uri", "artifact_sha256", "manifest_uri", "manifest_sha256"]) {
    const s = snapshot(`missing-${field}`, { [field]: null });
    await rejected(`missing ${field} rejected at staging`, insert("city_parking_source_snapshots", s.row), "23502", field, "service_role");
  }
  for (const consistency of ["INVALID", "POSSIBLY_CHANGED_DURING_CAPTURE"]) {
    const s = await stage(snapshot(consistency, { consistency_state: consistency }));
    await rejected(`validation rejects ${consistency}`, validate(s), "P0001", "Capture is not eligible", "curb_artifact_verifier");
  }
  const rejectFixture = await stage(snapshot("attestation-rejections"));
  await rejected("missing verifier attestation", validate(rejectFixture, rejectFixture.manifestHash, rejectFixture.seal, null), "P0001", "Invalid artifact attestation", "curb_artifact_verifier");
  await rejected("missing membership seal", validate(rejectFixture, rejectFixture.manifestHash, null), "P0001", "Invalid artifact attestation", "curb_artifact_verifier");
  await rejected("incorrect membership seal", validate(rejectFixture, rejectFixture.manifestHash, "f".repeat(64)), "P0001", "Verifier membership seal mismatch", "curb_artifact_verifier");
  for (const [name, overrides, summary, count, error] of [
    ["row count mismatch", { row_count: 3 }, {}, 2, "Manifest envelope mismatch"],
    ["membership count mismatch", {}, {}, 1, "Incomplete membership"],
    ["distinct identity manifest mismatch", {}, { distinct_external_id_count: 1 }, 2, "Manifest envelope mismatch"],
  ] as const) {
    const s = await stage(snapshot(name, overrides, summary), versions.slice(0, count));
    await rejected(name, validate(s), "P0001", error, "curb_artifact_verifier");
  }
  const badMembers = await stage(snapshot("bad-members"), []);
  await rejected("missing curb version rejected by FK", membership(badMembers, { ...versions[0], id: randomUUID() }), "23503", "foreign key", "service_role");
  const wrongSource = randomUUID();
  await rejected("wrong-source version cannot enter curb storage", insert("city_parking_sources", { id: wrongSource, source_key: `test-wrong-source-${runId}`, display_name: marker, provider: "DATASF", dataset_id: "test-dataset", api_base_url: "https://example.invalid" }) + "SET LOCAL ROLE service_role;" + insert("city_parking_curb_versions", {
    id: randomUUID(), source_id: wrongSource, external_id: "test-wrong-source", canonicalization_version: "curb-jcs-v1", geometry_presence: "VALUE", geometry_geojson: line,
    geometry_sha256: sha256("g"), attributes_sha256: sha256("a"), content_sha256: sha256("c"), raw_source: { globalid: "test-wrong-source" }, geometry_state: "USABLE", validation_version: "curb-geometry-v1", validation_reasons: [],
  }), "P0001", "Wrong curb source");
  await rejected("member external identity must agree with version", membership(badMembers, versions[0], { external_id: "test-wrong-identity" }), "23503", "foreign key", "service_role");
  await rejected("duplicate membership identity", membership(rejectFixture, versions[0]), "23505", "duplicate key", "service_role");
  const malformed = { globalid: `test-invalid-geometry-${runId}`, shape: { type: "Point", coordinates: [-122.44, 37.77] } };
  const badV = { id: randomUUID(), ...canonicalFeature(malformed) };
  await sql(insert("city_parking_curb_versions", { ...badV, source_id: source, canonicalization_version: "curb-jcs-v1", geometry_presence: "VALUE", geometry_geojson: malformed.shape,
    raw_source: { globalid: malformed.globalid }, geometry_state: "USABLE", validation_version: "curb-geometry-v1", validation_reasons: [] }), "service_role");
  const invalidGeometry = await stage(snapshot("invalid-geometry"), [versions[0], badV]);
  await rejected("invalid geometry despite asserted USABLE state", validate(invalidGeometry, invalidGeometry.manifestHash, seal([versions[0], badV])), "P0001", "Invalid version membership", "curb_artifact_verifier");
  for (const [label, s] of [["VALIDATED", first]] as const) {
    await rejected(`${label} membership INSERT frozen`, membership(s, versions[2]), "P0001", "Membership is frozen", "service_role");
    for (const command of [`UPDATE public.city_parking_curb_snapshot_features SET external_id='test-mutated' WHERE snapshot_id=${q(s.id)}`, `DELETE FROM public.city_parking_curb_snapshot_features WHERE snapshot_id=${q(s.id)}`])
      await rejected(`${label} membership ${command.split(" ")[0]} denied by trigger`, command + ";", "P0001", "forbidden");
  }
  await check("first publication creates one pointer with expected generation", async () => {
    assert.equal(await sql(publish(first, initialPointer?.snapshot_id ?? null), "service_role"), "PUBLISHED");
    const p = await pointer(); assert.equal(p.snapshot_id, first.id); assert.equal(p.generation, (initialPointer?.generation ?? 0) + 1);
    assert((await readSnapshot(first)).published_at); assert.equal(await sql(`SELECT count(*) FROM public.city_parking_curb_publications WHERE source_id=${q(source)};`), "1");
  });
  await check("successful publication retry changes no rows or timestamps", async () => {
    const before = await state(); assert.equal(await sql(publish(first, initialPointer?.snapshot_id ?? null), "service_role"), "ALREADY_CURRENT"); assert.equal(await state(), before);
  });
  const older = await validated("older");
  const second = await validated("second"), secondBefore = await pointer();
  await check("second capture advances once and preserves published history", async () => {
    const old = await readSnapshot(first); assert.equal(await sql(publish(second, first.id), "service_role"), "PUBLISHED");
    assert.deepEqual(await readSnapshot(first), old); const p = await pointer(); assert.equal(p.snapshot_id, second.id); assert.equal(p.generation, secondBefore.generation + 1);
  });
  const stale = await validated("stale");
  await rejected("stale predecessor", publish(stale, first.id), "P0001", "Stale publication predecessor", "service_role");
  const newer = second;
  await rejected("older capture cannot rewind current", publish(older, newer.id), "P0001", "Capture is not newer than current", "service_role");
  await check("retry of historical published snapshot never rewinds", async () => { const before = await state(); assert.equal(await sql(publish(first, null), "service_role"), "ALREADY_PUBLISHED_NOT_CURRENT"); assert.equal(await state(), before); });
  for (const field of ["source_id", "capture_key", "retrieval_started_at", "retrieval_completed_at", "artifact_uri", "artifact_sha256", "manifest_uri", "manifest_sha256", "schema_sha256", "source_content_sha256", "identity_geometry_sha256", "row_count", "consistency_state", "artifact_verified_at", "artifact_verified_by", "artifact_verification_version", "published_at", "manifest"]) {
    const replacement = field === "source_id" ? q(randomUUID()) : field.endsWith("_at") ? "clock_timestamp()" : field.startsWith("retrieval_") ? "clock_timestamp()" : field === "row_count" ? "3" : field === "manifest" ? "'{}'::jsonb" : field.endsWith("sha256") ? q("e".repeat(64)) : q("test-mutated");
    await rejected(`published snapshot ${field} immutable`, `UPDATE public.city_parking_source_snapshots SET ${field}=${replacement} WHERE id=${q(first.id)};`, "P0001", "Forbidden snapshot transition");
  }
  await rejected("snapshot DELETE denied", `DELETE FROM public.city_parking_source_snapshots WHERE id=${q(first.id)};`, "P0001", "forbidden");
  for (const [field, replacement] of Object.entries({ external_id: q("test-mutated"), geometry_geojson: "'{}'::jsonb", raw_source: "'{}'::jsonb", attributes_sha256: q("e".repeat(64)), geometry_sha256: q("e".repeat(64)), content_sha256: q("e".repeat(64)) }))
    await rejected(`version ${field} immutable`, `UPDATE public.city_parking_curb_versions SET ${field}=${replacement} WHERE id=${q(versions[0].id)};`, "P0001", "forbidden");
  await rejected("referenced version DELETE denied", `DELETE FROM public.city_parking_curb_versions WHERE id=${q(versions[0].id)};`, "P0001", "forbidden");
  await rejected("PUBLISHED membership INSERT frozen", membership(first, versions[2]), "P0001", "Membership is frozen", "service_role");
  for (const command of [`UPDATE public.city_parking_curb_snapshot_features SET external_id='test-mutated' WHERE snapshot_id=${q(first.id)}`, `DELETE FROM public.city_parking_curb_snapshot_features WHERE snapshot_id=${q(first.id)}`])
    await rejected(`PUBLISHED membership ${command.split(" ")[0]} denied`, command + ";", "P0001", "forbidden");
  for (const t of tables) await rejected(`${t} TRUNCATE denied`, `TRUNCATE public.${t} CASCADE;`, "P0001", "forbidden");
  await rejected("referenced source cannot be repurposed", `UPDATE public.city_parking_sources SET source_key='test-repurpose' WHERE id=${q(source)};`, "P0001", "Cannot repurpose");
  for (const s of [await stage(snapshot("fail-staging")), await validated("fail-validated")]) {
    await rejected("failure reason required", fail(s, null), "P0001", "Failure reason required", "service_role");
    await check("STAGING/VALIDATED to FAILED and idempotent failure", async () => { assert.equal(await sql(fail(s), "service_role"), "FAILED"); const before = await state(); assert.equal(await sql(fail(s), "service_role"), "ALREADY_FAILED"); assert.equal(await state(), before); assert((await readSnapshot(s)).failed_at); });
    await rejected("FAILED cannot validate", validate(s), "P0001", "Cannot validate terminal failed snapshot", "curb_artifact_verifier");
    await rejected("FAILED cannot publish", publish(s, newer.id), "P0001", "Snapshot must be VALIDATED", "service_role");
    await rejected("FAILED cannot return to STAGING", `UPDATE public.city_parking_source_snapshots SET lifecycle='STAGING' WHERE id=${q(s.id)};`, "P0001", "Forbidden snapshot transition");
  }
  const rollback = await validated("rollback");
  await rejected("pointer CHECK failure rolls back prior snapshot transition", `ALTER TABLE public.city_parking_curb_publications ADD CONSTRAINT test_curb_publication_rollback CHECK (snapshot_id <> ${q(rollback.id)}::uuid); SET LOCAL ROLE service_role; ${publish(rollback, newer.id)}`, "23514", "test_curb_publication_rollback");
  assert.equal((await readSnapshot(rollback)).lifecycle, "VALIDATED");
  assert.equal(await sql("SELECT count(*) FROM pg_constraint WHERE conname='test_curb_publication_rollback';"), "0");

  for (const role of ["anon", "authenticated"]) {
    for (const t of tables) {
      for (const [verb, operation] of [["INSERT", `INSERT INTO public.${t} DEFAULT VALUES`], ["UPDATE", `UPDATE public.${t} SET source_id=source_id`], ["DELETE", `DELETE FROM public.${t}`], ["SELECT", `SELECT * FROM public.${t}`]])
        await rejected(`${role} ${t} ${verb} denied`, operation + ";", "42501", "permission denied", role);
    }
    for (const statement of [validate(rejectFixture), publish(rollback, newer.id), fail(rejectFixture)]) await rejected(`${role} trusted RPC denied`, statement, "42501", "permission denied", role);
  }
  await rejected("service cannot validate", validate(rejectFixture), "42501", "permission denied", "service_role");
  await rejected("service cannot update pointer directly", `UPDATE public.city_parking_curb_publications SET generation=generation+1;`, "42501", "permission denied", "service_role");
  for (const statement of [publish(rollback, newer.id), fail(rejectFixture), insert("city_parking_source_snapshots", snapshot("verifier-insert").row), `UPDATE public.city_parking_source_snapshots SET lifecycle='FAILED';`, `DELETE FROM public.city_parking_source_snapshots;`])
    await rejected("verifier has no staging/publication/failure/mutation privilege", statement, "42501", "permission denied", "curb_artifact_verifier");
  await check("service and verifier can read intended server tables", async () => { for (const role of ["service_role", "curb_artifact_verifier"]) for (const t of tables) assert(Number(await sql(`SELECT count(*) FROM public.${t};`, role)) > 0); });

  const shadow = await stage(snapshot("shadow"));
  const shadowObjects = `CREATE TEMP TABLE city_parking_sources (id uuid); CREATE TEMP TABLE city_parking_source_snapshots (id uuid); CREATE TEMP TABLE city_parking_curb_publications (source_id uuid); CREATE TEMP TABLE city_parking_curb_versions (id uuid); CREATE TEMP TABLE city_parking_curb_snapshot_features (snapshot_id uuid);
    CREATE FUNCTION pg_temp.sha256(bytea) RETURNS bytea LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'shadow invoked'; END $$;
    CREATE FUNCTION pg_temp.clock_timestamp() RETURNS timestamptz LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'shadow invoked'; END $$;
    SET LOCAL search_path=pg_temp,public,pg_catalog;`;
  await check("SECURITY DEFINER resists temporary relation/function shadows", async () => {
    const before = await state();
    const result = await sql(`${shadowObjects} SET LOCAL ROLE curb_artifact_verifier; ${validate(shadow)} SET LOCAL ROLE service_role; ${publish(shadow, newer.id)}`, "postgres", true);
    assert.equal(result, "VALIDATED\nPUBLISHED"); assert.equal(await state(), before);
  });
  await check("staging and failure definers resist shadows without persistent test objects", async () => {
    const before = await state(), s = snapshot("shadow-stage-fail");
    const result = await sql(`${shadowObjects} SET LOCAL ROLE service_role; ${insert("city_parking_source_snapshots", s.row)} ${membership(s, versions[0])} ${fail(s)}`, "postgres", true);
    assert.equal(result, "FAILED"); assert.equal(await state(), before);
  });
  await rejected("source identity definer cannot be redirected to empty shadow evidence", `${shadowObjects} UPDATE public.city_parking_sources SET source_key='test-shadow-repurpose' WHERE id=${q(source)};`, "P0001", "Cannot repurpose referenced curb source");
  for (const role of ["service_role", "curb_artifact_verifier", "anon", "authenticated"])
    await rejected(`${role} cannot invoke private helpers`, `SELECT curb_private.membership_seal(${q(first.id)});`, "42501", "permission denied", role);
  await check("compiled catalog: ownership, RLS, ACL, functions, triggers, FKs and valid indexes", async () => {
    const catalog = await json(`SELECT jsonb_build_object(
      'tables',(SELECT jsonb_agg(jsonb_build_object('name',relname,'owner',pg_get_userbyid(relowner),'rls',relrowsecurity)) FROM pg_class WHERE oid IN (${tables.map(t => `${q("public." + t)}::regclass`).join(",")})),
      'functions',(SELECT jsonb_agg(jsonb_build_object('name',p.proname,'owner',pg_get_userbyid(p.proowner),'definer',p.prosecdef,'config',p.proconfig,'public_execute',EXISTS(SELECT 1 FROM aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a WHERE a.grantee=0 AND a.privilege_type='EXECUTE'))) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='curb_private' OR (n.nspname='public' AND p.proname LIKE '%city_parking_curb_snapshot')),
      'policies',(SELECT jsonb_agg(to_jsonb(p)) FROM pg_policies p WHERE tablename IN (${tables.map(q).join(",")})),
      'constraints',(SELECT jsonb_agg(jsonb_build_object('type',contype,'delete',confdeltype,'definition',pg_get_constraintdef(oid))) FROM pg_constraint WHERE conrelid IN (${tables.map(t => `${q("public." + t)}::regclass`).join(",")})),
      'triggers',(SELECT jsonb_agg(pg_get_triggerdef(oid)) FROM pg_trigger WHERE NOT tgisinternal AND (tgrelid IN (${tables.map(t => `${q("public." + t)}::regclass`).join(",")}) OR tgname='curb_source_identity')),
      'indexes',(SELECT jsonb_agg(jsonb_build_object('valid',indisvalid,'ready',indisready,'definition',pg_get_indexdef(indexrelid))) FROM pg_index WHERE indrelid IN (${tables.map(t => `${q("public." + t)}::regclass`).join(",")})));`);
    assert.equal(catalog.tables.length, 4); for (const t of catalog.tables) { assert.equal(t.owner, "postgres"); assert.equal(t.rls, true); }
    assert.equal(catalog.functions.length, 12); for (const f of catalog.functions) { assert.equal(f.owner, "postgres"); assert.deepEqual(f.config, ["search_path=pg_catalog, pg_temp"]); assert.equal(f.public_execute, false); }
    assert.equal(catalog.functions.filter((f: any) => f.definer).length, 6);
    assert.equal(catalog.policies.length, 4); for (const p of catalog.policies) { assert.deepEqual(p.roles, ["curb_artifact_verifier"]); assert.equal(p.cmd, "SELECT"); }
    const fks = catalog.constraints.filter((c: any) => c.type === "f"); assert.equal(fks.length, 6); assert(fks.every((c: any) => c.delete === "r"));
    assert.equal(catalog.constraints.filter((c: any) => c.type === "p").length, 4); assert.equal(catalog.constraints.filter((c: any) => c.type === "u").length, 6);
    const definitions: string[] = catalog.constraints.map((c: any) => c.definition);
    for (const expected of ["UNIQUE (source_id, capture_key)", "UNIQUE (id, source_id)", "UNIQUE (id, source_id, lifecycle)", "UNIQUE (source_id, external_id, canonicalization_version, content_sha256)", "UNIQUE (id, source_id, external_id)", "UNIQUE (snapshot_id, curb_version_id)", "PRIMARY KEY (snapshot_id, external_id)", "PRIMARY KEY (source_id)"])
      assert(definitions.includes(expected), expected);
    for (const expected of ["FOREIGN KEY (snapshot_id, source_id) REFERENCES city_parking_source_snapshots(id, source_id) ON DELETE RESTRICT", "FOREIGN KEY (curb_version_id, source_id, external_id) REFERENCES city_parking_curb_versions(id, source_id, external_id) ON DELETE RESTRICT", "FOREIGN KEY (snapshot_id, source_id, snapshot_state) REFERENCES city_parking_source_snapshots(id, source_id, lifecycle) ON DELETE RESTRICT"])
      assert(definitions.some(d => d.replaceAll("public.", "") === expected), expected);
    assert.equal(catalog.triggers.length, 14); assert(catalog.triggers.every((t: string) => t.includes("curb_private.")));
    assert.equal(catalog.indexes.length, 12); assert(catalog.indexes.every((i: any) => i.valid && i.ready));
    assert(catalog.indexes.some((i: any) => i.definition.includes("(source_id, retrieval_completed_at DESC)")));
    assert(catalog.indexes.some((i: any) => i.definition.includes("(curb_version_id)")));
    console.log(`CATALOG: ${catalog.tables.length} tables, ${catalog.functions.length} functions, ${catalog.triggers.length} triggers, ${fks.length} RESTRICT FKs, ${catalog.indexes.length} valid indexes`);
  });
  const winner = await validated("concurrent-winner"), loser = await validated("concurrent-loser");
  await check("two-session publishers block on source then loser rejects stale", async () => {
    const before = await pointer(); const appA = `curb-a-${runId}`, appB = `curb-b-${runId}`;
    const a = startSql(`SELECT pg_backend_pid(); ${publish(winner, before.snapshot_id)}\n\\echo CURB_WINNER_READY\n`, "service_role", false, true, appA);
    // Attach immediately so process errors cannot become unhandled rejections.
    const resultA = a.finished;
    let b: ReturnType<typeof startSql> | undefined;
    try {
      await until(async () => a.output().includes("CURB_WINNER_READY"), "Winner did not reach held transaction");
      const start = Date.now(); b = startSql(publish(loser, before.snapshot_id), "service_role", false, false, appB);
      let observed: any;
      await until(async () => {
        observed = await json(`SELECT coalesce((SELECT jsonb_build_object('wait',b.wait_event_type,'event',b.wait_event,'blocked_by_winner',a.pid=ANY(pg_blocking_pids(b.pid)),'source_lock',EXISTS(SELECT 1 FROM pg_locks l WHERE l.pid=a.pid AND l.relation='public.city_parking_sources'::regclass AND l.granted)) FROM pg_stat_activity a CROSS JOIN pg_stat_activity b WHERE a.application_name=${q(appA)} AND b.application_name=${q(appB)}),'null'::jsonb);`);
        return observed?.wait === "Lock" && observed.blocked_by_winner && observed.source_lock;
      }, "No source-lock blocking observed");
      const waitObservedMs = Date.now() - start;
      a.child.stdin.end("COMMIT;\n"); assert.equal((await resultA).code, 0);
      const resultB = await b.finished; assert.notEqual(resultB.code, 0); assert(resultB.error.includes("P0001") && resultB.error.includes("Stale publication predecessor"), resultB.error);
      const after = await pointer(); assert.equal(after.snapshot_id, winner.id); assert.equal(after.generation, before.generation + 1);
      assert.equal((await readSnapshot(loser)).lifecycle, "VALIDATED"); assert.equal((await readSnapshot(winner)).lifecycle, "PUBLISHED");
      console.log(`CONCURRENCY: observed ${observed.wait}/${observed.event} ${waitObservedMs}ms after launching loser; winner blocked loser until commit; exactly one advancement; no deadlock`);
    } finally { if (!a.child.stdin.destroyed) a.child.stdin.end("ROLLBACK;\n"); await resultA; if (b) await b.finished; }
  });
  console.log(`Curb DB behavior: ${checks} checks passed. Synthetic run ${runId} retained locally. Production never contacted; no migration/reset/ingestion.`);
}
main().catch(e => { console.error(e); process.exitCode = 1; });

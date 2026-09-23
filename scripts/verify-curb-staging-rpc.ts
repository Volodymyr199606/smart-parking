/** Fresh disposable LOCAL Supabase PostgreSQL 17.6 cluster and real PostgREST RPC.
 * No .env, hosted target, existing DB, source ingestion, extensions or image pulls.
 * Applies actual dependency SQL and 00013 as NOSUPERUSER postgres. Stops on first
 * migration error; every invocation starts fresh and removes its own containers.
 */
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createHmac, randomBytes, randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { createClient } from "@supabase/supabase-js";
import { canonicalDataset, canonicalFeature, canonicalJson, CONTRACT, jsonObject, parseSourceJson, sha256 } from "./canonicalize-curb-snapshot";
import { curbDbEligibility } from "./curb-db-eligibility";
import { preciseFeature, withNumeric } from "./verify-curb-db-eligibility";

const pipe = "npipe:////./pipe/dockerDesktopLinuxEngine";
const suffix = randomBytes(8).toString("hex");
const db = `curb-staging-db-${suffix}`, rest = `curb-staging-rest-${suffix}`, network = `curb-staging-net-${suffix}`;
const source = randomUUID(), otherSource = randomUUID();
const q = (s: string) => "'" + s.replaceAll("'", "''") + "'";
type ProcessResult = { code: number; out: string; error: string };
async function docker(args: string[], input = "", env = process.env): Promise<ProcessResult> {
  return new Promise((resolve, reject) => {
    const child = spawn("docker", ["--host", pipe, ...args], { windowsHide: true, stdio: "pipe", env });
    let out = "", error = "";
    const timer = setTimeout(() => { child.kill(); reject(new Error("Local Docker timeout")); }, 60000);
    child.stdout.on("data", b => { out += b; }); child.stderr.on("data", b => { error += b; });
    child.on("error", () => { clearTimeout(timer); reject(new Error("Local Docker unavailable")); });
    child.on("close", code => { clearTimeout(timer); resolve({ code: code ?? -1, out: out.trim(), error: error.trim() }); });
    child.stdin.on("error", () => {}); child.stdin.end(input);
  });
}
async function command(args: string[], env = process.env) {
  const r = await docker(args, "", env);
  assert.equal(r.code, 0, `Local Docker ${args[0]} failed`); return r.out;
}
async function rawSql(sql: string, role = "postgres") {
  assert(["postgres", "supabase_admin", "service_role", "anon", "authenticated", "curb_artifact_verifier", "public_only"].includes(role));
  return docker(["exec", "-i", db, "psql", "-X", "-qAt", "-U", "supabase_admin", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-v", "VERBOSITY=verbose"],
    `SET statement_timeout='15s'; SET lock_timeout='5s'; SET ROLE ${role};\n${sql}\n`);
}
async function sql(text: string, role = "postgres") {
  const r = await rawSql(text, role);
  assert.equal(r.code, 0, `Local SQL failed: ${r.error.slice(0, 700)}`); return r.out;
}
let checks = 0;
const check = (name: string, f: () => void) => { f(); checks++; console.log(`PASS ${name}`); };
const tables = ["city_parking_source_snapshots", "city_parking_curb_versions", "city_parking_curb_snapshot_features", "city_parking_curb_publications"];
const fingerprint = () => sql(`SELECT jsonb_build_array(${tables.map(t => `(SELECT encode(sha256(convert_to(coalesce(jsonb_agg(to_jsonb(t) ORDER BY to_jsonb(t)::text),'[]'::jsonb)::text,'UTF8')),'hex') FROM public.${t} t)`).join(",")})::text;`);

function argumentsGuard(args: string[]) {
  assert(args.length === 1 && args[0] === "--local-disposable", "Only --local-disposable is accepted; no URLs or existing DB targets");
}
async function main() {
  argumentsGuard(process.argv.slice(2));
  check("production/hosted/existing targets refused before Docker", () => {
    for (const target of ["https://pffznlpmgtrpsejayicj.supabase.co", "postgresql://localhost:54322/postgres", "https://example.com"])
      assert.throws(() => argumentsGuard(["--local-disposable", target]));
  });
  const created: string[] = [];
  let madeNetwork = false;
  try {
    await command(["network", "create", "--internal", network]); madeNetwork = true;
    await command(["create", "--pull=never", "--name", db, "--network", network, "--user", "postgres", "--entrypoint", "/bin/sh",
      "public.ecr.aws/supabase/postgres:17.6.1.167", "-c",
      "initdb -D /tmp/curb-staging-pg -U supabase_admin --auth=trust --no-locale --encoding=UTF8 --no-sync >/tmp/curb-init.log && printf 'host postgres authenticator all trust\\n' >> /tmp/curb-staging-pg/pg_hba.conf && exec postgres -D /tmp/curb-staging-pg -p 5432 -c listen_addresses='*'"]);
    created.push(db); await command(["start", db]);
    const deadline = Date.now() + 45000;
    while ((await docker(["exec", db, "pg_isready", "-U", "supabase_admin", "-d", "postgres", "-p", "5432"])).code !== 0) {
      assert(Date.now() < deadline, "Fresh local PostgreSQL did not start"); await new Promise(r => setTimeout(r, 250));
    }
    check("fresh local PostgreSQL 17.6", () => {});
    assert.equal(await sql("SHOW server_version;", "supabase_admin"), "17.6");
    await sql(`CREATE ROLE postgres LOGIN NOSUPERUSER CREATEDB CREATEROLE BYPASSRLS;
      CREATE ROLE anon NOLOGIN; CREATE ROLE authenticated NOLOGIN;
      CREATE ROLE service_role NOLOGIN BYPASSRLS; CREATE ROLE public_only NOLOGIN;
      CREATE ROLE authenticator LOGIN NOINHERIT;
      GRANT anon,authenticated,service_role,public_only TO authenticator;
      ALTER DATABASE postgres OWNER TO postgres; ALTER SCHEMA public OWNER TO postgres;
      GRANT USAGE ON SCHEMA public TO anon,authenticated,service_role,public_only;`, "supabase_admin");
    // Actual minimal dependency closure of 00012, not a substitute storage schema.
    const initial = await readFile("supabase/migrations/00001_initial_schema.sql", "utf8");
    const utility = initial.match(/CREATE OR REPLACE FUNCTION public\.set_updated_at\(\)[\s\S]*?\$\$ LANGUAGE plpgsql;/)?.[0];
    assert(utility, "Actual 00001 utility prerequisite missing"); await sql(utility);
    for (const file of ["00005_city_parking_data.sql", "00012_city_parking_curb_storage.sql", "00013_city_parking_curb_staging_rpc.sql"]) {
      const result = await rawSql(await readFile(`supabase/migrations/${file}`, "utf8"));
      // Fail immediately; finally destroys this cluster. Never continue a failed migration.
      assert.equal(result.code, 0, `STOP: first migration defect in ${file}: ${result.error.slice(0, 900)}`);
      check(`actual ${file} compiled as NOSUPERUSER postgres`, () => {});
    }
    await sql("GRANT curb_artifact_verifier TO authenticator;", "supabase_admin");
    await sql(`INSERT INTO public.city_parking_sources(id,source_key,display_name,provider,dataset_id,api_base_url)
      VALUES (${q(source)},'datasf_citywide_curbs','DISPOSABLE SYNTHETIC V2','DATASF','pep9-66vw','https://data.sf.gov/resource'),
      (${q(otherSource)},'synthetic_wrong_source','DISPOSABLE WRONG SOURCE','DATASF','wrong','https://data.sf.gov/resource');`);
    const secret = randomBytes(48).toString("hex");
    // Docker does not publish host ports on an internal-only network. The HTTP
    // service gets a loopback host binding on bridge plus the private DB network;
    // PostgreSQL itself remains internal-only and has no published ports.
    await command(["create", "--pull=never", "--name", rest, "--network", "bridge", "--publish", "127.0.0.1::3000",
      "--env", "PGRST_DB_URI", "--env", "PGRST_JWT_SECRET", "--env", "PGRST_DB_SCHEMAS=public", "--env", "PGRST_DB_ANON_ROLE=anon",
      "public.ecr.aws/supabase/postgrest:v16.2"], { ...process.env, PGRST_DB_URI: `postgresql://authenticator@${db}:5432/postgres`, PGRST_JWT_SECRET: secret });
    created.push(rest); await command(["network", "connect", network, rest]); await command(["start", rest]);
    const ports = JSON.parse(await command(["inspect", "--format", '{{json .NetworkSettings.Ports}}', rest]));
    const binding = ports["3000/tcp"][0]; assert.equal(binding.HostIp, "127.0.0.1");
    const base = `http://127.0.0.1:${binding.HostPort}`;
    const transport: typeof fetch = async (input, init) => {
      const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
      assert(url.origin === base && url.pathname.startsWith("/rest/v1/"), "Non-local API target refused");
      url.pathname = url.pathname.slice(8);
      return fetch(url, { ...init, redirect: "error", signal: AbortSignal.timeout(15000) });
    };
    const client = (role: string) => {
      const header = Buffer.from('{"alg":"HS256","typ":"JWT"}').toString("base64url");
      const body = Buffer.from(JSON.stringify({ role, exp: Math.floor(Date.now() / 1000) + 900 })).toString("base64url");
      const jwt = `${header}.${body}.${createHmac("sha256", secret).update(`${header}.${body}`).digest("base64url")}`;
      return createClient(base, jwt, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }, global: { fetch: transport } });
    };
    const api = client("service_role");
    const readyDeadline = Date.now() + 45000;
    while (true) {
      const ready = await api.rpc("read_city_parking_curb_version", { p_curb_version_id: randomUUID() });
      if (!ready.error) break;
      assert(Date.now() < readyDeadline, `Fresh PostgREST did not start: ${ready.error.code} ${ready.error.message}`);
      await new Promise(r => setTimeout(r, 250));
    }
    async function snapshot(version = CONTRACT) {
      const id = randomUUID(), t = new Date().toISOString(), dataset = canonicalDataset([parseSourceJson(preciseFeature)]), hash = sha256("synthetic");
      const manifest = { format_version: version === CONTRACT ? "curb-snapshot-v2" : "curb-snapshot-v1", canonicalization_version: version,
        provider: "datasf", dataset_id: "pep9-66vw", source_key: "datasf_citywide_curbs", api_endpoint: version === CONTRACT ? "https://data.sf.gov/resource/pep9-66vw.json" : "https://data.sfgov.org/resource/pep9-66vw.json" };
      await sql(`INSERT INTO public.city_parking_source_snapshots(id,source_id,capture_key,retrieval_started_at,retrieval_completed_at,
        canonicalization_version,fetch_tool_version,consistency_state,row_count,schema_sha256,source_content_sha256,identity_geometry_sha256,
        artifact_uri,artifact_sha256,manifest_uri,manifest_sha256,manifest)
        VALUES (${q(id)},${q(source)},${q(id)},${q(t)},${q(t)},${q(version)},'synthetic-v2','CONSISTENT',1,${q(hash)},${q(dataset.dataset_sha256)},${q(dataset.identity_geometry_sha256)},
        'test://local/artifact',${q(hash)},'test://local/manifest',${q(hash)},${q(JSON.stringify(manifest))}::jsonb);`, "service_role");
      return id;
    }
    function argsFor(s: string, row: unknown = parseSourceJson(preciseFeature)) {
      const h = canonicalFeature(row);
      return { p_source_id: source, p_snapshot_id: s, p_external_id: h.external_id, p_canonical_feature_json: canonicalJson(row),
        p_geometry_sha256: h.geometry_sha256, p_attributes_sha256: h.attributes_sha256, p_content_sha256: h.content_sha256, p_canonicalization_version: CONTRACT };
    }
    const first = await snapshot(), baseArgs = argsFor(first);
    const stage = (args: ReturnType<typeof argsFor>, role = "service_role") => client(role).rpc("stage_city_parking_curb_version", args);
    async function success(args: ReturnType<typeof argsFor>) {
      const r = await stage(args); assert(!r.error, `Staging failed: ${r.error?.code} ${r.error?.message}`); assert.equal(typeof r.data, "string"); return r.data as string;
    }
    async function read(id: string) {
      const r = await api.rpc("read_city_parking_curb_version", { p_curb_version_id: id }); assert(!r.error); assert.equal(r.data.length, 1); return r.data[0];
    }
    async function reject(name: string, args: ReturnType<typeof argsFor>, code: string, fragment: string, role = "service_role") {
      const before = await fingerprint(), r = await stage(args, role), after = await fingerprint();
      check(name, () => { assert.equal(r.error?.code, code); assert(r.error?.message.includes(fragment), r.error?.message); assert.equal(after, before, "Rejected RPC changed evidence"); });
    }
    const firstId = await success(baseArgs), firstRead = await read(firstId);
    check("precise coordinate and neighbor survive actual staging/read RPC", () => {
      assert(firstRead.geometry_json_text.includes("-122.37952207229336")); assert(firstRead.geometry_json_text.includes("-122.37952207229335"));
      const reconstructed = { ...jsonObject(parseSourceJson(firstRead.raw_source_json_text)), shape: parseSourceJson(firstRead.geometry_json_text) };
      assert.deepEqual(canonicalFeature(reconstructed), canonicalFeature(parseSourceJson(preciseFeature)));
      for (const k of ["geometry_sha256", "attributes_sha256", "content_sha256"]) assert.equal(firstRead[k], baseArgs[`p_${k}` as keyof typeof baseArgs]);
    });
    const beforeRetry = await fingerprint(); const repeated = await success(baseArgs);
    check("same staging retry leaves every evidence row unchanged", () => assert.equal(repeated, firstId));
    assert.equal(await fingerprint(), beforeRetry);
    const second = await snapshot(); const reused = await success(argsFor(second));
    check("same content in another snapshot reuses immutable version", () => assert.equal(reused, firstId));
    const concurrentSnapshot = await snapshot();
    const concurrent = await Promise.all([success(argsFor(concurrentSnapshot)), success(argsFor(concurrentSnapshot))]);
    const members = await sql(`SELECT count(*) FROM public.city_parking_curb_snapshot_features WHERE snapshot_id=${q(concurrentSnapshot)};`);
    check("concurrent identical calls serialize to one member and version", () => { assert.deepEqual(concurrent, [firstId, firstId]); assert.equal(members, "1"); });
    const changed = jsonObject(parseSourceJson(preciseFeature)); changed.extra = "changed";
    const third = await snapshot(), changedId = await success(argsFor(third, changed));
    check("changed content creates new immutable version", () => assert.notEqual(changedId, firstId));
    const otherIdRow = jsonObject(parseSourceJson(preciseFeature)); otherIdRow.globalid = "fixture-b";
    const distinctArgs = { ...argsFor(first, otherIdRow), p_content_sha256: baseArgs.p_content_sha256 };
    const distinctId = await success(distinctArgs);
    check("different external ID with same claimed content hash never merges", () => assert.notEqual(distinctId, firstId));
    // Claimed hashes are trusted at staging; independent artifact attestation is essential.
    const conflict = argsFor(first, changed);
    await reject("conflicting snapshot member rejects atomically", conflict, "P0001", "Conflicting snapshot membership");
    await reject("same claimed hash with different payload rejects", { ...argsFor(second, changed), p_content_sha256: baseArgs.p_content_sha256 }, "P0001", "Conflicting immutable version");
    await reject("same content with changed geometry hash rejects", { ...baseArgs, p_geometry_sha256: sha256("forged") }, "P0001", "Conflicting immutable version");
    for (const token of ["9007199254740993", "1e8191", "-1e8190", "1e-8190", "-1e-8189", "1e400", "1e-400", "9".repeat(4096)]) {
      const row = withNumeric(token), s = await snapshot(), id = await success(argsFor(s, row)), back = await read(id);
      check(`eligible numeric stored/reparsed exactly: ${token.length > 40 ? "4096 significant digits" : token}`, () => {
        assert.equal(curbDbEligibility(row).state, "ELIGIBLE");
        const after = { ...jsonObject(parseSourceJson(back.raw_source_json_text)), shape: parseSourceJson(back.geometry_json_text) };
        assert.equal(canonicalJson(after), canonicalJson(row)); assert.deepEqual(canonicalFeature(after), canonicalFeature(row));
      });
    }
    const payload = (x: string) => preciseFeature.slice(0, -1) + ',"n":' + x + '}';
    const unicode = jsonObject(parseSourceJson(preciseFeature)); unicode.extra = ["é 🚗\n\t", "1e900000", true, null];
    const unicodeId = await success(argsFor(await snapshot(), unicode));
    const bytes = await sql(`SELECT octet_length((raw_source || jsonb_build_object('shape',geometry_geojson))::text) FROM public.city_parking_curb_versions WHERE id=${q(unicodeId)};`);
    check("pure JSONB byte estimate agrees for Unicode, strings and nested values", () => assert.equal(curbDbEligibility(unicode).postgresTextBytes, bytes));
    for (const t of ["1e8192", "-1e8191", "1e-8191", "-1e-8190"])
      await reject(`DB rejects expanded token ${t}`, { ...baseArgs, p_canonical_feature_json: payload(t) }, "22023", "NUMERIC_TOKEN_TOO_LONG");
    await reject("DB rejects capture-ineligible 4097-digit precision", { ...baseArgs, p_canonical_feature_json: payload("9".repeat(4097)) }, "22023", "NUMERIC_PRECISION_TOO_LARGE");
    for (const t of ["1e131072", "1e-16384"])
      await reject(`PostgreSQL rejects numeric range ${t}`, { ...baseArgs, p_canonical_feature_json: payload(t) }, "22003", "numeric");
    for (const [t, n] of [["1e131071", 131072], ["1e-16383", 16385]] as const) {
      const length = await sql(`SELECT length((${q(payload(t))}::jsonb->>'n'));`);
      check(`PostgreSQL accepts range boundary ${t}, length ${n}`, () => assert.equal(length, String(n)));
      await reject(`storage domain rejects PG-accepted ${t}`, { ...baseArgs, p_canonical_feature_json: payload(t) }, "22023", "NUMERIC_TOKEN_TOO_LONG");
    }
    for (const [name, patch, code, msg] of [
      ["malformed JSON", { p_canonical_feature_json: "{bad" }, "22P02", "invalid input"],
      ["wrong version", { p_canonicalization_version: "curb-jcs-v1" }, "22023", "UNSUPPORTED_CANONICALIZATION_VERSION"],
      ["missing shape", { p_canonical_feature_json: '{"globalid":"fixture-a"}' }, "22023", "INVALID_FEATURE_SHAPE"],
      ["non-LineString", { p_canonical_feature_json: preciseFeature.replace("LineString", "MultiLineString") }, "22023", "INVALID_FEATURE_SHAPE"],
      ["external ID mismatch", { p_external_id: "wrong" }, "22023", "EXTERNAL_ID_MISMATCH"],
      ["blank ID", { p_external_id: " " }, "22023", "INVALID_EXTERNAL_ID"],
      ["Unicode blank ID", { p_external_id: "\u00a0\ufeff" }, "22023", "INVALID_EXTERNAL_ID"],
      ["duplicate decoded nested key", { p_canonical_feature_json: payload('{"a":1,"\\u0061":2}') }, "22023", "DUPLICATE_JSON_KEY"],
      ["numeric-string coordinate", { p_canonical_feature_json: preciseFeature.replace("-122.37952207229336", '"-122.37952207229336"') }, "22023", "INVALID_FEATURE_SHAPE"],
      ["precisely out-of-bounds coordinate", { p_canonical_feature_json: preciseFeature.replace("-122.37952207229336", "180.00000000000000001") }, "22023", "INVALID_FEATURE_SHAPE"],
      ["zero-length geometry", { p_canonical_feature_json: preciseFeature.replace("-122.37952207229335,37.743691137180925", "-122.37952207229336,37.732536608656226") }, "22023", "INVALID_FEATURE_SHAPE"],
      ["invalid hash", { p_content_sha256: "wrong" }, "22023", "INVALID_HASH_FORMAT"],
      ["wrong source", { p_source_id: otherSource }, "P0001", "Wrong curb source"],
      ["missing snapshot", { p_snapshot_id: randomUUID() }, "P0002", "no rows"],
      ["NUL Unicode", { p_canonical_feature_json: payload('"\\u0000"') }, "22P05", "Unicode"],
      ["oversized document", { p_canonical_feature_json: payload(JSON.stringify("a".repeat(1048576))) }, "22023", "DOCUMENT_TOO_LARGE"],
      ["expanded oversized document", { p_canonical_feature_json: payload('[' + Array(130).fill("1e8191").join(",") + ']') }, "22023", "DOCUMENT_TOO_LARGE"],
      ["excess depth", { p_canonical_feature_json: payload('['.repeat(101) + '0' + ']'.repeat(101)) }, "22023", "JSON_DEPTH_EXCEEDED"],
    ] as const) await reject(name, { ...baseArgs, ...patch }, code, msg);
    const failed = await snapshot(); assert(!(await api.rpc("fail_city_parking_curb_snapshot", { p_source: source, p_snapshot: failed, p_reason: "synthetic" })).error);
    await reject("non-STAGING snapshot rejects", argsFor(failed), "P0001", "Snapshot must be STAGING");
    await reject("snapshot version mismatch rejects", argsFor(await snapshot("curb-jcs-v1")), "P0001", "Snapshot version mismatch");
    for (const role of ["anon", "authenticated", "public_only", "curb_artifact_verifier"]) {
      await reject(`${role} cannot stage`, baseArgs, "42501", "permission denied", role);
      if (role !== "curb_artifact_verifier") {
        const denied = await client(role).rpc("read_city_parking_curb_version", { p_curb_version_id: firstId });
        check(`${role} cannot execute authoritative read`, () => assert.equal(denied.error?.code, "42501"));
      }
    }
    const verifierRead = await client("curb_artifact_verifier").rpc("read_city_parking_curb_version", { p_curb_version_id: firstId });
    check("independent verifier can read authoritative TEXT", () => assert(!verifierRead.error && typeof verifierRead.data[0].geometry_json_text === "string"));
    const acl = await sql(`SELECT count(*) FROM pg_proc p CROSS JOIN LATERAL aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a
      WHERE p.oid IN ('public.stage_city_parking_curb_version(uuid,uuid,text,text,text,text,text,text)'::regprocedure,'public.read_city_parking_curb_version(uuid)'::regprocedure)
      AND a.grantee=0 AND a.privilege_type='EXECUTE';`);
    check("PUBLIC EXECUTE absent in actual function ACLs", () => assert.equal(acl, "0"));
    const fixed = await sql(`SELECT count(*) FROM pg_proc WHERE oid IN
      ('public.stage_city_parking_curb_version(uuid,uuid,text,text,text,text,text,text)'::regprocedure,'public.read_city_parking_curb_version(uuid)'::regprocedure)
      AND prosecdef AND proconfig=ARRAY['search_path=pg_catalog, pg_temp'] AND proowner=(SELECT oid FROM pg_roles WHERE rolname='postgres');`);
    check("both RPCs have fixed search_path and executor SECURITY DEFINER ownership", () => assert.equal(fixed, "2"));
    for (const table of ["city_parking_curb_versions", "city_parking_curb_snapshot_features"]) {
      const r = await rawSql(`INSERT INTO public.${table} DEFAULT VALUES;`, "service_role");
      check(`service_role cannot bypass RPC with direct ${table} INSERT`, () => assert(r.code !== 0 && r.error.includes("42501")));
    }
    const publishing = await api.rpc("publish_city_parking_curb_snapshot", { p_source: source, p_snapshot: first, p_expected_current: null });
    check("STAGING cannot publish without attestation", () => assert(publishing.error?.message.includes("VALIDATED")));
    const seal = await sql(`SELECT curb_private.membership_seal(${q(first)});`);
    const attestation = await client("curb_artifact_verifier").rpc("validate_city_parking_curb_snapshot", {
      p_source: source, p_snapshot: first, p_manifest_sha256: sha256("synthetic"), p_membership_sha256: seal, p_verification_version: "curb-artifact-verify-v1" });
    check("V1 verifier cannot attest V2 manifest", () => assert(attestation.error?.message.includes("Manifest envelope mismatch")));
    const forgedManifest = await rawSql(`UPDATE public.city_parking_source_snapshots SET manifest=jsonb_set(manifest,'{format_version}','"curb-snapshot-v1"') WHERE id=${q(first)};`);
    check("snapshot envelope remains immutable", () => assert(forgedManifest.code !== 0));
    const vMutation = await rawSql(`UPDATE public.city_parking_curb_versions SET raw_source='{}' WHERE id=${q(firstId)};`);
    check("version append-only guard remains active", () => assert(vMutation.code !== 0 && vMutation.error.includes("forbidden")));
    const extensions = await sql("SELECT count(*) FROM pg_extension WHERE extname='postgis';");
    check("PostGIS never enabled", () => assert.equal(extensions, "0"));
  } finally {
    const failures: string[] = [];
    for (const name of created.reverse()) { const r = await docker(["rm", "--force", "--volumes", name]); if (r.code !== 0) failures.push(name); }
    if (madeNetwork && (await docker(["network", "rm", network])).code !== 0) failures.push(network);
    assert.equal(failures.length, 0, `Disposable cleanup failed: ${failures.join(", ")}`);
    console.log("Fresh test containers/volumes/network removed; existing local Supabase untouched.");
  }
  console.log(`${checks} local V2 staging RPC checks passed.`);
}
main().catch(e => { console.error(e instanceof Error ? e.message : "Local staging verifier failed"); process.exitCode = 1; });

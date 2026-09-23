/** Disposable LOCAL Supabase PostgreSQL + real PostgREST + installed Supabase JS.
 * No dotenv, migrations, source ingestion, hosted endpoints, or existing table writes.
 * Requires the existing local DB and cached PostgREST image. See ingestion-boundary doc.
 */
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createHmac, randomBytes } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { canonicalFeature, canonicalJson, jsonObject, parseSourceJson, LosslessJsonNumber } from "./canonicalize-curb-snapshot";

const pipe = "npipe:////./pipe/dockerDesktopLinuxEngine";
const db = "supabase_db_smart-parking";
const network = "supabase_network_smart-parking";
const image = "public.ecr.aws/supabase/postgrest:v16.2";
const forbidden = "pffznlpmgtrpsejayicj";
const suffix = randomBytes(8).toString("hex");
const schema = `curb_lossless_${suffix}`, login = `${schema}_login`, executor = `${schema}_exec`;
const container = `curb-lossless-${suffix}`;
const quote = (s: string) => "'" + s.replaceAll("'", "''") + "'";
let checks = 0;
function check(name: string, action: () => void) { action(); checks++; console.log(`PASS ${name}`); }

function localTarget(raw: string) {
  assert(!decodeURIComponent(raw).toLowerCase().includes(forbidden), "Production target refused");
  const u = new URL(raw);
  assert(u.protocol === "postgresql:" && u.hostname === "127.0.0.1" && u.port === "54322" &&
    u.username === "postgres" && !u.password && u.pathname === "/postgres" && !u.search && !u.hash,
  "Only --database-url=postgresql://postgres@127.0.0.1:54322/postgres is supported");
}

async function docker(args: string[], input = "", env: NodeJS.ProcessEnv = process.env) {
  return new Promise<string>((resolve, reject) => {
    const child = spawn("docker", ["--host", pipe, ...args], { windowsHide: true, stdio: "pipe", env });
    let out = "";
    // Never echo Docker errors/config/credentials or SQL input on failure.
    child.stdout.on("data", b => { out += b.toString(); });
    child.stderr.resume();
    const timer = setTimeout(() => { child.kill(); reject(new Error("Local Docker operation timed out")); }, 60000);
    child.on("error", () => { clearTimeout(timer); reject(new Error("Local Docker unavailable")); });
    child.on("close", code => { clearTimeout(timer); code === 0 ? resolve(out.trim()) : reject(new Error(`Local Docker ${args[0]} failed (exit ${code})`)); });
    child.stdin.on("error", () => { /* close handler reports failed command */ });
    child.stdin.end(input);
  });
}
const sql = (text: string) => docker(["exec", "-i", db, "psql", "-X", "-qAt", "-U", "supabase_admin", "-d", "postgres", "-v", "ON_ERROR_STOP=1"],
  `SET statement_timeout='15s'; SET lock_timeout='5s';\n${text}\n`);

async function main() {
  const args = process.argv.slice(2);
  assert(args.length === 1 && args[0].startsWith("--database-url="), "Explicit local endpoint assertion required; see ingestion-boundary doc");
  localTarget(args[0].slice("--database-url=".length));
  check("hosted/production/alternate endpoints rejected before Docker", () => {
    for (const target of [`postgresql://postgres@${forbidden}.supabase.co:54322/postgres`,
      "postgresql://postgres@example.com:54322/postgres", "postgresql://postgres@127.0.0.1.evil:54322/postgres",
      "postgresql://postgres@127.0.0.1:5432/postgres", "postgresql://postgres@127.0.0.1:54322/postgres?host=remote"])
      assert.throws(() => localTarget(target));
  });
  const info = JSON.parse(await docker(["inspect", "--format", '{{json .NetworkSettings}}', db]));
  assert(info.Ports["5432/tcp"].some((p: { HostPort: string }) => p.HostPort === "54322"));
  assert(info.Networks[network], "Expected local Supabase network missing");
  console.log(`Local PostgreSQL ${await sql("SHOW server_version;")}; PostgREST v16.2; disposable schema ${schema}`);
  const password = randomBytes(32).toString("hex"), secret = randomBytes(48).toString("hex");
  let objects = false, service = false;
  try {
    await sql(`BEGIN;
      CREATE ROLE ${login} LOGIN NOINHERIT PASSWORD ${quote(password)};
      CREATE ROLE ${executor} NOLOGIN;
      GRANT ${executor} TO ${login};
      CREATE SCHEMA ${schema};
      REVOKE ALL ON SCHEMA ${schema} FROM PUBLIC;
      GRANT USAGE ON SCHEMA ${schema} TO ${executor};
      CREATE TABLE ${schema}.receipts (id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, received text NOT NULL, document jsonb NOT NULL);
      REVOKE ALL ON ${schema}.receipts FROM PUBLIC, anon, authenticated, ${executor};
      CREATE FUNCTION ${schema}.ingest(payload text)
      RETURNS TABLE (receipt_id text, received_text text, stored_text text, x_text text)
      LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $body$
      DECLARE d jsonb;
      BEGIN
        d := payload::jsonb;
        IF jsonb_typeof(d) IS DISTINCT FROM 'object' THEN RAISE EXCEPTION 'Object required' USING ERRCODE='22023'; END IF;
        RETURN QUERY INSERT INTO ${schema}.receipts AS r(received, document) VALUES (payload,d)
          RETURNING r.id::text,r.received,r.document::text,r.document->>'x';
      END $body$;
      CREATE FUNCTION ${schema}.read_receipt(receipt_id text)
      RETURNS TABLE(stored_text text, geometry_text text, attributes_text text)
      LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $body$
        SELECT document::text,(document->'shape')::text,(document-'shape')::text
        FROM ${schema}.receipts WHERE id=receipt_id::bigint
      $body$;
      CREATE FUNCTION ${schema}.unsafe_object(payload jsonb) RETURNS jsonb
      LANGUAGE sql IMMUTABLE SECURITY INVOKER SET search_path=pg_catalog,pg_temp AS $body$ SELECT payload $body$;
      CREATE FUNCTION ${schema}.unsafe_read(receipt_id text) RETURNS jsonb
      LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $body$
        SELECT document FROM ${schema}.receipts WHERE id=receipt_id::bigint
      $body$;
      REVOKE ALL ON ALL FUNCTIONS IN SCHEMA ${schema} FROM PUBLIC,anon,authenticated;
      GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA ${schema} TO ${executor};
      COMMIT;`);
    objects = true;
    await docker(["create", "--pull=never", "--name", container, "--network", network,
      "--publish", "127.0.0.1::3000", "--env", "PGRST_DB_URI", "--env", "PGRST_JWT_SECRET",
      "--env", `PGRST_DB_SCHEMAS=${schema}`, "--env", "PGRST_DB_ANON_ROLE=anon", image], "", {
      ...process.env, PGRST_DB_URI: `postgresql://${login}:${password}@${db}:5432/postgres`, PGRST_JWT_SECRET: secret,
    });
    service = true;
    await docker(["start", container]);
    const ports = JSON.parse(await docker(["inspect", "--format", '{{json .NetworkSettings.Ports}}', container]));
    const binding = ports["3000/tcp"][0];
    assert.equal(binding.HostIp, "127.0.0.1");
    const base = `http://127.0.0.1:${binding.HostPort}`;
    // Real HTTP transport. Strip ONLY Supabase's gateway prefix for standalone PostgREST.
    // Body and response bytes are forwarded unchanged; no mock/number parsing here.
    const transport: typeof fetch = async (input, init) => {
      const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
      assert(url.origin === base && url.pathname.startsWith("/rest/v1/"), "Non-local RPC refused");
      url.pathname = url.pathname.slice("/rest/v1".length);
      return fetch(url, { ...init, redirect: "error", signal: AbortSignal.timeout(15000) });
    };
    const token = (role: string) => {
      const h = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url");
      const p = Buffer.from(JSON.stringify({ role, exp: Math.floor(Date.now() / 1000) + 600 })).toString("base64url");
      return `${h}.${p}.${createHmac("sha256", secret).update(`${h}.${p}`).digest("base64url")}`;
    };
    const client = (role: string) => createClient(base, token(role), {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
      global: { fetch: transport }, db: { schema },
    });
    const api = client(executor);
    const deadline = Date.now() + 45000;
    while (true) {
      const { error } = await api.rpc("read_receipt", { receipt_id: "0" });
      if (!error) break;
      assert(Date.now() < deadline, "Disposable PostgREST did not become ready");
      await new Promise(r => setTimeout(r, 250));
    }
    async function ingest(payload: string) {
      const { data, error } = await api.rpc("ingest", { payload });
      assert(!error, `TEXT RPC failed (${error?.code ?? "unknown"})`);
      assert.equal(data.length, 1);
      assert.equal(data[0].received_text, payload, "Client changed inner TEXT payload");
      return data[0] as { receipt_id: string; received_text: string; stored_text: string; x_text: string | null };
    }
    const coordinates = ["-122.37952207229336", "37.732536608656226", "37.743691137180925", "-122.43840032071572",
      "-122.45281351125684", "37.711929941578966", "-122.40468496538819", "37.768428921166255"];
    const tokens = [...coordinates, "-122.37952207229335", "9007199254740993", "-9007199254740993",
      "0.10000000000000001", "123456789012345678901234567890.1234567890123456789", "1e-400", "1e400",
      "1.2300E+2", "12300e-4", "-0.000e99", "1e8191", "1e-8190"];
    for (const t of tokens) {
      const value = LosslessJsonNumber.fromToken(t);
      const row = await ingest(canonicalJson({ x: value }));
      check(`exact numeric TEXT/JSONB round trip: ${t}`, () => {
        assert.equal(typeof row.x_text, "string");
        assert.equal(LosslessJsonNumber.fromToken(row.x_text!).canonical, value.canonical);
        assert.equal(canonicalJson(parseSourceJson(row.stored_text)), canonicalJson({ x: value }));
      });
    }
    const exact = await sql(`SELECT ('{"x":-122.37952207229336}'::jsonb->>'x') || '|' || ('{"x":-122.37952207229335}'::jsonb->>'x');`);
    check("PostgreSQL exact coordinate extraction and distinct neighbor", () => assert.equal(exact, "-122.37952207229336|-122.37952207229335"));
    const fixtures = [
      `{"globalid":"{A}","shape":{"type":"LineString","coordinates":[[-122.37952207229336,37.732536608656226],[-122.37951983978475,37.7325411169665]]},"large":9007199254740993,"precise":0.10000000000000001,"future":{"n":1e-400},"nullable":null}`,
      `{"globalid":"{B}","shape":{"type":"LineString","coordinates":[[-122.43840032071572,37.743691137180925],[-122.45281351125684,37.711929941578966]]},"array":[-0,1.2300e2,true,"9007199254740993"],"label":"curb é 🚗"}`,
      `{"globalid":"{C}","shape":{"type":"LineString","coordinates":[[-122.40468496538819,37.768428921166255],[-122.37952207229335,37.732536608656226]]},"huge":1e400,"precise":12345678901234567890.123456789}`,
      '{"globalid":"{D}","shape":null,"nested":{"values":[1e-20,"1e-20",null]}}',
      '{"globalid":"{E}","flag":false,"zero":-0.000}' ];
    for (const fixture of fixtures) {
      const before = parseSourceJson(fixture), expected = canonicalFeature(before);
      const receipt = await ingest(canonicalJson(before));
      const { data, error } = await api.rpc("read_receipt", { receipt_id: receipt.receipt_id });
      assert(!error);
      check(`persisted feature ${expected.external_id}: semantic JSON and all three hashes`, () => {
        const after = parseSourceJson(data[0].stored_text);
        assert.equal(canonicalJson(after), canonicalJson(before));
        assert.deepEqual(canonicalFeature(after), expected);
        const attributes = jsonObject(parseSourceJson(data[0].attributes_text));
        // Match 00012: attributes exclude shape; SQL NULL vs JSON null/absent retained separately.
        const original = jsonObject(before);
        const reconstructed = { ...attributes, ...(Object.hasOwn(original, "shape") ? { shape: parseSourceJson(data[0].geometry_text) } : {}) };
        assert.deepEqual(canonicalFeature(reconstructed), expected);
      });
    }
    check("ordinary Number merges coordinate neighbors and rounds unsafe integer", () => {
      assert.equal(Number(coordinates[0]), Number("-122.37952207229335"));
      assert.equal(JSON.stringify(JSON.parse('{"x":9007199254740993}')), '{"x":9007199254740992}');
    });
    const unsafe = await api.rpc("unsafe_object", { payload: JSON.parse(`{"x":${coordinates[0]}}`) });
    check("real ordinary-object RPC loses coordinate precision", () => {
      assert(!unsafe.error);
      assert.notEqual(String(unsafe.data.x), coordinates[0]);
    });
    const wrapper = await api.rpc("unsafe_object", { payload: { x: LosslessJsonNumber.fromToken(coordinates[0]) } });
    check("real Supabase wrapper serialization fails closed", () => {
      assert(wrapper.error?.message.includes("native JSON.stringify"));
    });
    const preserved = await ingest(canonicalJson({ x: LosslessJsonNumber.fromToken(coordinates[0]) }));
    const readRisk = await api.rpc("unsafe_read", { receipt_id: preserved.receipt_id });
    check("ordinary JSONB SDK response loses an exactly stored coordinate", () => {
      assert(!readRisk.error);
      assert.equal(preserved.x_text, coordinates[0]);
      assert.notEqual(String(readRisk.data.x), coordinates[0]);
    });
    const unsafeText = await ingest(JSON.stringify(JSON.parse(`{"x":${coordinates[0]}}`)));
    check("Number conversion already corrupts text before safe RPC", () => assert.notEqual(unsafeText.x_text, coordinates[0]));
    for (const role of ["anon", "authenticated"]) {
      const denied = await client(role).rpc("ingest", { payload: '{"x":1}' });
      check(`${role} denied disposable RPC`, () => assert(denied.error));
    }
    for (const [payload, code] of [["{bad", "22P02"], ["[]", "22023"], ['{"x":1e131072}', "22003"],
      ['{"x":1e-16384}', "22003"], ['{"x":"\\u0000"}', "22P05"]]) {
      const before = await sql(`SELECT count(*) FROM ${schema}.receipts;`);
      const rejected = await api.rpc("ingest", { payload });
      const after = await sql(`SELECT count(*) FROM ${schema}.receipts;`);
      check(`unsupported input fails without storing: ${code} ${payload}`, () => { assert.equal(rejected.error?.code, code); assert.equal(after, before); });
    }
    for (const [t, length] of [["1e131071", 131072], ["1e-16383", 16385]] as const) {
      const row = await ingest(canonicalJson({ x: LosslessJsonNumber.fromToken(t) }));
      check(`PostgreSQL accepts numeric limit ${t} (returned text length ${length})`, () => {
        assert.equal(row.x_text!.length, length);
        assert.equal(row.x_text, t[2] === "-" ? "0." + "0".repeat(16382) + "1" : "1" + "0".repeat(131071));
        assert.throws(() => parseSourceJson(row.stored_text), /8192/);
      });
    }
    for (const t of ["1e8192", "1e-8191"]) {
      const row = await ingest(canonicalJson({ x: LosslessJsonNumber.fromToken(t) }));
      check(`JSONB expansion exceeds existing V2 parser token limit: ${t}`, () => assert.throws(() => parseSourceJson(row.stored_text), /8192/));
    }
    console.log("Precision boundary verified for tested source values; full V2 domain requires explicit JSONB/read-range rejection. Production ingestion remains disabled.");
  } finally {
    // Only this randomly named test container/schema/roles. Existing curb data is untouched.
    // Attempt every cleanup even if one fails; a failed cleanup makes the verifier fail.
    const failures: string[] = [];
    if (service) try { await docker(["rm", "--force", container]); } catch { failures.push("test container"); }
    if (objects) try {
      await sql(`BEGIN; DROP SCHEMA ${schema} CASCADE; DROP ROLE ${login}; DROP ROLE ${executor}; COMMIT;`);
      const remaining = await sql(`SELECT (SELECT count(*) FROM pg_namespace WHERE nspname=${quote(schema)}) +
        (SELECT count(*) FROM pg_roles WHERE rolname IN (${quote(login)},${quote(executor)}));`);
      check("disposable schema and roles removed", () => assert.equal(remaining, "0"));
    } catch { failures.push("test schema/roles"); }
    assert.equal(failures.length, 0, `Cleanup failed: ${failures.join(", ")}; local object prefix ${schema}`);
  }
  console.log(`${checks} local lossless DB checks passed.`);
}
main().catch(e => { console.error(e instanceof Error ? e.message : "Local verifier failed"); process.exitCode = 1; });

/** Offline static review of the actual curb migration and its reviewed contract.
 * NEVER executes SQL or connects to a database.
 * These assertions are not a PostgreSQL parser or proof of runtime/concurrency behavior.
 */
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { sha256 } from "./canonicalize-curb-snapshot";

const document = readFileSync(resolve(__dirname, "../docs/CITY_CURB_PUBLICATION_CONTRACT.md"), "utf8");
const reviewedSql = document.match(/<!-- CURB_GUARD_SQL_BEGIN -->\s*```sql\s*([\s\S]*?)```\s*<!-- CURB_GUARD_SQL_END -->/)?.[1];
assert(reviewedSql, "Missing bounded reviewed SQL block");
const migrationName = "00012_city_parking_curb_storage.sql";
const migrationDirectory = resolve(__dirname, "../supabase/migrations");
const sql = readFileSync(resolve(migrationDirectory, migrationName), "utf8").replace(/\r\n/g, "\n");
const compact = (s: string) => s.replace(/--[^\n]*/g, "").replace(/\s+/g, " ").trim();
const ddl = compact(sql);
const tables = new Map([...sql.matchAll(/CREATE TABLE public\.(\w+) \(([\s\S]*?)\n\);/g)].map(m => [m[1], compact(m[2])]));
const functions = new Map([...sql.matchAll(/CREATE FUNCTION ([\w.]+)\(([\s\S]*?)\) RETURNS ([\s\S]*?) AS \$guard\$([\s\S]*?)\$guard\$;/g)]
  .map(m => [m[1], { args: compact(m[2]), header: compact(m[3]), body: compact(m[4]) }]));
const table = (name: string) => { const result = tables.get(name); assert(result, `Missing table ${name}`); return result; };
const fn = (name: string) => { const result = functions.get(name); assert(result, `Missing function ${name}`); return result; };
let checks = 0;
function check(name: string, run: () => void) { run(); checks++; console.log(`PASS ${name}`); }
const snapshots = "city_parking_source_snapshots", versions = "city_parking_curb_versions";
const members = "city_parking_curb_snapshot_features", pointers = "city_parking_curb_publications";

check("actual migration preserves reviewed SQL exactly after its banner", () => {
  assert.equal(sql.slice(sql.indexOf("BEGIN;")), reviewedSql.trim().replace(/\r\n/g, "\n") + "\n");
  const migrations = readdirSync(migrationDirectory).filter(name => /^\d+_.*\.sql$/.test(name));
  assert.equal(migrations.filter(name => name.startsWith("00012_")).length, 1);
  const predecessors = migrations.filter(name => Number(name.split("_")[0]) < 12).sort();
  assert.equal(predecessors.at(-1), "00011_city_parking_regulations.sql");
});
check("DDL is additive and contains no top-level data writes", () => {
  const outsideFunctions = compact(sql.replace(/\$guard\$[\s\S]*?\$guard\$/g, "''"));
  assert(!/\b(?:INSERT INTO|UPDATE public\.|DELETE FROM|TRUNCATE|COPY|DROP|CREATE EXTENSION|ALTER DEFAULT PRIVILEGES|ALTER PUBLICATION)\b/i.test(
    outsideFunctions.replace(/CREATE TRIGGER [^;]+;/g, "").replace(/CREATE POLICY [^;]+;/g, "")
  ));
  assert.deepEqual([...tables.keys()], [snapshots, versions, members, pointers]);
  for (const m of outsideFunctions.matchAll(/ALTER TABLE public\.(\w+)/g)) assert(tables.has(m[1]));
});
check("tables, functions, triggers, policies and indexes follow dependency order", () => {
  for (const [name, body] of tables) {
    const position = ddl.indexOf(`CREATE TABLE public.${name} (`);
    for (const m of body.matchAll(/REFERENCES public\.(\w+)/g)) {
      if (m[1] !== "city_parking_sources") assert(ddl.indexOf(`CREATE TABLE public.${m[1]} (`) < position);
    }
  }
  for (const [name, f] of functions) {
    const position = ddl.indexOf(`CREATE FUNCTION ${name}(`);
    for (const m of f.body.matchAll(/curb_private\.(\w+)\(/g)) {
      const dependency = ddl.indexOf(`CREATE FUNCTION curb_private.${m[1]}(`);
      assert(dependency >= 0 && dependency < position, `${name} -> ${m[1]}`);
    }
  }
  for (const m of ddl.matchAll(/CREATE (?:TRIGGER|POLICY|INDEX) [^;]+;/g)) {
    for (const ref of m[0].matchAll(/(?:ON public\.|EXECUTE FUNCTION )([\w.]+)/g)) {
      const dependency = ref[0].startsWith("ON ")
        ? ddl.indexOf(`CREATE TABLE public.${ref[1]} (`)
        : ddl.indexOf(`CREATE FUNCTION ${ref[1]}(`);
      assert(ref[1] === "city_parking_sources" || (dependency >= 0 && dependency < m.index!));
    }
  }
});
check("verifier is a non-login permission group with no application membership", () => {
  const roles = [...ddl.matchAll(/CREATE ROLE (\w+) ([^;]+);/g)];
  assert.deepEqual(roles.map(m => m[1]), ["curb_artifact_verifier"]);
  for (const m of roles) assert.equal(m[2], "NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS");
  assert(!/GRANT (?:curb_guard_owner|curb_artifact_verifier)\b/.test(ddl));
});
check("snapshot envelope has required capture, digest and attestation fields", () => {
  const t = table(snapshots);
  for (const field of ["schema_sha256", "source_content_sha256", "identity_geometry_sha256", "artifact_sha256", "manifest_sha256"]) {
    assert(t.includes(`${field} curb_private.sha256_hex NOT NULL`));
  }
  for (const field of ["artifact_uri", "manifest_uri", "canonicalization_version", "fetch_tool_version"]) assert(t.includes(`${field} text NOT NULL`));
  assert(t.includes("('CONSISTENT', 'POSSIBLY_CHANGED_DURING_CAPTURE', 'INVALID')"));
  assert(t.includes("manifest jsonb NOT NULL")); assert(t.includes("row_count BETWEEN 0 AND 100000"));
  assert(t.includes("retrieval_completed_at >= retrieval_started_at"));
  for (const field of ["artifact_verified_at", "artifact_verification_version", "artifact_verified_by", "validated_at", "published_at", "failed_at", "failure_reason"]) assert(t.includes(field));
  assert(fn("curb_private.assert_complete").body.includes("{summary,distinct_external_id_count}"));
});
check("version UUID and geometry payload are suitable for future interval FKs", () => {
  const t = table(versions);
  for (const text of ["id uuid PRIMARY KEY DEFAULT gen_random_uuid()", "geometry_geojson jsonb", "geometry_presence IN ('ABSENT','NULL','VALUE')", "raw_source jsonb NOT NULL", "NOT (raw_source ? 'shape')", "(raw_source ->> 'globalid') IS NOT DISTINCT FROM external_id"]) assert(t.includes(text));
  assert(!t.includes("updated_at")); assert(!ddl.includes("set_updated_at()"));
  assert(fn("curb_private.stage_insert_guard").body.includes("NEW.created_at := clock_timestamp()"));
});
check("required live-write guards are attached, not merely declared", () => {
  for (const t of [snapshots, versions, members]) assert(ddl.includes(`BEFORE INSERT ON public.${t} FOR EACH ROW EXECUTE FUNCTION curb_private.stage_insert_guard()`));
  assert(ddl.includes(`BEFORE UPDATE ON public.${snapshots} FOR EACH ROW EXECUTE FUNCTION curb_private.snapshot_transition_guard()`));
  assert(ddl.includes(`BEFORE INSERT OR UPDATE ON public.${pointers} FOR EACH ROW EXECUTE FUNCTION curb_private.pointer_guard()`));
  assert(ddl.includes("BEFORE UPDATE ON public.city_parking_sources FOR EACH ROW EXECUTE FUNCTION curb_private.source_identity_guard()"));
});
check("failure RPC requires a reason, permits only staging/validated, and retries without writes", () => {
  const b = fn("public.fail_city_parking_curb_snapshot").body;
  assert(b.includes("p_reason IS NULL OR length(btrim(p_reason)) = 0"));
  assert(b.includes("IF s.lifecycle = 'FAILED' THEN RETURN 'ALREADY_FAILED'"));
  assert(b.includes("s.lifecycle NOT IN ('STAGING','VALIDATED')"));
  assert(b.indexOf("ALREADY_FAILED") < b.indexOf("UPDATE public.city_parking_source_snapshots"));
  assert(b.includes("failed_at = clock_timestamp(), failure_reason = p_reason"));
});
check("first publication inserts generation one; later advancement is guarded", () => {
  const b = fn("public.publish_city_parking_curb_snapshot").body;
  assert(b.includes("IF current_id IS NULL THEN INSERT INTO public.city_parking_curb_publications(source_id, snapshot_id, generation) VALUES (p_source, p_snapshot, 1)"));
  assert(b.includes("generation = generation + 1"));
  assert(fn("curb_private.pointer_guard").body.includes("NEW.generation <> OLD.generation + 1"));
});
check("RPC PUBLIC execution is revoked and definer/invoker boundaries are explicit", () => {
  assert(ddl.includes("REVOKE ALL ON FUNCTION public.validate_city_parking_curb_snapshot(uuid, uuid, text, text, text), public.publish_city_parking_curb_snapshot(uuid, uuid, uuid), public.fail_city_parking_curb_snapshot(uuid, uuid, text) FROM PUBLIC, anon, authenticated, service_role, curb_artifact_verifier;"));
  const definers = ["curb_private.lock_source", "curb_private.stage_insert_guard", "curb_private.source_identity_guard", ...["validate", "publish", "fail"].map(n => `public.${n}_city_parking_curb_snapshot`)];
  for (const [name, f] of functions) assert(f.header.includes(`SECURITY ${definers.includes(name) ? "DEFINER" : "INVOKER"}`));
  assert(!/\b(?:SET ROLE|SET SESSION AUTHORIZATION|OWNER TO|AUTHORIZATION)\b/.test(ddl));
});
check("only documented secondary indexes supplement primary/unique lookup keys", () => {
  const indexes = [...ddl.matchAll(/CREATE INDEX (\w+) ON public\.(\w+)\(([^;]+)\);/g)];
  assert.deepEqual(indexes.map(m => [m[1], m[2], m[3]]), [
    ["city_curb_snapshots_source_time", snapshots, "source_id, retrieval_completed_at DESC"],
    ["city_curb_members_version", members, "curb_version_id"],
  ]);
});

check("one transaction; no extension, data import, or association DDL", () => {
  assert(ddl.startsWith("BEGIN;") && ddl.endsWith("COMMIT;"));
  assert(!/CREATE EXTENSION|CREATE TABLE public\.city_parking_regulation_associations|COPY\s/i.test(ddl));
  assert.equal(tables.size, 4); assert.equal(functions.size, 12);
});
check("balanced SQL parentheses and quote/dollar delimiters", () => {
  let depth = 0;
  // Inspect dollar bodies too: their SQL strings/comments still need lexical balance.
  const input = sql.replace(/\$guard\$/g, "");
  for (let i = 0; i < input.length; i++) {
    if (input.slice(i, i + 2) === "--") { while (i < input.length && input[i] !== "\n") i++; continue; }
    if (input[i] === "'" || input[i] === '"') {
      const quote = input[i++]; let closed = false;
      for (; i < input.length; i++) if (input[i] === quote) {
        if (input[i + 1] === quote) { i++; continue; } closed = true; break;
      }
      assert(closed, "Unclosed SQL quote"); continue;
    }
    if (input[i] === "(") depth++;
    if (input[i] === ")") { depth--; assert(depth >= 0); }
  }
  assert.equal(depth, 0); assert.equal((sql.match(/\$guard\$/g) ?? []).length, functions.size * 2);
});
check("all table FK dependencies resolve and form no cycle", () => {
  const graph = new Map([...tables].map(([name, body]) => [name, [...body.matchAll(/REFERENCES public\.(\w+)/g)].map(m => m[1])]));
  const existing = readFileSync(resolve(__dirname, "../supabase/migrations/00005_city_parking_data.sql"), "utf8");
  assert(existing.includes("CREATE TABLE public.city_parking_sources"));
  function visit(name: string, path: string[]) {
    assert(!path.includes(name), `FK cycle: ${[...path, name].join(" -> ")}`);
    for (const parent of graph.get(name) ?? []) {
      assert(parent === "city_parking_sources" || graph.has(parent), `Unknown FK target ${parent}`);
      visit(parent, [...path, name]);
    }
  }
  for (const name of graph.keys()) visit(name, []);
});
check("all new FKs are RESTRICT; no destructive cascade", () => {
  assert.equal((ddl.match(/REFERENCES public\./g) ?? []).length, (ddl.match(/ON DELETE RESTRICT/g) ?? []).length);
  assert(!ddl.includes("ON DELETE CASCADE"));
});
check("snapshot identity and terminal lifecycle contract", () => {
  const t = table(snapshots);
  for (const text of ["UNIQUE (source_id, capture_key)", "UNIQUE (id, source_id)", "UNIQUE (id, source_id, lifecycle)", "('STAGING', 'VALIDATED', 'PUBLISHED', 'FAILED')"]) assert(t.includes(text));
  const guard = fn("curb_private.snapshot_transition_guard").body;
  assert(guard.includes("OLD.lifecycle = 'STAGING' AND NEW.lifecycle = 'VALIDATED'"));
  assert(guard.includes("OLD.lifecycle = 'VALIDATED' AND NEW.lifecycle = 'PUBLISHED'"));
  assert(guard.includes("OLD.lifecycle IN ('STAGING','VALIDATED') AND NEW.lifecycle = 'FAILED'"));
  assert(guard.includes("ELSE RAISE EXCEPTION 'Forbidden snapshot transition'"));
});
check("snapshot payload changes limited to transition fields", () => {
  const guard = fn("curb_private.snapshot_transition_guard").body;
  assert(guard.includes("current_user IS DISTINCT FROM (SELECT pg_catalog.pg_get_userbyid(c.relowner) FROM pg_catalog.pg_class c WHERE c.oid = TG_RELID)"));
  assert(guard.includes("(to_jsonb(NEW) - allowed) IS DISTINCT FROM (to_jsonb(OLD) - allowed)"));
  assert(guard.includes("ARRAY['lifecycle','published_at']"));
});
check("version reuse key includes source and external identity", () => {
  assert(table(versions).includes("UNIQUE (source_id, external_id, canonicalization_version, content_sha256)"));
  assert(table(versions).includes("UNIQUE (id, source_id, external_id)"));
  assert(!table(versions).includes("UNIQUE (geometry_sha256)"));
});
check("membership composite FKs match unique referenced keys", () => {
  const t = table(members);
  assert(t.includes("PRIMARY KEY (snapshot_id, external_id)"));
  assert(t.includes("UNIQUE (snapshot_id, curb_version_id)"));
  assert(t.includes("FOREIGN KEY (snapshot_id, source_id) REFERENCES public.city_parking_source_snapshots(id, source_id)"));
  assert(t.includes("FOREIGN KEY (curb_version_id, source_id, external_id) REFERENCES public.city_parking_curb_versions(id, source_id, external_id)"));
  for (const column of ["snapshot_id uuid NOT NULL", "source_id uuid NOT NULL", "external_id text COLLATE \"C\" NOT NULL", "curb_version_id uuid NOT NULL"]) assert(t.includes(column));
});
check("one current pointer per source; FK requires PUBLISHED", () => {
  const t = table(pointers);
  assert(t.includes("source_id uuid PRIMARY KEY")); assert(t.includes("snapshot_state = 'PUBLISHED'"));
  assert(t.includes("REFERENCES public.city_parking_source_snapshots(id, source_id, lifecycle)"));
  assert(!/CREATE UNIQUE INDEX.*lifecycle/i.test(ddl));
});
check("source-first READ COMMITTED scope lock", () => {
  const lock = fn("curb_private.lock_source");
  assert(lock.header.includes("VOLATILE SECURITY DEFINER"));
  for (const text of ["transaction_isolation", "read committed", "FROM public.city_parking_sources WHERE id = p_source FOR UPDATE", "DATASF", "pep9-66vw", "datasf_citywide_curbs"]) assert(lock.body.includes(text));
});
check("registry locking retains source scope without new registry grants or policies", () => {
  assert(!/CREATE POLICY [^;]+ ON public\.city_parking_sources\b/.test(ddl));
  assert(!/GRANT [^;]+ ON public\.city_parking_sources\b/.test(ddl));
  const b = fn("curb_private.lock_source").body;
  for (const text of ["s.provider <> 'DATASF'", "s.dataset_id <> 'pep9-66vw'", "s.source_key <> 'datasf_citywide_curbs'", "s.api_base_url <> 'https://data.sfgov.org/resource'"]) assert(b.includes(text));
});
check("all lifecycle RPCs lock source before snapshot", () => {
  for (const name of ["validate", "publish", "fail"]) {
    const body = fn(`public.${name}_city_parking_curb_snapshot`).body;
    assert(body.indexOf("PERFORM curb_private.lock_source(p_source)") < body.indexOf("SELECT * INTO STRICT s"));
    assert(body.includes("id = p_snapshot AND source_id = p_source FOR UPDATE"));
  }
});
check("membership writer locks parent and requires STAGING", () => {
  const b = fn("curb_private.stage_insert_guard").body;
  assert(b.indexOf("lock_source(NEW.source_id)") < b.indexOf("SELECT * INTO STRICT s"));
  assert(b.includes("s.lifecycle <> 'STAGING'")); assert(b.includes("FOR UPDATE"));
  assert(b.includes("NEW.artifact_verified_at IS NOT NULL"));
});
check("append-only guards and TRUNCATE denial attached to all evidence tables", () => {
  for (const t of [snapshots, versions, members, pointers]) {
    assert(new RegExp(`BEFORE TRUNCATE ON public\\.${t} FOR EACH STATEMENT EXECUTE FUNCTION curb_private\\.deny_mutation`).test(ddl));
  }
  for (const t of [versions, members]) assert(ddl.includes(`BEFORE UPDATE OR DELETE ON public.${t} FOR EACH ROW EXECUTE FUNCTION curb_private.deny_mutation()`));
  for (const t of [snapshots, pointers]) assert(ddl.includes(`BEFORE DELETE ON public.${t} FOR EACH ROW EXECUTE FUNCTION curb_private.deny_mutation()`));
});
check("referenced source identity cannot be repurposed", () => {
  const b = fn("curb_private.source_identity_guard").body;
  for (const field of ["NEW.id", "NEW.source_key", "NEW.provider", "NEW.dataset_id", "NEW.api_base_url"]) assert(b.includes(field));
  assert(b.includes("FROM public.city_parking_source_snapshots")); assert(b.includes("FROM public.city_parking_curb_versions"));
});
check("non-CONSISTENT, empty, count-mismatched or invalid sets reject", () => {
  const b = fn("curb_private.assert_complete").body;
  for (const text of ["s.consistency_state <> 'CONSISTENT'", "s.row_count <= 0", "count(DISTINCT external_id)", "n <> s.row_count OR distinct_n <> s.row_count", "v.source_id <> s.source_id", "v.geometry_state <> 'USABLE'", "NOT curb_private.usable_line(v.geometry_geojson)"]) assert(b.includes(text));
});
check("manifest identity, query, timing and content are bound", () => {
  const b = fn("curb_private.assert_complete").body;
  for (const key of ["format_version", "canonicalization_version", "provider", "dataset_id", "source_key", "api_endpoint", "captured_at_start", "captured_at_end", "fetch_tool_version", "query", "schema_before", "schema_after", "count_before", "count_after", "dataset_sha256", "identity_geometry_sha256"]) assert(b.includes(key));
  assert(b.includes("IS DISTINCT FROM"));
});
check("artifact verification is separate, pinned, and frozen", () => {
  const b = fn("public.validate_city_parking_curb_snapshot").body;
  assert(b.includes("p_manifest_sha256 IS DISTINCT FROM s.manifest_sha256::text"));
  assert(b.includes("curb-artifact-verify-v1")); assert(b.includes("seal IS DISTINCT FROM p_membership_sha256"));
  assert(b.includes("artifact_verified_by = session_user::text")); assert(b.includes("ALREADY_VALIDATED"));
});
check("publish checks predecessor and capture chronology before mutation", () => {
  const b = fn("public.publish_city_parking_curb_snapshot").body;
  assert(b.includes("current_id IS DISTINCT FROM p_expected_current"));
  assert(b.includes("s.retrieval_completed_at <= previous_capture_completed_at"));
  assert(b.indexOf("seal IS DISTINCT FROM s.membership_sha256::text") < b.indexOf("SET lifecycle = 'PUBLISHED'"));
  assert(b.indexOf("SET lifecycle = 'PUBLISHED'") < b.indexOf("SET snapshot_id = p_snapshot"));
  assert(b.includes("snapshot_id = p_expected_current")); assert(b.includes("IF NOT FOUND THEN RAISE EXCEPTION"));
  assert(!b.includes("EXCEPTION WHEN")); // No handler that swallows partial-publication failure.
});
check("published retries cannot rewind pointer or refresh timestamps", () => {
  const b = fn("public.publish_city_parking_curb_snapshot").body;
  assert(b.includes("ALREADY_CURRENT") && b.includes("ALREADY_PUBLISHED_NOT_CURRENT"));
  assert(b.indexOf("ALREADY_PUBLISHED_NOT_CURRENT") < b.indexOf("UPDATE public.city_parking_source_snapshots"));
});
check("all new tables enable RLS and public clients get no policy", () => {
  for (const t of tables.keys()) assert(ddl.includes(`ALTER TABLE public.${t} ENABLE ROW LEVEL SECURITY`));
  for (const m of ddl.matchAll(/CREATE POLICY ([\s\S]*?);/g)) assert(!/TO (?:PUBLIC|anon|authenticated)\b/i.test(m[1]));
});
check("service role receives staging INSERT but no UPDATE/DELETE/TRUNCATE", () => {
  for (const m of ddl.matchAll(/GRANT ([^;]*?) TO service_role;/g)) assert(!/UPDATE|DELETE|TRUNCATE|ALL\b/.test(m[1]));
  assert(ddl.includes("FROM PUBLIC, anon, authenticated, service_role, curb_artifact_verifier"));
  assert(!ddl.includes("GRANT curb_guard_owner")); assert(!ddl.includes("GRANT curb_artifact_verifier"));
});
check("only verifier may validate; only service may publish/fail", () => {
  assert(ddl.includes("GRANT EXECUTE ON FUNCTION public.validate_city_parking_curb_snapshot(uuid, uuid, text, text, text) TO curb_artifact_verifier"));
  assert(ddl.includes("GRANT EXECUTE ON FUNCTION public.publish_city_parking_curb_snapshot(uuid, uuid, uuid), public.fail_city_parking_curb_snapshot(uuid, uuid, text) TO service_role"));
});
check("functions retain executor ownership, safe search paths and restricted private access", () => {
  for (const [name, f] of functions) {
    assert(f.header.includes("SET search_path = pg_catalog, pg_temp"), name);
    assert(!/\bEXECUTE\s/.test(f.body), `Unexpected dynamic SQL in ${name}`);
  }
  assert(ddl.includes("REVOKE ALL ON ALL FUNCTIONS IN SCHEMA curb_private"));
  assert(ddl.includes("CREATE SCHEMA curb_private;"));
  assert(ddl.includes("REVOKE ALL ON SCHEMA curb_private FROM PUBLIC, anon, authenticated, service_role;"));
  assert(!/\b(?:AUTHORIZATION|OWNER TO|SET ROLE|SET SESSION AUTHORIZATION)\b/.test(ddl));
  for (const name of ["snapshot_transition_guard", "pointer_guard"]) {
    const guard = fn(`curb_private.${name}`);
    assert(guard.header.includes("SECURITY INVOKER"));
    assert(guard.body.includes("current_user IS DISTINCT FROM (SELECT pg_catalog.pg_get_userbyid(c.relowner) FROM pg_catalog.pg_class c WHERE c.oid = TG_RELID)"));
  }
});
check("every trigger/private call references a defined function", () => {
  for (const m of ddl.matchAll(/EXECUTE FUNCTION ([\w.]+)\(/g)) assert(functions.has(m[1]), m[1]);
  for (const f of functions.values()) for (const m of f.body.matchAll(/curb_private\.(\w+)\(/g)) assert(functions.has(`curb_private.${m[1]}`));
});
check("DB set seal uses explicit domain, ordering and version/hash mapping", () => {
  const b = fn("curb_private.membership_seal").body;
  for (const text of ["city-curb/db-membership/v1", "sha256(convert_to(", "encode(convert_to(m.external_id, 'UTF8'), 'hex')", "v.id::text", "v.geometry_sha256::text", "v.attributes_sha256::text", "v.content_sha256::text", "COLLATE \"C\""]) assert(b.includes(text));
});

// Independent byte-protocol examples, not a simulation of PostgreSQL transactions.
type SealRow = { external: string; version: string; geometry: string; attributes: string; content: string };
function seal(rows: SealRow[]): string {
  const encoded = rows.map(r => ({ key: Buffer.from(r.external, "utf8").toString("hex"), row: r }));
  encoded.sort((a, b) => a.key < b.key ? -1 : a.key > b.key ? 1 : 0);
  assert.equal(new Set(encoded.map(r => r.key)).size, rows.length, "Duplicate source identity");
  return sha256("city-curb/db-membership/v1\n" + encoded.map(({ key, row: r }) => `${key}:${r.version}:${r.geometry}:${r.attributes}:${r.content}`).join("\n"));
}
const fixture: SealRow = { external: "a", version: "00000000-0000-4000-8000-000000000001", geometry: "1".repeat(64), attributes: "2".repeat(64), content: "3".repeat(64) };
check("membership seal exact single-row protocol", () => assert.equal(seal([fixture]), sha256(`city-curb/db-membership/v1\n61:00000000-0000-4000-8000-000000000001:${"1".repeat(64)}:${"2".repeat(64)}:${"3".repeat(64)}`)));
check("membership seal is independent of row enumeration", () => { const b = { ...fixture, external: "b" }; assert.equal(seal([fixture, b]), seal([b, fixture])); });
check("different version/identity/content changes seal", () => { for (const change of [{ version: "00000000-0000-4000-8000-000000000002" }, { external: "b" }, { geometry: "4".repeat(64) }, { attributes: "4".repeat(64) }, { content: "4".repeat(64) }]) assert.notEqual(seal([fixture]), seal([{ ...fixture, ...change }])); });
check("delimiters and Unicode are encoded; duplicate identities reject", () => { assert.notEqual(seal([{ ...fixture, external: "a\nb:c" }]), seal([{ ...fixture, external: "a" }, { ...fixture, external: "b:c" }])); assert.notEqual(seal([{ ...fixture, external: "é" }]), seal([{ ...fixture, external: "e\u0301" }])); assert.throws(() => seal([fixture, fixture]), /Duplicate source identity/); });
console.log(`Curb migration ${migrationName}: ${checks} static/protocol checks passed. SQL NOT executed; no database/network/writes. PostgreSQL role, trigger and concurrency tests remain required.`);

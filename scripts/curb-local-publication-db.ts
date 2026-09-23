/** Full-chain fresh Supabase PostgreSQL image fixture. No existing/hosted targets.
 * Minimal Auth/realtime schema prerequisites for compiling actual project SQL;
 * no Auth service, extension installation, PostGIS, dotenv or image pulling.
 */
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
const pipe="npipe:////./pipe/dockerDesktopLinuxEngine";
export const quote=(s:string)=>"'"+s.replaceAll("'","''")+"'";
export type SqlResult={code:number;out:string;error:string};
async function run(args:string[],input=""):Promise<SqlResult> {
  return new Promise((resolve,reject)=>{
    const child=spawn("docker",["--host",pipe,...args],{windowsHide:true,stdio:"pipe"});
    let out="",error=""; const timer=setTimeout(()=>{child.kill();reject(new Error("Local Docker timeout"));},60000);
    child.stdout.on("data",b=>out+=b);child.stderr.on("data",b=>error+=b);child.stdin.on("error",()=>{});
    child.on("error",()=>{clearTimeout(timer);reject(new Error("Local Docker unavailable"));});
    child.on("close",code=>{clearTimeout(timer);resolve({code:code??-1,out:out.trim(),error:error.trim()});});child.stdin.end(input);
  });
}
async function command(args:string[]) {const r=await run(args);assert.equal(r.code,0,`Local Docker ${args[0]} failed`);return r.out;}
export type Actor="postgres"|"supabase_admin"|"service_role"|"curb_artifact_verifier"|"anon"|"authenticated"|"public_only";
export type LocalDb={container:string;raw:(sql:string,actor?:Actor)=>Promise<SqlResult>;sql:(sql:string,actor?:Actor)=>Promise<string>};
export async function withPublicationDb(through:12|14, action:(db:LocalDb)=>Promise<void>) {
  const suffix=randomBytes(8).toString("hex"),container=`curb-publication-db-${suffix}`;
  let created=false;
  // No network at all: actual database role logins use docker exec + Unix socket.
  try {
    await command(["create","--pull=never","--name",container,"--network","none","--label","smart-parking.curb-publication-test=local-only",
      "--user","postgres","--entrypoint","/bin/sh","public.ecr.aws/supabase/postgres:17.6.1.167","-c",
      "initdb -D /tmp/curb-publication-pg -U supabase_admin --auth=trust --no-locale --encoding=UTF8 --no-sync >/tmp/curb-init.log && exec postgres -D /tmp/curb-publication-pg -c listen_addresses='' -c wal_level=logical"]);
    created=true;await command(["start",container]);
    const deadline=Date.now()+45000;
    while ((await run(["exec",container,"pg_isready","-U","supabase_admin","-d","postgres"])).code!==0) {
      assert(Date.now()<deadline,"Fresh PostgreSQL did not start");await new Promise(r=>setTimeout(r,200));
    }
    const raw=async(text:string,actor:Actor="postgres")=>{
      const login=actor==="curb_artifact_verifier"?"curb_test_verifier":actor==="service_role"?"curb_test_service":"supabase_admin";
      return run(["exec","-i",container,"psql","-X","-qAt","-U",login,"-d","postgres","-v","ON_ERROR_STOP=1","-v","VERBOSITY=verbose"],
        `SET statement_timeout='20s';SET lock_timeout='10s';SET ROLE ${actor};\n${text}\n`);
    };
    const sql=async(text:string,actor:Actor="postgres")=>{const r=await raw(text,actor);assert.equal(r.code,0,`Local SQL failure: ${r.error.slice(0,1200)}`);return r.out;};
    assert.equal(await sql("SHOW server_version;","supabase_admin"),"17.6");
    await sql(`CREATE ROLE postgres LOGIN NOSUPERUSER CREATEDB CREATEROLE BYPASSRLS;
      CREATE ROLE anon NOLOGIN;CREATE ROLE authenticated NOLOGIN;CREATE ROLE service_role NOLOGIN BYPASSRLS;CREATE ROLE public_only NOLOGIN;
      CREATE ROLE curb_test_service LOGIN NOINHERIT;CREATE ROLE curb_test_verifier LOGIN NOINHERIT;
      GRANT service_role TO curb_test_service;
      -- Test administrator must observe other sessions for the existing lock test.
      GRANT pg_read_all_stats TO postgres;
      ALTER DATABASE postgres OWNER TO postgres;ALTER SCHEMA public OWNER TO postgres;
      GRANT USAGE ON SCHEMA public TO anon,authenticated,service_role,public_only;
      CREATE SCHEMA auth AUTHORIZATION postgres;
      CREATE TABLE auth.users(id uuid PRIMARY KEY,email text,raw_user_meta_data jsonb);
      ALTER TABLE auth.users OWNER TO postgres;
      CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
      ALTER FUNCTION auth.uid() OWNER TO postgres;
      GRANT USAGE ON SCHEMA auth TO anon,authenticated,service_role;
      CREATE SCHEMA supabase_migrations AUTHORIZATION postgres;
      CREATE TABLE supabase_migrations.schema_migrations(version text PRIMARY KEY);
      ALTER TABLE supabase_migrations.schema_migrations OWNER TO postgres;`,"supabase_admin");
    await sql("CREATE PUBLICATION supabase_realtime;");
    const files=(await readdir("supabase/migrations")).filter(f=>/^\d{5}_.*\.sql$/.test(f)&&Number(f.slice(0,5))<=through).sort();
    assert.equal(files.length,through,"Full sequential migration chain missing");
    for (const file of files) {
      const r=await raw(await readFile(`supabase/migrations/${file}`,"utf8"));
      assert.equal(r.code,0,`STOP: first PostgreSQL migration defect in ${file}: ${r.error.slice(0,1400)}`);
      await sql(`INSERT INTO supabase_migrations.schema_migrations(version) VALUES (${quote(file.slice(0,5))});`);
      console.log(`COMPILED ${file}`);
    }
    await sql("GRANT curb_artifact_verifier TO curb_test_verifier;","supabase_admin");
    assert.equal(await sql("SELECT count(*) FROM pg_extension WHERE extname='postgis';"),"0");
    await action({container,raw,sql});
  } finally {
    if(created)await command(["rm","--force","--volumes",container]);
    console.log(`Removed disposable cluster ${container}; existing local Supabase untouched.`);
  }
}

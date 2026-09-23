/** Synthetic-only fresh 00001..00014 lifecycle/role regression. No network. */
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdtemp, readFile, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { canonicalDataset, canonicalFeature, canonicalJson, jsonObject, parseSourceJson, sha256 } from "./canonicalize-curb-snapshot";
import * as v1 from "./canonicalize-curb-snapshot-v1";
import { curbDbEligibility } from "./curb-db-eligibility";
import { membershipSealV2, SealedMember } from "./curb-v2-membership-seal";
import { withPublicationDb, LocalDb, Actor, quote as q } from "./curb-local-publication-db";

let checks=0;
function check(name:string, action:()=>void) { action();checks++;console.log(`PASS ${name}`); }
const tables=["city_parking_sources","city_parking_source_snapshots","city_parking_curb_versions","city_parking_curb_snapshot_features","city_parking_curb_publications","city_parking_curb_attestations"];
const insert=(table:string,row:Record<string,unknown>)=>`INSERT INTO public.${table} (${Object.keys(row).join(",")}) VALUES (${Object.values(row).map(v=>v===null?"NULL":q(typeof v==="object"?JSON.stringify(v):String(v))).join(",")});`;
type Fixture={id:string;rows:unknown[];record:Record<string,any>;manifest:Record<string,any>;artifactPath:string;manifestPath:string};

async function tests(db:LocalDb, directory:string) {
  const source=randomUUID();let clock=Date.now();
  const rows=["A","B","C"].map((id,i)=>parseSourceJson(`{"globalid":"synthetic-${id}","shape":{"type":"LineString","coordinates":[[-122.37952207229336,37.732536608656226],[-122.37952207229335,37.743691137180925]]},"large":9007199254740993,"order":${i}}`));
  await db.sql(insert("city_parking_sources",{id:source,source_key:"datasf_citywide_curbs",display_name:"DISPOSABLE V2 PUBLICATION",provider:"DATASF",dataset_id:"pep9-66vw",api_base_url:"https://data.sfgov.org/resource"}));
  const fingerprint=()=>db.sql(`SELECT jsonb_build_array(${tables.map(t=>`(SELECT encode(sha256(convert_to(coalesce(jsonb_agg(to_jsonb(x) ORDER BY to_jsonb(x)::text),'[]'::jsonb)::text,'UTF8')),'hex') FROM public.${t} x)`).join(",")})::text;`);
  async function rejected(name:string,statement:string,actor:Actor="service_role",fragment="",code="") {
    const before=await fingerprint(),result=await db.raw(statement,actor),after=await fingerprint();
    check(name,()=>{assert.notEqual(result.code,0,"Unexpected success");assert(result.error.includes(fragment),result.error);assert(result.error.includes(code),result.error);assert.equal(after,before,"Failed operation changed evidence");});
  }
  async function fixture(overrides:Record<string,any>={},manifestChanges:Record<string,any>={},input:unknown[]=rows,legacy=false) {
    const id=randomUUID();clock+=1000;const t=new Date(clock).toISOString();
    const data=legacy?v1.canonicalDataset(input):canonicalDataset(input);
    const artifact=legacy?JSON.stringify(input):canonicalJson(input),version=legacy?"curb-jcs-v1":"curb-decimal-v2",schema=sha256("synthetic-schema");
    const manifest={format_version:legacy?"curb-snapshot-v1":"curb-snapshot-v2",canonicalization_version:version,provider:"datasf",dataset_id:"pep9-66vw",source_key:"datasf_citywide_curbs",
      api_endpoint:legacy?"https://data.sfgov.org/resource/pep9-66vw.json":"https://data.sf.gov/resource/pep9-66vw.json",fetch_tool_version:"synthetic-v2",captured_at_start:t,captured_at_end:t,
      query:{select:"*",order:"globalid ASC",page_size:1000,offset_step:1000,filter:null},summary:{state:"CONSISTENT",ordered:true,count_before:input.length,count_after:input.length,row_count:input.length,distinct_external_id_count:input.length,usable_geometry_count:input.length,schema_before:schema,schema_after:schema,dataset_sha256:data.dataset_sha256,identity_geometry_sha256:data.identity_geometry_sha256},...manifestChanges};
    const manifestText=JSON.stringify(manifest),artifactPath=join(directory,`${id}-rows.json`),manifestPath=join(directory,`${id}-manifest.json`);
    await writeFile(artifactPath,artifact);await writeFile(manifestPath,manifestText);
    const record={id,source_id:source,capture_key:`test:${id}`,retrieval_started_at:t,retrieval_completed_at:t,canonicalization_version:version,fetch_tool_version:"synthetic-v2",consistency_state:"CONSISTENT",row_count:input.length,schema_sha256:schema,source_content_sha256:data.dataset_sha256,identity_geometry_sha256:data.identity_geometry_sha256,
      artifact_uri:`test://curb/${id}/rows`,artifact_sha256:sha256(artifact),manifest_uri:`test://curb/${id}/manifest`,manifest_sha256:sha256(manifestText),manifest,...overrides};
    return {id,rows:input,record,manifest,artifactPath,manifestPath};
  }
  const create=async(f:Fixture)=>{await db.sql(insert("city_parking_source_snapshots",f.record),"service_role");return f;};
  const stageSql=(f:Fixture,row:unknown)=>{const h=canonicalFeature(row);return `SELECT public.stage_city_parking_curb_version(${q(source)},${q(f.id)},${q(h.external_id)},${q(canonicalJson(row))},${q(h.geometry_sha256)},${q(h.attributes_sha256)},${q(h.content_sha256)},'curb-decimal-v2');`;};
  async function stage(f:Fixture,subset=f.rows) {for(const row of subset)await db.sql(stageSql(f,row),"service_role");return f;}
  const members=async(f:Fixture)=>JSON.parse(await db.sql(`SELECT coalesce(jsonb_agg(jsonb_build_object('external_id',m.external_id,'id',v.id,'geometry_sha256',v.geometry_sha256,'attributes_sha256',v.attributes_sha256,'content_sha256',v.content_sha256,'geometry_text',v.geometry_geojson::text,'raw_text',v.raw_source::text)),'[]'::jsonb)::text
    FROM public.city_parking_curb_snapshot_features m JOIN public.city_parking_curb_versions v ON v.id=m.curb_version_id WHERE m.snapshot_id=${q(f.id)};`,"curb_artifact_verifier")) as (SealedMember&{geometry_text:string;raw_text:string})[];
  const snapshot=async(f:Fixture)=>JSON.parse(await db.sql(`SELECT to_jsonb(s)::text FROM public.city_parking_source_snapshots s WHERE id=${q(f.id)};`,"curb_artifact_verifier"));
  async function verify(f:Fixture) {
    // Independent role reads retained bytes and authoritative DB TEXT; never takes
    // staging's claimed hashes as proof or converts source numerics to Number.
    const s=await snapshot(f),artifact=await readFile(f.artifactPath),manifestBytes=await readFile(f.manifestPath);
    assert.equal(sha256(artifact),s.artifact_sha256);assert.equal(sha256(manifestBytes),s.manifest_sha256);
    const manifest=jsonObject(parseSourceJson(manifestBytes)),input=parseSourceJson(artifact);assert(Array.isArray(input));
    assert.equal(manifest.format_version,"curb-snapshot-v2");assert.equal(manifest.canonicalization_version,"curb-decimal-v2");
    const dataset=canonicalDataset(input);assert.equal(dataset.dataset_sha256,s.source_content_sha256);assert.equal(dataset.identity_geometry_sha256,s.identity_geometry_sha256);
    assert.equal(input.length,s.row_count);assert(input.every(r=>curbDbEligibility(r).state==="ELIGIBLE"));
    const stored=await members(f);assert.equal(stored.length,input.length);
    const byId=new Map(input.map(r=>[jsonObject(r).globalid,r]));
    for(const m of stored) {
      const row=byId.get(m.external_id);assert(row);
      const restored={...jsonObject(parseSourceJson(m.raw_text)),shape:parseSourceJson(m.geometry_text)};
      assert.equal(canonicalJson(restored),canonicalJson(row));
      const h=canonicalFeature(restored);assert.equal(m.content_sha256,h.content_sha256);assert.equal(m.geometry_sha256,h.geometry_sha256);assert.equal(m.attributes_sha256,h.attributes_sha256);
    }
    return {artifact_sha256:sha256(artifact),manifest_sha256:sha256(manifestBytes),dataset_sha256:dataset.dataset_sha256,identity_geometry_sha256:dataset.identity_geometry_sha256,
      row_count:input.length,distinct_external_id_count:byId.size,membership_sha256:membershipSealV2(source,f.id,stored),eligibility_version:"curb-db-eligibility-v1",eligibility_state:"ELIGIBLE",eligible_row_count:input.length,ineligible_row_count:0,
      canonicalization_version:"curb-decimal-v2",snapshot_version:"curb-snapshot-v2",verifier_version:"curb-artifact-verify-v2"};
  }
  type Evidence=Awaited<ReturnType<typeof verify>>;
  const attest=(f:Fixture,e:unknown)=>`SELECT public.attest_city_parking_curb_snapshot_v2(${q(source)},${q(f.id)},${q(JSON.stringify(e))}::jsonb);`;
  const publish=(f:Fixture,predecessor:string|null)=>`SELECT public.publish_city_parking_curb_snapshot(${q(source)},${q(f.id)},${predecessor?q(predecessor):"NULL"});`;
  const validateV1=(f:Fixture,seal:string)=>`SELECT public.validate_city_parking_curb_snapshot(${q(source)},${q(f.id)},${q(f.record.manifest_sha256)},${q(seal)},'curb-artifact-verify-v1');`;

  // Preserve and exercise historical V1 after the complete 00001..00014 chain.
  const oldRows=[{globalid:"legacy-A",shape:{type:"LineString",coordinates:[[-122.4,37.7],[-122.399,37.701]]}}];
  const old=await create(await fixture({}, {},oldRows,true));
  for(const row of oldRows) {
    const h=v1.canonicalFeature(row),id=randomUUID();
    await db.sql(insert("city_parking_curb_versions",{id,source_id:source,...h,canonicalization_version:"curb-jcs-v1",geometry_presence:"VALUE",geometry_geojson:row.shape,raw_source:{globalid:row.globalid},geometry_state:"USABLE",validation_version:"curb-geometry-v1",validation_reasons:[]}));
    await db.sql(insert("city_parking_curb_snapshot_features",{snapshot_id:old.id,source_id:source,external_id:row.globalid,curb_version_id:id}));
  }
  const oldSeal=await db.sql(`SELECT curb_private.membership_seal(${q(old.id)});`);
  const oldValidated=await db.sql(validateV1(old,oldSeal),"curb_artifact_verifier");
  check("historical curb-jcs-v1 validates through preserved V1 path",()=>assert.equal(oldValidated,"VALIDATED"));
  check("historical V1 publication succeeds after 00014",()=>{});assert.equal(await db.sql(publish(old,null),"service_role"),"PUBLISHED");
  const oldState=await snapshot(old);
  await db.sql(`UPDATE public.city_parking_sources SET api_base_url='https://data.sf.gov/resource' WHERE id=${q(source)};`);
  const registry=await db.sql(`SELECT id::text||':'||source_key||':'||dataset_id||':'||api_base_url FROM public.city_parking_sources WHERE id=${q(source)};`);
  check("explicit local endpoint upgrade preserves logical source and V1 capture provenance",()=>assert.equal(registry,`${source}:datasf_citywide_curbs:pep9-66vw:https://data.sf.gov/resource`));
  assert.deepEqual(await snapshot(old),oldState);
  await rejected("logical dataset identity remains immutable",`UPDATE public.city_parking_sources SET dataset_id='other' WHERE id=${q(source)};`,"postgres","Cannot repurpose");
  await rejected("endpoint downgrade/unreviewed endpoint rejected",`UPDATE public.city_parking_sources SET api_base_url='https://data.sfgov.org/resource' WHERE id=${q(source)};`,"postgres","Unreviewed");
  const a=await stage(await create(await fixture()));const evidence=await verify(a),aMembers=await members(a);
  const dbSeal=await db.sql(`SELECT curb_private.membership_seal_v2(${q(a.id)});`);
  check("V2 seal TS/SQL agree; independent of enumeration; binds snapshot",()=>{
    assert.equal(dbSeal,evidence.membership_sha256);assert.equal(membershipSealV2(source,a.id,[...aMembers].reverse()),dbSeal);
    assert.notEqual(membershipSealV2(source,randomUUID(),aMembers),dbSeal);assert.notEqual(membershipSealV2(randomUUID(),a.id,aMembers),dbSeal);
  });
  for(const [name,changes] of [
    ["wrong dataset digest",{dataset_sha256:sha256("wrong")}],["wrong geometry digest",{identity_geometry_sha256:sha256("wrong")}],
    ["wrong membership seal",{membership_sha256:sha256("wrong")}],["wrong artifact digest",{artifact_sha256:sha256("wrong")}],
    ["wrong manifest digest",{manifest_sha256:sha256("wrong")}],["ineligible rows",{ineligible_row_count:1}],
    ["eligible count mismatch",{eligible_row_count:2}],["wrong row count",{row_count:2}],["wrong distinct count",{distinct_external_id_count:2}],
    ["unsupported verifier",{verifier_version:"unknown"}],["unsupported eligibility",{eligibility_version:"unknown"}],
    ["wrong attested canonicalization",{canonicalization_version:"curb-jcs-v1"}],["wrong attested snapshot version",{snapshot_version:"curb-snapshot-v1"}],
  ] as const)await rejected(name,attest(a,{...evidence,...changes}),"curb_artifact_verifier","V2 verifier evidence mismatch");
  const missingEligibility:Record<string,unknown>={...evidence};delete missingEligibility.eligibility_state;
  await rejected("missing eligibility result",attest(a,missingEligibility),"curb_artifact_verifier","evidence mismatch");
  await rejected("null attestation",attest(a,null),"curb_artifact_verifier","evidence mismatch");
  await rejected("publish without attestation/validation",publish(a,old.id),"service_role","must be VALIDATED");
  await rejected("V1 verifier API cannot validate V2",validateV1(a,dbSeal),"curb_artifact_verifier","V1 validation only");
  await rejected("service cannot self-attest",attest(a,evidence),"service_role","permission denied","42501");
  for(const role of ["anon","authenticated","public_only"] as const) {
    await rejected(`${role} denied attestation`,attest(a,evidence),role,"permission denied","42501");
    await rejected(`${role} denied publication`,publish(a,old.id),role,"permission denied","42501");
    await rejected(`${role} denied attestation read`,"SELECT * FROM public.city_parking_curb_attestations;",role,"permission denied","42501");
  }
  await rejected("verifier cannot stage",stageSql(a,rows[0]),"curb_artifact_verifier","permission denied","42501");
  await rejected("verifier cannot publish",publish(a,old.id),"curb_artifact_verifier","permission denied","42501");
  for(const role of ["service_role","curb_artifact_verifier"] as const)await rejected(`${role} cannot directly create attestation`,insert("city_parking_curb_attestations",{snapshot_id:a.id,source_id:source,verifier_identity:"forged",evidence}),role,"permission denied","42501");
  await rejected("verifier cannot alter membership",`DELETE FROM public.city_parking_curb_snapshot_features WHERE snapshot_id=${q(a.id)};`,"curb_artifact_verifier","permission denied","42501");
  await rejected("verifier cannot mutate historical versions",`UPDATE public.city_parking_curb_versions SET raw_source='{}';`,"curb_artifact_verifier","permission denied","42501");
  await rejected("service cannot set VALIDATED",`UPDATE public.city_parking_source_snapshots SET lifecycle='VALIDATED' WHERE id=${q(a.id)};`,"service_role","permission denied","42501");
  assert.equal(await db.sql(attest(a,evidence),"curb_artifact_verifier"),"VALIDATED");
  const attestation=JSON.parse(await db.sql(`SELECT to_jsonb(a)::text FROM public.city_parking_curb_attestations a WHERE snapshot_id=${q(a.id)};`,"curb_artifact_verifier"));
  const validated=await snapshot(a);
  check("independent replay then atomic immutable attestation + VALIDATED",()=>{
    assert.equal(attestation.verifier_identity,"curb_test_verifier");assert.equal(validated.artifact_verified_by,"curb_test_verifier");
    assert.equal(validated.artifact_verified_at,attestation.verified_at);assert.equal(validated.lifecycle,"VALIDATED");assert.deepEqual(attestation.evidence,evidence);
  });
  let before=await fingerprint();assert.equal(await db.sql(attest(a,evidence),"curb_artifact_verifier"),"ALREADY_VALIDATED");
  check("identical attestation/validation retry changes no rows or timestamps",()=>{});assert.equal(await fingerprint(),before);
  await rejected("membership frozen after attestation",stageSql(a,rows[0]),"service_role","must be STAGING");
  await rejected("owner cannot append frozen membership",insert("city_parking_curb_snapshot_features",{snapshot_id:a.id,source_id:source,external_id:aMembers[0].external_id,curb_version_id:aMembers[0].id}),"postgres","Membership is frozen");
  await rejected("immutable version protected after attestation",`UPDATE public.city_parking_curb_versions SET raw_source='{}' WHERE id=${q(aMembers[0].id)};`,"postgres","forbidden");
  for(const verb of ["UPDATE public.city_parking_curb_attestations SET evidence='{}'","DELETE FROM public.city_parking_curb_attestations","TRUNCATE public.city_parking_curb_attestations"])
    await rejected(`immutable attestation ${verb.split(" ")[0]} rejected`,verb+";","postgres","forbidden");
  assert.equal(await db.sql(publish(a,old.id),"service_role"),"PUBLISHED");
  check("synthetic 3-row V2 happy path reaches PUBLISHED",()=>{});
  before=await fingerprint();assert.equal(await db.sql(publish(a,old.id),"service_role"),"ALREADY_CURRENT");
  assert.equal(await db.sql(attest(a,evidence),"curb_artifact_verifier"),"ALREADY_VALIDATED");
  check("published validation/publication retries are no-ops",()=>{});assert.equal(await fingerprint(),before);
  check("V1 history remains unchanged after V2 publication",()=>{});assert.deepEqual(await snapshot(old),oldState);

  for(const [name,override,manifestChanges] of [
    ["unsupported canonicalization",{canonicalization_version:"curb-decimal-v1"},{}],
    ["V2 row with V1 manifest",{}, {format_version:"curb-snapshot-v1"}],
    ["unsupported snapshot version",{}, {format_version:"curb-snapshot-v99"}],
    ["V2 legacy capture endpoint",{}, {api_endpoint:"https://data.sfgov.org/resource/pep9-66vw.json"}],
  ] as const) {const f=await fixture(override,manifestChanges);await rejected(name,insert("city_parking_source_snapshots",f.record),"service_role","check constraint","23514");}
  const crossed=await create(await fixture({canonicalization_version:"curb-jcs-v1"}));
  await rejected("V1 row claiming V2 manifest cannot validate",validateV1(crossed,sha256("unused")),"curb_artifact_verifier","Manifest envelope mismatch");
  const incomplete=await stage(await create(await fixture()),rows.slice(0,2));
  await rejected("incomplete membership cannot attest",attest(incomplete,evidence),"curb_artifact_verifier","Incomplete V2 membership");
  const staleSeal=membershipSealV2(source,incomplete.id,await members(incomplete));await stage(incomplete,rows.slice(2));
  const freshEvidence=await verify(incomplete);
  await rejected("old prevalidation seal invalid after membership addition",attest(incomplete,{...freshEvidence,membership_sha256:staleSeal}),"curb_artifact_verifier","evidence mismatch");
  await rejected("another snapshot's seal cannot be replayed",attest(incomplete,{...freshEvidence,membership_sha256:dbSeal}),"curb_artifact_verifier","evidence mismatch");
  assert.equal(await db.sql(attest(incomplete,freshEvidence),"curb_artifact_verifier"),"VALIDATED");
  check("fresh re-verification after prevalidation change succeeds",()=>{});
  const failed=await stage(await create(await fixture()));const failedEvidence=await verify(failed);
  await db.sql(`SELECT public.fail_city_parking_curb_snapshot(${q(source)},${q(failed.id)},'synthetic failure');`,"service_role");
  await rejected("FAILED cannot attest",attest(failed,failedEvidence),"curb_artifact_verifier","requires STAGING");
  const unbound=await stage(await create(await fixture()));const unboundEvidence=await verify(unbound);
  await db.sql(`UPDATE public.city_parking_source_snapshots SET lifecycle='VALIDATED',membership_sha256=${q(unboundEvidence.membership_sha256)},artifact_verified_at=now(),validated_at=now(),artifact_verified_by='synthetic-owner-forged',artifact_verification_version='curb-artifact-verify-v2' WHERE id=${q(unbound.id)};`);
  await rejected("VALIDATED fields alone cannot replace independent attestation",publish(unbound,a.id),"service_role","Missing independent V2 attestation");
  const fake=await create(await fixture());
  const altered=jsonObject(parseSourceJson(canonicalJson(rows[0])));altered.large=parseSourceJson("9007199254740992");
  const h=canonicalFeature(rows[0]);
  await db.sql(`SELECT public.stage_city_parking_curb_version(${q(source)},${q(fake.id)},${q(h.external_id)},${q(canonicalJson(altered))},${q(h.geometry_sha256)},${q(h.attributes_sha256)},${q(sha256("synthetic dishonest hash"))},'curb-decimal-v2');`,"service_role");
  await stage(fake,rows.slice(1));
  await assert.rejects(()=>verify(fake));check("independent replay catches a stage caller's false payload/hash claim",()=>{});
  const corrupted=await stage(await create(await fixture()));await writeFile(corrupted.artifactPath,"[]");
  await assert.rejects(()=>verify(corrupted));check("retained-byte corruption rejects before attestation",()=>{});

  // Two independently verified publishers use the same expected predecessor.
  const b=await stage(await create(await fixture())),c=await stage(await create(await fixture()));
  await db.sql(attest(b,await verify(b)),"curb_artifact_verifier");await db.sql(attest(c,await verify(c)),"curb_artifact_verifier");
  const outcomes=await Promise.all([b,c].map(f=>db.raw(`BEGIN;${publish(f,a.id)} SELECT pg_sleep(0.2);COMMIT;`,"service_role")));
  check("two V2 publishers: one advancement, one stale predecessor",()=>{assert.equal(outcomes.filter(r=>r.code===0).length,1);assert(outcomes.find(r=>r.code!==0)?.error.includes("Stale publication predecessor"));});
  const winner=outcomes[0].code===0?b:c,loser=winner===b?c:b;
  assert.equal((await snapshot(winner)).lifecycle,"PUBLISHED");assert.equal((await snapshot(loser)).lifecycle,"VALIDATED");
  before=await fingerprint();assert.equal(await db.sql(publish(a,null),"service_role"),"ALREADY_PUBLISHED_NOT_CURRENT");
  check("retry old published V2 never rewinds pointer",()=>{});assert.equal(await fingerprint(),before);
  await rejected("stale predecessor rejects atomically",publish(incomplete,a.id),"service_role","Stale publication predecessor");
  await rejected("older validated capture cannot replace newer current",publish(incomplete,winner.id),"service_role","not newer");
  const privileges=await db.sql(`SELECT count(*) FROM pg_proc p CROSS JOIN LATERAL aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a
    WHERE p.oid IN ('public.attest_city_parking_curb_snapshot_v2(uuid,uuid,jsonb)'::regprocedure,'public.publish_city_parking_curb_snapshot(uuid,uuid,uuid)'::regprocedure)
    AND a.grantee=0 AND a.privilege_type='EXECUTE';`);
  check("PUBLIC has no attestation/publication execution",()=>assert.equal(privileges,"0"));
  const largeControl=await create(await fixture({row_count:18355},{summary:{...a.manifest.summary,count_before:18355,count_after:18355,row_count:18355,distinct_external_id_count:18355,usable_geometry_count:18355}}));
  check("18355-row V2/current-endpoint snapshot control envelope accepted",()=>{});
  await rejected("18355 control count alone cannot bypass full membership",attest(largeControl,{...evidence,row_count:18355,distinct_external_id_count:18355,eligible_row_count:18355}),"curb_artifact_verifier","Incomplete V2 membership");
}

async function legacyRegression(db:LocalDb) {
  const result=await new Promise<{code:number;out:string}>((resolve,reject)=>{
    const child=spawn(process.execPath,["--import","tsx","scripts/verify-curb-publication-db.ts",`--disposable-container=${db.container}`],{windowsHide:true,stdio:["ignore","pipe","pipe"]});
    let out="";child.stdout.on("data",b=>out+=b);child.stderr.on("data",b=>out+=b);child.on("error",reject);child.on("close",code=>resolve({code:code??-1,out}));
  });
  assert.equal(result.code,0,result.out.slice(-4000));const summary=result.out.match(/Curb DB behavior: \d+ checks passed\./)?.[0];assert(summary);console.log(summary);
}
async function main() {
  assert.deepEqual(process.argv.slice(2),["--local-disposable"],"Only --local-disposable; production pffznlpmgtrpsejayicj/hosted/existing targets refused");
  const root=resolve(tmpdir()),directory=await mkdtemp(join(root,"curb-v2-publication-"));
  try {
    await withPublicationDb(14,db=>tests(db,directory));
    // Historical test's direct INSERT grants intentionally apply at 00012 only;
    // 00013 removes those grants. Execute unchanged assertions at that checkpoint.
    await withPublicationDb(12,legacyRegression);
  } finally {
    assert.equal(dirname(resolve(directory)),root);assert(basename(directory).startsWith("curb-v2-publication-"));
    await rm(directory,{recursive:true,force:true});
  }
  console.log(`${checks} V2 publication checks passed; full 00001..00014 compiled; V1 checkpoint regression passed.`);
}
main().catch(e=>{console.error(e instanceof Error?e.message:"V2 publication verification failed");process.exitCode=1;});

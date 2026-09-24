/** Local object/recovery proof plus recording-fake AWS contract checks. No SDK or cloud calls. */
import assert from "node:assert/strict";
import { lstat, mkdir, mkdtemp, readFile, readdir, rm, unlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, join, relative, resolve } from "node:path";
import { canonicalJson, sha256 } from "./canonicalize-curb-snapshot";
import { checkKey, LocalArtifactStore, MAX_OBJECT_BYTES } from "./curb-artifact-store";
import { S3ArtifactStore, s3Config, S3Transport } from "./curb-s3-artifact-store";
import { packagePrefix, preparePackage, recoverPackage, uploadPreparedPackage } from "./verify-curb-artifact-recovery";
import { fixture } from "./verify-curb-snapshot-archive-tests";

async function main() {
  const root = await mkdtemp(join(tmpdir(), "curb-store-tests-"));
  const oldFetch = globalThis.fetch; globalThis.fetch = () => { throw new Error("Networking forbidden"); };
  let checks = 0, serial = 0;
  const pass = (name: string) => { checks++; console.log(`PASS ${name}`); };
  const fresh = () => LocalArtifactStore.create(join(root, `store-${serial++}`));
  const physical = (store: LocalArtifactStore, key: string) => {
    checkKey(key); const path = resolve(store.root, key + ".object");
    assert(!relative(store.root, path).startsWith("..")); return path;
  };
  const recoveryDirs = async () => (await readdir(tmpdir())).filter(name => name.startsWith("curb-recovery-")).sort();
  try {
    const store = await fresh(), bytes = Buffer.from("immutable exact bytes\n"), hash = sha256(bytes), key = "test/object.json";
    const put = await store.putImmutable(key, bytes, hash);
    assert.equal(put.protection, "LOCAL_ONLY"); assert.equal(put.version, hash); pass("local adapter explicitly lacks durable retention");
    assert.deepEqual(await store.head(put), put); pass("head returns byte length, checksum and stable version");
    assert.deepEqual(await store.get(put), bytes); await store.verifyChecksum(put, hash); pass("byte-perfect get and independent checksum verification");
    const modified = (await lstat(physical(store, key))).mtimeMs;
    assert.deepEqual(await store.putImmutable(key, bytes, hash), put); assert.equal((await lstat(physical(store, key))).mtimeMs, modified); pass("identical put is a no-op without replacement");
    await assert.rejects(() => store.putImmutable(key, Buffer.from("different"), sha256("different"))); assert.deepEqual(await store.get(put), bytes); pass("different content cannot overwrite same key");
    await assert.rejects(() => store.putImmutable("test/wrong", bytes, "0".repeat(64))); pass("incorrect upload checksum rejected");
    await assert.rejects(() => store.verifyChecksum(put, "0".repeat(64))); pass("incorrect expected read checksum rejected");
    await assert.rejects(() => store.get({ key, version: "0".repeat(64) })); pass("wrong version cannot resolve latest bytes");
    for (const invalid of ["../outside", "/absolute", "a//b", "a/../b", "a\\b", "c:/drive", "a/%2e%2e", "a/CON", "a/con.json", "a/end.", "Latest/data", "a?token=secret"]) {
      await assert.rejects(() => store.putImmutable(invalid, bytes, hash)); pass("unsafe/noncanonical key rejected");
    }
    const huge = Buffer.alloc(MAX_OBJECT_BYTES + 1); await assert.rejects(() => store.putImmutable("test/large", huge, sha256(huge))); pass("object size bound enforced before publication");
    const concurrent = await fresh();
    const result = await Promise.allSettled([concurrent.putImmutable(key, bytes, hash), concurrent.putImmutable(key, Buffer.from("other"), sha256("other"))]);
    assert.equal(result.filter(r => r.status === "fulfilled").length, 1); pass("concurrent conflicting publishers have exactly one winner");
    const identical = await fresh();
    const same = await Promise.all([identical.putImmutable(key, bytes, hash), identical.putImmutable(key, bytes, hash)]);
    assert.deepEqual(same[0], same[1]); pass("concurrent identical publishers safely converge");

    const archive = join(root, "archive"); await mkdir(archive); await mkdir(join(archive, "pages"));
    const f = fixture();
    for (const [path, b] of f.files) await writeFile(join(archive, path), b);
    const manifest = canonicalJson(f.manifest) + "\n";
    await writeFile(join(archive, "manifest.json"), manifest); await writeFile(join(archive, "manifest.sha256"), sha256(manifest) + "\n");
    const prepared = await preparePackage(archive);
    const expected = { artifactSha256: prepared.report.artifact_sha256, manifestSha256: prepared.report.manifest_sha256 };
    const roundtrip = await fresh(), receipt = await uploadPreparedPackage(roundtrip, prepared), before = await recoveryDirs();
    const recovered = await recoverPackage(roundtrip, receipt, expected);
    assert.equal(recovered.report.row_count, 1001); assert.equal(recovered.report.dataset_sha256, prepared.report.dataset_sha256);
    assert.equal(recovered.report.artifact_sha256, prepared.report.artifact_sha256); assert.equal(recovered.durable_cloud_retention_verified, false);
    assert.deepEqual(await recoveryDirs(), before); pass("synthetic multi-page full recovery passes and cleans only fresh materialization");
    for (const input of prepared.files) {
      const ref = receipt.objects.find(o => o.path === input.path)!;
      assert.deepEqual(Buffer.from(await roundtrip.get(ref)), input.bytes);
    }
    pass("all recovered objects byte-perfect, including manifest and metadata/counts");
    assert.equal(receipt.objects.at(-2)!.path, "manifest.json"); assert.equal(receipt.objects.at(-1)!.path, "manifest.sha256"); pass("raw evidence uploaded and verified before manifest");
    assert(!receipt.prefix.includes("latest") && !receipt.prefix.includes(prepared.report.dataset_sha256)); pass("package identity selects immutable historical namespace");
    const second = await uploadPreparedPackage(roundtrip, prepared); assert.deepEqual(second, receipt); pass("entire package upload retry is idempotent");
    const badRecovery = async (name: string, mutate: (s: LocalArtifactStore, r: typeof receipt) => Promise<void>) => {
      const s = await fresh(), r = await uploadPreparedPackage(s, prepared), dirs = await recoveryDirs();
      await mutate(s, r); await assert.rejects(() => recoverPackage(s, r, expected));
      assert.deepEqual(await recoveryDirs(), dirs); pass(name + "; no leaked recovery directory");
    };
    await badRecovery("missing page rejected", async (s, r) => { await unlink(physical(s, r.objects.find(o => o.path === "pages/000000.json")!.key)); });
    await badRecovery("corrupt page rejected", async (s, r) => {
      const path = physical(s, r.objects.find(o => o.path === "pages/000000.json")!.key), raw = await readFile(path); raw[raw.length - 3] ^= 1; await writeFile(path, raw);
    });
    await badRecovery("wrong manifest rejected", async (s, r) => {
      const path = physical(s, r.objects.find(o => o.path === "manifest.json")!.key), raw = await readFile(path); raw[raw.length - 3] ^= 1; await writeFile(path, raw);
    });
    await badRecovery("partial package rejected", async (s, r) => { await unlink(physical(s, r.objects.find(o => o.path === "metadata-after.json")!.key)); });
    await badRecovery("stale checksum metadata rejected", async (s, r) => {
      const ref = r.objects.find(o => o.path === "pages/000000.json")!, path = physical(s, ref.key), raw = await readFile(path);
      await writeFile(path, Buffer.concat([Buffer.from(JSON.stringify({ bytes: ref.bytes, sha256: "0".repeat(64) }) + "\n"), raw.subarray(raw.indexOf(10) + 1)]));
    });
    await badRecovery("receipt omitting a page rejected by full verifier", async (_s, r) => { r.objects = r.objects.filter(o => o.path !== "pages/000000.json"); });
    await badRecovery("receipt traversal rejected before any retrieval", async (_s, r) => { r.objects[0].path = "../escape"; });
    await badRecovery("receipt key rebinding rejected", async (_s, r) => { r.objects[0].key = "another/package"; });
    await badRecovery("duplicate receipt member rejected", async (_s, r) => { r.objects.push(r.objects[0]); });
    await badRecovery("forged self-consistent remote manifest fails trusted anchor", async (s, r) => {
      const ref = r.objects.find(o => o.path === "manifest.json")!, path = physical(s, ref.key);
      const changed = Buffer.from(manifest.replace("curb-capture-v2", "curb-capture-v3")), newHash = sha256(changed);
      await writeFile(path, Buffer.concat([Buffer.from(JSON.stringify({ bytes: changed.length, sha256: newHash }) + "\n"), changed]));
      ref.sha256 = newHash; ref.version = newHash; ref.bytes = changed.length;
    });
    await assert.rejects(() => recoverPackage(roundtrip, receipt, { ...expected, artifactSha256: "0".repeat(64) })); pass("external expected package digest required");

    // AWS recording fake. No default credential chain or cloud endpoint exists in this program.
    const env = { CURB_ARTIFACT_S3_BUCKET: "synthetic-curb-test", CURB_ARTIFACT_S3_REGION: "us-west-2", CURB_ARTIFACT_S3_OWNER: "000000000000",
      CURB_ARTIFACT_RETAIN_UNTIL: new Date(Date.now() + 365 * 86400_000).toISOString() };
    assert.throws(() => s3Config({}), /Missing CURB_ARTIFACT_S3_BUCKET/); pass("S3 missing configuration fails closed without credential lookup");
    assert.throws(() => s3Config({ ...env, CURB_ARTIFACT_RETAIN_UNTIL: "2000-01-01T00:00:00.000Z" })); pass("expired retention configuration rejected");
    const calls: Parameters<S3Transport["put"]>[0][] = [];
    let saved: Parameters<S3Transport["put"]>[0] | undefined, override: Record<string, unknown> = {}, corruptGet = false;
    const fake: S3Transport = {
      async put(request) { calls.push(request); if (saved) throw { code: "PRECONDITION_FAILED" }; saved = request; return { VersionId: "version-1" }; },
      async head() { assert(saved); return { ContentLength: saved.Body.length, ChecksumSHA256: saved.ChecksumSHA256, VersionId: "version-1",
        ObjectLockMode: "COMPLIANCE", ObjectLockRetainUntilDate: env.CURB_ARTIFACT_RETAIN_UNTIL, ...override }; },
      async get(request) { assert.equal(request.VersionId, "version-1"); assert(saved); return corruptGet ? Buffer.from("corrupt") : saved.Body; },
    };
    const s3 = new S3ArtifactStore(env, fake), s3key = `${packagePrefix(hash)}/archive/manifest.json`;
    const s3ref = await s3.putImmutable(s3key, bytes, hash);
    assert.equal(calls[0].IfNoneMatch, "*"); assert.equal(calls[0].ObjectLockMode, "COMPLIANCE"); assert.equal(calls[0].ExpectedBucketOwner, env.CURB_ARTIFACT_S3_OWNER);
    assert.equal(calls[0].ServerSideEncryption, "AES256"); assert.equal(calls[0].ChecksumSHA256, Buffer.from(hash, "hex").toString("base64"));
    assert(!Object.hasOwn(calls[0], "ACL")); pass("S3 skeleton requests conditional creation, exact checksum, retention, owner and private-default encryption");
    assert.deepEqual(await s3.putImmutable(s3key, bytes, hash), s3ref); pass("S3 412 requires verified identical retained version before no-op");
    await assert.rejects(() => s3.putImmutable(s3key, Buffer.from("conflict"), sha256("conflict"))); pass("S3 412 with different bytes fails");
    await s3.verifyChecksum(s3ref, hash); pass("S3 checksum verification GETs pinned version");
    await assert.rejects(() => s3.putImmutable("latest/manifest.json", bytes, hash)); pass("S3 writes outside immutable curb namespace rejected");
    for (const bad of [{ VersionId: "null" }, { ObjectLockMode: "GOVERNANCE" }, { ObjectLockRetainUntilDate: "2000-01-01T00:00:00.000Z" },
      { ChecksumSHA256: "missing" }, { ContentLength: MAX_OBJECT_BYTES + 1 }]) {
      override = bad; await assert.rejects(() => s3.head(s3ref)); pass("S3 incomplete version/checksum/retention evidence fails closed");
    }
    override = {}; corruptGet = true; await assert.rejects(() => s3.get(s3ref)); pass("S3 advertised checksum cannot hide corrupted response bytes");
    console.log(`${checks} artifact-store/recovery checks passed; local files and recording fake only; zero cloud/DB requests.`);
  } finally {
    globalThis.fetch = oldFetch;
    assert.equal(dirname(resolve(root)), resolve(tmpdir())); assert(basename(root).startsWith("curb-store-tests-"));
    await rm(root, { recursive: true, force: true });
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });

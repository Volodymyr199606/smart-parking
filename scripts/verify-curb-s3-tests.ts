/** No network: command-level S3 fake plus real SDK serialization into an in-memory HTTP handler. */
import assert from "node:assert/strict";
import { access, mkdir, mkdtemp, readFile, rm } from "node:fs/promises";
import { basename, dirname, join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { Readable } from "node:stream";
import { S3Client } from "@aws-sdk/client-s3";
import { sha256 } from "./canonicalize-curb-snapshot";
import { MAX_OBJECT_BYTES } from "./curb-artifact-store";
import { BLOCKED_SUPABASE_PROJECT, s3Config, S3ArtifactStore } from "./curb-s3-artifact-store";
import { AwsSdkS3Transport, BucketControls } from "./curb-s3-sdk-transport";
import { cloudReadback, CloudReceipt, makeCloudSynthetic, runCloudCommand } from "./verify-curb-artifact-cloud";
import { preparePackage } from "./verify-curb-artifact-recovery";

const env = { CURB_ARTIFACT_S3_BUCKET: "synthetic-curb-test", CURB_ARTIFACT_S3_REGION: "us-west-2", CURB_ARTIFACT_S3_OWNER: "000000000000",
  CURB_ARTIFACT_RETAIN_UNTIL: new Date(Date.now() + 365 * 86400_000).toISOString(), CURB_ARTIFACT_MIN_RETENTION_DAYS: "7" };
const goodControls: BucketControls = { region: "us-west-2", versioning: "Enabled", objectLock: "Enabled", retentionMode: "COMPLIANCE", retentionDays: 365,
  publicAccessBlocked: true, ownerEnforced: true, encryption: "AES256", enabledLifecycleRules: 0 };
type FakeObject = { bytes: Buffer; version: string; sha: string; retain: Date; modified: Date };
class FakeS3 {
  objects = new Map<string, FakeObject>(); commands: string[] = []; putAttempts = 0; getAttempts = 0;
  controls = { ...goodControls }; headOverride: Record<string, unknown> = {}; getVersion: string | undefined;
  missingUploadVersion = false; failPutAt = Infinity; failGetAfter = Infinity; corrupt = false; lieLength = false;
  client = { send: async (command: { constructor: { name: string }; input: any }) => {
    const name = command.constructor.name, i = command.input; this.commands.push(name);
    assert.equal(i.Bucket, env.CURB_ARTIFACT_S3_BUCKET); assert.equal(i.ExpectedBucketOwner, env.CURB_ARTIFACT_S3_OWNER);
    const c = this.controls;
    switch (name) {
      case "GetBucketLocationCommand": return { LocationConstraint: c.region };
      case "GetBucketVersioningCommand": return { Status: c.versioning };
      case "GetObjectLockConfigurationCommand": return { ObjectLockConfiguration: { ObjectLockEnabled: c.objectLock,
        Rule: { DefaultRetention: { Mode: c.retentionMode, ...(c.retentionDays !== undefined ? { Days: c.retentionDays } : {}), ...(c.retentionYears !== undefined ? { Years: c.retentionYears } : {}) } } } };
      case "GetPublicAccessBlockCommand": return { PublicAccessBlockConfiguration: { BlockPublicAcls: c.publicAccessBlocked, IgnorePublicAcls: c.publicAccessBlocked, BlockPublicPolicy: c.publicAccessBlocked, RestrictPublicBuckets: c.publicAccessBlocked } };
      case "GetBucketOwnershipControlsCommand": return { OwnershipControls: { Rules: [{ ObjectOwnership: c.ownerEnforced ? "BucketOwnerEnforced" : "ObjectWriter" }] } };
      case "GetBucketEncryptionCommand": return { ServerSideEncryptionConfiguration: { Rules: [{ ApplyServerSideEncryptionByDefault: { SSEAlgorithm: c.encryption } }] } };
      case "GetBucketLifecycleConfigurationCommand": return { Rules: Array.from({ length: c.enabledLifecycleRules }, () => ({ Status: "Enabled" })) };
      case "PutObjectCommand": {
        this.putAttempts++; if (this.putAttempts === this.failPutAt) throw { $metadata: { httpStatusCode: 503 } };
        assert.equal(i.IfNoneMatch, "*"); assert.equal(i.ContentLength, i.Body.length); assert.equal(i.ObjectLockMode, "COMPLIANCE");
        assert.equal(i.ServerSideEncryption, "AES256"); assert.equal(i.StorageClass, "STANDARD"); assert(!i.ACL);
        if (this.objects.has(i.Key)) throw { $metadata: { httpStatusCode: 412 } };
        assert.equal(Buffer.from(i.ChecksumSHA256, "base64").toString("hex"), sha256(i.Body));
        const version = `version-${this.objects.size + 1}`;
        this.objects.set(i.Key, { bytes: Buffer.from(i.Body), version, sha: i.ChecksumSHA256, retain: i.ObjectLockRetainUntilDate, modified: new Date() });
        return this.missingUploadVersion ? {} : { VersionId: version };
      }
      case "HeadObjectCommand": {
        const o = this.objects.get(i.Key); if (!o || (i.VersionId && i.VersionId !== o.version)) throw { $metadata: { httpStatusCode: 404 } };
        assert.equal(i.ChecksumMode, "ENABLED");
        return { ContentLength: o.bytes.length, VersionId: o.version, ChecksumSHA256: o.sha, ChecksumType: "FULL_OBJECT", ObjectLockMode: "COMPLIANCE",
          ObjectLockRetainUntilDate: o.retain, LastModified: o.modified, ContentType: "application/json", ServerSideEncryption: "AES256", ETag: '"not-sha256"', ...this.headOverride };
      }
      case "GetObjectCommand": {
        this.getAttempts++; if (this.getAttempts > this.failGetAfter) throw new Error("Synthetic failed recovery");
        const o = this.objects.get(i.Key); if (!o || i.VersionId !== o.version) throw { $metadata: { httpStatusCode: 404 } };
        const bytes = Buffer.from(o.bytes); if (this.corrupt) bytes[0] ^= 1;
        return { VersionId: this.getVersion ?? o.version, ContentLength: this.lieLength ? bytes.length + 1 : bytes.length, Body: Readable.from([bytes]) };
      }
      default: throw new Error("Unexpected AWS command");
    }
  }, destroy() {} } as unknown as S3Client;
  transport(access: "UPLOAD" | "READ_ONLY" = "UPLOAD") { return new AwsSdkS3Transport(this.client, s3Config(env), access); }
}

async function main() {
  const root = await mkdtemp(join(tmpdir(), "curb-s3-tests-")); let checks = 0, serial = 0;
  const pass = (name: string) => { checks++; console.log(`PASS ${name}`); };
  const exists = async (path: string) => access(path).then(() => true, () => false);
  const restore: (() => void)[] = [], oldFetch = globalThis.fetch;
  globalThis.fetch = () => { throw new Error("NETWORK FORBIDDEN"); }; restore.push(() => { globalThis.fetch = oldFetch; });
  for (const [module, methods] of [["node:http", ["request", "get"]], ["node:https", ["request", "get"]], ["node:net", ["connect", "createConnection"]], ["node:tls", ["connect"]]] as const) {
    const api = require(module); for (const method of methods) { const old = api[method]; api[method] = () => { throw new Error("NETWORK FORBIDDEN"); }; restore.push(() => { api[method] = old; }); }
  }
  try {
    const archive = join(root, "synthetic"); await makeCloudSynthetic(archive);
    const p = await preparePackage(archive); assert.equal(p.report.row_count, 2); assert.equal(p.files.length, 7); pass("fixed tiny synthetic archive passes full verification");
    const noFactory = () => { throw new Error("Plan attempted client/credential construction"); };
    const protectedEnv = { ...env }; Object.defineProperty(protectedEnv, "AWS_SECRET_ACCESS_KEY", { get() { throw new Error("Credential value inspected"); } });
    const plan: any = await runCloudCommand([`--archive=${archive}`], protectedEnv, noFactory);
    assert.equal(plan.cloud_requests, 0); assert.equal(plan.object_count, 7); assert.equal(plan.target.bucket, env.CURB_ARTIFACT_S3_BUCKET); pass("plan is offline and does not inspect credential values");
    for (const args of [[`--archive=${archive}`, "--execute-cloud"], [`--archive=${archive}`, "--ack=UPLOAD_SYNTHETIC_ONLY"],
      [`--archive=${archive}`, "--execute-cloud", "--ack=wrong", `--out=${root}/never`], [`--archive=${archive}`, "--execute-cloud", "--execute-cloud"]]) {
      await assert.rejects(() => runCloudCommand(args, env, noFactory)); pass("missing/invalid/duplicate execution gate fails before factory");
    }
    assert.throws(() => s3Config({ ...env, CURB_ARTIFACT_S3_BUCKET: BLOCKED_SUPABASE_PROJECT }));
    for (const endpoint of [`https://${BLOCKED_SUPABASE_PROJECT}.supabase.co`, "https://example.com", "http://localhost:9000", "http://127.0.0.1:9000/?token=value"]) {
      assert.throws(() => s3Config({ ...env, CURB_ARTIFACT_S3_ENDPOINT: endpoint })); pass("production/unreviewed endpoint hard-blocked");
    }
    assert.equal(s3Config({ ...env, CURB_ARTIFACT_S3_ENDPOINT: "http://127.0.0.1:9000" }).endpoint, "http://127.0.0.1:9000"); pass("explicit loopback-only compatibility endpoint supported");
    const altered = join(root, "altered"); await makeCloudSynthetic(altered);
    // Still a valid full archive, but byte identity differs from the accepted synthetic fixture.
    const { readFile: read, writeFile: write } = await import("node:fs/promises");
    const m = JSON.parse(await read(join(altered, "manifest.json"), "utf8")); m.node_version = "changed";
    const text = JSON.stringify(m) + "\n"; await write(join(altered, "manifest.json"), text); await write(join(altered, "manifest.sha256"), sha256(text) + "\n");
    await assert.rejects(() => runCloudCommand([`--archive=${altered}`, "--execute-cloud", "--ack=UPLOAD_SYNTHETIC_ONLY", `--out=${root}/never`], env, noFactory), /exact generated synthetic/);
    pass("arbitrary/real archive cannot become first upload by claiming synthetic");
    const argsFor = (out: string) => [`--archive=${archive}`, "--execute-cloud", "--ack=UPLOAD_SYNTHETIC_ONLY", `--out=${out}`];
    const fake = new FakeS3(), out = join(root, "success");
    const receipt = await runCloudCommand(argsFor(out), env, (_c, a) => fake.transport(a)) as CloudReceipt;
    assert.equal(receipt.state, "RECOVERY_VERIFIED"); assert.equal(receipt.recovery?.row_count, 2); assert.equal(receipt.object_count, 7);
    assert.equal(receipt.cloud_retention_accepted, false); assert.equal(receipt.independent_verification_required, true); pass("complete mocked cloud upload/recovery finalizes bounded receipt without independence claim");
    assert(receipt.objects.every(o => o.versionId && o.expected_sha256 === o.confirmed_sha256 && o.uploaded_at && o.retention_mode === "COMPLIANCE")); pass("receipt binds provider target, pinned versions, exact checksums, sizes and server retention timestamps");
    const keys = [...fake.objects.keys()]; assert(keys.at(-2)!.endsWith("/manifest.json") && keys.at(-1)!.endsWith("/manifest.sha256")); pass("raw/checksum confirmations precede manifest upload");
    assert(fake.commands.slice(0, 7).every(n => n.startsWith("Get") && n !== "GetObjectCommand")); pass("all bucket controls read before first write");
    const again = await runCloudCommand(argsFor(join(root, "retry")), env, () => fake.transport()) as CloudReceipt;
    assert.equal(fake.objects.size, 7); assert.deepEqual(again.objects, receipt.objects); pass("identical cloud retry preserves object versions and upload timestamps");
    const s3 = new S3ArtifactStore(env, fake.transport());
    await assert.rejects(() => s3.putImmutable(keys[0], Buffer.from("different"), sha256("different"))); pass("412 conflict with different bytes fails atomically");
    for (const change of [{ versioning: "Suspended" }, { objectLock: "" }, { retentionMode: "GOVERNANCE" }, { retentionDays: 1 },
      { publicAccessBlocked: false }, { ownerEnforced: false }, { encryption: "aws:kms" }, { enabledLifecycleRules: 1 }, { region: "us-east-1" }]) {
      const bad = new FakeS3(); Object.assign(bad.controls, change); const dir = join(root, `controls-${serial++}`);
      await assert.rejects(() => runCloudCommand(argsFor(dir), env, () => bad.transport()));
      assert.equal(bad.putAttempts, 0); assert.equal(await exists(join(dir, "receipt.json")), false); pass("unproven bucket control fails before any object PUT");
    }
    const short = { ...env, CURB_ARTIFACT_RETAIN_UNTIL: new Date(Date.now() + 86400_000).toISOString() }, shortFake = new FakeS3();
    for (const lifecycle of [{}, { Rules: [{ Status: "Unknown" }] }]) {
      const bad = new FakeS3(), send = bad.client.send.bind(bad.client);
      bad.client.send = ((command: any) => command.constructor.name === "GetBucketLifecycleConfigurationCommand" ? Promise.resolve(lifecycle) : send(command)) as typeof bad.client.send;
      await assert.rejects(() => runCloudCommand(argsFor(join(root, `unknown-lifecycle-${serial++}`)), env, () => bad.transport()));
      assert.equal(bad.putAttempts, 0); pass("unknown lifecycle configuration fails before PUT");
    }
    await assert.rejects(() => runCloudCommand(argsFor(join(root, "short")), short, () => shortFake.transport())); assert.equal(shortFake.putAttempts, 0); pass("explicit object horizon must meet minimum retention days");
    for (const test of ["missing-version", "partial-upload", "failed-recovery"] as const) {
      const bad = new FakeS3(); if (test === "missing-version") bad.missingUploadVersion = true;
      if (test === "partial-upload") bad.failPutAt = 3;
      if (test === "failed-recovery") bad.failGetAfter = p.files.length * 2;
      const dir = join(root, test); await assert.rejects(() => runCloudCommand(argsFor(dir), env, () => bad.transport()));
      assert.equal(await exists(join(dir, "receipt.json")), false);
      if (test === "failed-recovery") assert.equal(JSON.parse(await readFile(join(dir, "preliminary-receipt.json"), "utf8")).state, "UPLOADED_UNVERIFIED");
      pass(`${test}: no premature RECOVERY_VERIFIED receipt`);
    }
    for (const override of [{ VersionId: "null" }, { ChecksumSHA256: Buffer.alloc(32).toString("base64") }, { ObjectLockMode: "GOVERNANCE" },
      { ObjectLockRetainUntilDate: new Date(Date.now() + 86400_000) }, { ChecksumType: "COMPOSITE" }]) {
      fake.headOverride = override; await assert.rejects(() => s3.get(receipt.transfer.objects[0])); pass("object metadata/checksum/retention failure rejects read");
    }
    fake.headOverride = {};
    for (const mode of ["missing", "corrupt", "wrong-version", "truncated"] as const) {
      const ref = receipt.transfer.objects[0], saved = fake.objects.get(ref.key)!;
      if (mode === "missing") fake.objects.delete(ref.key);
      if (mode === "corrupt") fake.corrupt = true;
      if (mode === "wrong-version") fake.getVersion = "wrong";
      if (mode === "truncated") fake.lieLength = true;
      await assert.rejects(() => cloudReadback(receipt, { artifactSha256: receipt.package_sha256, manifestSha256: receipt.manifest_sha256 }, env, fake.transport("READ_ONLY")));
      fake.objects.set(ref.key, saved); fake.corrupt = false; fake.getVersion = undefined; fake.lieLength = false; pass(`version-pinned recovery rejects ${mode} object`);
    }
    const beforePuts = fake.putAttempts;
    await runCloudCommand([`--verify-receipt=${out}/receipt.json`, "--execute-cloud-read", "--ack=READ_ONLY_RECOVERY", `--out=${root}/reader`,
      `--expected-artifact-sha256=${receipt.package_sha256}`, `--expected-manifest-sha256=${receipt.manifest_sha256}`], env, (_c, a) => { assert.equal(a, "READ_ONLY"); return fake.transport(a); });
    assert.equal(fake.putAttempts, beforePuts); pass("separate read-only command performs recovery without PUTs");
    const reader = new S3ArtifactStore(env, fake.transport("READ_ONLY")); await assert.rejects(() => reader.putImmutable(keys[0], Buffer.from("x"), sha256("x")));
    assert.equal(fake.putAttempts, beforePuts); pass("read-only transport blocks even a direct upload call");

    // Actual modular SDK builds/signs requests into a fake handler: no sockets, credential files, STS or metadata endpoints.
    const wireCalls: any[] = [], bytes = Buffer.from("wire fixture");
    const client = new S3Client({ region: env.CURB_ARTIFACT_S3_REGION, endpoint: "https://s3.us-west-2.amazonaws.com", forcePathStyle: true,
      maxAttempts: 1, credentials: { accessKeyId: "LOCAL_TEST_ONLY", secretAccessKey: "LOCAL_TEST_ONLY" },
      requestHandler: { async handle(request: any) {
        wireCalls.push(request);
        if (request.method === "PUT") return { response: { statusCode: 200, headers: { "x-amz-version-id": "wire-version" }, body: Readable.from([]) } };
        return { response: { statusCode: 200, headers: { "x-amz-version-id": "wire-version", "content-length": String(bytes.length),
          "x-amz-checksum-sha256": Buffer.from(sha256(bytes), "hex").toString("base64"), "x-amz-checksum-type": "FULL_OBJECT",
          "x-amz-object-lock-mode": "COMPLIANCE", "x-amz-object-lock-retain-until-date": env.CURB_ARTIFACT_RETAIN_UNTIL,
          "last-modified": new Date().toUTCString(), "content-type": "application/json", "x-amz-server-side-encryption": "AES256", etag: '"not-a-sha256"' },
          body: Readable.from(request.method === "GET" ? [bytes] : []) } };
      } } });
    try {
      const wireStore = new S3ArtifactStore(env, new AwsSdkS3Transport(client, s3Config(env), "UPLOAD"));
      const ref = await wireStore.putImmutable(keys[0], bytes, sha256(bytes)); await wireStore.verifyChecksum(ref, sha256(bytes));
      const put = wireCalls.find(c => c.method === "PUT");
      assert.equal(put.headers["if-none-match"], "*"); assert.equal(put.headers["content-length"], String(bytes.length));
      assert.equal(put.headers["x-amz-expected-bucket-owner"], env.CURB_ARTIFACT_S3_OWNER);
      assert.equal(put.headers["x-amz-object-lock-mode"], "COMPLIANCE"); assert.equal(put.headers["x-amz-checksum-sha256"], Buffer.from(sha256(bytes), "hex").toString("base64"));
      assert(wireCalls.filter(c => c.method === "GET" || c.method === "HEAD").every(c => c.query.versionId === "wire-version"));
      pass("real AWS SDK serializes conditional/checksum/owner/retention headers and pinned reads into fake HTTP only");
      assert.equal(ref.etag, '"not-a-sha256"'); assert.equal(ref.sha256, sha256(bytes)); pass("ETag remains descriptive, never SHA-256 authority");
    } finally { client.destroy(); }
    console.log(`${checks} S3 mocked checks passed; networking blocked; no credential values inspected; no cloud calls/writes.`);
  } finally {
    restore.reverse().forEach(f => f());
    assert.equal(dirname(resolve(root)), resolve(tmpdir())); assert(basename(root).startsWith("curb-s3-tests-")); await rm(root, { recursive: true, force: true });
  }
}
main().catch(error => { console.error(error instanceof Error ? error.message : "S3 mock verification failed"); process.exitCode = 1; });

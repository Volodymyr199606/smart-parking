/** Offline plan by default. Cloud acceptance is synthetic-only and explicitly gated. */
import { lstat, mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { canonicalJson, sha256 } from "./canonicalize-curb-snapshot";
import { blockProductionTarget, s3Config, S3ArtifactStore, S3Config } from "./curb-s3-artifact-store";
import { acceptancePolicy, AcceptanceTransport, assertBucketControls, createAwsTransport } from "./curb-s3-sdk-transport";
import { preparePackage, recoverPackage, PackageReceipt, uploadPreparedPackage } from "./verify-curb-artifact-recovery";
import { fixture } from "./verify-curb-snapshot-archive-tests";

export function syntheticCloudFiles() {
  const rows = [0, 1].map(i => `{"globalid":"curb-cloud-acceptance-v1-${i}","shape":{"type":"LineString","coordinates":[[-122.37952207229336,37.732536608656226],[-122.37952207229335,37.743691137180925]]}}`);
  const f = fixture(rows);
  f.manifest.node_version = "synthetic-fixture-v1"; f.manifest.test_fixture = "curb-cloud-acceptance-v1";
  const manifest = canonicalJson(f.manifest) + "\n";
  f.files.set("manifest.json", Buffer.from(manifest)); f.files.set("manifest.sha256", Buffer.from(sha256(manifest) + "\n"));
  return f.files;
}
export async function makeCloudSynthetic(directory: string) {
  blockProductionTarget(directory); await mkdir(directory); await mkdir(join(directory, "pages"));
  for (const [name, bytes] of syntheticCloudFiles()) await writeFile(join(directory, name), bytes, { flag: "wx" });
}
function requireSynthetic(p: Awaited<ReturnType<typeof preparePackage>>) {
  const expected = syntheticCloudFiles();
  if (p.files.length !== expected.size || !p.files.every(f => expected.get(f.path)?.equals(f.bytes))) throw new Error("First cloud acceptance permits only the exact generated synthetic archive; real archives are blocked");
}
type CloudObject = { provider: "AWS_S3"; bucket: string; region: string; key: string; versionId: string; byteLength: number;
  expected_sha256: string; confirmed_sha256: string; retention_mode: "COMPLIANCE"; retain_until: string; uploaded_at: string; etag?: string };
export type CloudReceipt = { contract: "curb-cloud-receipt-v1"; purpose: "SYNTHETIC_ACCEPTANCE"; state: "UPLOADED_UNVERIFIED" | "RECOVERY_VERIFIED";
  target: { bucket: string; region: string; owner: string; endpoint: string }; package_sha256: string; manifest_sha256: string;
  object_count: number; objects: CloudObject[]; transfer: PackageReceipt; bucket_controls: Awaited<ReturnType<AcceptanceTransport["inspectBucket"]>>;
  verification_context: "UPLOADER_SELF_READBACK"; independent_verification_required: true; cloud_retention_accepted: false;
  recovery?: { status: "PASS"; row_count: number; dataset_sha256: string; identity_geometry_sha256: string; verified_at: string } };
const target = (c: S3Config) => ({ bucket: c.bucket, region: c.region, owner: c.owner, endpoint: c.endpoint ?? "AWS_REGIONAL" });
async function record(out: string, file: string, value: unknown) {
  const bytes = canonicalJson(value) + "\n";
  if (Buffer.byteLength(bytes) > 1024 * 1024) throw new Error("Cloud report exceeds bound");
  await writeFile(join(out, file), bytes, { flag: "wx", mode: 0o600 });
}
export async function cloudUpload(p: Awaited<ReturnType<typeof preparePackage>>, env: Readonly<Record<string, string | undefined>>,
  transport: AcceptanceTransport, out: string): Promise<CloudReceipt> {
  requireSynthetic(p);
  const config = s3Config(env), policy = acceptancePolicy(env), store = new S3ArtifactStore(env, transport);
  await mkdir(out); let stage = "BUCKET_ACCEPTANCE";
  try {
    const controls = await transport.inspectBucket(); assertBucketControls(controls, config, policy);
    await record(out, "bucket-controls.json", controls);
    stage = "UPLOADING";
    const transfer = await uploadPreparedPackage(store, p), objects: CloudObject[] = [];
    for (const f of transfer.objects) {
      const h = await store.head(f);
      if (!h.lastModified || !Number.isFinite(Date.parse(h.lastModified)) || h.sha256 !== f.sha256 || h.bytes !== f.bytes || h.serverSideEncryption !== "AES256") throw new Error("Incomplete cloud receipt evidence");
      objects.push({ provider: "AWS_S3", bucket: config.bucket, region: config.region, key: f.key, versionId: f.version, byteLength: f.bytes,
        expected_sha256: f.sha256, confirmed_sha256: h.sha256, retention_mode: "COMPLIANCE", retain_until: h.retainUntil!,
        uploaded_at: h.lastModified, ...(h.etag ? { etag: h.etag } : {}) });
    }
    const receipt: CloudReceipt = { contract: "curb-cloud-receipt-v1", purpose: "SYNTHETIC_ACCEPTANCE", state: "UPLOADED_UNVERIFIED",
      target: target(config), package_sha256: p.report.artifact_sha256, manifest_sha256: p.report.manifest_sha256,
      object_count: objects.length, objects, transfer, bucket_controls: controls, verification_context: "UPLOADER_SELF_READBACK",
      independent_verification_required: true, cloud_retention_accepted: false };
    await record(out, "preliminary-receipt.json", receipt); stage = "RECOVERING";
    const recovered = await recoverPackage(store, transfer, { artifactSha256: p.report.artifact_sha256, manifestSha256: p.report.manifest_sha256 });
    // Recheck controls after replay; same-process readback never becomes independent acceptance.
    assertBucketControls(await transport.inspectBucket(), config, policy);
    const final: CloudReceipt = { ...receipt, state: "RECOVERY_VERIFIED", recovery: { status: "PASS", row_count: recovered.report.row_count,
      dataset_sha256: recovered.report.dataset_sha256, identity_geometry_sha256: recovered.report.identity_geometry_sha256, verified_at: recovered.report.verified_at } };
    await record(out, "receipt.json", final); return final;
  } catch {
    await record(out, "failure.json", { status: "FAIL", stage, retention_ready: false });
    throw new Error("Cloud acceptance failed; no successful final receipt");
  }
}
async function readCloudReceipt(path: string): Promise<CloudReceipt> {
  const stat = await lstat(path);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 1024 * 1024) throw new Error("Invalid receipt file");
  return JSON.parse(await readFile(path, "utf8")); // Bounded control metadata; no source numerics.
}
export async function cloudReadback(receipt: CloudReceipt, expected: { artifactSha256: string; manifestSha256: string },
  env: Readonly<Record<string, string | undefined>>, transport: AcceptanceTransport) {
  const config = s3Config(env), policy = acceptancePolicy(env);
  if (receipt.contract !== "curb-cloud-receipt-v1" || receipt.state !== "RECOVERY_VERIFIED" || receipt.purpose !== "SYNTHETIC_ACCEPTANCE"
    || canonicalJson(receipt.target) !== canonicalJson(target(config)) || receipt.package_sha256 !== expected.artifactSha256 || receipt.manifest_sha256 !== expected.manifestSha256
    || !Array.isArray(receipt.objects) || receipt.objects.length !== receipt.object_count || receipt.object_count !== receipt.transfer.objects.length || receipt.object_count > 107
    || receipt.transfer.artifact_sha256 !== expected.artifactSha256 || receipt.transfer.manifest_sha256 !== expected.manifestSha256) throw new Error("Cloud receipt target/identity mismatch");
  for (let i = 0; i < receipt.objects.length; i++) {
    const o = receipt.objects[i], f = receipt.transfer.objects[i];
    if (o.provider !== "AWS_S3" || o.bucket !== config.bucket || o.region !== config.region || o.key !== f.key || o.versionId !== f.version || o.byteLength !== f.bytes
      || o.expected_sha256 !== f.sha256 || o.confirmed_sha256 !== f.sha256 || o.retention_mode !== "COMPLIANCE" || !Number.isFinite(Date.parse(o.uploaded_at))
      || !(Date.parse(o.retain_until) >= Date.parse(config.retainUntil))) throw new Error("Cloud object receipt mismatch");
  }
  const controls = await transport.inspectBucket(); assertBucketControls(controls, config, policy);
  const result = await recoverPackage(new S3ArtifactStore(env, transport), receipt.transfer, expected);
  return { ...result, verification_context: "READ_ONLY_SESSION_REPLAY", credential_independence: "REQUIRES_OPERATOR_CONFIRMATION",
    target: target(config), bucket_controls: controls };
}

/** Injection point is for offline tests. Default factory is never invoked in plan mode. */
export async function runCloudCommand(args: string[], env: Readonly<Record<string, string | undefined>>,
  factory: (config: S3Config, access: "UPLOAD" | "READ_ONLY") => AcceptanceTransport = createAwsTransport) {
  args.forEach(a => blockProductionTarget(a));
  const options = new Map<string, string>(); const flags = new Set<string>();
  for (const arg of args) {
    if (["--execute-cloud", "--execute-cloud-read"].includes(arg)) { if (flags.has(arg)) throw new Error("Duplicate execution flag"); flags.add(arg); continue; }
    const m = /^--(archive|out|ack|make-synthetic|verify-receipt|expected-artifact-sha256|expected-manifest-sha256)=(.+)$/.exec(arg);
    if (!m || options.has(m[1])) throw new Error("Invalid/duplicate cloud option"); options.set(m[1], m[2]);
  }
  if (options.has("make-synthetic")) {
    if (options.size !== 1 || flags.size) throw new Error("Synthetic generation is local-only");
    await makeCloudSynthetic(options.get("make-synthetic")!); return { status: "SYNTHETIC_CREATED", cloud_requests: 0 };
  }
  const config = s3Config(env), policy = acceptancePolicy(env);
  if (options.has("verify-receipt")) {
    if (options.has("archive") || flags.has("--execute-cloud")) throw new Error("Read-only mode cannot upload");
    const receipt = await readCloudReceipt(options.get("verify-receipt")!);
    if (!flags.has("--execute-cloud-read")) {
      if (options.has("ack")) throw new Error("Read acknowledgement requires explicit read execution");
      return { status: "READ_ONLY_PLAN", target: target(config), cloud_requests: 0 };
    }
    if (options.get("ack") !== "READ_ONLY_RECOVERY" || !options.has("out") || !options.has("expected-artifact-sha256") || !options.has("expected-manifest-sha256")) throw new Error("Read execution requires acknowledgement, expected digests and new output directory");
    await mkdir(options.get("out")!);
    const transport = factory(config, "READ_ONLY");
    try {
      const report = await cloudReadback(receipt, { artifactSha256: options.get("expected-artifact-sha256")!, manifestSha256: options.get("expected-manifest-sha256")! }, env, transport);
      await record(options.get("out")!, "readback-report.json", report); return report;
    } finally { transport.destroy?.(); }
  }
  if (!options.has("archive") || flags.has("--execute-cloud-read") || options.has("expected-artifact-sha256") || options.has("expected-manifest-sha256")) throw new Error("Use --archive=DIR for an offline upload plan");
  const p = await preparePackage(options.get("archive")!);
  const plan = { state: "LOCAL_VERIFIED", target: target(config), prefix: p.prefix, artifact_sha256: p.report.artifact_sha256, manifest_sha256: p.report.manifest_sha256,
    object_count: p.files.length, objects: p.files.map(f => ({ key: `${p.prefix}/archive/${f.path}`, bytes: f.bytes.length, sha256: f.sha256 })),
    minimum_retention_days: policy.minimumDays, retain_until: config.retainUntil, cloud_requests: 0,
    operations: ["Read bucket location/versioning/lock/public-access/ownership/encryption/lifecycle", "Conditional PUT raw objects; HEAD/GET/checksum",
      "Conditional PUT manifest/checksum; HEAD/GET/checksum", "Pinned full recovery; recheck controls; local receipt"] };
  if (!flags.has("--execute-cloud")) { if (options.has("ack")) throw new Error("Upload acknowledgement requires explicit execution"); return plan; }
  if (options.get("ack") !== "UPLOAD_SYNTHETIC_ONLY" || !options.has("out")) throw new Error("Cloud writes require --execute-cloud --ack=UPLOAD_SYNTHETIC_ONLY --out=NEW_DIR");
  requireSynthetic(p); // Before client construction, credentials or any network operation.
  const transport = factory(config, "UPLOAD");
  try { return await cloudUpload(p, env, transport, options.get("out")!); }
  finally { transport.destroy?.(); }
}
if (require.main === module) runCloudCommand(process.argv.slice(2), process.env)
  .then(result => console.log(canonicalJson(result)))
  .catch(() => { console.error("Cloud artifact command refused or failed; no acceptance claimed. Check flags, non-secret configuration and local failure report. SDK credential details are suppressed."); process.exitCode = 1; });

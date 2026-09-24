/** Provider-independent recovery. Every temporary materialization is removed in finally. */
import { lstat, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { basename, dirname, join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { canonicalJson, sha256 } from "./canonicalize-curb-snapshot";
import { checkHash, checkedBytes, ImmutableArtifactStore, LocalArtifactStore, MAX_OBJECT_BYTES, ObjectRef } from "./curb-artifact-store";
import { PACKAGE_CONTRACT, verifyFullArchive } from "./verify-curb-snapshot-archive";

export type StoredFile = ObjectRef & { path: string; bytes: number; sha256: string };
export type PackageReceipt = { contract: "curb-store-receipt-v1"; provider_kind: ImmutableArtifactStore["kind"];
  artifact_sha256: string; manifest_sha256: string; prefix: string; objects: StoredFile[] };
export type RecoveryExpectations = { artifactSha256: string; manifestSha256: string };
const RAW = /^(?:(?:metadata|count)-(?:before|after)\.json|pages\/\d{6}\.json)$/;
export function packagePrefix(hash: string) { checkHash(hash); return `curb-snapshots/datasf_citywide_curbs/${PACKAGE_CONTRACT}/${hash}`; }
function archivePath(path: unknown): asserts path is string {
  if (typeof path !== "string" || !(RAW.test(path) || ["manifest.json", "manifest.sha256"].includes(path))) throw new Error("Unsafe/unknown archive member path");
}
async function localBytes(root: string, path: string) {
  archivePath(path); const target = join(root, path), stat = await lstat(target);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size > MAX_OBJECT_BYTES) throw new Error(`Invalid local artifact: ${path}`);
  const bytes = await readFile(target); if (bytes.length !== stat.size) throw new Error(`Local artifact changed: ${path}`); return bytes;
}

/** Verify first, then freeze bounded bytes/checksums in memory before any adapter write. */
export async function preparePackage(archive: string) {
  const { report } = await verifyFullArchive(archive);
  if (report.status !== "PASS") throw new Error("Only a complete eligible PASS archive can enter retention preparation");
  const manifest = checkedBytes(await localBytes(archive, "manifest.json"), report.manifest_sha256);
  const m = JSON.parse(manifest.toString("utf8")); // Already verified descriptor/control JSON, not source feature JSON.
  const files: { path: string; bytes: Buffer; sha256: string }[] = [];
  for (const a of m.artifacts) {
    const bytes = checkedBytes(await localBytes(archive, a.path), a.sha256);
    if (bytes.length !== a.bytes) throw new Error(`Local artifact changed: ${a.path}`);
    files.push({ path: a.path, bytes, sha256: a.sha256 });
  }
  const checksum = await localBytes(archive, "manifest.sha256");
  if (checksum.toString("utf8") !== report.manifest_sha256 + "\n") throw new Error("Local manifest checksum changed");
  // Raw evidence first; manifest and its checksum last. No partial package readiness marker.
  files.push({ path: "manifest.json", bytes: manifest, sha256: report.manifest_sha256 },
    { path: "manifest.sha256", bytes: checksum, sha256: sha256(checksum) });
  return { report, files, prefix: packagePrefix(report.artifact_sha256) };
}
export async function uploadPreparedPackage(store: ImmutableArtifactStore, prepared: Awaited<ReturnType<typeof preparePackage>>): Promise<PackageReceipt> {
  const objects: StoredFile[] = [];
  if (prepared.prefix !== packagePrefix(prepared.report.artifact_sha256)) throw new Error("Invalid prepared prefix");
  for (const f of prepared.files) {
    archivePath(f.path);
    const key = `${prepared.prefix}/archive/${f.path}`, head = await store.putImmutable(key, f.bytes, f.sha256);
    if (head.key !== key || head.bytes !== f.bytes.length || head.sha256 !== f.sha256) throw new Error(`Upload metadata mismatch: ${f.path}`);
    await store.verifyChecksum(head, f.sha256); // Retrieval, not a trusted uploader-supplied metadata digest.
    objects.push({ key, version: head.version, path: f.path, bytes: head.bytes, sha256: f.sha256 });
  }
  return { contract: "curb-store-receipt-v1", provider_kind: store.kind, artifact_sha256: prepared.report.artifact_sha256,
    manifest_sha256: prepared.report.manifest_sha256, prefix: prepared.prefix, objects };
}

export async function recoverPackage(store: ImmutableArtifactStore, receipt: PackageReceipt, expected: RecoveryExpectations) {
  checkHash(expected.artifactSha256); checkHash(expected.manifestSha256);
  if (receipt.contract !== "curb-store-receipt-v1" || receipt.provider_kind !== store.kind || receipt.prefix !== packagePrefix(expected.artifactSha256)
    || receipt.artifact_sha256 !== expected.artifactSha256 || receipt.manifest_sha256 !== expected.manifestSha256
    || !Array.isArray(receipt.objects) || receipt.objects.length < 7 || receipt.objects.length > 107) throw new Error("Receipt does not match trusted package identity");
  const seen = new Set<string>(); let total = 0;
  for (const f of receipt.objects) {
    archivePath(f.path); checkHash(f.sha256);
    if (seen.has(f.path) || f.key !== `${receipt.prefix}/archive/${f.path}` || typeof f.version !== "string" || !f.version
      || !Number.isSafeInteger(f.bytes) || f.bytes < 0 || f.bytes > MAX_OBJECT_BYTES) throw new Error(`Invalid receipt member: ${f.path}`);
    seen.add(f.path); total += f.bytes;
  }
  if (total > 256 * 1024 * 1024 + 65 || !seen.has("manifest.json") || !seen.has("manifest.sha256")) throw new Error("Incomplete/excessive receipt");
  const root = await mkdtemp(join(tmpdir(), "curb-recovery-"));
  try {
    await mkdir(join(root, "pages"));
    // Fetch pinned manifest first. A remote descriptor is not authority for its own checksum.
    const ordered = [...receipt.objects].sort((a, b) => Number(b.path === "manifest.json") - Number(a.path === "manifest.json"));
    for (const f of ordered) {
      try {
        const head = await store.head(f);
        if (head.key !== f.key || head.version !== f.version || head.bytes !== f.bytes || head.sha256 !== f.sha256) throw new Error("metadata mismatch");
        const bytes = checkedBytes(await store.get(f), f.sha256);
        if (bytes.length !== f.bytes) throw new Error("byte length mismatch");
        if (f.path === "manifest.json") checkedBytes(bytes, expected.manifestSha256);
        await writeFile(join(root, f.path), bytes, { flag: "wx", mode: 0o600 });
      } catch { throw new Error(`Recovery failed for ${f.path}: missing object, corrupt bytes or stale metadata/version`); }
    }
    const result = await verifyFullArchive(root, expected);
    if (result.report.status !== "PASS") throw new Error("Recovered archive is not consistent and fully eligible");
    return { state: "RECOVERY_VERIFIED" as const, provider_kind: store.kind, durable_cloud_retention_verified: false,
      recovered_object_count: receipt.objects.length, recovered_bytes: total, report: result.report };
  } finally {
    // Only this freshly created materialization; never store/source/provider objects.
    if (dirname(resolve(root)) !== resolve(tmpdir()) || !basename(root).startsWith("curb-recovery-")) throw new Error("Unsafe recovery cleanup target");
    await rm(root, { recursive: true, force: true });
  }
}

/** Local-only operational proof: no cloud constructor or credentials can be selected here. */
export async function retainLocally(archive: string, newStoreDirectory: string) {
  const prepared = await preparePackage(archive), store = await LocalArtifactStore.create(newStoreDirectory);
  const receipt = await uploadPreparedPackage(store, prepared);
  const recovered = await recoverPackage(store, receipt, { artifactSha256: receipt.artifact_sha256, manifestSha256: receipt.manifest_sha256 });
  const markerBytes = Buffer.from(canonicalJson({ ...receipt, state: recovered.state, durable_cloud_retention_verified: false }) + "\n");
  const marker = await store.putImmutable(`${receipt.prefix}/recovery-receipt.json`, markerBytes, sha256(markerBytes));
  return { receipt, marker, recovery: recovered };
}
async function main() {
  const args = process.argv.slice(2), options = new Map<string, string>();
  const plan = args.includes("--plan-s3");
  for (const arg of args.filter(a => a !== "--plan-s3")) {
    const match = /^--(archive|local-store|receipt|expected-artifact-sha256|expected-manifest-sha256)=(.+)$/.exec(arg);
    if (!match || options.has(match[1])) throw new Error("Invalid or duplicate recovery option"); options.set(match[1], match[2]);
  }
  if (plan) {
    if (args.filter(a => a === "--plan-s3").length !== 1 || options.size !== 1 || !options.has("archive")) throw new Error("Use --plan-s3 --archive=DIR");
    const p = await preparePackage(options.get("archive")!);
    console.log(canonicalJson({ provider: "AWS_S3", readiness: "CLOUD_ACCEPTANCE_PENDING_USE_VERIFY_CURB_ARTIFACT_CLOUD", prefix: p.prefix,
      object_count: p.files.length, bytes: p.files.reduce((n, f) => n + f.bytes.length, 0), cloud_requests: 0 })); return;
  }
  if (options.size === 3 && options.has("archive") && options.has("local-store") && options.has("receipt")) {
    // Reserve output before creating a store. Never overwrite user files.
    const handle = await import("node:fs/promises").then(fs => fs.open(options.get("receipt")!, "wx", 0o600));
    try { const result = await retainLocally(options.get("archive")!, options.get("local-store")!);
      await handle.writeFile(canonicalJson(result.receipt) + "\n"); console.log(canonicalJson(result.recovery));
    } finally { await handle.close(); } return;
  }
  if (options.size === 4 && ["local-store", "receipt", "expected-artifact-sha256", "expected-manifest-sha256"].every(k => options.has(k))) {
    const receiptFile = options.get("receipt")!;
    if ((await lstat(receiptFile)).size > 256 * 1024) throw new Error("Receipt exceeds limit");
    const receipt = JSON.parse(await readFile(receiptFile, "utf8"));
    console.log(canonicalJson(await recoverPackage(await LocalArtifactStore.open(options.get("local-store")!), receipt,
      { artifactSha256: options.get("expected-artifact-sha256")!, manifestSha256: options.get("expected-manifest-sha256")! }))); return;
  }
  throw new Error("Use --archive=DIR --local-store=NEW_DIR --receipt=NEW_JSON, or --local-store=DIR --receipt=JSON --expected-artifact-sha256=HEX --expected-manifest-sha256=HEX; cloud writes unavailable");
}
if (require.main === module) main().catch(() => { console.error("Artifact recovery failed; no retention readiness claimed. Check local paths, checksums and receipt."); process.exitCode = 1; });

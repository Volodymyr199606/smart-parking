/** AWS SDK v3 binding. No client or credential chain is created on module import. */
import { S3Client, PutObjectCommand, HeadObjectCommand, GetObjectCommand, GetBucketLocationCommand, GetBucketVersioningCommand,
  GetObjectLockConfigurationCommand, GetPublicAccessBlockCommand, GetBucketOwnershipControlsCommand,
  GetBucketEncryptionCommand, GetBucketLifecycleConfigurationCommand } from "@aws-sdk/client-s3";
import { MAX_OBJECT_BYTES } from "./curb-artifact-store";
import { blockProductionTarget, S3Config, S3Transport } from "./curb-s3-artifact-store";

export type BucketControls = { region: string; versioning: string; objectLock: string; retentionMode: string;
  retentionDays?: number; retentionYears?: number; publicAccessBlocked: boolean; ownerEnforced: boolean;
  encryption: string; enabledLifecycleRules: number };
export interface AcceptanceTransport extends S3Transport { inspectBucket(): Promise<BucketControls>; destroy?(): void }
export type S3AcceptancePolicy = { minimumDays: number };
export function acceptancePolicy(env: Readonly<Record<string, string | undefined>>): S3AcceptancePolicy {
  const value = env.CURB_ARTIFACT_MIN_RETENTION_DAYS;
  if (!value || !/^\d+$/.test(value) || !Number.isSafeInteger(Number(value)) || Number(value) < 1 || Number(value) > 36500) throw new Error("Missing/invalid CURB_ARTIFACT_MIN_RETENTION_DAYS");
  return { minimumDays: Number(value) };
}
export function assertBucketControls(c: BucketControls, config: S3Config, policy: S3AcceptancePolicy, now = Date.now()) {
  // Years conservatively count as 365 days. Variable/event retention is not accepted here.
  const days = c.retentionDays ?? (c.retentionYears === undefined ? 0 : c.retentionYears * 365);
  if (c.region !== config.region || c.versioning !== "Enabled" || c.objectLock !== "Enabled" || c.retentionMode !== "COMPLIANCE"
    || (c.retentionDays !== undefined && c.retentionYears !== undefined) || !Number.isSafeInteger(days) || days < policy.minimumDays
    || Date.parse(config.retainUntil) - now < policy.minimumDays * 86400_000 || !c.publicAccessBlocked || !c.ownerEnforced
    || c.encryption !== "AES256" || c.enabledLifecycleRules !== 0) throw new Error("Bucket controls/retention policy not proven; acceptance refused");
}
/** Called only after an explicit CLI execution gate. Endpoint is explicit to ignore ambient endpoint overrides.
 * Credentials are omitted deliberately: SDK's standard Node provider chain resolves them lazily on send.
 */
export function createAwsTransport(config: S3Config, access: "UPLOAD" | "READ_ONLY") {
  blockProductionTarget(config.bucket, config.region, config.endpoint ?? "");
  const client = new S3Client({ region: config.region, endpoint: config.endpoint ?? `https://s3.${config.region}.amazonaws.com`,
    forcePathStyle: true, followRegionRedirects: false, useAccelerateEndpoint: false, useDualstackEndpoint: false, useFipsEndpoint: false,
    maxAttempts: 1, requestHandler: { connectionTimeout: 5000, requestTimeout: 30000 } });
  return new AwsSdkS3Transport(client, config, access);
}
export class AwsSdkS3Transport implements AcceptanceTransport {
  constructor(private readonly client: S3Client, private readonly config: S3Config, private readonly access: "UPLOAD" | "READ_ONLY") {}
  destroy() { this.client.destroy(); }
  private check(input: { Bucket: string; ExpectedBucketOwner: string; Key?: string }) {
    blockProductionTarget(input.Bucket, input.Key ?? "");
    if (input.Bucket !== this.config.bucket || input.ExpectedBucketOwner !== this.config.owner) throw new Error("S3 target/owner mismatch");
  }
  async put(input: Parameters<S3Transport["put"]>[0]) {
    this.check(input);
    if (this.access !== "UPLOAD") throw new Error("Read-only S3 transport cannot upload");
    try {
      const r = await this.client.send(new PutObjectCommand({ ...input, ContentLength: input.Body.length,
        ContentType: "application/json", StorageClass: "STANDARD", ObjectLockRetainUntilDate: new Date(input.ObjectLockRetainUntilDate) }));
      if (!r.VersionId || r.VersionId === "null") throw new Error("S3 upload returned no immutable version");
      return { VersionId: r.VersionId };
    } catch (error) {
      if ((error as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode === 412) throw { code: "PRECONDITION_FAILED" };
      throw new Error("S3 PUT failed; no acceptance claimed");
    }
  }
  async head(input: Parameters<S3Transport["head"]>[0]) {
    this.check(input);
    try {
      const r = await this.client.send(new HeadObjectCommand(input));
      if (r.ChecksumType && r.ChecksumType !== "FULL_OBJECT") throw new Error("Composite checksum unsupported");
      return { ContentLength: r.ContentLength ?? -1, ChecksumSHA256: r.ChecksumSHA256 ?? "", VersionId: r.VersionId ?? "",
        ObjectLockMode: r.ObjectLockMode ?? "", ObjectLockRetainUntilDate: r.ObjectLockRetainUntilDate?.toISOString() ?? "",
        ...(r.ETag ? { ETag: r.ETag } : {}), ...(r.ContentType ? { ContentType: r.ContentType } : {}),
        ...(r.LastModified ? { LastModified: r.LastModified.toISOString() } : {}),
        ...(r.ServerSideEncryption ? { ServerSideEncryption: r.ServerSideEncryption } : {}) };
    } catch { throw new Error("S3 HEAD failed or unsupported metadata"); }
  }
  async get(input: Parameters<S3Transport["get"]>[0]) {
    this.check(input);
    if (!input.VersionId || input.VersionId === "null" || input.maxBytes > MAX_OBJECT_BYTES || input.maxBytes < 0) throw new Error("Bounded version-pinned GET required");
    const abort = new AbortController(), timer = setTimeout(() => abort.abort(), 30000);
    let body: any;
    try {
      const { maxBytes, ...request } = input;
      const r = await this.client.send(new GetObjectCommand({ ...request, ChecksumMode: "ENABLED" }), { abortSignal: abort.signal });
      body = r.Body;
      if (r.VersionId !== input.VersionId || !Number.isSafeInteger(r.ContentLength) || r.ContentLength! < 0 || r.ContentLength! > maxBytes
        || !body || typeof body[Symbol.asyncIterator] !== "function") throw new Error("Invalid GET metadata/body");
      const chunks: Buffer[] = []; let size = 0;
      for await (const chunk of body) {
        if (!(chunk instanceof Uint8Array)) throw new Error("Non-byte S3 response");
        size += chunk.length; if (size > maxBytes) throw new Error("S3 response exceeds limit"); chunks.push(Buffer.from(chunk));
      }
      if (size !== r.ContentLength) throw new Error("Truncated GET");
      return Buffer.concat(chunks, size);
    } catch { throw new Error("S3 version-pinned GET failed"); }
    finally { clearTimeout(timer); abort.abort(); body?.destroy?.(); }
  }
  async inspectBucket(): Promise<BucketControls> {
    const input = { Bucket: this.config.bucket, ExpectedBucketOwner: this.config.owner }; this.check(input);
    try {
      const [location, version, lock, access, ownership, encryption, lifecycle] = await Promise.all([
        this.client.send(new GetBucketLocationCommand(input)), this.client.send(new GetBucketVersioningCommand(input)),
        this.client.send(new GetObjectLockConfigurationCommand(input)), this.client.send(new GetPublicAccessBlockCommand(input)),
        this.client.send(new GetBucketOwnershipControlsCommand(input)), this.client.send(new GetBucketEncryptionCommand(input)),
        this.client.send(new GetBucketLifecycleConfigurationCommand(input)).catch(error => {
          if (error.name === "NoSuchLifecycleConfiguration") return { Rules: [] }; throw error;
        }),
      ]);
      const retention = lock.ObjectLockConfiguration?.Rule?.DefaultRetention;
      // New event/variable retention forms require a separate contract review.
      if (retention && Object.keys(retention).some(k => !["Mode", "Days", "Years"].includes(k))) throw new Error("Unsupported retention form");
      const p = access.PublicAccessBlockConfiguration, rules = encryption.ServerSideEncryptionConfiguration?.Rules;
      if (!Array.isArray(lifecycle.Rules) || lifecycle.Rules.some(r => r.Status !== "Enabled" && r.Status !== "Disabled")) throw new Error("Unproven lifecycle configuration");
      return { region: location.LocationConstraint === "EU" ? "eu-west-1" : location.LocationConstraint || "us-east-1",
        versioning: version.Status ?? "", objectLock: lock.ObjectLockConfiguration?.ObjectLockEnabled ?? "", retentionMode: retention?.Mode ?? "",
        ...(retention?.Days !== undefined ? { retentionDays: retention.Days } : {}), ...(retention?.Years !== undefined ? { retentionYears: retention.Years } : {}),
        publicAccessBlocked: !!(p?.BlockPublicAcls && p.IgnorePublicAcls && p.BlockPublicPolicy && p.RestrictPublicBuckets),
        ownerEnforced: ownership.OwnershipControls?.Rules?.length === 1 && ownership.OwnershipControls.Rules[0].ObjectOwnership === "BucketOwnerEnforced",
        encryption: rules?.length === 1 ? rules[0].ApplyServerSideEncryptionByDefault?.SSEAlgorithm ?? "" : "",
        enabledLifecycleRules: lifecycle.Rules.filter(r => r.Status === "Enabled").length };
    } catch { throw new Error("Unable to prove required bucket controls"); }
  }
}

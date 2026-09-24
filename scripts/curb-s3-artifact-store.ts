/** AWS S3 adapter SKELETON. Deliberately no SDK binding/default credential chain/CLI upload.
 * Transport is injected (only a recording fake is used in this milestone).
 */
import { checkHash, checkKey, checkedBytes, ImmutableArtifactStore, MAX_OBJECT_BYTES, ObjectHead, ObjectRef } from "./curb-artifact-store";
export type S3Config = { bucket: string; region: string; owner: string; retainUntil: string };
export function s3Config(env: Readonly<Record<string, string | undefined>>): S3Config {
  const names = ["CURB_ARTIFACT_S3_BUCKET", "CURB_ARTIFACT_S3_REGION", "CURB_ARTIFACT_S3_OWNER", "CURB_ARTIFACT_RETAIN_UNTIL"] as const;
  for (const name of names) if (!env[name]) throw new Error(`Missing ${name}`); // Names only, never values.
  const [bucket, region, owner, retainUntil] = names.map(name => env[name]!);
  if (!/^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/.test(bucket) || !/^[a-z]{2}-[a-z]+-\d$/.test(region) || !/^\d{12}$/.test(owner)
    || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(retainUntil) || !(Date.parse(retainUntil) > Date.now())) throw new Error("Invalid S3 configuration");
  return { bucket, region, owner, retainUntil };
}
type Request = { Bucket: string; Key: string; ExpectedBucketOwner: string };
type Head = { ContentLength: number; ChecksumSHA256: string; VersionId: string; ObjectLockMode: string; ObjectLockRetainUntilDate: string };
/** Future SDK binding must enforce region, bounded streaming, no custom endpoints/redirects,
 * and map 412 ONLY to { code: 'PRECONDITION_FAILED' }. Other errors fail closed.
 */
export interface S3Transport {
  put(input: Request & { Body: Uint8Array; IfNoneMatch: "*"; ChecksumSHA256: string; ServerSideEncryption: "AES256";
    ObjectLockMode: "COMPLIANCE"; ObjectLockRetainUntilDate: string }): Promise<{ VersionId: string }>;
  head(input: Request & { VersionId?: string; ChecksumMode: "ENABLED" }): Promise<Head>;
  get(input: Request & { VersionId: string; maxBytes: number }): Promise<Uint8Array>;
}
export class S3ArtifactStore implements ImmutableArtifactStore {
  readonly kind = "AWS_S3" as const;
  private readonly config: S3Config;
  constructor(env: Readonly<Record<string, string | undefined>>, private readonly transport: S3Transport) { this.config = s3Config(env); }
  private request(key: string): Request {
    checkKey(key);
    if (!/^curb-snapshots\/datasf_citywide_curbs\/curb-artifact-package-v1\/[0-9a-f]{64}\//.test(key)) throw new Error("Key outside curb evidence prefix");
    return { Bucket: this.config.bucket, Key: key, ExpectedBucketOwner: this.config.owner };
  }
  private metadata(key: string, h: Head): ObjectHead {
    const hash = Buffer.from(h.ChecksumSHA256, "base64").toString("hex"); checkHash(hash);
    if (Buffer.from(hash, "hex").toString("base64") !== h.ChecksumSHA256 || !h.VersionId || h.VersionId === "null"
      || !Number.isSafeInteger(h.ContentLength) || h.ContentLength < 0 || h.ContentLength > MAX_OBJECT_BYTES
      || h.ObjectLockMode !== "COMPLIANCE" || !(Date.parse(h.ObjectLockRetainUntilDate) >= Date.parse(this.config.retainUntil))
      || !(Date.parse(h.ObjectLockRetainUntilDate) > Date.now())) throw new Error("S3 checksum/version/retention evidence missing or insufficient");
    return { key, version: h.VersionId, sha256: hash, bytes: h.ContentLength, uri: `s3://${this.config.bucket}/${key}`,
      protection: "COMPLIANCE", retainUntil: h.ObjectLockRetainUntilDate };
  }
  async head(ref: ObjectRef) {
    if (!ref.version || ref.version === "null") throw new Error("Pinned S3 version required");
    const result = this.metadata(ref.key, await this.transport.head({ ...this.request(ref.key), VersionId: ref.version, ChecksumMode: "ENABLED" }));
    if (result.version !== ref.version) throw new Error("S3 version mismatch"); return result;
  }
  async get(ref: ObjectRef) {
    const head = await this.head(ref);
    const bytes = await this.transport.get({ ...this.request(ref.key), VersionId: ref.version, maxBytes: MAX_OBJECT_BYTES });
    if (bytes.length !== head.bytes) throw new Error("S3 length mismatch"); return checkedBytes(bytes, head.sha256);
  }
  async verifyChecksum(ref: ObjectRef, expectedSha256: string) { checkedBytes(await this.get(ref), expectedSha256); }
  async putImmutable(key: string, input: Uint8Array, expectedSha256: string) {
    const bytes = checkedBytes(input, expectedSha256);
    if (!(Date.parse(this.config.retainUntil) > Date.now())) throw new Error("Approved retention horizon has expired");
    let version: string;
    try {
      version = (await this.transport.put({ ...this.request(key), Body: bytes, IfNoneMatch: "*", ChecksumSHA256: Buffer.from(expectedSha256, "hex").toString("base64"),
        ServerSideEncryption: "AES256", ObjectLockMode: "COMPLIANCE", ObjectLockRetainUntilDate: this.config.retainUntil })).VersionId;
    } catch (error) {
      if ((error as { code?: string }).code !== "PRECONDITION_FAILED") throw new Error("S3 immutable upload failed");
      // A 412 is NOT success: verify the existing version, retention and exact bytes.
      version = this.metadata(key, await this.transport.head({ ...this.request(key), ChecksumMode: "ENABLED" })).version;
    }
    const ref = { key, version };
    if (!Buffer.from(await this.get(ref)).equals(bytes)) throw new Error("S3 immutable object conflict");
    return this.head(ref);
  }
}

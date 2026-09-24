/** Object-level boundary. No provider SDK, credentials or network imports. */
import { link, lstat, mkdir, open, readFile, realpath, unlink } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { sha256 } from "./canonicalize-curb-snapshot";

export const MAX_OBJECT_BYTES = 32 * 1024 * 1024;
export type ObjectRef = { key: string; version: string };
export type ObjectHead = ObjectRef & { bytes: number; sha256: string; uri: string;
  protection: "LOCAL_ONLY" | "COMPLIANCE"; retainUntil?: string };
export interface ImmutableArtifactStore {
  readonly kind: "LOCAL_ONLY" | "AWS_S3";
  putImmutable(key: string, bytes: Uint8Array, expectedSha256: string): Promise<ObjectHead>;
  head(ref: ObjectRef): Promise<ObjectHead>;
  get(ref: ObjectRef): Promise<Uint8Array>;
  verifyChecksum(ref: ObjectRef, expectedSha256: string): Promise<void>;
}
export function checkHash(value: unknown): asserts value is string {
  if (typeof value !== "string" || !/^[0-9a-f]{64}$/.test(value)) throw new Error("Expected lowercase SHA-256");
}
export function checkKey(key: unknown): asserts key is string {
  if (typeof key !== "string" || key.length > 900 || !key.split("/").every(p =>
    /^[a-z0-9][a-z0-9._-]*$/.test(p) && !p.endsWith(".") && !/^(con|prn|aux|nul|com[0-9]|lpt[0-9])(?:\.|$)/.test(p))) {
    throw new Error("Invalid object key: use relative lowercase segments; no traversal, reserved names or URL escapes");
  }
}
export function checkedBytes(bytes: Uint8Array, expectedSha256: string): Buffer {
  checkHash(expectedSha256);
  if (bytes.length > MAX_OBJECT_BYTES || sha256(bytes) !== expectedSha256) throw new Error("Object byte limit/checksum mismatch");
  return Buffer.from(bytes);
}

/** Test/dev only. Atomic hard-link publication of one header+body file; never a durable WORM claim.
 * Requires a private root with no hostile concurrent filesystem administrator.
 */
export class LocalArtifactStore implements ImmutableArtifactStore {
  readonly kind = "LOCAL_ONLY" as const;
  private constructor(readonly root: string) {}
  static async create(directory: string) {
    await mkdir(resolve(directory)); // Exclusive new root; never repurpose another directory.
    return LocalArtifactStore.open(directory);
  }
  static async open(directory: string) {
    const stat = await lstat(directory);
    if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error("Local store root must be a real directory");
    return new LocalArtifactStore(await realpath(directory));
  }
  private async target(key: string, create: boolean) {
    checkKey(key);
    const parts = key.split("/"); let parent = this.root;
    for (const part of parts.slice(0, -1)) {
      parent = join(parent, part);
      if (create) await mkdir(parent).catch(error => { if (error.code !== "EEXIST") throw error; });
      const stat = await lstat(parent);
      if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error("Object parent must be a real directory");
    }
    return join(parent, parts.at(-1)! + ".object");
  }
  private async record(ref: ObjectRef) {
    checkHash(ref.version);
    const target = await this.target(ref.key, false), stat = await lstat(target);
    if (!stat.isFile() || stat.isSymbolicLink() || stat.size > MAX_OBJECT_BYTES + 256) throw new Error("Invalid local object file");
    const all = await readFile(target), newline = all.indexOf(10);
    if (newline < 0 || newline > 255 || all.length !== stat.size) throw new Error("Invalid local object envelope");
    const meta = JSON.parse(all.subarray(0, newline).toString("utf8")); // Internal bounded controls, never source JSON.
    checkHash(meta.sha256);
    const bytes = all.subarray(newline + 1);
    if (meta.sha256 !== ref.version || meta.bytes !== bytes.length || !Number.isSafeInteger(meta.bytes)) throw new Error("Stale local object metadata/version");
    const head: ObjectHead = { ...ref, bytes: bytes.length, sha256: meta.sha256,
      uri: pathToFileURL(target).toString(), protection: "LOCAL_ONLY" };
    return { head, bytes };
  }
  async head(ref: ObjectRef) { return (await this.record(ref)).head; }
  async get(ref: ObjectRef) {
    const r = await this.record(ref); return checkedBytes(r.bytes, r.head.sha256);
  }
  async verifyChecksum(ref: ObjectRef, expectedSha256: string) { checkedBytes(await this.get(ref), expectedSha256); }
  async putImmutable(key: string, input: Uint8Array, expectedSha256: string) {
    const bytes = checkedBytes(input, expectedSha256), target = await this.target(key, true);
    const pending = join(this.root, `.pending-${randomUUID()}`);
    const handle = await open(pending, "wx", 0o600);
    try {
      await handle.writeFile(Buffer.concat([Buffer.from(JSON.stringify({ bytes: bytes.length, sha256: expectedSha256 }) + "\n"), bytes]));
      await handle.sync();
    } finally { await handle.close(); }
    try {
      try { await link(pending, target); }
      catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
        // No replacing a corrupt/conflicting object, even if metadata claims the requested hash.
        if (!Buffer.from(await this.get({ key, version: expectedSha256 })).equals(bytes)) throw new Error("Immutable object conflict");
      }
    } finally { await unlink(pending); }
    return this.head({ key, version: expectedSha256 });
  }
}

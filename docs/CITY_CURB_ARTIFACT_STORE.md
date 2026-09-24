# City curb AWS S3 adapter and cloud acceptance harness V1

**S3 ADAPTER IMPLEMENTED. S3 MOCK-TESTED. AWS RESOURCES NOT PROVISIONED. NO CLOUD UPLOAD PERFORMED. CLOUD ACCEPTANCE PENDING.** Resource status means this task neither provisioned nor inspected AWS resources. No credential values were inspected, requested or logged. No AWS service calls, production Supabase access, migrations, curb ingestion, publication, PostGIS or application changes occurred. CITY remains INCOMPLETE.

## Repository readiness

The scripts now use the modular `@aws-sdk/client-s3` v3 SDK (direct dev dependency `^3.1139.0`, exact resolution in `pnpm-lock.yaml`). No other direct AWS package or broad SDK bundle is needed. Existing Supabase dependencies are unrelated; artifact scripts require no Supabase configuration. Real `.env` files and ambient credential values/presence were not examined. Cloud credential files must remain outside Git. The normal SDK credential chain is used only by a later explicitly executed cloud command.

The existing lossless archive verifier stays provider-independent and unchanged. New code is scripts-only:

- `curb-artifact-store.ts`: object interface and local implementation.
- `curb-s3-artifact-store.ts`: immutable S3 object operations, configuration and version/checksum/retention validation.
- `curb-s3-sdk-transport.ts`: actual AWS SDK commands, bounded streaming and read-only bucket inspection.
- `verify-curb-artifact-cloud.ts`: offline plan, synthetic-only gated upload, bounded receipts and separate read-only replay.
- `verify-curb-s3-tests.ts`: injected S3 responses and actual SDK serialization into a fake HTTP handler, with networking blocked.
- `verify-curb-artifact-recovery.ts`: preparation, object transfer, full recovery and local-only CLI.
- `verify-curb-artifact-store.ts`: synthetic adapter, concurrency, corruption/recovery and S3 contract tests.

## Capability checklist

| Priority | Capability and acceptance proof |
|---|---|
| Required | Upload exact bytes; read them back through the provider and match SHA-256 and byte length. |
| Required | Deterministic immutable keys; conditional creation, conflicting writes rejected, identical retries verified. |
| Required | HEAD metadata and a stable object-version reference; retrieval must pin that reference. |
| Required | Private access; separate uploader/verifier identities; no public ACL, credentials in URLs, or source-secret logging. |
| Required | Historical retrieval; protect published evidence from ordinary client deletion and lifecycle expiration. |
| Required | Complete package recovery from trusted external package/manifest hashes; incomplete uploads cannot qualify. |
| Strongly preferred | Versioning, WORM retention/Object Lock, lifecycle controls, audit events and recovery after client delete markers. |
| Irrelevant here | Public CDN, transformations and image processing. They cannot justify weakening evidence retention. |

## Provider comparison and recommendation

Official documentation reviewed 2026-09-23; pricing/configuration must be rechecked before provisioning.

| Consideration | Supabase Storage | AWS S3 (primary) | Backblaze B2 S3 API (fallback) |
|---|---|---|---|
| Immutable history | Application keys/RLS; documented S3 versioning and Object Lock unsupported | Versioned objects plus compliance retention; conditional writes guard names | Object Lock supports compliance/governance and retention; S3-compatible API |
| Delete recovery | Documentation says deleted objects cannot be restored | Retained version IDs survive ordinary delete markers; version deletion governed by lock | Retained locked versions; prove version retrieval in provider acceptance tests |
| Checksums | Always download/hash; do not assume AWS checksum headers are supported | SHA-256 upload/HEAD and independent GET hashing | Download/hash required; exact checksum/conditional-write API compatibility still needs proof |
| Private access | Existing Supabase auth/RLS fit | Dedicated IAM roles, private bucket, public-access block | Private bucket and scoped application keys |
| SDK / development | Existing SDK; local Supabase available | Modular SDK adapter and offline acceptance tests implemented; actual cloud acceptance pending | Similar S3 client shape, but not a drop-in substitute without capability tests |
| Operations / lock-in | Fewest accounts; weaker retention meets neither preferred versioning nor lock requirements | More IAM setup; retention decisions need review; standard S3 object API with AWS policy controls | Separate account/key administration; S3 portability with provider differences |
| Cost shape | Existing plan/storage/egress quotas | Pay-as-you-go storage, requests, transfer, optional audit costs | Low per-TB storage pricing and included egress allowance; current pricing page linked below |
| Supabase integration | Native SDK convenience | DB stores external artifact/manifest URIs and hashes; no app runtime coupling | Same provider-neutral DB contract |

Sources: [Supabase S3 compatibility](https://supabase.com/docs/guides/storage/s3/compatibility), [Supabase storage pricing](https://supabase.com/docs/guides/storage/pricing), [S3 Object Lock](https://docs.aws.amazon.com/AmazonS3/latest/userguide/object-lock.html), [S3 conditional writes](https://docs.aws.amazon.com/AmazonS3/latest/userguide/conditional-writes.html), [S3 PutObject checksum contract](https://docs.aws.amazon.com/AmazonS3/latest/API/API_PutObject.html), [S3 HeadObject](https://docs.aws.amazon.com/AmazonS3/latest/API/API_HeadObject.html), [Backblaze Object Lock](https://www.backblaze.com/docs/cloud-storage-enable-object-lock-with-the-s3-compatible-api), [B2 S3 compatibility](https://www.backblaze.com/docs/cloud-storage-s3-compatible-api).

**Choose AWS S3 Standard in a dedicated private evidence bucket with versioning and Object Lock COMPLIANCE for published evidence.** This optimizes the safety/reproducibility requirement: AWS documents the required conditional-create, checksum and version-retention behavior together. Keep bucket-owner-enforced ACLs and all public-access blocking enabled. Those controls still require actual provisioning and audit; adapter request defaults alone do not prove bucket privacy. [AWS public-access controls](https://docs.aws.amazon.com/AmazonS3/latest/userguide/configuring-block-public-access-bucket.html), [object ownership defaults](https://docs.aws.amazon.com/AmazonS3/latest/userguide/managing-acls.html).

Object Lock protects versions, not key names: another version or a delete marker can still obscure an existing key. Require `If-None-Match: *` and deny delete/nonconditional writes to normal clients in bucket policy; retain version IDs in receipts. COMPLIANCE retention cannot be shortened during its approved period. Review the horizon/cost before enabling it; no duration is silently selected here. [Lock behavior](https://docs.aws.amazon.com/AmazonS3/latest/userguide/object-lock.html), [conditional-write behavior](https://docs.aws.amazon.com/AmazonS3/latest/userguide/conditional-writes.html).

**Fallback: Backblaze B2 with Object Lock.** It is materially useful for low-cost retained evidence and implements the required retention modes. Before adopting it, independently prove conditional-create conflict behavior, checksums, scoped permissions and version-pinned retrieval. Generic S3 compatibility does not prove every AWS capability; this milestone supplies no B2 adapter or readiness claim. GCS/Azure would add another SDK/IAM model without a demonstrated project advantage; R2 is not evaluated as another fallback because B2 already supplies a documented Object Lock option.

Cost judgment: the retained package is about 7.7 MB. At one such full capture per day, one year adds roughly 2.8 GB before reports, replicas and overhead. This is an illustrative workload calculation, not a billing quote. S3 has no minimum charge and bills storage/requests/transfer; audit/logging choices may matter more than this tiny data volume. Avoid cold-storage retrieval complexity initially. B2 currently advertises pricing starting at $6.95/TB/month, a free storage allowance and egress allowances. Keep budget alerts and review actual account/region pricing; no paid resource is created. [S3 pricing](https://aws.amazon.com/s3/pricing/), [B2 pricing](https://www.backblaze.com/cloud-storage/pricing).

## Keys, upload order and states

```text
curb-snapshots/datasf_citywide_curbs/curb-artifact-package-v1/<package-sha256>/
  archive/
    manifest.json
    manifest.sha256
    metadata-before.json
    count-before.json
    pages/000000.json ...
    count-after.json
    metadata-after.json
  recovery-receipt.json
```

Use **package SHA-256**, not merely dataset SHA-256: equal logical data may have different capture metadata/timestamps/raw bytes. No authoritative `latest/` or `current/` key is used. Source archive names/bytes and the established package digest preimage are unchanged; the `archive/` storage prefix is removed on materialization. The receipt is outside the archive and excluded from its content identity. Logical keys permit lowercase ASCII segments only, prohibit traversal/URL escapes/Windows reserved names and have an explicit length bound.

Upload protocol:

1. Run complete local archive verification; require consistent, nonempty, fully eligible PASS. Freeze bounded bytes and validate them against the verified manifest.
2. Conditionally create each raw evidence object. For each, inspect HEAD then GET/check its exact bytes/checksum and record the immutable version.
3. Upload and verify manifest, then its checksum file. Do not emit package-completion evidence while any object is missing or failed.
4. Independently recover all pinned objects into a fresh local directory. Compare externally trusted package/manifest hashes using the full verifier.
5. Only after successful recovery produce a receipt. For cloud readiness, an independent process must also verify retention/privacy/policy/receipt protection and record its own evidence. An uploader-authored receipt alone is not a trust boundary or DB attestation.

Smallest operational state model: `LOCAL_ONLY` -> `UPLOADING` -> `UPLOADED_UNVERIFIED` -> `RECOVERY_VERIFIED`. The first three describe workflow progress; only successful final results are emitted. Failed/partial objects remain non-ready and may be retried; this code never deletes store objects. `RECOVERY_VERIFIED` is qualified by provider kind and `durable_cloud_retention_verified`; all current results set the latter **false**. A future cloud policy/retention acceptance gate must succeed before it can become true. None of these states changes DB snapshot lifecycle.

## Narrow object interface and local semantics

```typescript
interface ImmutableArtifactStore {
  readonly kind: "LOCAL_ONLY" | "AWS_S3";
  putImmutable(key: string, bytes: Uint8Array, expectedSha256: string): Promise<ObjectHead>;
  head(ref: {key: string; version: string}): Promise<ObjectHead>;
  get(ref: {key: string; version: string}): Promise<Uint8Array>;
  verifyChecksum(ref: {key: string; version: string}, expectedSha256: string): Promise<void>;
}
// ObjectHead: key, version, bytes, SHA-256, URI, protection kind, optional retainUntil.
```

This refines the earlier package-level conceptual interface into object operations; orchestration owns package inventory/replay. No delete, list, mutable-current, ACL-setting or credential method is exposed. Objects are bounded to 32 MiB, receipts to 107 archive files and the established total archive limit.

The local adapter creates a new private test root, preserves the logical key hierarchy, and stores each object as `<key>.object`: bounded JSON control header (length/SHA) plus LF plus exact original bytes. The envelope is internal to the local adapter; `get` returns only the original bytes. HEAD reads declared controls, while GET independently hashes the body. Versions are content hashes in this test adapter, not invented cloud version IDs.

Writes use an exclusive temporary file, flush, and atomic hard-link publication to a previously absent target. Concurrent different bodies have one winner. Existing identical bytes/checksum produce a no-op without replacing the object; a different body, stale metadata or corruption fails instead of being repaired. Unsupported hard-link filesystems fail closed. Paths are checked for real directories/files and symlinks; the root must be private against hostile concurrent filesystem administration. This implements adapter semantics, **not filesystem WORM, retention or power-loss durability**. Filesystem owners can remove/change test objects, intentionally used by corruption tests. No production retention can be inferred from local success.

## Recovery proof and commands

`recoverPackage` requires external expected package and manifest checksums, a receipt and a store. It validates receipt paths/keys/counts/versions/size bounds, fetches the pinned manifest first, and retrieves every declared object through HEAD/GET with independent hashes. It reconstructs a fresh `%TEMP%/curb-recovery-*` directory and runs the unchanged full archive verifier. Missing declarations also fail the verifier's complete archive inventory. Its `finally` cleanup checks the resolved path is its own newly created temp child and removes only that materialization, including on failures. It never deletes the source archive, store objects or historical receipts.

```powershell
# Synthetic object, overwrite/concurrency, S3-recording-fake and recovery tests:
pnpm.cmd verify:curb-artifact-store

# Local-only store and recovery, new store root and new receipt file required:
pnpm.cmd verify:curb-artifact-recovery --archive=<DIR> --local-store=<NEW_DIR> --receipt=<NEW_JSON>

# Independent local readback using separately trusted digests:
pnpm.cmd verify:curb-artifact-recovery --local-store=<DIR> --receipt=<JSON> --expected-artifact-sha256=<HEX> --expected-manifest-sha256=<HEX>

# Exact currently available provider-readiness command: local reads only, zero cloud calls:
pnpm.cmd verify:curb-artifact-recovery --plan-s3 --archive=<DIR>
```

`--plan-s3` remains offline and emits keys/object count/bytes with `CLOUD_ACCEPTANCE_PENDING_USE_VERIFY_CURB_ARTIFACT_CLOUD`. The new command below additionally validates non-secret target configuration and retention policy. Neither plan constructs an SDK client or resolves credentials. Do not substitute `aws s3 sync`: it lacks this package's conditional-write/version-receipt/recovery gate.

## AWS adapter and configuration contract

`S3ArtifactStore` uses the `AwsSdkS3Transport` binding for PutObject, HeadObject and GetObject. Importing modules and running plans does not create a client. The factory is called only after explicit execution gates and local verification. Requests pin the expected owner and configured regional endpoint; ambient S3 endpoint overrides and region redirects cannot retarget them. This V1 targets commercial AWS regions and general-purpose buckets, not directory buckets, access points, GovCloud or China partitions.

Non-secret configuration names (no values or credentials belong in source):

| Name | Purpose |
|---|---|
| `CURB_ARTIFACT_S3_BUCKET` | Dedicated reviewed evidence bucket; no default |
| `CURB_ARTIFACT_S3_REGION` | Region for the explicit AWS endpoint; no default |
| `CURB_ARTIFACT_S3_OWNER` | Expected 12-digit owner account, checked on every request |
| `CURB_ARTIFACT_RETAIN_UNTIL` | Explicit future UTC retention horizon, reviewed before any write |
| `CURB_ARTIFACT_MIN_RETENTION_DAYS` | Required harness policy minimum, integer 1–36500; no default |
| `CURB_ARTIFACT_S3_PREFIX` | Optional; if set must equal `curb-snapshots/datasf_citywide_curbs/curb-artifact-package-v1` |
| `CURB_ARTIFACT_S3_ENDPOINT` | Optional test-only endpoint: literal `http(s)://127.0.0.1[:port]` or `[::1]`, no path/query/credentials; all external custom endpoints rejected |

The scripts do not load `.env` or inspect credential values. The SDK receives no explicit credentials in the real transport, so its standard Node provider chain resolves credentials lazily at execution. Prefer short-lived assumed roles, SSO or workload identity. Select uploader/verifier profiles in separate sessions; SDK authentication may contact SSO/STS/metadata services only during future explicitly gated execution. No AWS access keys are required in project `.env`. Never log credential objects, use public credential variants or reuse Supabase credentials. Tests use explicit non-secret signing fixtures and a fake HTTP handler, never the real credential chain. [AWS Node credential resolution](https://docs.aws.amazon.com/sdk-for-javascript/v3/developer-guide/setting-credentials-node.html).

PUT sends `IfNoneMatch: '*'`, known ContentLength, base64 SHA-256, STANDARD storage class, AES256 server-side encryption, COMPLIANCE mode, explicit retain-until and expected owner. No ACL grants are sent. Conditional creation provides atomic overwrite protection; HEAD-then-PUT is not used as the race guard. Only HTTP 412 becomes an identical-retry candidate: HEAD obtains the existing version, then pinned GET must prove equal bytes/checksum and sufficient retention. Conflicts and other errors fail closed. The SDK uses one attempt; ambiguous failures leave non-ready partial evidence for an explicit retry, never a blind overwrite or delete.

HEAD normalizes key/version, byte length, SHA-256, content type, ETag, last-modified, encryption and Object Lock mode/date. Missing/null VersionId, composite or absent checksum, invalid size and insufficient COMPLIANCE retention fail. Version IDs are bounded to 1024 characters. After a version is known, all HEAD/GET requests pin it; only the 412 discovery HEAD may read current metadata. GET verifies the returned version and declared length, consumes byte streams with a 32 MiB ceiling and 30-second abort deadline, and checks downloaded SHA-256. Connection timeout is five seconds. ETag is descriptive only; our own SHA-256 is authoritative. SDK errors are sanitized, and receipts never contain signed URLs or credentials.

Before any PUT, and again after uploader recovery, the harness reads location, versioning, Object Lock, public-access block, ownership controls, default encryption and lifecycle configuration. It requires the exact region, versioning Enabled, Object Lock Enabled, fixed default COMPLIANCE retention (Days or Years) meeting the configured minimum, all four public-access block flags, BucketOwnerEnforced and SSE-S3 AES256. Explicit object retain-until must also meet the minimum from the time of acceptance. Years are conservatively counted as 365 days. V1 accepts no enabled lifecycle rule; absent lifecycle configuration is accepted only for the specific NoSuchLifecycleConfiguration response. Unknown/inaccessible controls fail closed. A loopback emulator passing these checks never proves AWS retention. Actual IAM and bucket-policy enforcement still need manual review and real acceptance.

Future permission split, scoped to the reviewed bucket/prefix:

- **Uploader:** `s3:PutObject`, `s3:PutObjectRetention`, and minimal `s3:GetObject`/`s3:GetObjectVersion`/`s3:GetObjectRetention` needed by post-write verification/idempotency. It cannot be strictly write-only while providing byte-verified no-op semantics. Deny DeleteObject, DeleteObjectVersion, bypass retention, bucket-policy/lifecycle administration and nonconditional writes. No DB verifier credential.
- **Independent verifier:** read-only `s3:GetObject`, `s3:GetObjectVersion`, `s3:GetObjectRetention` on evidence; separately restricted read of bucket retention/versioning/public-access configuration if doing readiness audit. No PutObject/DeleteObject/retention-change permission. No staging/service credentials.
- **Provisioning/retention administrator:** separate reviewed identity sets bucket versioning/Object Lock, public-access block, owner-enforced ACLs, policy, retention duration/lifecycle and audit events. It is not used by either normal process.

HEAD/checksum and lock metadata permissions must be checked against real IAM responses before deployment. Start with SSE-S3 to avoid unnecessary KMS dependencies; if KMS is later selected, explicitly review the additional permissions/key-retention dependency. [AWS operation permissions](https://docs.aws.amazon.com/AmazonS3/latest/userguide/using-with-s3-policy-actions.html), [HEAD requirements](https://docs.aws.amazon.com/AmazonS3/latest/API/API_HeadObject.html), [lock operational considerations/auditing](https://docs.aws.amazon.com/AmazonS3/latest/userguide/object-lock-managing.html).

## Independent verifier execution

| Option | Assessment |
|---|---|
| Local/manual operator with a separate profile | Lowest infrastructure cost; credible initial acceptance/recovery test with reviewed pinned code and independently recorded checksums, but weaker repeatability and credential isolation on a shared workstation. |
| Manually triggered protected CI job | Recommended eventual normal execution: repeatable pinned implementation, separate read-only artifact identity and narrowly scoped DB verifier credentials, retained logs/reports, approval-controlled environment. |
| Small worker/job | Useful at higher cadence; extra deployment, secret rotation and scheduling burden now. |

Use the local/manual flow for first approved provider acceptance, then a protected CI job for recurring independent verification. The staging identity must be unable to assume the verifier role, access its DB login, edit the protected verifier workflow/code or provide self-approved expected hashes. Review/pin the verifier revision independently, deny untrusted PR execution in that environment, and keep a trusted version receipt outside uploader control. Use a distinct DB verifier session identity rather than letting a shared ingest gateway assert its own identity. No workflow/credentials or DB connectivity are implemented here.

## Database compatibility and remaining gates

00012 already stores immutable `artifact_uri`, `artifact_sha256`, `manifest_uri`, `manifest_sha256`; 00014 binds those digests in verifier evidence. `s3://<bucket>/<prefix>/archive/` and its manifest URI satisfy the existing no-query/no-fragment URI checks. Actual object version IDs live in the independently retained receipt; URI naming and bucket policy prevent normal clients rebinding authoritative history. Do not put expiring signed URLs or version query strings into these DB columns. Future verifier jobs must bind the configured store/account and trusted receipt to those DB declarations. **Schema sufficient; no migration required or modified.**

Before first cloud upload: separately select/approve account, bucket, region, retention horizon and costs; provision/audit the controls and separate roles; review the implemented SDK adapter and concrete offline plan. Follow the synthetic-only acceptance commands below. No available credentials bypass the execution gates.

Remaining production blockers: actual cloud retention/recovery acceptance and independently protected receipts; verifier credentials/deployment plus complete DB TEXT comparison/attestation integration; reviewed source registration/endpoint and migration rollout; separate authorization for ingestion/publication. This local recovery result grants none of those permissions.

## IAM templates and manual bucket provisioning

Templates contain placeholders only and have not been provisioned or validated against an AWS account:

- [Uploader identity policy](./curb-artifacts/aws-uploader-policy.template.json): prefix-scoped PutObject/PutObjectRetention, GetObject/GetObjectVersion/GetObjectRetention and the bucket reads below. Explicit deny excludes other operations on this bucket/evidence prefix.
- [Verifier identity policy](./curb-artifacts/aws-verifier-policy.template.json): the same bucket reads and prefix-scoped GetObject/GetObjectVersion/GetObjectRetention only. Explicit deny prevents writes, deletes, retention changes and bucket administration even if another attached identity policy grants them on this scope.
- [Bucket policy guardrails](./curb-artifacts/aws-bucket-policy.template.json): deny nonconditional creation, non-COMPLIANCE retention, retention below the approved minimum, evidence deletion/bypass and insecure object transfers. Replace `<BUCKET>` and `<MIN_RETENTION_DAYS>` only after policy review. The wildcard principal occurs only in Deny statements; it grants no public access.

Both identities need exactly these bucket inspection actions on `arn:aws:s3:::<BUCKET>`:

```text
s3:GetBucketLocation
s3:GetBucketVersioning
s3:GetBucketObjectLockConfiguration
s3:GetBucketPublicAccessBlock
s3:GetBucketOwnershipControls
s3:GetEncryptionConfiguration
s3:GetLifecycleConfiguration
```

Object actions are restricted to `arn:aws:s3:::<BUCKET>/curb-snapshots/datasf_citywide_curbs/curb-artifact-package-v1/*`. No list permission is needed: receipts enumerate exact keys/versions. HeadObject uses GetObject/GetObjectVersion authorization, with GetObjectRetention needed for lock metadata. No KMS, ACL, deletion, bucket configuration, STS or role-assumption permissions are granted by these templates. Authentication trust/SSO setup is separate; neither role should inherit other bucket access or be able to assume the other role. [AWS API-to-IAM action mapping](https://docs.aws.amazon.com/AmazonS3/latest/userguide/using-with-s3-policy-actions.html).

The bucket policy supplements identity permissions; the harness does not read/evaluate the policy document or prove effective IAM isolation. Review those controls with the provisioning administrator and validate the templates in the chosen account before execution. Restrict administration and review receipt retention/auditing separately. The retention guard uses AWS's remaining-retention-days condition; explicit object retention overrides bucket defaults, so both controls matter. [AWS retention policy conditions](https://docs.aws.amazon.com/AmazonS3/latest/userguide/object-lock-managing.html), [enforcing conditional writes](https://docs.aws.amazon.com/AmazonS3/latest/userguide/conditional-writes-enforce.html).

Manual provisioning checklist, **not executed by this task**:

1. Record the approved account/12-digit owner, commercial region, dedicated general-purpose bucket name, retention minimum/horizon, cost owner and receipt custodian. No project retention duration is invented here.
2. Create the private bucket using a separate administrator; enable versioning and Object Lock, with fixed default COMPLIANCE retention meeting the approved minimum. Review the retention commitment before writing.
3. Enable all four public-access blocks and BucketOwnerEnforced ownership. Set default SSE-S3 AES256 encryption. Use S3 Standard; this V1 does not accept SSE-KMS or archival tiers.
4. Leave lifecycle rules absent/disabled for the first acceptance; review noncurrent-version expiration, delete markers, transitions and replication separately before any later change.
5. Review/substitute the bucket policy and separate uploader/verifier identity policies. Create distinct roles/trust paths; exclude bucket administration, deletion, bypass and cross-assumption. Verify no other permissions undermine prefix/identity separation.
6. Retain the policy/configuration review, choose an independent custodian for trusted digests/version receipts, and configure approved access auditing. Neither application role administers those records.
7. Supply only the documented non-secret configuration in the uploader session. Set retain-until with sufficient margin beyond the minimum to cover upload/replay time. Generate the tiny fixture and review the offline plan; obtain separate authorization for the first cloud execution.

## Cloud receipts, failure behavior and exact future commands

Cloud reports are local exclusive-create files, each bounded to 1 MiB. `preliminary-receipt.json` has state `UPLOADED_UNVERIFIED`; `receipt.json` is created only after fresh-directory pinned recovery passes the unchanged full archive verifier and the second bucket-control check. `bucket-controls.json` records the initial checks. Failures produce a bounded `failure.json` with stage and `retention_ready: false`; partial remote objects are never deleted or called ready.

The receipt binds contract/purpose, configured bucket/region/owner/endpoint, package SHA-256, manifest SHA-256, object count, existing transfer receipt and bucket controls. Every object records provider, bucket, region, key, VersionId, byteLength, expected/confirmed SHA-256, COMPLIANCE mode, retain-until and uploaded_at from S3 LastModified (not the retry's wall clock). Optional ETag is metadata only. Final recovery records PASS, row count, dataset/identity-geometry digests and verified_at. At most 107 archive objects are permitted. No source rows, credentials or signed URLs belong in receipts.

Uploader recovery is explicitly `UPLOADER_SELF_READBACK`, with `independent_verification_required: true` and `cloud_retention_accepted: false`, even after `RECOVERY_VERIFIED`. The verifier command emits `READ_ONLY_SESSION_REPLAY` and `credential_independence: REQUIRES_OPERATOR_CONFIRMATION`; it cannot prove who holds the process credentials. Preserve receipts outside uploader control before treating them as independent historical evidence. No receipt here authorizes DB attestation/publication.

Commands below use new local directories. Replace placeholders locally, quote paths containing spaces, and set the non-secret configuration above. Plain invocation plans only. The first two commands are offline:

```powershell
pnpm.cmd verify:curb-artifact-cloud --make-synthetic=<NEW_SYNTHETIC_DIR>
pnpm.cmd verify:curb-artifact-cloud --archive=<SYNTHETIC_DIR>
```

The plan validates the complete archive and lists target/prefix, exact keys/lengths/SHA-256, retention policy and required operations with `cloud_requests: 0`. It never constructs a client, resolves credentials or inspects the bucket. Existing `verify:curb-artifact-recovery --plan-s3` remains available without AWS target configuration. A read-only receipt plan is also available with `--verify-receipt=<RECEIPT_JSON>` and no execution flag.

**Future first cloud test, NOT executed in this task**, after manual provisioning and authorization, in the uploader session:

```powershell
pnpm.cmd verify:curb-artifact-cloud --archive=<SYNTHETIC_DIR> --out=<NEW_UPLOADER_DIR> --execute-cloud --ack=UPLOAD_SYNTHETIC_ONLY
```

Both the execution flag and exact acknowledgement are required. Missing/duplicate/conflicting gates fail. The archive must byte-match the generated two-row, seven-file fixture before any client construction; a renamed real archive or forged synthetic label cannot pass. The flow is local full verification -> bucket inspection -> conditional raw uploads and HEAD/GET checks -> manifest/checksum uploads and checks -> preliminary receipt -> pinned full recovery -> bucket recheck -> final receipt. Identical retries use a new local output directory and preserve remote versions; insufficient existing retention fails rather than modifying old objects.

In a **separate shell/session with the verifier's read-only identity**, using independently preserved package/manifest digests:

```powershell
pnpm.cmd verify:curb-artifact-cloud --verify-receipt=<UPLOADER_DIR>/receipt.json --out=<NEW_VERIFIER_DIR> --expected-artifact-sha256=<TRUSTED_PACKAGE_HEX> --expected-manifest-sha256=<TRUSTED_MANIFEST_HEX> --execute-cloud-read --ack=READ_ONLY_RECOVERY
```

The read transport rejects PUT even when called directly. Running verifier code with uploader credentials does not count as independent verification. Confirm the selected role/profile through the separately reviewed authentication setup; do not print keys. The script neither assumes another role nor calls STS to claim identity independence.

Later rollout order is synthetic cloud acceptance -> separate-identity recovery -> receipt/control review -> explicit user approval -> separately reviewed real-archive upload support and upload -> independent real recovery -> separately authorized DB registration/staging rollout. This V1 deliberately provides **no real-archive cloud execution path**. The retained 18,355-row archive can be planned offline and must never be the first cloud write. No Supabase URL/key is needed, and the production project reference is hard-blocked in configuration, arguments and S3 targets.

## Current offline execution evidence

Workspace/scripts typecheck and the existing 60 synthetic archive checks and 52 artifact-store/recovery checks pass. The S3 suite tests bucket controls, exact execution gates, synthetic-only enforcement, immutable creation, equal retries, conflicting writes, missing versions, retention/checksum failures, missing/corrupt/truncated/wrong-version reads, partial uploads and failed recovery without premature final receipts. It also runs the actual AWS SDK serializer/signing path against an in-memory HTTP handler with explicit dummy fixtures. All network entry points are blocked in that suite; no real credential chain or AWS API is used. The policy templates are documentation artifacts, not a cloud IAM validation result.

```powershell
pnpm.cmd typecheck
pnpm.cmd verify:curb-archive-tests
pnpm.cmd verify:curb-artifact-store
pnpm.cmd verify:curb-s3-tests
git diff --check
git status --short
```

## Previous local-store execution evidence

Executed locally: **52 artifact-store/recovery checks**, **60 existing synthetic archive checks**, and workspace/scripts **typecheck** passed. The prior archive suite's “61” total includes its optional retained-archive double replay; here real evidence was exercised through the new store/recovery path instead. S3 tests used only a recording fake; no cloud readiness is inferred from them.

The real archive was read from `%TEMP%/curb-v2-double-02753736130e4c279273764268ef070d/a/capture-1` and retained separately in `%TEMP%/curb-artifact-store-real-v1-20260923`. Receipt: `%TEMP%/curb-artifact-store-real-v1-20260923-receipt.json`. All **25 archive objects / 7,725,157 bytes** were recovered (23 raw response files plus manifest/checksum), plus a separately stored local recovery marker. The temporary recovered archive was removed; the original archive, object layout and receipt remain.

A second, separate CLI process recovered the package using only that store/receipt and independently supplied package/manifest checksums, without an original archive path or capture-process memory. It passed the same counts/digests. The executable `--plan-s3` command also passed and reported **25 objects, 7,725,157 bytes, zero cloud requests**, with readiness `SDK_BINDING_PROVISIONING_AND_APPROVAL_REQUIRED`.

| Recovered evidence | Result |
|---|---|
| Archive status / consistency | PASS / CONSISTENT |
| Rows / distinct IDs | 18,355 / 18,355 |
| Pages | 19 |
| Eligible / ineligible | 18,355 / 0 |
| Package SHA-256 | `e019f4534e993f11db4043b00fd5a201600c9d569637ec13012ac62e77d55ca4` |
| Manifest SHA-256 | `f60ec7819866fbd4e894500714ebc84c567ea742ea8e6bef2a0f782a6bc3bee2` |
| Dataset SHA-256 | `f536717d946b36d19bfcb9ae2d7ca0e753fe09e4e08e3bde1356ad0c6c5216a2` |
| Identity/geometry SHA-256 | `3051d88c0c71122a0945903c268a4db07431dc258d93aa575366fcc9e13202c6` |
| Operational state | RECOVERY_VERIFIED, provider LOCAL_ONLY |
| Durable cloud retention verified | **false** |

Tests reject conflicting/concurrent overwrites, wrong upload/read checksums, unsafe keys, missing/corrupt pages, wrong manifests, partial packages, stale metadata, omitted/duplicate members, key rebinding and a rehashed forged manifest against the independent checksum. Both success and failure paths remove only their temporary recovery directory. No cloud object upload, production connection, migration or commit was performed.

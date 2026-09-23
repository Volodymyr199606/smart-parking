/** Numeric-payload-free V2 DB seal. V1 protocol remains unchanged. */
import { sha256 } from "./canonicalize-curb-snapshot";
export type SealedMember = { external_id: string; id: string; geometry_sha256: string; attributes_sha256: string; content_sha256: string };
export function membershipSealV2(sourceId: string, snapshotId: string, members: readonly SealedMember[]): string {
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
  if (![sourceId,snapshotId,...members.map(m=>m.id)].every(v=>uuid.test(v))) throw new Error("Seal requires normalized UUIDs");
  if (new Set(members.map(m=>m.external_id)).size!==members.length) throw new Error("Duplicate seal identity");
  const rows=members.map(m=> {
    if (![m.geometry_sha256,m.attributes_sha256,m.content_sha256].every(v=>/^[0-9a-f]{64}$/.test(v))) throw new Error("Invalid seal hash");
    return { ...m,key:Buffer.from(m.external_id,"utf8").toString("hex") };
  }).sort((a,b)=>a.key<b.key?-1:a.key>b.key?1:0);
  return sha256(`city-curb/db-membership/v2\n${sourceId}:${snapshotId}:curb-decimal-v2:curb-snapshot-v2\n`+
    rows.map(m=>`${m.key}:${m.id}:${m.geometry_sha256}:${m.attributes_sha256}:${m.content_sha256}`).join("\n"));
}

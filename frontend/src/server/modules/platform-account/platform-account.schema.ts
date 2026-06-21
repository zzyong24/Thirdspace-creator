// PlatformAccount module schema surface — the contract Zod DTO this module produces
// (foundation §5: "<module>.schema.ts — re-export/usage of the contract Zod DTOs for
// this module"). The transport's mapper and the contract test validate their outputs
// against this; the contract is the single source of truth for the wire shape
// (contract/src/resources/platform-accounts.ts, contract v0.4).
//
// Topology (verified against candidate.schema.ts): the @creatoros/contract root barrel
// re-exports `ENDPOINTS` but NOT the resource files. All 5 account op responses are the
// SAME platformAccountResource, reachable as ENDPOINTS.<opKey>.response:
//   listAccounts / createAccount / getAccount / updateAccount / archiveAccount.
import { ENDPOINTS } from "@creatoros/contract";
import type { PlatformAccountRow } from "./platform-account.repository";

export const platformAccountResource = ENDPOINTS.getAccount.response;

// Derive the inferred output type from the schema's phantom `_output` (zod 4's
// `z.infer<T>` is `T["_output"]`). The frontend package does not declare `zod` as a
// direct dependency, so we read the output type structurally (mirrors candidate).
export type PlatformAccountResource = (typeof platformAccountResource)["_output"];

// Row → DTO mapper (SPEC §9: the API DTO is built by an explicit mapper, NEVER the
// Drizzle row). The service + contract test share ONE mapping so a wire-shape change
// is caught once.
export function toPlatformAccountDto(
  row: PlatformAccountRow,
): PlatformAccountResource {
  return {
    id: row.id,
    userId: row.userId,
    platform: row.platform as PlatformAccountResource["platform"],
    accountHandle: row.accountHandle,
    secretReference: row.secretReference ?? null,
    followerBaseline: row.followerBaseline,
    status: row.status as PlatformAccountResource["status"],
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

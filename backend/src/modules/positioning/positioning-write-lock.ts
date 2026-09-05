import {
  and,
  eq,
  platformAccounts,
  requireAccountId,
  type Db,
} from "@creatoros/backend";
import type { RequestContext } from "@creatoros/contract";
import { OwnershipError } from "./positioning.errors";
type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];
/** 使用真实账号行串行首次建母版、修改母版和版本追加，不新增锁表。 */
export async function lockPositioningAdoptionAccount(
  ctx: RequestContext,
  tx: Tx,
  requireExisting = true,
) {
  const id = requireAccountId(ctx.accountId, "positioning.write");
  const [account] = await tx
    .select()
    .from(platformAccounts)
    .where(
      and(eq(platformAccounts.id, id), eq(platformAccounts.userId, ctx.userId)),
    )
    .for("update");
  if (!account && requireExisting) throw new OwnershipError("定位账号不存在");
}

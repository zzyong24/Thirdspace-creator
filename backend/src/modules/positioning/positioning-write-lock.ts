import {accountGroups} from "../../schema/account-groups";
import {
  assertWritableWorkspace,
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
  if(ctx.groupId){
    const [group]=await tx.select().from(accountGroups).where(and(eq(accountGroups.id,ctx.groupId),eq(accountGroups.userId,ctx.userId),eq(accountGroups.status,"active"))).for("update");
    if(!group)throw new OwnershipError("定位账号组不可用");
    return;
  }
  await assertWritableWorkspace(tx,ctx);
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

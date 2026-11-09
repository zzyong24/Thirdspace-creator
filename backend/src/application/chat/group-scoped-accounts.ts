import type { RequestContext } from "@creatoros/contract";

type AccountPage<T> = { rows: T[]; total: number };
type ListAccounts<T, Q> = (ctx: RequestContext, query: Q) => Promise<AccountPage<T>>;
type GroupMembers = (ctx: RequestContext, groupId: string) => Promise<{ members: Array<{ accountId: string; leftAt: string | null }> }>;

/**
 * 编导/生成上下文里的「账号画像」只能来自当前账号组的在组账号。
 * platformAccountService.listAccounts 是用户级全量（采集、启动等后台流程仍需要），
 * 直接喂给编导会把别的账号组的号串进来（月明录屏 2026-11-10：「小号演示」列出主号组五个号）。
 * 无账号组上下文的旧调用保持原样。
 */
export function scopeAccountListToGroup<T extends { id: string }, Q>(
  listAccounts: ListAccounts<T, Q>,
  readGroup: GroupMembers,
): { listAccounts: ListAccounts<T, Q> } {
  return {
    async listAccounts(ctx, query) {
      if (!ctx.groupId) return listAccounts(ctx, query);
      const [page, group] = await Promise.all([listAccounts(ctx, query), readGroup(ctx, ctx.groupId)]);
      const ids = new Set(group.members.filter(member => member.leftAt === null).map(member => member.accountId));
      const rows = page.rows.filter(row => ids.has(row.id));
      return { rows, total: rows.length };
    },
  };
}

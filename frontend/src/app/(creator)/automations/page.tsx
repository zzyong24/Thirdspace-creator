/**
 * 自动化 `/automations` route(T-007 切片 D6)。
 *
 * 在共享 (creator) layout 内渲染 AutomationsPage,layout 已提供 AppShell
 * (Sidebar + TopHeader)。页面本身是 Server Component。
 *
 * Session-scoped read(lane center-pages):route 解析请求 session 并构造
 * `createServerClient(session.ctx)`,作业列表按登录用户收窄 —— 新账号读自己的
 * (空)作业,不是 user-zyongzhu 的 seed。无 session 走 fixture 兜底(SSR/测试不崩)。
 */

import { AutomationsPage } from "@/features/automations/automations-page";
import { createServerClient } from "@/lib/contract-client.server";
import { resolveSession } from "@/lib/session.server";

export default async function Page() {
  const session = await resolveSession();
  if (!session) {
    return <AutomationsPage />;
  }
  return (
    <AutomationsPage
      client={createServerClient(session.ctx)}
      // [T-332 S4] 当前号 id 来自 RSC ctx(S3 current-account cookie)——页面据此渲
      // 「当前号 badge」并把作业列表明确标注为「仅当前号」(§6.3)。
      currentAccountId={session.ctx.accountId ?? null}
      scope={{groupId:session.ctx.groupId ?? null,accountId:session.ctx.accountId ?? null}}
    />
  );
}

/**
 * 定位中心 route entrypoint (七步①② · SPEC §3.4).
 *
 * The (creator) layout supplies the shared AppShell (Sidebar + TopHeader) and the
 * global Header is configured for `/positioning` in `shell-router.tsx`. The page
 * itself is a Server Component that renders the positioning feature shell, which
 * reads pages.positioning.get (real SQL via the composite transport).
 *
 * Session-scoped read (lane center-pages): the route resolves the request's
 * session and constructs `createServerClient(session.ctx)` so the positioning read
 * is scoped to the logged-in user — a brand-new empty account reads its own empty
 * profile (the 「创建定位」 CTA), not the user-zyongzhu seed. With no session the
 * fixture-composed fallback (the feature's singleton seam) renders so SSR/tests
 * never crash.
 */
import { PositioningCenterPage } from "@/features/positioning/positioning-center";
import { createServerClient } from "@/lib/contract-client.server";
import { resolveSession } from "@/lib/session.server";
import { ZeroAccountGuidance } from "@/components/shell/zero-account-guidance";

export default async function PositioningRoutePage() {
  const session = await resolveSession();
  if (!session) {
    return <PositioningCenterPage />;
  }

  // [T-353] 未选号(含 0 号)= 引导态(T-332 §4.2):本页 per-account 读会撞 S2 strict 门
  // (AccountRequiredError → 整页错误边界)。layout 的零账号守卫只在首次渲染判定(App Router
  // 客户端导航不重渲 layout),故页面自兜:ctx 无选中号 → 渲绑定引导,不发注定失败的读。
  if (!session.ctx.groupId && !session.ctx.accountId) {
    return <ZeroAccountGuidance />;
  }
  return <PositioningCenterPage client={createServerClient(session.ctx)} />;
}

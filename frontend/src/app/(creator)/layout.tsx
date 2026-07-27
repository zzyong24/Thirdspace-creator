/**
 * (creator) segment layout — the single shell wrapping every authenticated
 * CreatorOS page, and (Module 00, Task 11) the SESSION GUARD.
 *
 * Foundation §2 names this layout the place where the session cookie becomes a
 * `RequestContext`:
 *  - no / invalid session cookie → `redirect("/login?from=<pathname>")`, so an
 *    unauthenticated visitor lands on the login page and returns afterwards,
 *  - a valid cookie → derive `ctx`, render the children, and bind the Shell
 *    user profile card to the REAL identity (`displayName` / `email`) — the
 *    `userResource` shape `settings.get` will eventually serve (Settings module,
 *    Wave 1). In Wave 0 the read comes from `identity.getCurrentUser(ctx)`,
 *    which returns the same DTO shape, so the card stops importing the static
 *    fixture and renders the logged-in user.
 *
 * It owns:
 *  - the shared `AppShell`, routed by `ShellRouter` based on the current
 *    pathname,
 *  - the `@modal` parallel slot for intercepting-route overlays,
 *  - the global `OverlayController` (inside the ShellRouter island).
 *
 * Pages remain Server Components by default. The router runs in a small Client
 * island so `usePathname()` / `useSearchParams()` resolve the active nav,
 * header mode, contextual-card variant and overlay state. The user card props
 * are derived here (server) and passed down, so no auth state leaks into the
 * client island beyond the display identity.
 */

import * as React from "react";
import { redirect } from "next/navigation";

import { ShellRouter, type ShellUser } from "./shell-router";
import { GlobalSearchHotkey } from "@/components/shell/global-search-hotkey";
import { LicenseHeartbeatBridge } from "@/components/shell/license-heartbeat-bridge";
// [T-530/T-534] 渠道品牌名：只读 Rust 已验证并写入加密 .license 的 runtime 投影。
import { SidebarBrandNameProvider } from "@/components/shell/sidebar";
import { readChannelRuntime } from "@/server/activation/channel-runtime.server";
import {
  ZeroAccountGuidance,
  isZeroAccountAllowedPath,
} from "@/components/shell/zero-account-guidance";
import { resolveSession, currentPathname } from "@/lib/session.server";
// T-147 P5 桌面激活授权 —— 桌面态未激活/到期则弹回 /activate;web/dev 永远放行(门不触发)。
import { isActivationAllowed } from "@/lib/activation-gate.server";
import { createServerClient } from "@/lib/contract-client.server";
import type { NotificationsViewModel } from "@/fixtures/selectors";
import type { RequestContext } from "@creatoros/contract";

interface CreatorLayoutProps {
  readonly children: React.ReactNode;
  readonly modal: React.ReactNode;
}

// G1 — the REAL Shell notifications read. The (creator) layout (an RSC) calls
// `GET /notifications` via the server contract client under the request ctx and
// projects the NotificationResource[] into the `NotificationsViewModel` the
// popover consumes (read = readAt !== null). Threaded down through the Shell so
// the bell + unread badge reflect real server state.
async function loadNotifications(
  ctx: RequestContext,
): Promise<NotificationsViewModel> {
  const items = (await createServerClient(ctx).listNotifications({
    params: undefined,
    query: { page: 1, pageSize: 20 },
    body: undefined,
  })) as unknown as ReadonlyArray<{
    id: string;
    title: string;
    body: string;
    notificationType: string;
    readAt: string | null;
    createdAt: string;
  }>;
  const views = items.map((n) => ({
    id: n.id,
    title: n.title,
    body: n.body,
    type: n.notificationType,
    read: n.readAt !== null,
    createdAt: n.createdAt,
  }));
  return {
    items: views,
    unreadCount: views.filter((v) => !v.read).length,
  };
}

function initialsFromName(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0]!.slice(0, 1).toUpperCase();
  return `${parts[0]!.charAt(0)}${parts[parts.length - 1]!.charAt(0)}`.toUpperCase();
}

export default async function CreatorLayout({
  children,
  modal,
}: CreatorLayoutProps) {
  const session = await resolveSession();
  if (!session) {
    const pathname = await currentPathname();
    redirect(`/login?from=${encodeURIComponent(pathname)}`);
  }

  // T-147 P5 — 一机一码激活门。**只桌面壳(CREATOROS_DESKTOP=1)拦**:未激活/年卡到期/超离线
  // 宽限 → 弹回 /activate。web/dev 恒放行(isActivationAllowed 内 isDesktopRuntime=false 硬短路,
  // 不启激活校验、不联网)——web 绝不被卡。放在 session 之后:先有本机用户再谈授权。
  if (!(await isActivationAllowed())) {
    redirect("/activate");
  }

  // Real identity for the Shell user card (Shell §4 row, Module = Identity).
  // The brand mark + unread dot stay intentionally inert (decorative); only the
  // user profile card is lifted to a real read. `planLabel` is a fixed display
  // string — no billing/plan entity exists in Wave 0.
  const user: ShellUser = {
    displayName: session.user.displayName,
    email: session.user.email,
    planLabel: "个人版",
    initials: initialsFromName(session.user.displayName),
  };

  // [T-332 S4 / T-348] 0 号全局引导守卫(SPEC §4.2):该 user 名下没有任何 active 抖音号 →
  // per-account 创作域页面整页替换为绑定引导(壳/侧栏保留);账号管理/设置等 user 级
  // 页面放行(白名单),否则用户没入口去绑号。
  //   [T-348] **首页 `/` 现在也放行**:首页承接完整引导流(OnboardingCard,绑号=高亮
  //   第一步),不再被守卫盖成光秃秃「去绑定」页;首页的 per-account 读降级由 page.tsx
  //   自己 catch(AccountRequiredError → 诚实空 dashboard)。白名单判定见 isZeroAccountAllowedPath。
  // 判定读 accounts.list(user 级读,不需要当前号);读失败 fail-open 照常渲染 children ——
  // 守卫是引导,不是安全门(安全边界在 backend strict 门),绝不能因一次读失败把整个 app 锁死。
  let hasActiveAccount = true;
  try {
    const accounts = (await createServerClient(session.ctx).listAccounts({
      params: undefined,
      query: { page: 1, pageSize: 100, platform: "douyin" },
      body: undefined,
    })) as unknown as ReadonlyArray<{ status: "active" | "archived" }>;
    hasActiveAccount = (accounts ?? []).some((a) => a.status === "active");
  } catch {
    hasActiveAccount = true; // fail-open:读失败不误锁
  }
  const pathname = await currentPathname();
  const zeroAccountGuarded =
    !hasActiveAccount && !isZeroAccountAllowedPath(pathname);

  // G1: real notifications for the Shell bell, read under the session ctx.
  // [FE-H03] 通知是次要功能(铃铛)——读取失败绝不能拖垮整个登录后布局(首页/项目/素材/
  // 发布/设置全靠这个 layout 渲染)。优雅降级:读失败 → 空通知(0 未读),铃铛为空,其余页面照常。
  let notifications: NotificationsViewModel;
  try {
    notifications = await loadNotifications(session.ctx);
  } catch {
    notifications = { items: [], unreadCount: 0 };
  }

  // [T-530/T-534] 渠道品牌名只从已验证加密 runtime 读取。
  // 读失败/未激活/官方码/未配置 → null,Sidebar 回官方名「CreatorOS」(品牌名回退
  // 不涉密;与渠道链接「null 不回退」红线不同)。读端设计上不 throw,这里仍兜一层
  // —— 品牌字样绝不能拖垮整个登录后布局。
  let brandName: string | null = null;
  let bugFeedbackUrl: string | null = null;
  try {
    const channelRuntime = await readChannelRuntime();
    brandName = channelRuntime.brandName;
    bugFeedbackUrl = channelRuntime.bugFeedbackUrl;
  } catch {
    brandName = null;
    bugFeedbackUrl = null;
  }

  return (
    <>
      {/* [T-051 2c] ⌘K 全局热键 → /search(让 TopHeader 的 kbd 提示言行一致)。 */}
      <GlobalSearchHotkey />
      {/* [T-372 L3] 授权心跳桥:Rust 心跳(内测 60min/买断 30d)判定 licensed=false 时
          立即跳激活页(内测到期/超宽限/吊销即时生效);web 下零副作用(封装内短路)。 */}
      <LicenseHeartbeatBridge />
      {/* [T-257] 外链处理已上移到根 layout(app/layout.tsx),覆盖 (creator) 外的页面;此处不再重复挂,避免双监听外链开两次。 */}
      {/* [T-530] 品牌名经 Provider 注入(server → client 只读;props 链被 ShellRouter
          隔断,沿 CurrentProjectProvider 同款上下文注入模式)。 */}
      <SidebarBrandNameProvider
        brandName={brandName}
        bugFeedbackUrl={bugFeedbackUrl}
      >
        <ShellRouter user={user} notifications={notifications}>
          {/* [T-332 S4] 0 号 → per-account 页面整页绑定引导(不渲染 children,防各页
              读 per-account op 撞 AccountRequiredError 的裸错;白名单页照常)。 */}
          {zeroAccountGuarded ? <ZeroAccountGuidance /> : children}
        </ShellRouter>
      </SidebarBrandNameProvider>
      {/* The @modal parallel slot renders intercepting-route overlays
          (currently `/projects/new`). It is rendered above the AppShell
          so the dialog appears above the page chrome. */}
      {modal}
    </>
  );
}

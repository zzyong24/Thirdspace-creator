"use client";

/**
 * Sidebar is the pinned left rail shared by every CreatorOS page.
 *
 * Structure (D-002, D-003, D-004, D-005):
 *  - Brand + [T-129] 折叠开关
 *  - PrimaryNav (seven approved items in fixed order)
 *  - ContextSection (current project / quick access, when present)
 *  - AssistantPromoCard with two content variants: `assistant` (default)
 *    and `storage` (used by the Assets Center per D-003)
 *  - UserProfileCard
 *
 * Active state is derived from the `pathname` prop, not from a router hook, so
 * it is testable without a Next.js runtime.
 *
 * [T-129] 折叠态:client 组件(useState + localStorage 持久)—— 展开(图标+文字,w-sidebar)↔
 * 收拢(仅图标窄条 w-16 + hover tooltip 显名)。默认展开(SSR 安全,localStorage 挂载后读),
 * 状态存 localStorage `creatoros:sidebar:collapsed`。宽度由 aside 宽度 class 跟随,主框 flex-1
 * 自动补位(AppShell 无需改)。
 */

import * as React from "react";
import Image from "next/image";
import Link from "next/link";
import { usePrimaryNavigation } from "./use-primary-navigation";
import {
  LoaderCircle,
  PanelLeftClose,
  PanelLeftOpen,
  Sparkles,
  type LucideIcon,
} from "lucide-react";

import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { creatorIcons } from "@/lib/icons";
import {
  PACKAGE_BRAND_ICON_DATA_URL,
  PACKAGE_BRAND_NAME,
  PACKAGE_BRAND_SIDEBAR_STYLE,
  resolveVisibleBrandName,
} from "@/lib/package-brand";
import { cn } from "@/lib/utils";
import { canonicalDataset } from "@/fixtures/canonical";
import { SidebarStorageCard } from "./sidebar-storage-card";
import { AccountSwitcher } from "./account-switcher";
import { IssueFeedbackDialog } from "./issue-feedback-dialog";

// [T-129] 折叠态持久化键。收拢="1"、展开="0"/缺失。隐私模式/禁用 storage → try/catch 降级不持久。
const SIDEBAR_COLLAPSED_KEY = "creatoros:sidebar:collapsed";

// ---------------------------------------------------------------------------
// [T-530] 渠道品牌名(轻贴牌):左上角品牌字样
// ---------------------------------------------------------------------------
//
// 数据通路:(creator)/layout.tsx(RSC)服务端读已验证 channel runtime → 经下方
// Provider 注入(server → client 单向只读,非全局 store;同款先例 =
// current-project-context 的 CurrentProjectProvider)。Sidebar 在 client 侧消费。
// 显示规则:brandName 有效 → 左上角显示品牌名;null/缺失/未激活/官方码 → 官方名
// 「CreatorOS」。**品牌名回退官方名不涉密**(显示名而已),与渠道链接「null 绝不
// 回退官方链接」的白标红线不同 —— 链接红线原样保留,别混淆。

interface SidebarChannelRuntimeContextValue {
  readonly brandName: string | null;
  readonly bugFeedbackUrl: string | null | undefined;
  readonly packageBrandName: string;
  readonly packageBrandIconDataUrl: string | null;
}

const SidebarChannelRuntimeContext =
  React.createContext<SidebarChannelRuntimeContextValue>({
    brandName: null,
    // undefined 只用于没有 Provider 的组件测试兼容；正式布局始终传入已验签投影。
    bugFeedbackUrl: undefined,
    packageBrandName: PACKAGE_BRAND_NAME,
    packageBrandIconDataUrl: PACKAGE_BRAND_ICON_DATA_URL,
  });

/** [T-530] 品牌名注入口(由 (creator)/layout.tsx 服务端包裹;缺 Provider = 官方名)。 */
export function SidebarBrandNameProvider({
  brandName,
  bugFeedbackUrl,
  packageBrandName = PACKAGE_BRAND_NAME,
  packageBrandIconDataUrl = PACKAGE_BRAND_ICON_DATA_URL,
  children,
}: {
  readonly brandName: string | null;
  readonly bugFeedbackUrl?: string | null;
  readonly packageBrandName?: string;
  readonly packageBrandIconDataUrl?: string | null;
  readonly children: React.ReactNode;
}) {
  return (
    <SidebarChannelRuntimeContext.Provider
      value={{
        brandName,
        bugFeedbackUrl,
        packageBrandName,
        packageBrandIconDataUrl,
      }}
    >
      {children}
    </SidebarChannelRuntimeContext.Provider>
  );
}

/** 有效(非空非纯空白)才用品牌名,否则官方名。读端已按契约清洗,这里薄防线兜底。 */
// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

export type SidebarContextualCardVariant = "assistant" | "storage";

export interface SidebarContextSection {
  readonly heading: string;
  readonly items: ReadonlyArray<{
    readonly id: string;
    readonly label: string;
    readonly href: string;
    readonly indicator?: "unread" | "active" | "default";
  }>;
}

export interface SidebarUser {
  readonly displayName: string;
  readonly email: string;
  readonly planLabel: string;
  readonly initials: string;
}

export interface SidebarProps {
  readonly pathname: string;
  readonly contextualCardVariant?: SidebarContextualCardVariant;
  readonly contextSection?: SidebarContextSection;
  readonly user?: SidebarUser;
  readonly className?: string;
}

interface NavEntry {
  readonly id: string;
  readonly label: string;
  readonly href: string;
  readonly icon: LucideIcon;
  readonly match: (pathname: string) => boolean;
}

function PrimaryNavContents({icon:Icon,label,collapsed,pending}:{icon:LucideIcon;label:string;collapsed:boolean;pending:boolean}) {
  return <>
    {pending?<LoaderCircle className="size-4 shrink-0 animate-spin text-primary" aria-hidden="true"/>:<Icon className="size-4 shrink-0" aria-hidden="true"/>}
    {!collapsed?<span>{label}</span>:null}
    {pending?<span role="status" className={collapsed?"sr-only":"ml-auto text-[10px] text-primary"}>正在打开</span>:null}
  </>;
}

const PRIMARY_NAV: ReadonlyArray<NavEntry> = [
  { id: "dashboard", label: "首页", href: "/", icon: creatorIcons.dashboard, match: matchExact("/") },
  { id: "overview", label: "创作者总览", href: "/overview", icon: creatorIcons.operations, match: matchExact("/overview") },
  // 定位中心 — the upstream constraint source (七步①②, SPEC §3.4): 排在「项目」前.
  { id: "positioning", label: "定位中心", href: "/positioning", icon: creatorIcons.positioning, match: matchExact("/positioning") },
  // T-482 内容雷达：定位之后先观察真实信源，再由用户转为选题。
  { id: "intelligence", label: "内容雷达", href: "/intelligence", icon: creatorIcons.radar, match: matchPrefix("/intelligence") },
  // 选题候选池 — 七步③, SPEC §5.5: AI/受众信号 → 按综合评分排序的待选选题. 紧跟定位中心
  // (定位→选题→项目 的上游顺序): 定位约束选题, 选题落地为项目. [T-052 裁决③] 排序措辞去变现化。
  { id: "topics", label: "选题", href: "/topics", icon: creatorIcons.topics, match: matchExact("/topics") },
  // [T-112] 独立「校准」模块退役(IA 收敛 SPEC §A):校准能力只走稿面盲预测
  // (blind-predict-row)+ Copilot calibration.diagnose 深链,不再有独立 /calibration 中心页。
  { id: "projects", label: "项目", href: "/projects", icon: creatorIcons.projects, match: matchPrefix("/projects") },
  { id: "knowledge", label: "知识库", href: "/knowledge", icon: creatorIcons.knowledge, match: matchExact("/knowledge") },
  { id: "assets", label: "素材中心", href: "/assets", icon: creatorIcons.assets, match: matchExact("/assets") },
  { id: "canvases", label: "创作画布", href: "/canvases", icon: creatorIcons.canvas, match: matchPrefix("/canvases") },
  // [FE-M03] `/calendar`(内容日历)是发布中心的子面(shell-router 标题即「内容日历(发布中心)」),
  // 故其高亮跟随「发布中心」。`/accounts`、`/search` 无对应导航项 → 不高亮任何项(见 findActiveNav)。
  { id: "publishing", label: "发布中心", href: "/publishing", icon: creatorIcons.publishing, match: (pathname) => pathname === "/publishing" || pathname === "/calendar" },
  { id: "operations", label: "运营分析", href: "/daily-report", icon: creatorIcons.operations, match: matchPrefix("/daily-report") },
  // 自动化 — 七步下游数据采集(T-007, data-source-pipeline §9 D6): 周期抓「自己作品指标/评论」
  // 的调度作业, 数据落库供 Dashboard/选题消费. 归在运营/采集类, 紧跟发布中心.
  { id: "automations", label: "自动化", href: "/automations", icon: creatorIcons.automations, match: matchPrefix("/automations") },
  // MONE-01:变现中心移除/隐藏(太难且不影响飞轮,见 lifecycle spec §4)。路由保留但无入口。
  // [T-118c] 独立「经验沉淀」模块彻底退役:已验证经验并入 /knowledge 作只读一等类型(T-118b),
  // 裁决迁进复盘页(T-118a);/experience 路由 307 重定向到 /knowledge,无独立 nav 项。
  { id: "settings", label: "设置", href: "/settings", icon: creatorIcons.settings, match: matchExact("/settings") },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function matchExact(target: string) {
  return (pathname: string) => pathname === target;
}

function matchPrefix(prefix: string) {
  return (pathname: string) => pathname === prefix || pathname.startsWith(`${prefix}/`);
}

// [FE-M03] 无匹配 → null(不再错误兜底高亮「首页」)。`/accounts`、`/search` 等无导航项的
// 路由下,不选中任何项;aria-current 也随之不落在任何链接上。
function findActiveNav(pathname: string): string | null {
  return PRIMARY_NAV.find((entry) => entry.match(pathname))?.id ?? null;
}

function initialsFromName(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0]?.slice(0, 1) ?? "?";
  return `${parts[0]?.charAt(0) ?? ""}${parts[parts.length - 1]?.charAt(0) ?? ""}`.toUpperCase();
}

// ---------------------------------------------------------------------------
// Components
// ---------------------------------------------------------------------------

export function Sidebar({
  pathname,
  contextualCardVariant = "assistant",
  contextSection,
  user,
  className,
}: SidebarProps) {
  const channelRuntime = React.useContext(SidebarChannelRuntimeContext);
  const activeNavId = findActiveNav(pathname);
  const resolvedUser = resolveUser(user);
  // [T-129] 折叠态。默认展开(SSR/首帧一致,避免 hydration mismatch);挂载后读 localStorage,
  // 是收拢态则切过去(收拢用户会有一帧展开闪,可接受)。
  const [collapsed, setCollapsed] = React.useState(false);
  const desktopCollapsed = React.useRef(false);
  React.useEffect(() => {
    try {
      desktopCollapsed.current = window.localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === "1";
    } catch {
      /* storage 不可用 → 维持展开(默认),不崩 */
    }
    const narrow = window.matchMedia("(max-width: 1024px)");
    const sync = () => setCollapsed(narrow.matches || desktopCollapsed.current);
    // eslint-disable-next-line react-hooks/set-state-in-effect -- 挂载时同步真实视口与桌面偏好，SSR 首帧保持一致
    sync();
    const change = (event: MediaQueryListEvent) => setCollapsed(event.matches || desktopCollapsed.current);
    narrow.addEventListener("change", change);
    return () => narrow.removeEventListener("change", change);
  }, []);
  const handleToggle = React.useCallback(() => {
    setCollapsed((prev) => {
      const next = !prev;
      // 自动收起不覆盖桌面偏好；窄窗口仍可由用户临时展开。
      if (!window.matchMedia("(max-width: 1024px)").matches) desktopCollapsed.current = next;
      try {
        if (!window.matchMedia("(max-width: 1024px)").matches) window.localStorage.setItem(SIDEBAR_COLLAPSED_KEY, next ? "1" : "0");
      } catch {
        /* 写失败(隐私模式)→ 本次会话内切换仍生效,只是不持久 */
      }
      return next;
    });
  }, []);
  return (
    <TooltipProvider delayDuration={0}>
      <aside
        data-slot="app-sidebar"
        data-testid="app-sidebar"
        data-collapsed={collapsed ? "true" : "false"}
        aria-label="主侧栏"
        style={PACKAGE_BRAND_SIDEBAR_STYLE as React.CSSProperties}
        className={cn(
          "flex h-dvh min-h-0 shrink-0 flex-col gap-4 overflow-hidden border-r border-border bg-surface pb-8 pt-6 transition-[width] duration-200 [@media(max-height:760px)]:gap-2 [@media(max-height:760px)]:py-3",
          collapsed ? "w-16 px-2" : "w-sidebar px-4",
          className,
        )}
      >
        <SidebarHeader collapsed={collapsed} onToggle={handleToggle} />
        <div
          data-slot="sidebar-scroll-region"
          className="min-h-0 flex-1 overflow-y-auto overscroll-contain"
        >
          <PrimaryNav activeId={activeNavId} collapsed={collapsed} />
          {contextSection && !collapsed ? (
            <ContextSection section={contextSection} />
          ) : null}
        </div>
        <div
          data-slot="sidebar-identity-footer"
          className={cn(
            "flex shrink-0 flex-col gap-card-gap [@media(max-height:760px)]:gap-2",
            collapsed && "items-center",
          )}
        >
          {/* 收拢态隐藏促销/存储卡(留出窄条空间);展开态照旧。 */}
          {!collapsed ? (
            <SidebarContextualCard
              variant={contextualCardVariant}
              userDisplayName={resolvedUser.displayName}
            />
          ) : null}
          <IssueFeedbackDialog
            pathname={pathname}
            collapsed={collapsed}
            bugFeedbackUrl={channelRuntime.bugFeedbackUrl}
          />
          {/* [T-136 切片 a] 当前抖音号切换器(多号 = 多独立人设);紧挨用户区上方,
              展开/收拢态都渲染(收拢态只显图标 + tooltip)。 */}
          <AccountSwitcher collapsed={collapsed} />
          <UserProfileCard
            collapsed={collapsed}
            displayName={resolvedUser.displayName}
            email={resolvedUser.email}
            planLabel={resolvedUser.planLabel}
            initials={resolvedUser.initials}
          />
        </div>
      </aside>
    </TooltipProvider>
  );
}

// ---------------------------------------------------------------------------
// Brand + [T-129] 折叠开关
// ---------------------------------------------------------------------------

function SidebarHeader({
  collapsed,
  onToggle,
}: {
  collapsed: boolean;
  onToggle: () => void;
}) {
  // The brand is a visual anchor, not a focusable link — the home route
  // is reachable through the primary nav. Keeping the brand out of the
  // focus order ensures the first Tab lands inside the TopHeader.
  //
  // [T-718] Growth 已验签名称优先；未激活/暂不可用时使用构建期包品牌。
  const { brandName, packageBrandName, packageBrandIconDataUrl } =
    React.useContext(SidebarChannelRuntimeContext);
  const brandDisplayName = resolveVisibleBrandName(
    brandName,
    packageBrandName,
  );
  return (
    <div
      data-slot="sidebar-header"
      className={cn(
        "mb-7 flex [@media(max-height:760px)]:mb-2",
        collapsed
          ? "flex-col items-center gap-2"
          : "items-center justify-between",
      )}
    >
      <div
        data-slot="sidebar-brand"
        aria-hidden="true"
        className={cn(
          // min-w-0 让长品牌名可被 truncate 裁剪(否则 flex 子项按内容宽撑爆窄栏)。
          "flex min-w-0 items-center text-[15px] font-semibold text-foreground",
          collapsed ? "" : "gap-2 px-2 py-1",
        )}
      >
        {packageBrandIconDataUrl ? (
          <Image
            src={packageBrandIconDataUrl}
            alt=""
            width={28}
            height={28}
            unoptimized
            className="size-7 shrink-0 rounded-md object-cover"
          />
        ) : (
          <span className="flex size-7 shrink-0 items-center justify-center rounded-md bg-brand text-primary-foreground">
            <Sparkles className="size-4" />
          </span>
        )}
        {!collapsed ? <span className="truncate">{brandDisplayName}</span> : null}
      </div>
      <SidebarCollapseToggle collapsed={collapsed} onToggle={onToggle} />
    </div>
  );
}

function SidebarCollapseToggle({
  collapsed,
  onToggle,
}: {
  collapsed: boolean;
  onToggle: () => void;
}) {
  const Icon = collapsed ? PanelLeftOpen : PanelLeftClose;
  const label = collapsed ? "展开侧栏" : "收起侧栏";
  const button = (
    <button
      type="button"
      data-slot="sidebar-collapse-toggle"
      data-testid="sidebar-collapse-toggle"
      aria-label={label}
      aria-pressed={collapsed}
      onClick={onToggle}
      className="flex size-8 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <Icon className="size-4" aria-hidden="true" />
    </button>
  );
  // 收拢态给 tooltip(窄条无文字);展开态按钮本身够清楚,不加 tooltip(避免与文字重复)。
  if (!collapsed) return button;
  return (
    <Tooltip>
      <TooltipTrigger asChild>{button}</TooltipTrigger>
      <TooltipContent side="right">{label}</TooltipContent>
    </Tooltip>
  );
}

// ---------------------------------------------------------------------------
// Primary nav
// ---------------------------------------------------------------------------

function PrimaryNav({
  activeId,
  collapsed,
}: {
  activeId: string | null;
  collapsed: boolean;
}) {
  const {navigate,pendingHref,error}=usePrimaryNavigation();
  return (
    <nav
      data-slot="sidebar-primary-nav"
      aria-label="主要导航"
      className="flex flex-col gap-1"
    >
      {error ? <p role="alert" className="text-xs text-destructive">{error}</p> : null}
      {PRIMARY_NAV.map((entry) => {
        const Icon = entry.icon;
        const isActive = entry.id === activeId;
        const link = (
          <Link
            href={entry.href}
            // 桌面单进程服务：未点击页面不抢占当前页面的查询资源。
            prefetch={false}
            onNavigate={(event)=>{event.preventDefault();navigate(entry.href)}}
            data-slot="sidebar-nav-item"
            data-active={isActive ? "true" : "false"}
            aria-current={isActive ? "page" : undefined}
            // 收拢态无可见文字 → aria-label + title 兜底可及性(tooltip 另作视觉提示)。
            aria-label={collapsed ? entry.label : undefined}
            title={collapsed ? entry.label : undefined}
            className={cn(
              "flex h-10 items-center rounded-md text-[13px] transition-colors",
              collapsed ? "justify-center px-0" : "gap-2.5 px-2.5",
              "text-muted-foreground hover:bg-muted hover:text-foreground",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              isActive && "bg-brand-soft font-medium text-brand",
            )}
          >
            <PrimaryNavContents icon={Icon} label={entry.label} collapsed={collapsed} pending={pendingHref===entry.href}/>
          </Link>
        );
        if (!collapsed) {
          return <React.Fragment key={entry.id}>{link}</React.Fragment>;
        }
        return (
          <Tooltip key={entry.id}>
            <TooltipTrigger asChild>{link}</TooltipTrigger>
            <TooltipContent side="right">{entry.label}</TooltipContent>
          </Tooltip>
        );
      })}
    </nav>
  );
}

// ---------------------------------------------------------------------------
// Context section
// ---------------------------------------------------------------------------

function ContextSection({ section }: { section: SidebarContextSection }) {
  return (
    <section
      data-slot="sidebar-context-section"
      aria-label={section.heading}
      className="flex flex-col gap-1"
    >
      <h2 className="px-2.5 text-xs font-medium uppercase tracking-wide text-text-subtle">
        {section.heading}
      </h2>
      <ul className="flex flex-col gap-0.5">
        {section.items.map((item) => (
          <li key={item.id}>
            <Link
              href={item.href}
              data-slot="sidebar-context-item"
              data-indicator={item.indicator ?? "default"}
              className={cn(
                "flex h-8 items-center justify-between rounded-control px-2.5 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                item.indicator === "active" && "bg-muted font-medium text-foreground",
              )}
            >
              <span className="truncate">{item.label}</span>
              {item.indicator === "unread" ? (
                <span
                  aria-hidden="true"
                  className="size-1.5 rounded-full bg-brand"
                />
              ) : null}
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Contextual promo card
// ---------------------------------------------------------------------------

interface SidebarContextualCardProps {
  readonly variant: SidebarContextualCardVariant;
  readonly userDisplayName: string;
}

function SidebarContextualCard({ variant, userDisplayName }: SidebarContextualCardProps) {
  if (variant === "storage") {
    // [T-115] storage 卡接真实源 —— 客户端拉 settings.storage.get,显真实
    // usedBytes / totalBytes(真实磁盘容量),读失败诚实降级。旧硬编码
    // (12.4/50GB · 固定 25% · 自动同步已开启)全删。
    return <SidebarStorageCard />;
  }
  return (
    <div
      data-slot="sidebar-contextual-card"
      data-variant="assistant"
      className="flex min-h-36 flex-col gap-3 rounded-xl border border-border bg-surface-subtle p-4 text-xs [@media(max-height:760px)]:hidden"
    >
      <div className="flex items-center gap-2 text-foreground">
        <span
          aria-hidden="true"
          className="flex size-6 items-center justify-center rounded-full bg-brand-soft text-brand"
        >
          <Sparkles className="size-3.5" />
        </span>
        <span className="font-medium">AI 助手</span>
      </div>
      <p className="text-muted-foreground">
        {`${userDisplayName}，今天想先做点什么？`}
      </p>
      {/* bug #3:query-only href(以 `?` 开头)= 保持当前页路径,就地开 Copilot 浮层,不跳首页。
          [T-096 #1] 显式 scope=global:全局入口有自己的会话桶(不再借 topics 桶),
          延续全局会话 + 历史只列全局(修「左下角每次新建对话」根因)。 */}
      <Link
        href="?copilot=open&scope=global"
        prefetch={false}
        className="text-brand underline-offset-4 hover:underline"
      >
        打开 AI 助手
      </Link>
    </div>
  );
}

// ---------------------------------------------------------------------------
// User profile card
// ---------------------------------------------------------------------------

// [T-231⑦] 纯展示的用户卡(原名 UserProfileMenu 名不副实 —— 从来只是静态 div,无菜单)。
// 审计裁定**不挂登出菜单**:T-046 单机免登录语义下(request-context.server.ts:无 session
// token / token 失效 → 以本机主用户直通,登录页已下线),登出后一刷新即自动回登,
// 「退出登录」是无意义按钮;/api/v1/auth/logout 保留给未来多用户/web 形态。
// 故这里只做身份展示(头像/名/邮箱/套餐),不做任何可点菜单暗示。
function UserProfileCard({
  collapsed,
  displayName,
  email,
  planLabel,
  initials,
}: {
  collapsed: boolean;
  displayName: string;
  email: string;
  planLabel: string;
  initials: string;
}) {
  // [T-129] 收拢态:仅头像(tooltip 显名+套餐),窄条不摆姓名/邮箱/套餐条。
  if (collapsed) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <div
            data-slot="sidebar-user-profile"
            aria-label={displayName}
            className="flex items-center justify-center rounded-card border border-border bg-surface p-1.5"
          >
            <Avatar size="sm">
              <AvatarFallback>{initials}</AvatarFallback>
            </Avatar>
          </div>
        </TooltipTrigger>
        <TooltipContent side="right">
          {displayName} · {planLabel}
        </TooltipContent>
      </Tooltip>
    );
  }
  return (
    <div
      data-slot="sidebar-user-profile"
      className="flex items-center gap-2 rounded-card border border-border bg-surface p-2.5"
    >
      <Avatar size="sm">
        <AvatarFallback>{initials}</AvatarFallback>
      </Avatar>
      <div className="flex min-w-0 flex-1 flex-col">
        <span className="truncate text-sm font-medium text-foreground">
          {displayName}
        </span>
        <span className="truncate text-xs text-muted-foreground">{email}</span>
      </div>
      <Badge variant="secondary" className="shrink-0 text-[10px]">
        {planLabel}
      </Badge>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Defaults
// ---------------------------------------------------------------------------

function resolveUser(overrides: SidebarProps["user"]) {
  if (overrides) return {...overrides,displayName:overrides.displayName.trim() || "创作者"};
  const user = canonicalDataset.user;
  return {
    displayName: user.displayName,
    email: user.email,
    planLabel: "个人版",
    initials: initialsFromName(user.displayName),
  };
}

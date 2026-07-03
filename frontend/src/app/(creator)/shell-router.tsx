"use client";

/**
 * ShellRouter derives the AppShell props from the current pathname and
 * mounts the overlay infrastructure that watches `?copilot=open` and any
 * intercepting modal route currently active.
 *
 * The (creator) layout is a Server Component so the route outlet stays
 * server-rendered. ShellRouter is a small Client island that reads
 * `usePathname()` and maps the URL to a TopHeader mode, a Sidebar
 * contextual-card variant, a page heading, an optional current-project
 * identity, and an overlay-mask state. The `useSearchParams()` consumer
 * is the child `OverlayController`, which Next.js prerenders with a
 * Suspense fallback.
 *
 * Pure functions, no `Date.now`, no `Math.random`, no network access. The
 * resolver never branches on cookies or auth state.
 */

import * as React from "react";
import { usePathname } from "next/navigation";

import { AppShell } from "@/components/shell/app-shell";
import type {
  SidebarContextSection,
  SidebarContextualCardVariant,
} from "@/components/shell/sidebar";
import type {
  TopHeaderMode,
  TopHeaderProjectIdentity,
  TopHeaderStage,
} from "@/components/shell/top-header";
import { OverlayController } from "@/components/overlays/overlay-controller";
import { AICopilotDialog } from "@/components/overlays/ai-copilot-dialog";
import { CopilotOverlayBridge } from "@/components/overlays/copilot-overlay-bridge";
import { canonicalDataset } from "@/fixtures/canonical";
import type { NotificationsViewModel } from "@/fixtures/selectors";
import {
  useCurrentProjectOverride,
  type CurrentProjectOverride,
} from "./current-project-context";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function startsWith(pathname: string, prefix: string): boolean {
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

function resolveProjectRouteId(projectId: string): string {
  if (projectId === "ai-native-browser") {
    return "project-ainativebrowser";
  }
  return projectId;
}

interface RouteResolution {
  readonly headerMode: TopHeaderMode;
  readonly pageTitle?: string;
  readonly pageDescription?: string;
  readonly contextualCardVariant: SidebarContextualCardVariant;
  readonly sidebarContext?: SidebarContextSection;
  readonly project?: TopHeaderProjectIdentity;
  readonly primaryActionLabel?: string;
  readonly secondaryActionLabel?: string;
  readonly projectStages?: ReadonlyArray<TopHeaderStage>;
}

/**
 * 走「填满」固定高度布局的工作台路由集合 (band/funnel 钉住、中间列各自框内滚)。
 * 这些页自己用 flex 真高度排版,自管内部滚动 → 开启 AppShell 的 contentFill 模式,
 * 不需要外层 PageScrollArea 整页滚动 (避免双滚动条)。简单页不在此集合,维持整体滚动。
 */
const CONTENT_FILL_ROUTES: ReadonlySet<string> = new Set([
  "/topics",
  "/calibration",
  "/positioning",
]);

/** 该路由是否走固定高度填满模式。工作台路由 + [T-055a] 稿面工作台(/projects/<id>,
 * 无 stage 子段;new 除外——那是新建弹窗拦截路由)。 */
export function isContentFillRoute(pathname: string): boolean {
  if (CONTENT_FILL_ROUTES.has(pathname)) return true;
  const m = pathname.match(/^\/projects\/([^/]+)$/);
  return Boolean(m && m[1] !== "new");
}

const PROJECT_STAGES = [
  { id: "research", label: "研究" },
  { id: "planning", label: "策划" },
  { id: "script", label: "脚本" },
  { id: "production", label: "拍摄" },
  { id: "publishing", label: "发布" },
  { id: "review", label: "复盘" },
] as const;

// T-010: 项目概览头部元信息读真值。阶段标签取自真实 currentStage,「更新于」由
// 真实 updatedAt 派生为粗粒度相对时间(不再写死「今天 14:30」)。
function stageLabel(stageId: string): string {
  return PROJECT_STAGES.find((stage) => stage.id === stageId)?.label ?? stageId;
}

function relativeUpdatedLabel(updatedAt: string): string {
  const updated = new Date(updatedAt).getTime();
  if (Number.isNaN(updated)) return "";
  const diffMs = Date.now() - updated;
  const day = 24 * 60 * 60 * 1000;
  if (diffMs < 60 * 60 * 1000) return "更新于 1 小时内";
  if (diffMs < day) return "更新于 今天";
  if (diffMs < 2 * day) return "更新于 昨天";
  const days = Math.floor(diffMs / day);
  return `更新于 ${days} 天前`;
}

function buildProjectStages(currentStage: string): ReadonlyArray<TopHeaderStage> {
  const currentIndex = PROJECT_STAGES.findIndex(
    (stage) => stage.id === currentStage,
  );
  return PROJECT_STAGES.map((stage, index) => ({
    ...stage,
    status:
      index < currentIndex
        ? "completed"
        : index === currentIndex
          ? "in_progress"
          : "pending",
  }));
}

function resolveWorkspacePrimaryAction(stage: string): string {
  if (stage === "research") return "进入下一步:策划构思";
  if (stage === "planning") return "进入下一步:脚本撰写";
  if (stage === "script") return "进入下一步:拍摄制作";
  if (stage === "production") return "完成制作";
  if (stage === "publishing") return "查看数据";
  if (stage === "review") return "导出报告";
  return "进入下一步";
}

export function resolveRoute(
  pathname: string,
  // T-039b item②:真项目 identity override(从 projects/[projectId]/layout.tsx 经 client context
  // 灌进来)。项目路由下有真 {projectId,title} 时,标题优先用真值(fixture 里查不到真项目 → 原来
  // 退回中性「当前项目」)。非项目路由 / 无 override → 走原 fixture 逻辑,**不破坏现有 fixture 路由**。
  override?: CurrentProjectOverride | null,
): RouteResolution {
  if (pathname === "/") {
    return {
      headerMode: "global",
      // [T-063a] 首页 → 今日台(北极星 IA:回答「今天干什么」;行动队列在 T-063b 落地)。
      pageTitle: "今日台",
      pageDescription: "今天干什么——行动队列与真值趋势",
      contextualCardVariant: "assistant",
    };
  }
  // [T-063a] 库:素材 + 知识 + 经验 三 tab 的统一资产面(回答「攒下了什么」)。
  if (pathname === "/library") {
    return {
      headerMode: "global",
      pageTitle: "库",
      pageDescription: "素材、知识与经验——你攒下的一切",
      contextualCardVariant: "assistant",
    };
  }
  // [T-063a] 以下旧一级路由已在 app 路由层 301(→ /projects·/library·/settings 对应
  // tab);resolveRoute 条目保留,作为跳转前一瞬间渲染的标题兜底(书签/深链不断)。
  if (pathname === "/positioning") {
    return {
      headerMode: "global",
      pageTitle: "定位中心",
      pageDescription: "账号定位与定位陈述版本链 · 下游选题/评分的约束源",
      contextualCardVariant: "assistant",
    };
  }
  if (pathname === "/accounts") {
    return {
      headerMode: "global",
      pageTitle: "账号管理(设置)",
      pageDescription: "多账号矩阵 · 每个发布/指标归到真实账号，而不是一个字符串（七步⑤）",
      contextualCardVariant: "assistant",
    };
  }
  if (pathname === "/calendar") {
    return {
      headerMode: "global",
      pageTitle: "内容日历(发布中心)",
      pageDescription: "发布节奏 · 这周该发什么、哪个账号断更了（七步⑦ · §7.2）",
      contextualCardVariant: "assistant",
    };
  }
  if (pathname === "/projects") {
    return {
      headerMode: "global",
      // [T-063a] 项目 → 作品:候选/进行中/已发布/排期 全生命周期 tab(北极星 IA §1)。
      pageTitle: "作品",
      pageDescription: "候选 → 进行中 → 已发布 → 排期,一条作品的全生命周期",
      contextualCardVariant: "assistant",
    };
  }
  if (pathname === "/topics") {
    return {
      headerMode: "global",
      pageTitle: "选题候选池",
      // [T-052 裁决③] 「按变现潜力排序」随变现中心移除改为「按综合评分排序」。
      pageDescription: "AI / 受众信号 → 按综合评分排序的待选选题 · 一键晋升为 Project（七步③）",
      contextualCardVariant: "assistant",
    };
  }
  if (pathname === "/calibration") {
    return {
      headerMode: "global",
      pageTitle: "校准",
      pageDescription: "发布前盲预测 + 回流校准评分维度（七步⑤⑥ · §6.5）",
      contextualCardVariant: "assistant",
    };
  }
  if (pathname === "/projects/new") {
    return {
      headerMode: "global",
      pageTitle: "新建项目",
      contextualCardVariant: "assistant",
    };
  }
  if (startsWith(pathname, "/projects")) {
    const segments = pathname.split("/").filter(Boolean);
    // /projects/:projectId/...
    const projectId = segments[1] ?? "";
    const stage = segments[2];
    const resolvedProjectId = resolveProjectRouteId(projectId);
    const project = canonicalDataset.projects.find(
      (item) => item.id === resolvedProjectId,
    );
    // T-039b item②:真项目标题优先级 —— override(server 读真值)> fixture project.title > 中性态。
    // override 仅在 URL 段与它匹配时采信(它就是据本 pathname 的 projectId 在 layout 里解析出来的,
    // 但多加一道 routeParam 校验,防串味)。有真标题 → header + 左下角指示器都显真名,不再退中性。
    const overrideTitle =
      override && override.routeParam === projectId ? override.title.trim() : "";
    const realTitle = overrideTitle || project?.title || "";
    const identity: TopHeaderProjectIdentity | undefined =
      project || realTitle
        ? {
            projectId: project?.id ?? resolvedProjectId,
            title: realTitle || "项目",
            stage: project?.currentStage ?? "research",
            stageProgressPct: project?.progressPct ?? 0,
            // T-010: 真实「<阶段> · 更新于 …」,派生自 fixture project 真值(有则);override 只带
            // 标题(shell 指示器/header 主要需要它),阶段/时间等仍走 fixture 兜底,无 fixture 则空串
            // (header 用 `updatedLabel ? … : "最近更新 —"` 兜底,不摆假时间)。
            updatedLabel: project
              ? [
                  stageLabel(project.currentStage),
                  relativeUpdatedLabel(project.updatedAt),
                ]
                  .filter(Boolean)
                  .join(" · ")
              : "",
            ...(project?.brief ? { brief: project.brief } : {}),
            starred: project?.starred ?? false,
          }
        : undefined;

    // 左下角指示器 + header 的标题:真标题优先,否则维持中性「当前项目」/「项目概览」。
    const sidebarLabel = realTitle || "当前项目";

    if (!stage) {
      // [T-055a] 稿面工作台:页面自带顶条(标题/成熟度/主行动),shell 不再叠
      // 「项目概览」大标题头(双头冗余);走 contentFill 全高布局。
      return {
        headerMode: "global",
        pageTitle: "",
        contextualCardVariant: "assistant",
        project: identity,
        sidebarContext: {
          heading: "当前项目",
          items: [
            {
              id: projectId,
              label: sidebarLabel,
              href: pathname,
              indicator: "active",
            },
          ],
        },
      };
    }
    return {
      headerMode: "project-workspace",
      pageTitle: realTitle || undefined,
      contextualCardVariant: "assistant",
      project: identity,
      projectStages: buildProjectStages(stage),
      primaryActionLabel: resolveWorkspacePrimaryAction(stage),
      secondaryActionLabel: "分享",
      sidebarContext: {
        heading: "当前项目",
        items: [
          {
            id: projectId,
            label: sidebarLabel,
            href: `/projects/${projectId}`,
            indicator: "active",
          },
        ],
      },
    };
  }
  if (pathname === "/knowledge") {
    return {
      headerMode: "global",
      pageTitle: "知识库",
      pageDescription: "沉淀的笔记、灵感与外部参考",
      contextualCardVariant: "assistant",
    };
  }
  if (pathname === "/assets") {
    return {
      headerMode: "global",
      pageTitle: "素材中心",
      pageDescription: "所有图片、视频、音频与文档",
      contextualCardVariant: "storage",
    };
  }
  if (pathname === "/publishing") {
    return {
      headerMode: "global",
      pageTitle: "发布中心",
      pageDescription: "已发布内容、表现与排期",
      contextualCardVariant: "assistant",
    };
  }
  if (pathname === "/experience") {
    return {
      headerMode: "global",
      pageTitle: "经验沉淀",
      pageDescription: "被验证的创作经验与失败案例",
      contextualCardVariant: "assistant",
    };
  }
  if (pathname === "/search") {
    return {
      headerMode: "search",
      pageTitle: "全局搜索",
      contextualCardVariant: "assistant",
    };
  }
  if (pathname === "/settings") {
    return {
      headerMode: "global",
      pageTitle: "设置",
      pageDescription: "账号、偏好与系统",
      contextualCardVariant: "assistant",
    };
  }
  return {
    headerMode: "global",
    contextualCardVariant: "assistant",
  };
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * The Shell user-card identity (Module 00, Task 11). Derived on the server (the
 * (creator) layout session guard) from `identity.getCurrentUser(ctx)` and passed
 * down so the user profile card renders the logged-in user instead of importing
 * a static fixture. The resolver itself stays auth-agnostic — it never branches
 * on this value; it is forwarded to the Sidebar untouched.
 */
export interface ShellUser {
  readonly displayName: string;
  readonly email: string;
  readonly planLabel: string;
  readonly initials: string;
}

export interface ShellRouterProps {
  readonly children: React.ReactNode;
  readonly user?: ShellUser;
  // G1: the server-read Shell notifications, forwarded untouched to the
  // TopHeader bell. The resolver never branches on it.
  readonly notifications?: NotificationsViewModel;
  readonly hasInterceptingModal?: boolean;
  readonly overlayMasked?: boolean;
}

export function ShellRouter({
  children,
  user,
  notifications,
  hasInterceptingModal = false,
  overlayMasked = false,
}: ShellRouterProps) {
  const pathname = usePathname() ?? "/";
  // T-039b item②:项目路由下读真项目 identity(由 projects/[projectId]/layout.tsx 灌进 context)。
  // 非项目路由无 Provider → null → resolveRoute 走原 fixture 逻辑(向后兼容,不破坏现有路由)。
  const projectOverride = useCurrentProjectOverride();
  const resolution = resolveRoute(pathname, projectOverride);

  return (
    <AppShell
      pathname={pathname}
      user={user}
      notifications={notifications}
      headerMode={resolution.headerMode}
      pageTitle={resolution.pageTitle}
      pageDescription={resolution.pageDescription}
      contextualCardVariant={resolution.contextualCardVariant}
      sidebarContext={resolution.sidebarContext}
      project={resolution.project}
      projectStages={resolution.projectStages}
      primaryActionLabel={resolution.primaryActionLabel}
      secondaryActionLabel={resolution.secondaryActionLabel}
      contentFill={isContentFillRoute(pathname)}
      overlayMasked={hasInterceptingModal || overlayMasked}
    >
      {children}
      {/* The Copilot overlay controller is wrapped in a Suspense boundary
          because it consumes `useSearchParams()`, which Next.js requires
          during prerender. The fallback is `null` so the panel only
          appears on the client, after hydration. */}
      <React.Suspense fallback={null}>
        <OverlayController>
          <AICopilotDialog pathname={pathname} />
          <CopilotOverlayBridge />
        </OverlayController>
      </React.Suspense>
    </AppShell>
  );
}

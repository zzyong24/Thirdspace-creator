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

/** 该路由是否走固定高度填满模式。仅这几条工作台路由开启 (精确匹配,不含子路由)。 */
export function isContentFillRoute(pathname: string): boolean {
  return CONTENT_FILL_ROUTES.has(pathname);
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

export function resolveRoute(pathname: string): RouteResolution {
  if (pathname === "/") {
    return {
      headerMode: "global",
      pageTitle: "首页",
      pageDescription: "个人创作工作台总览",
      contextualCardVariant: "assistant",
    };
  }
  if (pathname === "/positioning") {
    return {
      headerMode: "global",
      pageTitle: "定位中心",
      pageDescription: "账号定位与定位陈述版本链 · 下游选题/评分的约束源",
      contextualCardVariant: "assistant",
    };
  }
  if (pathname === "/monetization") {
    return {
      headerMode: "global",
      pageTitle: "变现中心",
      pageDescription: "产品 / Offer / 线索 / 成交漏斗 · 诚实归因（§4.5 不强行 100% 分配）",
      contextualCardVariant: "assistant",
    };
  }
  if (pathname === "/accounts") {
    return {
      headerMode: "global",
      pageTitle: "账号管理",
      pageDescription: "多账号矩阵 · 每个发布/指标归到真实账号，而不是一个字符串（七步⑤）",
      contextualCardVariant: "assistant",
    };
  }
  if (pathname === "/calendar") {
    return {
      headerMode: "global",
      pageTitle: "内容日历",
      pageDescription: "发布节奏 · 这周该发什么、哪个账号断更了（七步⑦ · §7.2）",
      contextualCardVariant: "assistant",
    };
  }
  if (pathname === "/projects") {
    return {
      headerMode: "global",
      pageTitle: "项目",
      pageDescription: "所有项目及其当前阶段",
      contextualCardVariant: "assistant",
    };
  }
  if (pathname === "/topics") {
    return {
      headerMode: "global",
      pageTitle: "选题候选池",
      pageDescription: "AI / 受众信号 → 按变现潜力排序的待选选题 · 一键晋升为 Project（七步③）",
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
    const identity: TopHeaderProjectIdentity | undefined = project
      ? {
          projectId: project.id,
          title: project.title,
          stage: project.currentStage,
          stageProgressPct: project.progressPct,
          // T-010: 真实「<阶段> · 更新于 …」,派生自 project 真值,无假时间。
          updatedLabel: [
            stageLabel(project.currentStage),
            relativeUpdatedLabel(project.updatedAt),
          ]
            .filter(Boolean)
            .join(" · "),
          brief: project.brief,
          starred: project.starred,
        }
      : undefined;

    if (!stage) {
      return {
        headerMode: "project-overview",
        pageTitle: project?.title ?? "项目概览",
        contextualCardVariant: "assistant",
        project: identity,
        primaryActionLabel: "进入工作台",
        secondaryActionLabel: "分享",
        sidebarContext: {
          heading: "当前项目",
          items: [
            {
              id: projectId,
              label: project?.title ?? "当前项目",
              href: pathname,
              indicator: "active",
            },
          ],
        },
      };
    }
    return {
      headerMode: "project-workspace",
      pageTitle: project?.title,
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
            label: project?.title ?? "当前项目",
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
  const resolution = resolveRoute(pathname);

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

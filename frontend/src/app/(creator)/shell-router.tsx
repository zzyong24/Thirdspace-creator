"use client";

/**
 * ShellRouter derives the AppShell props from the current pathname.
 *
 * The (creator) layout is a Server Component so the route outlet stays
 * server-rendered. ShellRouter is a small Client island that reads
 * `usePathname()` and maps the URL to a TopHeader mode, a Sidebar
 * contextual-card variant, a page heading and an optional current-project
 * identity.
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
} from "@/components/shell/top-header";
import { canonicalDataset } from "@/fixtures/canonical";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function startsWith(pathname: string, prefix: string): boolean {
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

interface RouteResolution {
  readonly headerMode: TopHeaderMode;
  readonly pageTitle?: string;
  readonly pageDescription?: string;
  readonly contextualCardVariant: SidebarContextualCardVariant;
  readonly sidebarContext?: SidebarContextSection;
  readonly project?: TopHeaderProjectIdentity;
}

function resolveRoute(pathname: string): RouteResolution {
  if (pathname === "/") {
    return {
      headerMode: "global",
      pageTitle: "首页",
      pageDescription: "个人创作工作台总览",
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
  if (pathname === "/projects/new") {
    return {
      headerMode: "global",
      pageTitle: "新建项目",
      contextualCardVariant: "assistant",
    };
  }
  if (startsWith(pathname, "/projects/")) {
    const segments = pathname.split("/").filter(Boolean);
    // /projects/:projectId/...
    const projectId = segments[1] ?? "";
    const stage = segments[2];
    const project = canonicalDataset.projects.find((p) => p.id === projectId);
    const identity: TopHeaderProjectIdentity | undefined = project
      ? {
          projectId: project.id,
          title: project.title,
          stage: project.currentStage,
          stageProgressPct: project.progressPct,
          updatedLabel: "最近更新 —",
          starred: project.starred,
        }
      : undefined;

    if (!stage) {
      return {
        headerMode: "project-overview",
        pageTitle: project?.title ?? "项目概览",
        contextualCardVariant: "assistant",
        project: identity,
      };
    }
    return {
      headerMode: "project-workspace",
      pageTitle: project?.title,
      contextualCardVariant: "assistant",
      project: identity,
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

export interface ShellRouterProps {
  readonly children: React.ReactNode;
  readonly overlayMasked?: boolean;
}

export function ShellRouter({ children, overlayMasked = false }: ShellRouterProps) {
  const pathname = usePathname() ?? "/";
  const resolution = resolveRoute(pathname);
  return (
    <AppShell
      pathname={pathname}
      headerMode={resolution.headerMode}
      pageTitle={resolution.pageTitle}
      pageDescription={resolution.pageDescription}
      contextualCardVariant={resolution.contextualCardVariant}
      sidebarContext={resolution.sidebarContext}
      project={resolution.project}
      overlayMasked={overlayMasked}
    >
      {children}
    </AppShell>
  );
}

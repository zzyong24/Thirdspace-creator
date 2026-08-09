"use client";

/**
 * [T-098] CONTEXT_CARD_REGISTRY —— context.* 工具结果 kind → 渲染卡的全覆盖注册表
 * (SPEC 2026-07-03 context-layer-redesign §2.2)。
 *
 * 铁律:chat-tools 里每个 context.* 工具的结果 kind 必须在这里有卡 —— 覆盖锁测
 * (context-card-registry.test.tsx)遍历 allChatTools 的 context.* 工具断言全覆盖,
 * 新增 context 工具不配卡 = 测试红。「前端安全跳过」(旧 chat-tools.ts:286-288 注释)永久失效。
 *
 * 运行时兜底:未知 kind → ChatContextGenericCard(通用键值表格,真数据直渲),
 * 替换原 800 字 JSON trace 裸兜底 —— 即使注册漏网,用户看到的也是数据表格,不是模型转述。
 */

import * as React from "react";

import type {
  ContextArtifactsToolResult,
  ContextArtifactTextToolResult,
  ContextCandidatesToolResult,
  ContextCommentsToolResult,
  ContextKnowledgeDetailToolResult,
  ContextKnowledgeTextToolResult,
  ContextKnowledgeToolResult,
  ContextLearningsToolResult,
  ContextMaterialsToolResult,
  ContextMetricsToolResult,
  ContextPositioningDetailToolResult,
  ContextPredictionsToolResult,
  ContextProjectDetailToolResult,
  ContextProjectLifecycleToolResult,
  ContextProjectsToolResult,
  ContextProjectsSearchToolResult,
  ContextPublicationsToolResult,
  ContextReviewReportToolResult,
} from "@creatoros/backend/modules/ai-runtime";

import {
  ChatArtifactListCard,
  ChatArtifactTextCard,
  ChatCandidateListCard,
  ChatCommentListCard,
  ChatContextGenericCard,
  ChatKnowledgeDetailCard,
  ChatKnowledgeListCard,
  ChatKnowledgeTextCard,
  ChatLearningsListCard,
  ChatMetricsCard,
  ChatPositioningDetailCard,
  ChatPredictionsCard,
  ChatProjectDetailCard,
  ChatProjectLifecycleCard,
  ChatProjectListCard,
  ChatPublicationListCard,
  ChatReviewContextCard,
} from "./chat-context-cards";
import { ChatMaterialListCard } from "./chat-material-list-card";

/** 卡渲染上下文:当前对话关联的项目(素材卡「加入弹药」需要)。 */
export interface ContextCardCtx {
  readonly projectId: string | null;
}

export type ContextCardRenderer = (
  out: Record<string, unknown>,
  ctx: ContextCardCtx,
) => React.ReactNode;

/**
 * kind → 卡组件。out 由调用侧保证是对应工具的 output(与既有 dispatch 的结构化 cast
 * 惯例一致 —— 本文件内 cast 成各工具结果类型,字段缺失时组件按空值诚实降级)。
 */
export const CONTEXT_CARD_REGISTRY: Readonly<Record<string, ContextCardRenderer>> = {
  "context.projects": (out) => {
    const o = out as unknown as Partial<ContextProjectsToolResult>;
    return (
      <ChatProjectListCard
        items={o.items ?? []}
        total={o.total ?? (o.items?.length ?? 0)}
        hasMore={o.hasMore ?? false}
      />
    );
  },
  "context.projects.search": (out) => {
    const o = out as unknown as Partial<ContextProjectsSearchToolResult>;
    return (
      <ChatProjectListCard
        items={o.items ?? []}
        total={o.total ?? (o.items?.length ?? 0)}
        hasMore={o.hasMore ?? false}
      />
    );
  },
  "context.comments": (out) => {
    const o = out as unknown as Partial<ContextCommentsToolResult>;
    return (
      <ChatCommentListCard
        items={o.items ?? []}
        total={o.total ?? (o.items?.length ?? 0)}
        hasMore={o.hasMore ?? false}
      />
    );
  },
  "context.knowledge": (out) => {
    const o = out as unknown as Partial<ContextKnowledgeToolResult>;
    return <ChatKnowledgeListCard items={o.items ?? []} />;
  },
  // T-055c 活范式原卡,归入注册表统一分发(行为不变:逐条「加入弹药」)。
  "context.materials": (out, ctx) => {
    const o = out as unknown as Partial<ContextMaterialsToolResult>;
    return (
      <ChatMaterialListCard
        items={o.items ?? []}
        projectId={ctx.projectId}
        // [T-380] 空态诚实:带词没搜到 ≠ 库空(仅标题匹配),卡内按 query 分文案。
        query={o.query ?? ""}
      />
    );
  },
  // [T-099b] 切片二:详情类。数据从 tool-result part.output 直渲,不二次请求。
  "context.project.detail": (out) => {
    const o = out as unknown as Partial<ContextProjectDetailToolResult>;
    return <ChatProjectDetailCard project={o.project ?? null} />;
  },
  "context.project.lifecycle": (out) => {
    const o = out as unknown as Partial<ContextProjectLifecycleToolResult>;
    return <ChatProjectLifecycleCard lifecycle={o.lifecycle ?? null} />;
  },
  "context.review.report": (out) => {
    const o = out as unknown as Partial<ContextReviewReportToolResult>;
    return <ChatReviewContextCard report={o.report ?? null} />;
  },
  "context.positioning.detail": (out) => {
    const o = out as unknown as Partial<ContextPositioningDetailToolResult>;
    return (
      <ChatPositioningDetailCard
        positioning={
          o.positioning ?? {
            profile: null,
            currentStatement: null,
            statementCount: null,
            accounts: [],
          }
        }
      />
    );
  },
  "context.knowledge.detail": (out) => {
    const o = out as unknown as Partial<ContextKnowledgeDetailToolResult>;
    return <ChatKnowledgeDetailCard item={o.item ?? null} />;
  },
  // [T-099c] 切片三:全文类(产物清单 + 长文本窗口)。数据从 part.output 直渲,不二次请求。
  "context.artifacts": (out) => {
    const o = out as unknown as Partial<ContextArtifactsToolResult>;
    return (
      <ChatArtifactListCard
        found={o.found ?? false}
        projectTitle={o.projectTitle ?? ""}
        items={o.items ?? []}
      />
    );
  },
  "context.artifact.text": (out) => {
    const o = out as unknown as Partial<ContextArtifactTextToolResult>;
    return <ChatArtifactTextCard result={o} />;
  },
  // context.knowledge.text 复用全文阅读卡(SPEC §1 行#11:#11 复用 #4 卡)。
  "context.knowledge.text": (out) => {
    const o = out as unknown as Partial<ContextKnowledgeTextToolResult>;
    return <ChatKnowledgeTextCard result={o} />;
  },
  // [T-099 切片四] 指标/发布类。数据从 tool-result part.output 直渲,不二次请求。
  "context.publications": (out) => {
    const o = out as unknown as Partial<ContextPublicationsToolResult>;
    return (
      <ChatPublicationListCard
        items={o.items ?? []}
        total={o.total ?? (o.items?.length ?? 0)}
        hasMore={o.hasMore ?? false}
      />
    );
  },
  "context.metrics": (out) => {
    const o = out as unknown as Partial<ContextMetricsToolResult>;
    return (
      <ChatMetricsCard
        subject={o.subject ?? null}
        rows={o.rows ?? []}
        retention={o.retention ?? []}
      />
    );
  },
  // [T-099 切片五] 经验/候选/校准类。数据从 part.output 直渲,不二次请求。
  "context.learnings": (out) => {
    const o = out as unknown as Partial<ContextLearningsToolResult>;
    return (
      <ChatLearningsListCard
        items={o.items ?? []}
        total={o.total ?? (o.items?.length ?? 0)}
      />
    );
  },
  "context.candidates": (out) => {
    const o = out as unknown as Partial<ContextCandidatesToolResult>;
    return (
      <ChatCandidateListCard
        items={o.items ?? []}
        total={o.total ?? (o.items?.length ?? 0)}
        hasMore={o.hasMore ?? false}
      />
    );
  },
  "context.predictions": (out) => {
    const o = out as unknown as Partial<ContextPredictionsToolResult>;
    return (
      <ChatPredictionsCard
        rubric={o.rubric ?? null}
        items={o.items ?? []}
        total={o.total ?? (o.items?.length ?? 0)}
      />
    );
  },
};

/**
 * 按 kind 渲 context 数据卡;未注册 kind 走通用表格兜底(永不返回 null ——
 * context.* 的数据必须以卡形态到达用户)。
 */
export function renderContextCard(
  kind: string,
  out: Record<string, unknown>,
  ctx: ContextCardCtx,
): React.ReactNode {
  const renderer = CONTEXT_CARD_REGISTRY[kind];
  if (renderer) return renderer(out, ctx);
  return <ChatContextGenericCard kind={kind} out={out} />;
}

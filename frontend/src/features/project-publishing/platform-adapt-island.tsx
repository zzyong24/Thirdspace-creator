"use client";

/**
 * `PlatformAdaptIsland` — the 一稿多平台 node (publish.platform_adapt), a thin wrapper over
 * the shared `AdoptCandidateCard`. AI adapts one finished script into a per-platform draft
 * (抖音 / B站 / 小红书 / 公众号), each with its own title/body/tags/cover idea; 采纳 → each
 * draft becomes a real Publication (+ revision) under the project's primary ContentOutput.
 * Demonstrates the reusable candidate-confirm bus: this whole node is ~one render + a parse.
 */

import * as React from "react";

import { AdoptCandidateCard } from "@/components/ai/adopt-candidate-card";

interface PlatformDraft {
  platform: string;
  title: string;
  body: string;
  tags: string[];
  coverIdea: string;
}

const PLATFORM_LABEL: Record<string, string> = {
  douyin: "抖音",
  bilibili: "B站",
  xiaohongshu: "小红书",
  wechat: "公众号",
  wechatVideo: "视频号",
  youtube: "YouTube",
  x: "X",
};

function parseDrafts(resultData: Record<string, unknown>): PlatformDraft[] {
  const drafts = Array.isArray(resultData.drafts) ? resultData.drafts : [];
  return drafts
    .map((raw): PlatformDraft | null => {
      const o = (raw ?? {}) as Record<string, unknown>;
      const platform = typeof o.platform === "string" ? o.platform : "";
      const title = typeof o.title === "string" ? o.title : "";
      if (!platform || !title) return null;
      return {
        platform,
        title,
        body: typeof o.body === "string" ? o.body : "",
        tags: Array.isArray(o.tags)
          ? o.tags.filter((t): t is string => typeof t === "string")
          : [],
        coverIdea: typeof o.coverIdea === "string" ? o.coverIdea : "",
      };
    })
    .filter((d): d is PlatformDraft => d !== null);
}

function renderDraft(d: PlatformDraft) {
  return (
    <div className="flex flex-col gap-1 rounded-control border border-border bg-surface px-2.5 py-2 text-sm">
      <div className="flex items-center gap-2">
        <span className="shrink-0 rounded-full bg-brand-soft px-2 py-0.5 text-[11px] font-medium text-brand">
          {PLATFORM_LABEL[d.platform] ?? d.platform}
        </span>
        <span className="flex-1 font-medium leading-snug text-foreground">
          {d.title}
        </span>
      </div>
      {d.coverIdea ? (
        <span className="text-xs text-muted-foreground">封面：{d.coverIdea}</span>
      ) : null}
      {d.tags.length > 0 ? (
        <div className="flex flex-wrap gap-1">
          {d.tags.map((tag) => (
            <span
              key={tag}
              className="inline-flex h-4 items-center rounded-md bg-brand-soft px-1.5 text-[10px] font-medium text-brand"
            >
              #{tag}
            </span>
          ))}
        </div>
      ) : null}
    </div>
  );
}

export interface PlatformAdaptIslandProps {
  readonly projectId: string;
  readonly outputId: string;
  readonly topic: string;
}

export function PlatformAdaptIsland({
  projectId,
  outputId,
  topic,
}: PlatformAdaptIslandProps) {
  return (
    <AdoptCandidateCard<PlatformDraft>
      title="AI 一稿多平台"
      description="把这一稿改成各平台版本(抖音/B站/小红书/公众号),各自标题文案标签"
      startLabel="帮我改多平台"
      runningLabel="一稿多平台 agent 正在按各平台调性适配标题/文案/标签（可能要一两分钟）…"
      taskType="publish.platform_adapt"
      inputData={{ projectId, outputId, topic }}
      parseItems={parseDrafts}
      renderItem={renderDraft}
      adoptLabel={(n) => `采纳全部（${n}）建发布草稿`}
      doneLabel={(n) => `已为 ${n} 个平台建好发布草稿。`}
    />
  );
}

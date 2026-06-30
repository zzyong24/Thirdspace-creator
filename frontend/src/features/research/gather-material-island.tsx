"use client";

/**
 * `GatherMaterialIsland` — the Research stage's 搜集素材 node, now a thin wrapper over the
 * reusable `AdoptCandidateCard` (机制③). It only supplies the gather node's specifics:
 * taskType, the project topic, and how to parse/render a material item. The
 * createAITask→poll→采纳 loop lives in AdoptCandidateCard, shared with every other node.
 */

import * as React from "react";

import {
  AdoptCandidateCard,
  type ItemEditor,
} from "@/components/ai/adopt-candidate-card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

interface MaterialItem {
  title: string;
  url: string;
  source: string;
  why_relevant: string;
}

function parseMaterials(resultData: Record<string, unknown>): MaterialItem[] {
  const items = Array.isArray(resultData.items) ? resultData.items : [];
  return items
    .map((raw): MaterialItem | null => {
      const o = (raw ?? {}) as Record<string, unknown>;
      const title = typeof o.title === "string" ? o.title : "";
      if (!title) return null;
      return {
        title,
        url: typeof o.url === "string" ? o.url : "",
        source: typeof o.source === "string" ? o.source : "",
        why_relevant: typeof o.why_relevant === "string" ? o.why_relevant : "",
      };
    })
    .filter((m): m is MaterialItem => m !== null);
}

function renderMaterial(
  m: MaterialItem,
  _index: number,
  editor?: ItemEditor<MaterialItem>,
) {
  // CollabField(COLLAB-01):editor 在时 → title/why_relevant 渲成受控控件,采纳前可就地改。
  if (editor) {
    return (
      <div className="flex flex-col gap-1.5 rounded-control border border-border bg-surface px-2.5 py-2 text-sm">
        <Input
          aria-label="素材标题"
          value={m.title}
          disabled={editor.disabled}
          onChange={(e) => editor.onEdit({ title: e.target.value })}
          className="h-7 font-medium"
        />
        <Textarea
          aria-label="相关性说明"
          value={m.why_relevant}
          disabled={editor.disabled}
          onChange={(e) => editor.onEdit({ why_relevant: e.target.value })}
          className="min-h-12 text-xs"
        />
        <span className="flex items-center gap-2 text-[11px] text-text-subtle">
          {m.source ? <span>{m.source}</span> : null}
          {m.url ? (
            <a
              href={m.url}
              target="_blank"
              rel="noopener noreferrer"
              className="truncate text-brand hover:underline"
            >
              原文
            </a>
          ) : null}
        </span>
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-0.5 rounded-control border border-border bg-surface px-2.5 py-2 text-sm">
      <span className="font-medium leading-snug text-foreground">{m.title}</span>
      {m.why_relevant ? (
        <span className="text-xs text-muted-foreground">{m.why_relevant}</span>
      ) : null}
      <span className="flex items-center gap-2 text-[11px] text-text-subtle">
        {m.source ? <span>{m.source}</span> : null}
        {m.url ? (
          <a
            href={m.url}
            target="_blank"
            rel="noopener noreferrer"
            className="truncate text-brand hover:underline"
          >
            原文
          </a>
        ) : null}
      </span>
    </div>
  );
}

export function GatherMaterialIsland({
  projectId,
  topic,
  angle,
}: {
  projectId: string;
  topic: string;
  angle?: string;
}) {
  return (
    <AdoptCandidateCard<MaterialItem>
      title="AI 搜集素材"
      description="让 agent 按你的定位联网找相关素材"
      startLabel="帮我搜素材"
      runningLabel="agent 正在按你的定位联网搜集（可能要一两分钟）…"
      taskType="research.gather_material"
      inputData={{ projectId, topic, angle: angle ?? "" }}
      parseItems={parseMaterials}
      renderItem={renderMaterial}
      adoptLabel={(n) => `采纳全部（${n}）入知识库`}
      doneLabel={(n) => `已采纳 ${n} 条进知识库。`}
    />
  );
}

"use client";

/**
 * `GatherMaterialIsland` — the Research stage's 搜集素材 node, a thin wrapper over the
 * reusable `AdoptCandidateCard` (机制③). It supplies the gather node's specifics:
 * taskType, the project topic, and how to parse/render a material candidate. The
 * createAITask→poll→采纳 loop lives in AdoptCandidateCard, shared with every other node.
 *
 * L2「创作向重写」: the research node now emits four creation-oriented classes
 * (钩子/案例/数据点/金句) via a schema-constrained generateObject. The runner flattens
 * them into MaterialItem[] (each `title` carries a 「钩子：/案例：/数据：/金句：」 prefix) so
 * the existing material_list 采纳→KnowledgeItem path is unchanged; here we split that
 * prefix back into a class badge so the candidate list reads as the four classes.
 */

import * as React from "react";

import {
  AdoptCandidateCard,
  type ItemEditor,
} from "@/components/ai/adopt-candidate-card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { TagChip } from "@/components/content/tag-chip";

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

// 把 runner 摊平时打的「<类>：<正文>」前缀拆回 {类标签, 正文}。无识别前缀 → 当作素材(兜底)。
const CLASS_LABELS = ["钩子", "案例", "数据", "金句"] as const;
function splitClass(title: string): { cls: string | null; body: string } {
  const sep = title.indexOf("：");
  if (sep > 0) {
    const head = title.slice(0, sep);
    if ((CLASS_LABELS as readonly string[]).includes(head)) {
      return { cls: head, body: title.slice(sep + 1) };
    }
  }
  return { cls: null, body: title };
}

function renderMaterial(
  m: MaterialItem,
  _index: number,
  editor?: ItemEditor<MaterialItem>,
) {
  const { cls, body } = splitClass(m.title);
  // CollabField(COLLAB-01):editor 在时 → title/why_relevant 渲成受控控件,采纳前可就地改。
  // 注:受控编辑的是完整 title(含前缀),避免改字段时丢掉分类。
  if (editor) {
    return (
      <div className="flex flex-col gap-1.5 rounded-control border border-border bg-surface px-2.5 py-2 text-sm">
        <span className="flex items-center gap-1.5">
          {cls ? <TagChip label={cls} tone="brand" size="sm" /> : null}
          <Input
            aria-label="素材内容"
            value={m.title}
            disabled={editor.disabled}
            onChange={(e) => editor.onEdit({ title: e.target.value })}
            className="h-7 font-medium"
          />
        </span>
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
    <div
      data-slot="material-candidate"
      data-class={cls ?? "other"}
      className="flex flex-col gap-0.5 rounded-control border border-border bg-surface px-2.5 py-2 text-sm"
    >
      <span className="flex items-start gap-1.5">
        {cls ? <TagChip label={cls} tone="brand" size="sm" /> : null}
        <span className="min-w-0 flex-1 font-medium leading-snug text-foreground">
          {body}
        </span>
      </span>
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
      description="按你的定位生成可写进脚本的钩子 / 案例 / 数据点 / 金句"
      startLabel="帮我搜素材"
      runningLabel="agent 正在按你的定位备料（钩子 / 案例 / 数据点 / 金句）…"
      taskType="research.gather_material"
      inputData={{ projectId, topic, angle: angle ?? "" }}
      parseItems={parseMaterials}
      renderItem={renderMaterial}
      adoptLabel={(n) => `采纳全部（${n}）入知识库`}
      doneLabel={(n) => `已采纳 ${n} 条进知识库。`}
    />
  );
}

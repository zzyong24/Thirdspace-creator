"use client";

/**
 * 对话内 hook 候选组卡(T-055c,SPEC §5.1)。
 *
 * script.hooks 工具产的开场 hook 候选(非实体)渲成卡,逐条「写入稿面」:
 *   ensureScriptArtifact(写前记当前版本)→ 读当前 sections → 替换/置顶 hook 段
 *   → createArtifactVersion(append-only 物化,铁律②)→ router.refresh()
 *   (稿面脚本区 server 读侧重取,编辑器按 versionCount key 重挂新内容)。
 * 写入后卡上出系统行「已写入 · 撤销」—— 撤销 = restoreArtifact 回滚到写入前版本
 * (同样 append-only,复用 script-version-restore 的门)。
 *
 * 无项目上下文(未 @ 项目且非稿面右栏)→ 按钮禁用 + 显式提示,不静默(gate-F2 同款惯例)。
 */

import * as React from "react";
import { useRouter } from "next/navigation";

import { client } from "@/lib/contract-client";
import { ensureScriptArtifact } from "@/features/script/ensure-script-artifact";

export interface ChatHookItem {
  text: string;
  angle: string;
}

interface SectionRow {
  id?: string;
  heading?: string;
  body?: string;
  role?: string;
  [k: string]: unknown;
}

interface VersionRow {
  id: string;
  versionNumber: number;
  contentText?: string;
  contentData?: { sections?: SectionRow[] } | null;
}

interface ArtifactRow {
  id: string;
  currentVersionId?: string | null;
}

/** 读脚本 artifact 的当前版本(currentVersionId 优先,回退最大 versionNumber)。 */
async function readCurrentVersion(
  artifactId: string,
): Promise<VersionRow | null> {
  const artifact = (await client.getArtifact({
    params: { artifactId },
    query: undefined,
    body: undefined,
  })) as unknown as ArtifactRow;
  const versionsRaw = (await client.listArtifactVersions({
    params: { artifactId },
    query: { page: 1, pageSize: 100 },
    body: undefined,
  })) as unknown;
  const rows = (Array.isArray(versionsRaw) ? versionsRaw : []) as VersionRow[];
  if (rows.length === 0) return null;
  return (
    rows.find((v) => v.id === artifact.currentVersionId) ??
    rows.slice().sort((a, b) => b.versionNumber - a.versionNumber)[0] ??
    null
  );
}

/**
 * 把选中 hook 写进 sections:已有 role=hook(或标题含「hook/开场」)的段 → 替换其正文;
 * 没有 → 置顶插入一个 hook 段。返回新 sections(不改原数组)。
 */
export function applyHookToSections(
  sections: ReadonlyArray<SectionRow>,
  hookText: string,
): SectionRow[] {
  const isHookSection = (s: SectionRow) =>
    s.role === "hook" ||
    /hook|开场|开头/i.test(typeof s.heading === "string" ? s.heading : "");
  const idx = sections.findIndex(isHookSection);
  if (idx >= 0) {
    return sections.map((s, i) => (i === idx ? { ...s, body: hookText } : s));
  }
  return [
    { id: `hook-${hookText.length}`, heading: "HOOK 开场", body: hookText, role: "hook" },
    ...sections,
  ];
}

type WriteState =
  | { phase: "idle" }
  | { phase: "writing"; index: number }
  | {
      phase: "written";
      index: number;
      artifactId: string;
      previousVersionId: string | null;
    }
  | { phase: "undone" }
  | { phase: "error"; message: string };

export function ChatHookCard({
  items,
  projectId,
}: {
  items: ReadonlyArray<ChatHookItem>;
  projectId: string | null;
}) {
  const router = useRouter();
  const [state, setState] = React.useState<WriteState>({ phase: "idle" });

  const writeToDraft = React.useCallback(
    async (index: number) => {
      if (!projectId) return;
      const hook = items[index];
      if (!hook) return;
      setState({ phase: "writing", index });
      try {
        const ensured = (await ensureScriptArtifact(projectId, null)) as {
          artifactId: string;
        };
        const artifactId = ensured.artifactId;
        const current = await readCurrentVersion(artifactId);
        const sections = applyHookToSections(
          current?.contentData?.sections ?? [],
          hook.text,
        );
        await client.createArtifactVersion({
          params: { artifactId },
          query: undefined,
          body: {
            contentText: sections
              .map((s) => `${s.heading ?? ""}\n${s.body ?? ""}`.trim())
              .join("\n\n"),
            changeSummary: `对话写入 HOOK:${hook.text.slice(0, 24)}`,
            contentData: { sections },
          },
        });
        setState({
          phase: "written",
          index,
          artifactId,
          previousVersionId: current?.id ?? null,
        });
        router.refresh();
      } catch (err) {
        setState({
          phase: "error",
          message:
            err instanceof Error && err.message ? err.message : "写入失败,重试",
        });
      }
    },
    [items, projectId, router],
  );

  const undo = React.useCallback(async () => {
    if (state.phase !== "written") return;
    try {
      if (state.previousVersionId) {
        await client.restoreArtifact({
          params: { artifactId: state.artifactId },
          query: undefined,
          body: { versionId: state.previousVersionId },
        });
      }
      setState({ phase: "undone" });
      router.refresh();
    } catch (err) {
      setState({
        phase: "error",
        message:
          err instanceof Error && err.message ? err.message : "撤销失败,重试",
      });
    }
  }, [router, state]);

  if (items.length === 0) {
    return (
      <div
        data-slot="chat-hook-card"
        data-empty="true"
        className="mt-1 rounded-[10px] border border-dashed border-border px-3 py-2 text-[11px] text-text-subtle"
      >
        这轮没生成出可用的 hook 候选 —— 换个说法再试试。
      </div>
    );
  }

  return (
    <div
      data-slot="chat-hook-card"
      className="mt-1 flex w-full max-w-[420px] flex-col gap-1.5 rounded-[10px] border border-border bg-surface p-2.5"
    >
      <span className="text-[10px] font-medium uppercase tracking-wide text-brand">
        HOOK 候选 · 选一条写入稿面
      </span>
      <ol className="flex flex-col gap-1.5">
        {items.map((h, i) => {
          const writing = state.phase === "writing" && state.index === i;
          const written = state.phase === "written" && state.index === i;
          return (
            <li
              key={`${i}-${h.text.slice(0, 8)}`}
              data-slot="chat-hook-item"
              className="flex flex-col gap-1 rounded-md border border-border/70 bg-surface-subtle/50 px-2.5 py-2"
            >
              <span className="text-[13px] leading-relaxed text-foreground">
                {h.text}
              </span>
              <div className="flex items-center justify-between gap-2">
                <span className="text-[11px] text-text-subtle">
                  切角:{h.angle}
                </span>
                {written ? (
                  <span
                    data-slot="chat-hook-written"
                    className="text-[11px] font-medium text-success"
                  >
                    已写入稿面
                  </span>
                ) : (
                  <button
                    type="button"
                    data-slot="chat-hook-write"
                    disabled={!projectId || state.phase === "writing"}
                    onClick={() => void writeToDraft(i)}
                    className="inline-flex h-6 items-center rounded-control bg-brand px-2 text-[10px] font-medium text-brand-foreground hover:bg-brand/90 disabled:opacity-50"
                  >
                    {writing ? "写入中…" : "写入稿面"}
                  </button>
                )}
              </div>
            </li>
          );
        })}
      </ol>
      {!projectId ? (
        <p
          data-slot="chat-hook-no-project"
          className="text-[11px] text-text-subtle"
        >
          未关联项目 —— 输入 @ 引用一个项目后才能写入稿面。
        </p>
      ) : null}
      {state.phase === "written" ? (
        <div
          data-slot="chat-hook-system-row"
          className="flex items-center justify-between rounded-md bg-success-soft px-2.5 py-1.5 text-[11px] text-success"
        >
          <span>已写入稿面(新版本已保存)</span>
          <button
            type="button"
            data-slot="chat-hook-undo"
            onClick={() => void undo()}
            className="font-medium underline underline-offset-2 hover:opacity-80"
          >
            撤销
          </button>
        </div>
      ) : null}
      {state.phase === "undone" ? (
        <p
          data-slot="chat-hook-system-row"
          className="rounded-md bg-surface-subtle px-2.5 py-1.5 text-[11px] text-muted-foreground"
        >
          已撤销 —— 稿面回滚到写入前版本。
        </p>
      ) : null}
      {state.phase === "error" ? (
        <p role="alert" className="text-[11px] text-destructive">
          {state.message}
        </p>
      ) : null}
    </div>
  );
}

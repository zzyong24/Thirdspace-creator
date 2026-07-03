"use client";

/**
 * 对话内整稿分镜脚本卡(T-057⑤,替代已退役的 ScriptDraftIsland)。
 *
 * script.draft 工具产的整稿 sections 渲成卡,「写入稿面」= ensureScriptArtifact →
 * createArtifactVersion(整稿 sections 作为新版本,append-only)→ refresh(编辑器按
 * versionCount key 重挂吃新稿);撤销 = restoreArtifact 回滚写入前版本。
 */

import * as React from "react";
import { useRouter } from "next/navigation";

import { client } from "@/lib/contract-client";
import { ensureScriptArtifact } from "@/features/script/ensure-script-artifact";

export interface ChatScriptSection {
  heading: string;
  body: string;
}

type WriteState =
  | { phase: "idle" }
  | { phase: "writing" }
  | { phase: "written"; artifactId: string; previousVersionId: string | null }
  | { phase: "undone" }
  | { phase: "error"; message: string };

async function currentVersionId(artifactId: string): Promise<string | null> {
  const artifact = (await client.getArtifact({
    params: { artifactId },
    query: undefined,
    body: undefined,
  })) as unknown as { currentVersionId?: string | null };
  return artifact.currentVersionId ?? null;
}

export function ChatScriptDraftCard({
  sections,
  projectId,
}: {
  sections: ReadonlyArray<ChatScriptSection>;
  projectId: string | null;
}) {
  const router = useRouter();
  const [state, setState] = React.useState<WriteState>({ phase: "idle" });
  const [expanded, setExpanded] = React.useState(false);

  const writeToDraft = React.useCallback(async () => {
    if (!projectId || sections.length === 0) return;
    setState({ phase: "writing" });
    try {
      const ensured = (await ensureScriptArtifact(projectId, null)) as {
        artifactId: string;
      };
      const prev = await currentVersionId(ensured.artifactId);
      await client.createArtifactVersion({
        params: { artifactId: ensured.artifactId },
        query: undefined,
        body: {
          contentText: sections
            .map((s) => `${s.heading}\n${s.body}`.trim())
            .join("\n\n"),
          changeSummary: `对话整稿写入(${sections.length} 段分镜)`,
          contentData: {
            sections: sections.map((s, i) => ({
              id: `draft-${i}`,
              heading: s.heading,
              body: s.body,
            })),
          },
        },
      });
      setState({
        phase: "written",
        artifactId: ensured.artifactId,
        previousVersionId: prev,
      });
      router.refresh();
    } catch (err) {
      setState({
        phase: "error",
        message:
          err instanceof Error && err.message ? err.message : "写入失败,重试",
      });
    }
  }, [projectId, sections, router]);

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
    } catch {
      setState({ phase: "error", message: "撤销失败,重试" });
    }
  }, [router, state]);

  if (sections.length === 0) {
    return (
      <div
        data-slot="chat-script-draft-card"
        data-empty="true"
        className="mt-1 rounded-[10px] border border-dashed border-border px-3 py-2 text-[11px] text-text-subtle"
      >
        这轮没生成出可用的整稿 —— 换个说法再试试。
      </div>
    );
  }

  const shown = expanded ? sections : sections.slice(0, 3);
  return (
    <div
      data-slot="chat-script-draft-card"
      className="mt-1 flex w-full max-w-[420px] flex-col gap-1.5 rounded-[10px] border border-border bg-surface p-2.5"
    >
      <span className="text-[10px] font-medium uppercase tracking-wide text-brand">
        整稿分镜脚本 · {sections.length} 段
      </span>
      <ol className="flex flex-col gap-1">
        {shown.map((s, i) => (
          <li
            key={`${i}-${s.heading.slice(0, 8)}`}
            data-slot="chat-script-section"
            className="rounded-md border border-border/70 bg-surface-subtle/50 px-2.5 py-1.5"
          >
            <p className="text-[11px] font-semibold text-foreground">
              {s.heading}
            </p>
            <p className="mt-0.5 whitespace-pre-line text-[13px] leading-relaxed text-muted-foreground">
              {s.body}
            </p>
          </li>
        ))}
      </ol>
      {sections.length > 3 ? (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="self-start text-[11px] text-brand underline underline-offset-2"
        >
          {expanded ? "收起" : `展开全部 ${sections.length} 段 ▾`}
        </button>
      ) : null}
      <div className="flex items-center justify-between gap-2">
        {!projectId ? (
          <p className="text-[11px] text-text-subtle">
            未关联项目 —— 输入 @ 引用一个项目后才能写入稿面。
          </p>
        ) : (
          <span />
        )}
        {state.phase === "written" ? (
          <div
            data-slot="chat-script-system-row"
            className="flex flex-1 items-center justify-between rounded-md bg-success-soft px-2.5 py-1.5 text-[11px] text-success"
          >
            <span>整稿已写入稿面(新版本已保存)</span>
            <button
              type="button"
              data-slot="chat-script-undo"
              onClick={() => void undo()}
              className="font-medium underline underline-offset-2 hover:opacity-80"
            >
              撤销
            </button>
          </div>
        ) : state.phase === "undone" ? (
          <p className="text-[11px] text-muted-foreground">
            已撤销 —— 稿面回滚到写入前版本。
          </p>
        ) : (
          <button
            type="button"
            data-slot="chat-script-write"
            disabled={!projectId || state.phase === "writing"}
            onClick={() => void writeToDraft()}
            className="inline-flex h-7 items-center rounded-control bg-brand px-3 text-[11px] font-medium text-brand-foreground hover:bg-brand/90 disabled:opacity-50"
          >
            {state.phase === "writing" ? "写入中…" : "整稿写入稿面"}
          </button>
        )}
      </div>
      {state.phase === "error" ? (
        <p role="alert" className="text-[11px] text-destructive">
          {state.message}
        </p>
      ) : null}
    </div>
  );
}

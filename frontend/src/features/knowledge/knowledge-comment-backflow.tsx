"use client";

/**
 * 评论回流(T-092 SPEC §2)—— 知识库页倾倒场旁的常驻入口:
 *
 *   点「评论回流」→ POST /api/knowledge/comment-sift(服务端跑 ①硬规则预筛 →
 *   ②AI 蒸馏筛 comment.qa-sift,只产候选)→ ③人工确认门(勾选/改 title/改 note)→
 *   「采纳选中 N 条」→ 逐条 contract knowledge.create:
 *     knowledgeType='qa'、sourceType='import'、sourceNote 带支撑评论数、
 *     sourceMetadata = { origin:'comment_backflow', signalIds, signalExternalIds }
 *   (溯源与幂等双料锚)→ router.refresh。
 *
 * 诚实空态铁律:
 *   - audience_signals 0 行 → 「还没有采集到评论」+ 复盘页引导,不渲假门;
 *   - 预筛后 0 条 / AI 候选 0 条 → 各自诚实文案(全是水评/已回流),不编候选。
 * 幂等:服务端预筛已排除已回流;采纳时 service 再校验(并发兜底,409 → 门内标「已入库」)。
 */

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { MessageSquareQuote } from "lucide-react";

import { describeUserError } from "@/lib/ai-error-humanize";
import { client } from "@/lib/contract-client";
import { fetchCreatorApi } from "@/lib/http-transport";
import { cn } from "@/lib/utils";

interface SupportingComment {
  readonly id: string;
  readonly rawText: string;
  readonly likeCount: number | null;
}

interface SiftCandidateDto {
  readonly title: string;
  readonly note: string;
  readonly sourceNote: string;
  readonly signalIds: string[];
  readonly signalExternalIds: string[];
  readonly supportingComments: SupportingComment[];
}

interface SiftResponse {
  readonly signalsTotal: number;
  readonly prefiltered: number;
  readonly droppedNoise: number;
  readonly droppedBackflowed: number;
  readonly candidates: SiftCandidateDto[];
}

interface CandidateRow extends SiftCandidateDto {
  selected: boolean;
  /** 采纳时 service 幂等校验命中(409)→ 标「已入库」。 */
  conflicted: boolean;
}

const buttonCls =
  "inline-flex h-8 items-center gap-1.5 rounded-md px-3 text-[13px] font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40 disabled:opacity-50";
const inputCls =
  "rounded-md border border-border bg-surface px-2 py-1 text-[13px] text-foreground focus-visible:border-ring focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40";

export function KnowledgeCommentBackflow() {
  const router = useRouter();
  const [busy, setBusy] = React.useState<"idle" | "sifting" | "saving">("idle");
  const [error, setError] = React.useState<string | null>(null);
  const [result, setResult] = React.useState<SiftResponse | null>(null);
  const [rows, setRows] = React.useState<CandidateRow[] | null>(null);

  const handleSift = React.useCallback(async () => {
    if (busy !== "idle") return;
    setBusy("sifting");
    setError(null);
    try {
      const res = await fetchCreatorApi("/api/knowledge/comment-sift", {
        method: "POST",
      });
      const json = (await res.json().catch(() => null)) as
        | (SiftResponse & { error?: string })
        | null;
      if (!res.ok || !json || !Array.isArray(json.candidates)) {
        throw new Error(json?.error || `评论回流失败(HTTP ${res.status})`);
      }
      setResult(json);
      setRows(
        json.candidates.map((c) => ({ ...c, selected: true, conflicted: false })),
      );
    } catch (err) {
      setError(describeUserError(err, "评论回流失败，请重试。"));
    } finally {
      setBusy("idle");
    }
  }, [busy]);

  const patchRow = React.useCallback(
    (index: number, patch: Partial<CandidateRow>) => {
      setRows((prev) =>
        prev ? prev.map((r, i) => (i === index ? { ...r, ...patch } : r)) : prev,
      );
    },
    [],
  );

  const selectedCount = (rows ?? []).filter(
    (r) => r.selected && !r.conflicted && r.title.trim().length > 0,
  ).length;

  // ③确认门「采纳选中 N 条」→ 逐条 knowledge.create(type='qa' + 双料锚)。
  const handleAdopt = React.useCallback(async () => {
    if (!rows || busy !== "idle") return;
    const picked = rows
      .map((r, index) => ({ row: r, index }))
      .filter(
        ({ row }) =>
          row.selected && !row.conflicted && row.title.trim().length > 0,
      );
    if (picked.length === 0) return;
    setBusy("saving");
    setError(null);
    let adopted = 0;
    try {
      for (const { row, index } of picked) {
        try {
          await client.createKnowledge({
            params: undefined,
            query: undefined,
            body: {
              title: row.title.trim(),
              knowledgeType: "qa",
              content: row.note.trim(),
              sourceType: "import",
              ...(row.sourceNote.trim()
                ? { sourceNote: row.sourceNote.trim() }
                : {}),
              sourceMetadata: {
                origin: "comment_backflow",
                signalIds: row.signalIds,
                signalExternalIds: row.signalExternalIds,
              },
            },
          });
          adopted += 1;
        } catch (err) {
          // service 幂等兜底命中(并发下同锚已入库)→ 门内标「已入库」跳过,
          // 其余候选继续(诚实呈现,不整批回滚)。
          const message = err instanceof Error ? err.message : String(err);
          if (message.includes("已回流") || message.includes("409")) {
            patchRow(index, { conflicted: true, selected: false });
            continue;
          }
          throw err;
        }
      }
      if (adopted > 0) {
        setRows(null);
        setResult(null);
        router.refresh();
      }
    } catch (err) {
      setError(describeUserError(err, "采纳入库失败，请重试。"));
    } finally {
      setBusy("idle");
    }
  }, [rows, busy, router, patchRow]);

  return (
    <section
      data-slot="knowledge-comment-backflow"
      aria-label="评论回流"
      className="flex flex-col gap-2 rounded-card border border-border bg-surface p-3"
    >
      <div className="flex flex-wrap items-center gap-2">
        <MessageSquareQuote
          className="size-4 shrink-0 text-muted-foreground"
          aria-hidden="true"
        />
        <span className="text-xs text-text-subtle">
          把采集到的观众评论蒸馏成「观众问题」原子(三级去噪:规则预筛 → AI 只留真疑问 →
          人工采纳)
        </span>
        <button
          type="button"
          data-slot="knowledge-comment-backflow-run"
          disabled={busy !== "idle"}
          onClick={() => void handleSift()}
          className={cn(
            buttonCls,
            "ml-auto bg-brand text-brand-foreground hover:bg-brand/90",
          )}
        >
          {busy === "sifting" ? "蒸馏中…" : "评论回流"}
        </button>
      </div>

      {error ? (
        <p
          data-slot="knowledge-comment-backflow-error"
          role="alert"
          className="rounded-md border border-destructive/40 bg-destructive/5 px-2.5 py-1.5 text-[12px] text-destructive"
        >
          {error}
        </p>
      ) : null}

      {/* 诚实空态:0 行评论 → 引导去复盘页采集,不渲假门。 */}
      {result !== null && result.signalsTotal === 0 ? (
        <div
          data-slot="knowledge-comment-backflow-empty"
          className="flex flex-col items-start gap-1 rounded-md border border-dashed border-border bg-surface-subtle px-3 py-3"
        >
          <p className="text-[12px] font-medium text-foreground">
            还没有采集到评论
          </p>
          <p className="text-[11px] text-muted-foreground">
            先在作品复盘页采集评论(或去自动化配「抓我作品评论」),回来再回流。
          </p>
          <Link
            href="/projects"
            data-slot="knowledge-comment-backflow-goto"
            className="text-[11px] text-brand hover:underline"
          >
            去项目列表 → 打开作品复盘页采集评论
          </Link>
        </div>
      ) : null}

      {/* 预筛后/AI 后 0 候选:诚实文案(全是水/已回流),不编候选。 */}
      {result !== null &&
      result.signalsTotal > 0 &&
      (rows === null || rows.length === 0) ? (
        <p
          data-slot="knowledge-comment-backflow-none"
          className="rounded-md border border-border bg-surface-subtle px-2.5 py-1.5 text-[12px] text-muted-foreground"
        >
          共 {result.signalsTotal} 条评论:{result.droppedNoise} 条被规则预筛掉(短/水),
          {result.droppedBackflowed} 条已回流过
          {result.prefiltered > 0
            ? `;AI 蒸馏后没有发现新的真实疑问(诚实空,不编问题)`
            : `;没有剩余可蒸馏的评论`}
          。
        </p>
      ) : null}

      {/* ③人工确认门:qa 候选行卡(勾选/title/note 可改 + 支撑评论溯源)。 */}
      {rows !== null && rows.length > 0 ? (
        <div
          data-slot="knowledge-comment-backflow-gate"
          className="flex flex-col gap-2 rounded-md border border-border bg-surface-subtle/40 p-2.5"
        >
          <p className="text-[11px] text-muted-foreground">
            蒸馏出 {rows.length} 个观众问题候选(来自 {result?.prefiltered ?? 0} 条预筛评论;
            勾选要留的,问题/备注可改;采纳后进知识库为 qa 原子)
          </p>
          <ul className="flex flex-col gap-2">
            {rows.map((row, index) => (
              <li
                key={index}
                data-slot="knowledge-qa-candidate"
                data-conflicted={row.conflicted ? "true" : "false"}
                className={cn(
                  "flex flex-col gap-1.5 rounded-md border border-border/70 bg-surface p-2",
                  row.conflicted && "opacity-60",
                )}
              >
                <div className="flex flex-wrap items-center gap-2">
                  <input
                    type="checkbox"
                    data-slot="knowledge-qa-select"
                    aria-label={`采纳第 ${index + 1} 个问题`}
                    checked={row.selected && !row.conflicted}
                    disabled={row.conflicted}
                    onChange={(e) =>
                      patchRow(index, { selected: e.target.checked })
                    }
                    className="size-4 accent-brand"
                  />
                  <input
                    type="text"
                    data-slot="knowledge-qa-title"
                    aria-label="问题"
                    value={row.title}
                    disabled={row.conflicted}
                    onChange={(e) => patchRow(index, { title: e.target.value })}
                    className={cn(inputCls, "h-8 min-w-0 flex-1")}
                  />
                  {row.conflicted ? (
                    <span className="rounded-full bg-surface-subtle px-1.5 py-0.5 text-[10px] text-muted-foreground">
                      已入库
                    </span>
                  ) : null}
                </div>
                <div className="flex items-center gap-2 pl-6">
                  <label
                    className="shrink-0 text-[11px] text-muted-foreground"
                    htmlFor={`knowledge-qa-note-${index}`}
                  >
                    备注
                  </label>
                  <input
                    id={`knowledge-qa-note-${index}`}
                    data-slot="knowledge-qa-note"
                    type="text"
                    placeholder="补充语境(可空)"
                    value={row.note}
                    disabled={row.conflicted}
                    onChange={(e) => patchRow(index, { note: e.target.value })}
                    className={cn(inputCls, "h-7 min-w-0 flex-1 text-[12px]")}
                  />
                </div>
                <p className="pl-6 text-[11px] text-muted-foreground">
                  {row.sourceNote}
                </p>
                {row.supportingComments.length > 0 ? (
                  <ul
                    data-slot="knowledge-qa-supporting"
                    className="flex flex-col gap-0.5 pl-6"
                  >
                    {row.supportingComments.slice(0, 3).map((c) => (
                      <li
                        key={c.id}
                        className="truncate text-[11px] text-muted-foreground"
                      >
                        「{c.rawText}」{(c.likeCount ?? 0) > 0 ? ` · 赞 ${c.likeCount}` : ""}
                      </li>
                    ))}
                  </ul>
                ) : null}
              </li>
            ))}
          </ul>
          <div className="flex items-center gap-2">
            <button
              type="button"
              data-slot="knowledge-qa-adopt"
              disabled={busy !== "idle" || selectedCount === 0}
              onClick={() => void handleAdopt()}
              className={cn(
                buttonCls,
                "bg-brand text-brand-foreground hover:bg-brand/90",
              )}
            >
              {busy === "saving" ? "入库中…" : `采纳选中 ${selectedCount} 条`}
            </button>
            <button
              type="button"
              data-slot="knowledge-qa-cancel"
              disabled={busy !== "idle"}
              onClick={() => {
                setRows(null);
                setResult(null);
              }}
              className={cn(
                buttonCls,
                "border border-border bg-surface text-foreground hover:bg-surface-subtle",
              )}
            >
              取消
            </button>
          </div>
        </div>
      ) : null}
    </section>
  );
}

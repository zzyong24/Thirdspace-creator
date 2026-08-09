"use client";

/**
 * [T-247] 「已回流校准(待采纳)」可操作列表 —— 校准飞轮 轨B 的采纳/驳回门。
 *
 * 复盘裁决产生的 CalibrationRuleSuggestion(learnings → rubric 维度建议)此前只有
 * 后端三 op(list/adopt/dismiss),前端零入口 = 建议永远 pending、rubric 永远不进化。
 * 本卡挂在复盘页(裁决发生地),交互与 learnings.evaluate 同款先例:
 *   - `calibration.suggestions.list` → pending 建议列表(维度名/权重 + 一句话理由);
 *   - 采纳 → `calibration.suggestions.adopt`(服务端折入新 RubricVersion 并归一权重);
 *   - 驳回 → `calibration.suggestions.dismiss`(终态,不动 rubric)。
 * 动作后重拉列表(pending-only 读侧,采纳/驳回即从列表消失)。读失败 → 整卡不渲
 * (user-scoped 辅助区,不拖垮复盘页);0 条 → 也不渲(不摆空卡)。
 */

import * as React from "react";
import { useRouter } from "next/navigation";
import { GitMerge } from "lucide-react";

import { SectionCard } from "@/components/project/section-card";
import { client } from "@/lib/contract-client";
import { describeUserError } from "@/lib/ai-error-humanize";

interface SuggestionDto {
  readonly id: string;
  readonly status: "pending" | "adopted" | "dismissed";
  readonly proposedDimension: {
    readonly key: string;
    readonly label: string;
    readonly weight: number;
    readonly description?: string;
  };
  readonly rationale: string;
  readonly createdAt: string;
}

export function CalibrationSuggestionsCard() {
  const router = useRouter();
  const [suggestions, setSuggestions] = React.useState<
    ReadonlyArray<SuggestionDto> | null
  >(null);
  const [busyId, setBusyId] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  const load = React.useCallback(async () => {
    try {
      const rows = (await client.listRuleSuggestions({
        params: undefined,
        query: { page: 1, pageSize: 50 },
        body: undefined,
      })) as unknown as ReadonlyArray<SuggestionDto>;
      // 读侧本就 pending-only(见 calibration.service listRuleSuggestions),再滤一道兜底。
      setSuggestions(
        (Array.isArray(rows) ? rows : []).filter((s) => s.status === "pending"),
      );
    } catch {
      // 读失败 → 整卡不渲(辅助区诚实降级,不报错刷屏)。
      setSuggestions([]);
    }
  }, []);

  React.useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- 挂载触发异步外部数据加载，状态更新发生在 Promise 回调
    void load();
  }, [load]);

  const act = React.useCallback(
    (suggestionId: string, action: "adopt" | "dismiss") => {
      if (busyId !== null) return;
      setBusyId(suggestionId);
      setError(null);
      void (async () => {
        try {
          if (action === "adopt") {
            await client.adoptRuleSuggestion({
              params: { suggestionId },
              query: undefined,
              body: undefined,
            });
          } else {
            await client.dismissRuleSuggestion({
              params: { suggestionId },
              query: undefined,
              body: undefined,
            });
          }
          await load(); // pending-only 读侧 → 该行消失。
          router.refresh();
        } catch (err) {
          setError(
            describeUserError(
              err,
              action === "adopt" ? "采纳失败，请重试。" : "驳回失败，请重试。",
            ),
          );
        } finally {
          setBusyId(null);
        }
      })();
    },
    [busyId, load, router],
  );

  // 未加载完 / 0 条 → 不渲(不摆空卡,复盘页保持干净)。
  if (suggestions === null || suggestions.length === 0) return null;

  return (
    <SectionCard
      title="已回流校准(待采纳)"
      description={`${suggestions.length} 条来自复盘经验的评分维度建议——采纳即折入新版评分标准`}
    >
      <div
        data-slot="calibration-suggestions-card"
        data-count={suggestions.length}
        className="flex flex-col gap-2"
      >
        {suggestions.map((s) => (
          <article
            key={s.id}
            data-slot="calibration-suggestion-row"
            data-suggestion-id={s.id}
            className="flex flex-col gap-1.5 rounded-control border border-border/70 p-3"
          >
            <div className="flex items-center gap-2">
              <GitMerge className="size-3.5 shrink-0 text-brand" aria-hidden="true" />
              <span className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">
                {s.proposedDimension.label || s.proposedDimension.key}
              </span>
              <span className="shrink-0 rounded-full bg-surface-subtle px-2 py-0.5 font-mono text-[10px] tabular-nums text-muted-foreground">
                建议权重 {s.proposedDimension.weight}
              </span>
            </div>
            {s.rationale ? (
              <p className="text-[12px] leading-relaxed text-muted-foreground">
                {s.rationale}
              </p>
            ) : null}
            <div className="flex items-center justify-end gap-1.5">
              <button
                type="button"
                data-slot="calibration-suggestion-dismiss"
                disabled={busyId !== null}
                onClick={() => act(s.id, "dismiss")}
                className="rounded-control border border-border bg-surface px-2 py-1 text-xs font-medium text-muted-foreground hover:bg-surface-subtle disabled:opacity-50"
              >
                驳回
              </button>
              <button
                type="button"
                data-slot="calibration-suggestion-adopt"
                disabled={busyId !== null}
                onClick={() => act(s.id, "adopt")}
                className="rounded-control bg-brand px-2 py-1 text-xs font-medium text-brand-foreground hover:bg-brand/90 disabled:opacity-50"
              >
                {busyId === s.id ? "处理中…" : "采纳"}
              </button>
            </div>
          </article>
        ))}
        {error ? (
          <p
            data-slot="calibration-suggestion-error"
            role="alert"
            className="text-[12px] text-destructive"
          >
            {error}
          </p>
        ) : null}
      </div>
    </SectionCard>
  );
}

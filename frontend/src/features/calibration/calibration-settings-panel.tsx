"use client";

/**
 * `calibration-settings-panel.tsx` — 设置「校准」页签的深度形态(T-063e,北极星 SPEC §3)。
 *
 * 校准从「独立工作台页」后台化为配置形态,三块(自上而下):
 *  ① rubric 规则库 —— 当前评分标准的维度权重查看 + 手改(草稿权重 → 保存 =
 *     `calibration.rubrics.bumpVersion` 追加一条不可变新版本,权重和须为 1)。
 *  ② 待采纳规则建议 —— T-062a 复盘回流(Learning→校准)落下的 pending
 *     CalibrationRuleSuggestion 列表;「采纳」= `calibration.suggestions.adopt`
 *     (折叠维度进新 RubricVersion,rubric 即刻生效),「忽略」=
 *     `calibration.suggestions.dismiss`(终态,不 bump)。这是飞轮「回流→采纳」的消费端。
 *  ③ 校准历史 —— 现有盲预测对照记录保留:已锁定待回流的主体(带「录入真实表现」)
 *     + 发布后回流对照表(ReflowTable 复用)。
 *
 * 盲预测的「发起」入口已随 T-063e 移到稿面发布包区(blind-predict-row.tsx);
 * 对照消费视图并入项目复盘页。三栏工作台组件(CalibrationWorkbench)保留不删
 * (删壳不删肉,gate-F3),只是不再作为设置页签的宿主。
 *
 * 诚实(铁律):每块数据为空渲染诚实空态;权重编辑校验和为 1 才允许保存;
 * 无 rubric 时规则库显式说明,不编造维度。
 */

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  Gauge,
  Inbox,
  Check,
  X,
  History,
  Lock,
  Pencil,
} from "lucide-react";

import { client } from "@/lib/contract-client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SectionCard } from "@/components/project/section-card";
import { cn } from "@/lib/utils";
import type {
  CalibrationOverviewResource,
  CalibrationRuleSuggestionResource,
  RubricResource,
} from "@creatoros/backend/modules/calibration";

import {
  RecordResultButton,
  ReflowTable,
} from "./calibration-interactive-region";

// ── shared mutation seam(与 calibration-interactive-region 同款)────────────────
function useMutation() {
  const router = useRouter();
  const [pending, setPending] = React.useState(false);
  const run = React.useCallback(
    (mutate: () => Promise<unknown>, onError?: (err: unknown) => void) => {
      if (pending) return;
      setPending(true);
      void (async () => {
        try {
          await mutate();
          router.refresh();
        } catch (err) {
          if (onError) onError(err);
        } finally {
          setPending(false);
        }
      })();
    },
    [pending, router],
  );
  return { pending, run };
}

// ── ① rubric 规则库:维度权重查看 / 手改 ─────────────────────────────────────────
// 草稿权重本地受控;保存前校验(每维 0–1、总和≈1),通过 → bumpRubricVersion 追加
// 一条不可变新版本(与 adopt 同一版本链语义)。
function RubricRuleCard({ rubric }: { readonly rubric: RubricResource | null }) {
  const { pending, run } = useMutation();
  const dims = React.useMemo(
    () => rubric?.currentVersion.dimensions ?? [],
    [rubric],
  );
  // 维度 key → 草稿权重字符串(保存时转数字)。rubric 版本变化(保存刷新后)重置草稿。
  const [drafts, setDrafts] = React.useState<Record<string, string>>({});
  const [editing, setEditing] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const versionId = rubric?.currentVersionId ?? "";
  React.useEffect(() => {
    setDrafts({});
    setEditing(false);
    setError(null);
  }, [versionId]);

  if (!rubric) {
    return (
      <SectionCard title="评分规则库" description="盲预测使用的维度与权重">
        <p
          data-testid="rubric-empty"
          className="rounded-card border border-dashed border-border px-3 py-6 text-center text-sm text-muted-foreground"
        >
          还没有评分标准。第一次盲预测会基于默认变现加权标准创建。
        </p>
      </SectionCard>
    );
  }

  const draftWeight = (key: string, fallback: number): number => {
    const raw = drafts[key];
    if (raw === undefined || raw === "") return fallback;
    const n = Number(raw);
    return Number.isFinite(n) ? n : NaN;
  };
  const weights = dims.map((d) => draftWeight(d.key, d.weight));
  const sum = weights.reduce((acc, w) => acc + (Number.isFinite(w) ? w : 0), 0);
  const allValid = weights.every((w) => Number.isFinite(w) && w >= 0 && w <= 1);
  const sumOk = Math.abs(sum - 1) < 1e-4;
  const dirty = dims.some((d) => {
    const raw = drafts[d.key];
    return raw !== undefined && raw !== "" && Number(raw) !== d.weight;
  });

  const save = () => {
    if (!dirty || !allValid || !sumOk || pending) return;
    setError(null);
    run(
      () =>
        client.bumpRubricVersion({
          params: { rubricId: rubric.id },
          query: undefined,
          body: {
            dimensions: dims.map((d) => ({
              key: d.key,
              label: d.label,
              weight: draftWeight(d.key, d.weight),
            })),
            changeSummary: "设置页手改维度权重",
          },
        }),
      () => setError("保存失败:权重需含变现维度且总和为 1,请检查后重试。"),
    );
  };

  return (
    <SectionCard
      title="评分规则库"
      description="盲预测使用的维度与权重;改权重 = 追加一条不可变新版本"
      action={
        <Badge variant="secondary" className="gap-1 text-[10px]">
          <Gauge className="size-3" />
          {rubric.name} · v{rubric.currentVersion.versionNumber}
        </Badge>
      }
    >
      <div data-testid="rubric-rule-card" className="flex flex-col gap-2">
        <ul className="flex flex-col">
          {dims.map((d) => (
            <li
              key={d.key}
              data-testid="rubric-dimension-row"
              data-dim={d.key}
              className="flex items-center justify-between gap-3 border-b border-border/60 py-2.5 last:border-b-0"
            >
              <span className="min-w-0 text-sm text-foreground">{d.label}</span>
              {editing ? (
                <label className="flex shrink-0 items-center gap-1.5 text-xs text-muted-foreground">
                  权重
                  <Input
                    type="number"
                    min={0}
                    max={1}
                    step={0.05}
                    aria-label={`${d.label} 权重`}
                    value={drafts[d.key] ?? String(d.weight)}
                    disabled={pending}
                    onChange={(e) =>
                      setDrafts((s) => ({ ...s, [d.key]: e.target.value }))
                    }
                    className="h-8 w-20"
                  />
                </label>
              ) : (
                <span className="shrink-0 font-mono text-xs tabular-nums text-muted-foreground">
                  {Math.round(d.weight * 100)}%
                </span>
              )}
            </li>
          ))}
        </ul>
        {editing ? (
          <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
          <span
            className={cn(
              "text-[11px] tabular-nums",
              sumOk ? "text-muted-foreground" : "text-destructive",
            )}
          >
            权重总和 {sum.toFixed(2)}(须为 1.00)
          </span>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                size="sm"
                variant="ghost"
                disabled={pending}
                onClick={() => {
                  setDrafts({});
                  setEditing(false);
                  setError(null);
                }}
              >
                取消
              </Button>
              <Button
                type="button"
                size="sm"
                data-testid="rubric-save-button"
                disabled={!dirty || !allValid || !sumOk || pending}
                onClick={save}
                className="bg-brand text-brand-foreground hover:bg-brand/90"
              >
                {pending ? "保存中…" : "保存为新版本"}
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex justify-end pt-1">
            <Button
              type="button"
              size="sm"
              variant="outline"
              data-testid="rubric-edit-button"
              className="h-7 gap-1.5 px-2.5 text-[11px]"
              onClick={() => setEditing(true)}
            >
              <Pencil className="size-3.5" />
              编辑权重
            </Button>
          </div>
        )}
        {error ? <p className="text-xs text-destructive">{error}</p> : null}
      </div>
    </SectionCard>
  );
}

// ── ② 待采纳规则建议(T-062a 回流的消费端)──────────────────────────────────────
function SuggestionRow({
  suggestion,
}: {
  readonly suggestion: CalibrationRuleSuggestionResource;
}) {
  const { pending, run } = useMutation();
  const [error, setError] = React.useState<string | null>(null);
  const dim = suggestion.proposedDimension;
  return (
    <li
      data-testid="rule-suggestion-row"
      data-suggestion-id={suggestion.id}
      className="flex flex-col gap-2 rounded-control border border-border/70 bg-surface-subtle/40 p-3"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="flex items-center gap-2 text-sm font-medium text-foreground">
          {dim.label}
          <span className="font-mono text-[11px] tabular-nums text-muted-foreground">
            建议权重 {Math.round(dim.weight * 100)}%
          </span>
        </span>
        <div className="flex shrink-0 items-center gap-1.5">
          <Button
            type="button"
            size="sm"
            data-testid="suggestion-adopt-button"
            className="h-7 gap-1 bg-brand px-2.5 text-[11px] text-brand-foreground hover:bg-brand/90"
            disabled={pending}
            onClick={() =>
              run(
                () =>
                  client.adoptRuleSuggestion({
                    params: { suggestionId: suggestion.id },
                    query: undefined,
                    body: undefined,
                  }),
                () => setError("采纳失败,请重试。"),
              )
            }
          >
            <Check className="size-3.5" />
            采纳
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            data-testid="suggestion-dismiss-button"
            className="h-7 gap-1 px-2.5 text-[11px]"
            disabled={pending}
            onClick={() =>
              run(
                () =>
                  client.dismissRuleSuggestion({
                    params: { suggestionId: suggestion.id },
                    query: undefined,
                    body: undefined,
                  }),
                () => setError("忽略失败,请重试。"),
              )
            }
          >
            <X className="size-3.5" />
            忽略
          </Button>
        </div>
      </div>
      {suggestion.rationale ? (
        <p className="text-[12px] leading-snug text-muted-foreground">
          <span className="text-text-subtle">回流依据 · </span>
          {suggestion.rationale}
        </p>
      ) : null}
      {dim.description ? (
        <p className="text-[12px] leading-snug text-muted-foreground">
          {dim.description}
        </p>
      ) : null}
      {error ? <p className="text-xs text-destructive">{error}</p> : null}
    </li>
  );
}

function SuggestionList({
  suggestions,
}: {
  readonly suggestions: readonly CalibrationRuleSuggestionResource[];
}) {
  return (
    <SectionCard
      title="待采纳规则建议"
      description="复盘经验回流生成的 rubric 维度建议;采纳后立即生效为新版本"
      action={
        suggestions.length > 0 ? (
          <Badge variant="secondary" className="text-[10px] tabular-nums">
            {suggestions.length}
          </Badge>
        ) : undefined
      }
    >
      {suggestions.length === 0 ? (
        <p
          data-testid="suggestions-empty"
          className="flex items-center justify-center gap-1.5 rounded-card border border-dashed border-border px-3 py-6 text-sm text-muted-foreground"
        >
          <Inbox className="size-4" />
          暂无待采纳建议。在库的经验裁决台把复盘经验「回流到校准」后,建议会出现在这里。
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {suggestions.map((s) => (
            <SuggestionRow key={s.id} suggestion={s} />
          ))}
        </ul>
      )}
    </SectionCard>
  );
}

// ── ③ 校准历史:已锁定待回流 + 发布后回流对照 ─────────────────────────────────────
function CalibrationHistory({
  overview,
  subjectTitles,
}: {
  readonly overview: CalibrationOverviewResource;
  readonly subjectTitles: Readonly<Record<string, string>>;
}) {
  // 已锁定待回流的主体(badge=locked 且有 predictionId)→ 每行给「录入真实表现」。
  const lockedPending = overview.pendingSubjects.filter(
    (s) => s.badge === "locked" && s.predictionId,
  );
  const empty = lockedPending.length === 0 && overview.reflowRows.length === 0;
  return (
    <SectionCard
      title="校准历史"
      description="盲预测 → 发布 → 回流的对照记录;盲预测在稿面发布包区发起"
      action={
        <Badge variant="outline" className="gap-1 text-[10px] tabular-nums">
          <History className="size-3" />
          已锁定 {overview.kpis.lockedPredictions} · 已回流{" "}
          {overview.kpis.completedReflows}
        </Badge>
      }
    >
      {empty ? (
        <p
          data-testid="calibration-history-empty"
          className="rounded-card border border-dashed border-border px-3 py-6 text-center text-sm text-muted-foreground"
        >
          还没有校准记录。去稿面的发布包区对一条内容「先盲预测」,发布后回流即可在这里看到对照。
        </p>
      ) : (
        <div className="flex flex-col gap-3">
          {lockedPending.length > 0 ? (
            <ul data-testid="locked-pending-list" className="flex flex-col gap-2">
              {lockedPending.map((s) => (
                <li
                  key={`${s.subjectType}:${s.subjectId}`}
                  data-testid="locked-pending-row"
                  className="flex flex-wrap items-center justify-between gap-2 rounded-control border border-border/70 px-3 py-2"
                >
                  <span className="flex min-w-0 items-center gap-2 text-sm text-foreground">
                    <Lock className="size-3.5 shrink-0 text-text-subtle" />
                    <span className="truncate">{s.title}</span>
                    <Badge variant="outline" className="shrink-0 text-[10px]">
                      已锁定 · 等回流
                    </Badge>
                  </span>
                  <RecordResultButton
                    predictionId={s.predictionId!}
                    title={s.title}
                  />
                </li>
              ))}
            </ul>
          ) : null}
          <ReflowTable rows={overview.reflowRows} subjectTitles={subjectTitles} />
        </div>
      )}
    </SectionCard>
  );
}

// ── 页签根组件 ────────────────────────────────────────────────────────────────────
export function CalibrationSettingsPanel({
  rubric,
  suggestions,
  overview,
  subjectTitles,
}: {
  readonly rubric: RubricResource | null;
  readonly suggestions: readonly CalibrationRuleSuggestionResource[];
  readonly overview: CalibrationOverviewResource;
  readonly subjectTitles: Readonly<Record<string, string>>;
}) {
  return (
    <div
      data-testid="calibration-settings-panel"
      className="flex flex-col gap-card-gap"
    >
      <RubricRuleCard rubric={rubric} />
      <SuggestionList suggestions={suggestions} />
      <CalibrationHistory overview={overview} subjectTitles={subjectTitles} />
    </div>
  );
}

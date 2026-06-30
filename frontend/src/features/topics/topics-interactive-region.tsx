"use client";

/**
 * `topics-interactive-region.tsx` — Client islands for the 选题中心 (选题中心大改 · Slice 2,
 * 三栏重构). The 选题中心 is a three-column workspace whose middle (候选池) and right
 * (选题卡详情) columns share ONE piece of state — the selected candidate — so the whole
 * three-column body lives in a single client `TopicsWorkspace` island that owns the
 * selection and renders 左来源 / 中候选池 / 右详情.
 *
 * needs-backend controls, each → its mapped contract op then `router.refresh()`:
 *  - `CreateCandidateForm` (新建选题卡) → `client.createCandidate` (source fixed 'idea';
 *    AI-sourced candidates arrive via the AI 选题会 confirm flow, NOT this form — C-3).
 *  - rich `CandidateCard` 立项为 Project → `client.promoteCandidate` → navigate to the new
 *    `/projects/:id`; 丢弃 → `client.patchCandidate { status:'dropped' }`; 查看选题卡 →
 *    selects the card (drives the right detail column, no op); 补充信息 / 补全选题卡 →
 *    `EnrichButton` fires a `topic.enrich` AI task (poll → confirm → refresh).
 *  - `CandidateSortControl` (推荐排序 / …) → re-issues `candidates.list` with the new
 *    `sort` via a URL search-param navigation.
 *
 * Determinism (C-5): every visible value comes from props; no Date.now / Math.random /
 * fetch in render. The mutation seam mirrors the monetization/positioning islands.
 */

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  MessageSquare,
  Headphones,
  BookOpen,
  Flame,
  TrendingUp,
  RotateCcw,
  Lightbulb,
  ChevronRight,
  Eye,
  Plus,
  Sparkles,
  HeartPulse,
  FileText,
  Rocket,
  Trash2,
  Search,
  type LucideIcon,
} from "lucide-react";

import { client } from "@/lib/contract-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import type {
  CandidateResource,
  TopicsOverviewResource,
} from "@creatoros/backend/modules/candidate";

export type CandidateSortKey =
  | "predictedScore"
  | "positioningFit"
  | "demandCount";

const SORT_LABELS: Record<CandidateSortKey, string> = {
  predictedScore: "推荐排序",
  positioningFit: "定位契合优先",
  demandCount: "需求热度优先",
};

// ── shared mutation seam ────────────────────────────────────────────────────────
// A `pending` guard blocks concurrent writes; on success it runs `after` (defaults to
// router.refresh) so the server re-reads persisted rows.
function useMutation() {
  const router = useRouter();
  const [pending, setPending] = React.useState(false);
  const run = React.useCallback(
    (mutate: () => Promise<unknown>, after?: (result: unknown) => void) => {
      if (pending) return;
      setPending(true);
      void (async () => {
        try {
          const result = await mutate();
          if (after) after(result);
          else router.refresh();
        } finally {
          setPending(false);
        }
      })();
    },
    [pending, router],
  );
  return { pending, run, router };
}

// ── source / status / role label maps ───────────────────────────────────────────
const SOURCE_LABELS: Record<string, string> = {
  trend: "推荐",
  benchmark: "对标",
  demand: "需求",
  idea: "灵感",
};

const STATUS_LABELS: Record<string, string> = {
  pool: "候选池",
  promoted: "已立项",
  dropped: "已丢弃",
};

const ROLE_LABELS: Record<string, string> = {
  traffic: "引流",
  trust: "信任",
  conversion: "转化",
};

const DIFFICULTY_LABELS: Record<string, string> = {
  low: "低",
  mid: "中",
  high: "高",
};

const SOURCE_ICONS: Record<string, LucideIcon> = {
  comment: MessageSquare,
  consultation: Headphones,
  knowledge: BookOpen,
  highPerformer: Flame,
  trend: TrendingUp,
  review: RotateCcw,
  idea: Lightbulb,
};

// ── 选中态 context (中候选池 ⇄ 右详情共享) ──────────────────────────────────────
interface SelectionContext {
  readonly selectedId: string | null;
  readonly select: (id: string) => void;
}
const SelectionCtx = React.createContext<SelectionContext>({
  selectedId: null,
  select: () => {},
});

// ── 评分 chip ────────────────────────────────────────────────────────────────────
// One scored dimension. `value` null → 「—」 (honest unknown, never fabricated).
function ScoreChip({
  label,
  value,
  suffix,
}: {
  readonly label: string;
  readonly value: number | string | null;
  readonly suffix?: string;
}) {
  const has = value !== null && value !== undefined && value !== "";
  return (
    <span
      data-slot="score-chip"
      className="flex items-center gap-1 rounded-full bg-surface-subtle px-2 py-0.5 text-[11px]"
    >
      <span className="text-text-subtle">{label}</span>
      <span
        className={cn(
          "font-semibold tabular-nums",
          has ? "text-foreground" : "text-text-subtle",
        )}
      >
        {has ? `${value}${suffix ?? ""}` : "—"}
      </span>
    </span>
  );
}

// ── 富候选卡 (中栏) ───────────────────────────────────────────────────────────────
export function CandidateCard({
  candidate,
  sourceLabel,
}: {
  readonly candidate: CandidateResource;
  readonly sourceLabel?: string;
}) {
  const { pending, run, router } = useMutation();
  const { selectedId, select } = React.useContext(SelectionCtx);
  const selected = selectedId === candidate.id;
  const card = candidate.card;

  function promote() {
    run(
      () =>
        client.promoteCandidate({
          params: { candidateId: candidate.id },
          query: undefined,
          body: {},
        }),
      (result) => {
        const projectId = (result as { projectId?: string } | null)?.projectId;
        if (projectId) router.push(`/projects/${projectId}`);
        else router.refresh();
      },
    );
  }

  function drop() {
    run(() =>
      client.patchCandidate({
        params: { candidateId: candidate.id },
        query: undefined,
        body: { status: "dropped" },
      }),
    );
  }

  const meta = [
    card.targetAudience ? `观众 ${card.targetAudience}` : null,
    SOURCE_LABELS[candidate.source] ?? candidate.source,
    card.format ? `形式 ${card.format}` : null,
    STATUS_LABELS[candidate.status] ?? candidate.status,
  ].filter((x): x is string => x !== null);

  return (
    <li
      data-testid="candidate-card"
      data-candidate-id={candidate.id}
      data-source={candidate.source}
      data-status={candidate.status}
      data-selected={selected ? "true" : undefined}
      onClick={() => select(candidate.id)}
      className={cn(
        "flex cursor-pointer flex-col gap-2.5 rounded-card border bg-surface px-3.5 py-3 text-sm transition-colors",
        selected
          ? "border-brand ring-1 ring-brand/30"
          : "border-border hover:border-brand/40",
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <span className="flex min-w-0 flex-col gap-0.5">
          <span className="flex items-center gap-2">
            <span className="font-medium leading-snug text-foreground">
              {candidate.title}
            </span>
            <Badge variant="secondary" className="shrink-0 text-[10px]">
              {sourceLabel ?? SOURCE_LABELS[candidate.source] ?? candidate.source}
            </Badge>
            {ROLE_LABELS[candidate.contentRole ?? ""] ? (
              <Badge variant="outline" className="shrink-0 text-[10px]">
                {ROLE_LABELS[candidate.contentRole ?? ""]}
              </Badge>
            ) : null}
          </span>
        </span>
      </div>

      <p className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[11px] text-muted-foreground">
        {meta.map((m, i) => (
          <React.Fragment key={i}>
            {i > 0 ? <span className="text-text-subtle">·</span> : null}
            <span>{m}</span>
          </React.Fragment>
        ))}
      </p>

      {/* 4 评分 chip — null 显示「—」(不编). */}
      <div className="flex flex-wrap gap-1.5">
        <ScoreChip label="定位契合" value={candidate.positioningFit} />
        <ScoreChip label="受众痛感" value={card.audiencePainScore} />
        <ScoreChip label="素材充足" value={card.materialScore} />
        <ScoreChip
          label="制作难度"
          value={DIFFICULTY_LABELS[card.productionDifficulty ?? ""] ?? null}
        />
      </div>

      {/* 4 按钮. */}
      <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-7 gap-1 px-2 text-xs"
          onClick={(e) => {
            e.stopPropagation();
            select(candidate.id);
          }}
        >
          <Eye className="size-3.5" />
          查看选题卡
        </Button>
        <EnrichButton candidate={candidate} />
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-7 gap-1 px-2 text-xs"
          disabled={pending || candidate.status === "promoted"}
          onClick={(e) => {
            e.stopPropagation();
            promote();
          }}
        >
          <Rocket className="size-3.5" />
          立项为 Project
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-7 gap-1 px-2 text-xs text-muted-foreground"
          disabled={pending || candidate.status === "dropped"}
          onClick={(e) => {
            e.stopPropagation();
            drop();
          }}
        >
          <Trash2 className="size-3.5" />
          丢弃
        </Button>
      </div>
    </li>
  );
}

// 补充信息 / 补全选题卡 — fires a topic.enrich AI task for THIS candidate, polls to
// awaiting_confirmation, confirms, then refreshes so the filled 选题卡 lands. The label
// flips to 「补全选题卡」 when the card is still empty (待评估), 「补充信息」 once it has a
// 一句话选题 (待补充→可再补).
export function EnrichButton({
  candidate,
  className,
}: {
  readonly candidate: CandidateResource;
  readonly className?: string;
}) {
  const { run } = useMutation();
  const [phase, setPhase] = React.useState<"idle" | "running" | "error">(
    "idle",
  );
  const cancelledRef = React.useRef(false);
  React.useEffect(
    () => () => {
      cancelledRef.current = true;
    },
    [],
  );

  const hasCard = Boolean(candidate.card.oneLiner);
  const label = hasCard ? "补充信息" : "补全选题卡";

  function enrich(e: React.MouseEvent) {
    e.stopPropagation();
    if (phase === "running") return;
    setPhase("running");
    void (async () => {
      try {
        const task = (await client.createAITask({
          params: undefined,
          query: undefined,
          body: {
            taskType: "topic.enrich",
            inputData: { candidateId: candidate.id },
          },
        })) as { id: string };
        // poll until awaiting_confirmation, then confirm (AI proposes → 采纳 materializes)
        for (let i = 0; i < 75; i++) {
          if (cancelledRef.current) return;
          await new Promise((r) => setTimeout(r, 4000));
          if (cancelledRef.current) return;
          const status = (await client.getTask({
            params: { taskId: task.id },
            query: undefined,
            body: undefined,
          })) as { status: string };
          if (status.status === "awaiting_confirmation") {
            await client.confirmTask({
              params: { taskId: task.id },
              query: undefined,
              body: undefined,
            });
            if (!cancelledRef.current) {
              setPhase("idle");
              run(() => Promise.resolve()); // router.refresh()
            }
            return;
          }
          if (status.status === "cancelled" || status.status === "failed") {
            if (!cancelledRef.current) setPhase("error");
            return;
          }
        }
        if (!cancelledRef.current) setPhase("error");
      } catch {
        if (!cancelledRef.current) setPhase("error");
      }
    })();
  }

  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      data-testid="enrich-button"
      className={cn("h-7 gap-1 px-2 text-xs", className)}
      disabled={phase === "running"}
      onClick={enrich}
    >
      <Sparkles className="size-3.5" />
      {phase === "running" ? "补全中…" : phase === "error" ? "重试补全" : label}
    </Button>
  );
}

// ── 新建选题卡 (manual·富字段录入弹窗 TOPIC-FORM) ──────────────────────────────────
// 标题必填;其余整张候选卡字段(一句话/受众/痛点/冲突/Hook/结构/素材/风险/立项)可选。
// 提交:createCandidate(title/angle) → 若富字段非空再 patchCandidate(card) 落库(评分由 AI/系统补)。
const EMPTY_CARD = {
  oneLiner: "",
  targetAudience: "",
  audiencePain: "",
  coreConflict: "",
  hook: "",
  contentStructure: "", // 每行一条,提交时 split
  format: "",
  materialBasis: "",
  riskNote: "",
  proposal: "",
};

function FieldRow({
  label,
  required,
  children,
}: {
  readonly label: string;
  readonly required?: boolean;
  readonly children: React.ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1 text-xs">
      <span className="font-medium text-text-subtle">
        {label}
        {required ? <span className="text-destructive"> *</span> : null}
      </span>
      {children}
    </label>
  );
}

export function CreateCandidateForm() {
  const { pending, run, router } = useMutation();
  const [open, setOpen] = React.useState(false);
  const [title, setTitle] = React.useState("");
  const [angle, setAngle] = React.useState("");
  const [card, setCard] = React.useState(EMPTY_CARD);
  const valid = title.trim().length > 0;
  const setField =
    (k: keyof typeof EMPTY_CARD) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      setCard((c) => ({ ...c, [k]: e.target.value }));

  function reset() {
    setTitle("");
    setAngle("");
    setCard(EMPTY_CARD);
  }

  function submit() {
    if (!valid) return;
    run(
      async () => {
        const created = (await client.createCandidate({
          params: undefined,
          query: undefined,
          body: { title: title.trim(), angle: angle.trim(), source: "idea" },
        })) as { id: string };
        // 富字段非空才 patch(数据要真:不写空字段)。
        const filled: Record<string, unknown> = {};
        const strFields = [
          "oneLiner",
          "targetAudience",
          "audiencePain",
          "coreConflict",
          "hook",
          "format",
          "materialBasis",
          "riskNote",
          "proposal",
        ] as const;
        for (const k of strFields) {
          const v = card[k].trim();
          if (v) filled[k] = v;
        }
        const structure = card.contentStructure
          .split("\n")
          .map((s) => s.trim())
          .filter(Boolean);
        if (structure.length) filled.contentStructure = structure;
        if (Object.keys(filled).length > 0 && created?.id) {
          await client.patchCandidate({
            params: { candidateId: created.id },
            query: undefined,
            body: { card: filled },
          });
        }
        return created;
      },
      () => {
        reset();
        setOpen(false);
        router.refresh(); // re-read the pool so the new card shows up
      },
    );
  }

  return (
    <>
      <Button
        type="button"
        size="sm"
        variant="ghost"
        className="h-8 gap-1.5 px-2 text-xs text-muted-foreground hover:text-foreground"
        onClick={() => setOpen(true)}
      >
        <Plus className="size-3.5" />
        手动详填
      </Button>
      <Dialog
        open={open}
        onOpenChange={(v) => {
          if (!pending) setOpen(v);
        }}
      >
        <DialogContent
          data-testid="create-candidate-dialog"
          className="flex max-h-[85vh] flex-col gap-0 p-0 sm:max-w-2xl"
        >
          <DialogHeader className="border-b px-5 py-4">
            <DialogTitle>新建选题卡</DialogTitle>
            <DialogDescription>
              标题必填;其余可选——可只填标题先建,后续在详情栏补全。
            </DialogDescription>
          </DialogHeader>
          <form
            data-testid="create-candidate-form"
            onSubmit={(e) => {
              e.preventDefault();
              submit();
            }}
            className="flex min-h-0 flex-1 flex-col"
          >
            <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-5 py-4">
              <section className="flex flex-col gap-2.5">
                <h4 className="text-[11px] font-semibold uppercase tracking-wide text-brand">
                  基本
                </h4>
                <FieldRow label="选题标题" required>
                  <Input
                    aria-label="选题标题"
                    placeholder="一句话说清这条拍什么"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    autoFocus
                  />
                </FieldRow>
                <FieldRow label="切入角度">
                  <Input
                    aria-label="切入角度"
                    placeholder="从什么角度切入（可空）"
                    value={angle}
                    onChange={(e) => setAngle(e.target.value)}
                  />
                </FieldRow>
              </section>

              <section className="flex flex-col gap-2.5">
                <h4 className="text-[11px] font-semibold uppercase tracking-wide text-brand">
                  核心
                </h4>
                <FieldRow label="一句话选题">
                  <Input value={card.oneLiner} onChange={setField("oneLiner")} />
                </FieldRow>
                <FieldRow label="目标观众">
                  <Input
                    value={card.targetAudience}
                    onChange={setField("targetAudience")}
                  />
                </FieldRow>
                <FieldRow label="受众痛点">
                  <Input
                    value={card.audiencePain}
                    onChange={setField("audiencePain")}
                  />
                </FieldRow>
                <FieldRow label="核心冲突">
                  <Input
                    value={card.coreConflict}
                    onChange={setField("coreConflict")}
                  />
                </FieldRow>
                <FieldRow label="推荐 Hook（前 3 秒）">
                  <Input value={card.hook} onChange={setField("hook")} />
                </FieldRow>
              </section>

              <section className="flex flex-col gap-2.5">
                <h4 className="text-[11px] font-semibold uppercase tracking-wide text-brand">
                  结构
                </h4>
                <FieldRow label="内容结构（每行一条）">
                  <Textarea
                    rows={3}
                    value={card.contentStructure}
                    onChange={setField("contentStructure")}
                    placeholder={"钩子\n痛点\n价值\n卡点\nCTA"}
                  />
                </FieldRow>
                <FieldRow label="片长 / 形式">
                  <Input value={card.format} onChange={setField("format")} />
                </FieldRow>
                <FieldRow label="素材依据">
                  <Input
                    value={card.materialBasis}
                    onChange={setField("materialBasis")}
                  />
                </FieldRow>
              </section>

              <section className="flex flex-col gap-2.5">
                <h4 className="text-[11px] font-semibold uppercase tracking-wide text-brand">
                  立项
                </h4>
                <FieldRow label="风险点">
                  <Input value={card.riskNote} onChange={setField("riskNote")} />
                </FieldRow>
                <FieldRow label="立项建议">
                  <Textarea
                    rows={2}
                    value={card.proposal}
                    onChange={setField("proposal")}
                  />
                </FieldRow>
              </section>
            </div>
            <DialogFooter className="border-t">
              <Button
                type="button"
                variant="ghost"
                disabled={pending}
                onClick={() => setOpen(false)}
              >
                取消
              </Button>
              <Button
                type="submit"
                disabled={pending || !valid}
                className="bg-brand text-brand-foreground hover:bg-brand/90"
              >
                {pending ? "保存中…" : "新建选题卡"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}

export function CandidateSortControl({
  sort,
}: {
  readonly sort: CandidateSortKey;
}) {
  const { router } = useMutation();
  function onChange(next: string) {
    if (next === sort) return;
    router.push(`/topics?sort=${next}`);
  }
  return (
    <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
      <select
        aria-label="候选排序"
        data-testid="candidate-sort-control"
        value={sort}
        onChange={(e) => onChange(e.target.value)}
        className="h-8 rounded-control border border-border bg-background px-2 text-xs"
      >
        {(Object.keys(SORT_LABELS) as CandidateSortKey[]).map((k) => (
          <option key={k} value={k}>
            {SORT_LABELS[k]}
          </option>
        ))}
      </select>
    </label>
  );
}

// ── 左栏：选题来源 ────────────────────────────────────────────────────────────────
function SourcesColumn({
  sources,
}: {
  readonly sources: TopicsOverviewResource["sources"];
}) {
  return (
    <aside
      data-testid="topics-sources"
      className="flex min-h-0 flex-col gap-3 overflow-hidden rounded-card border border-border bg-surface p-4"
    >
      <h3 className="shrink-0 text-sm font-semibold text-foreground">选题来源</h3>
      <ul className="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto">
        {sources.map((s) => {
          const Icon = SOURCE_ICONS[s.key] ?? Lightbulb;
          return (
            <li
              key={s.key}
              data-testid="topics-source-row"
              className="flex items-center gap-2.5 rounded-control px-2 py-2 text-sm transition-colors hover:bg-surface-subtle"
            >
              <span className="flex size-7 shrink-0 items-center justify-center rounded-control bg-brand-soft text-brand">
                <Icon className="size-4" strokeWidth={2} />
              </span>
              <span className="flex-1 truncate text-foreground">{s.label}</span>
              <Badge variant="secondary" className="text-[10px] tabular-nums">
                {s.count}
              </Badge>
              <ChevronRight className="size-3.5 shrink-0 text-text-subtle" />
            </li>
          );
        })}
      </ul>
    </aside>
  );
}

// ── 右栏：选题卡详情 ──────────────────────────────────────────────────────────────
function DetailRow({
  label,
  value,
}: {
  readonly label: string;
  readonly value: string | null | undefined;
}) {
  if (!value) return null; // 空字段不显示、不编
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[11px] font-medium text-text-subtle">{label}</span>
      <span className="text-sm leading-relaxed text-foreground">{value}</span>
    </div>
  );
}

function DetailIcon({ icon: Icon, label }: { readonly icon: LucideIcon; readonly label: string }) {
  return (
    <span className="flex items-center gap-1.5 text-[11px] font-medium text-text-subtle">
      <Icon className="size-3.5 text-brand" />
      {label}
    </span>
  );
}

function CandidateDetailPanel({
  candidate,
}: {
  readonly candidate: CandidateResource | null;
}) {
  return (
    <aside
      data-testid="topics-detail"
      className="flex min-h-0 flex-col gap-3 overflow-hidden rounded-card border border-border bg-surface p-4"
    >
      <h3 className="shrink-0 text-sm font-semibold text-foreground">选题卡详情</h3>

      {/* 详情体可能较长 → 框内独立滚动 (列内裁切而非整页滚)。 */}
      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto pr-1">
        {candidate === null ? (
          <div
            data-testid="detail-no-selection"
            className="flex flex-1 flex-col items-center justify-center gap-2 py-10 text-center"
          >
            <span className="flex size-10 items-center justify-center rounded-full bg-surface-subtle text-text-subtle">
              <FileText className="size-5" />
            </span>
            <p className="text-sm text-muted-foreground">
              从中间候选池选一条，查看它的选题卡。
            </p>
          </div>
        ) : !candidate.card.oneLiner ? (
          // card 为空：不显示空字段,给一个 CTA(不编).
          <div
            data-testid="detail-empty-card"
            className="flex flex-1 flex-col items-start gap-3 py-6"
          >
            <p className="text-base font-medium text-foreground">
              {candidate.title}
            </p>
            <p className="text-sm text-muted-foreground">
              这条还没有选题卡。让 AI 按你的定位 + 素材补全一句话选题、观众痛点、推荐结构等。
            </p>
            <EnrichButton candidate={candidate} className="h-8 px-3" />
          </div>
        ) : (
          <CandidateCardDetail candidate={candidate} />
        )}
      </div>
    </aside>
  );
}

function CandidateCardDetail({
  candidate,
}: {
  readonly candidate: CandidateResource;
}) {
  const { pending, run, router } = useMutation();
  const card = candidate.card;

  function promote() {
    run(
      () =>
        client.promoteCandidate({
          params: { candidateId: candidate.id },
          query: undefined,
          body: {},
        }),
      (result) => {
        const projectId = (result as { projectId?: string } | null)?.projectId;
        if (projectId) router.push(`/projects/${projectId}`);
        else router.refresh();
      },
    );
  }

  return (
    <div className="flex flex-col gap-3.5">
      <p className="text-base font-semibold leading-snug text-foreground">
        {card.oneLiner}
      </p>

      <DetailRow label="目标观众" value={card.targetAudience} />
      <DetailRow label="观众痛点" value={card.audiencePain} />
      <DetailRow label="核心冲突" value={card.coreConflict} />

      {card.hook ? (
        <div className="flex flex-col gap-1 rounded-control bg-brand-soft/60 px-3 py-2">
          <DetailIcon icon={Sparkles} label="推荐 Hook" />
          <span className="text-sm leading-relaxed text-foreground">
            {card.hook}
          </span>
        </div>
      ) : null}

      {card.contentStructure.length > 0 ? (
        <div className="flex flex-col gap-1.5">
          <DetailIcon icon={FileText} label="推荐内容结构" />
          <ol className="flex flex-col gap-1 text-sm text-foreground">
            {card.contentStructure.map((step, i) => (
              <li key={i} className="flex gap-2">
                <span className="flex size-4 shrink-0 items-center justify-center rounded-full bg-brand-soft text-[10px] font-semibold text-brand">
                  {i + 1}
                </span>
                <span className="leading-relaxed">{step}</span>
              </li>
            ))}
          </ol>
        </div>
      ) : null}

      <DetailRow label="适合形式" value={card.format} />
      <DetailRow label="素材依据" value={card.materialBasis} />

      {card.riskNote ? (
        <div className="flex flex-col gap-1 rounded-control border border-warning/30 bg-warning-soft/50 px-3 py-2">
          <DetailIcon icon={HeartPulse} label="风险点" />
          <span className="text-sm leading-relaxed text-foreground">
            {card.riskNote}
          </span>
        </div>
      ) : null}

      <DetailRow label="立项建议" value={card.proposal} />

      {/* 底部动作 */}
      <div className="flex flex-wrap items-center gap-1.5 border-t border-border pt-3">
        <EnrichButton candidate={candidate} className="h-8 px-3" />
        <Button
          type="button"
          size="sm"
          className="h-8 gap-1 bg-brand px-3 text-xs text-brand-foreground hover:bg-brand/90"
          disabled={pending || candidate.status === "promoted"}
          onClick={promote}
        >
          <Rocket className="size-3.5" />
          立项为 Project
        </Button>
      </div>
    </div>
  );
}

// ── 编导起草:一句话 → 补全整张选题卡(A1 把"填表"翻成"审稿")────────────────────────
// 人只打一句意图;编导一气做完 建卡(createCandidate)→ 补全(topic.enrich)→ 物化(confirm),
// 补全的整卡进池等人审/改(CollabField)。补全失败也让裸卡进池(人可手动详填)。复用 EnrichButton 流。
export function IdeaDraftForm() {
  const { run } = useMutation();
  const [idea, setIdea] = React.useState("");
  const [phase, setPhase] = React.useState<"idle" | "running" | "error">("idle");
  const [hint, setHint] = React.useState("");
  const cancelledRef = React.useRef(false);
  React.useEffect(
    () => () => {
      cancelledRef.current = true;
    },
    [],
  );
  const valid = idea.trim().length > 0;

  function draft() {
    if (!valid || phase === "running") return;
    setPhase("running");
    setHint("编导起草中:建卡…");
    void (async () => {
      try {
        const created = (await client.createCandidate({
          params: undefined,
          query: undefined,
          body: { title: idea.trim(), angle: "", source: "idea" },
        })) as { id: string };
        setHint("编导补全中:读定位 · 找痛点 · 写 Hook…");
        const task = (await client.createAITask({
          params: undefined,
          query: undefined,
          body: { taskType: "topic.enrich", inputData: { candidateId: created.id } },
        })) as { id: string };
        for (let i = 0; i < 75; i++) {
          if (cancelledRef.current) return;
          await new Promise((r) => setTimeout(r, 4000));
          if (cancelledRef.current) return;
          const status = (await client.getTask({
            params: { taskId: task.id },
            query: undefined,
            body: undefined,
          })) as { status: string };
          if (status.status === "awaiting_confirmation") {
            await client.confirmTask({
              params: { taskId: task.id },
              query: undefined,
              body: undefined,
            });
            if (!cancelledRef.current) {
              setIdea("");
              setHint("");
              setPhase("idle");
              run(() => Promise.resolve()); // router.refresh() — 补全的卡进池
            }
            return;
          }
          if (status.status === "cancelled" || status.status === "failed") {
            // 裸卡已建(title 在);补全没成 → 仍刷新让它进池,人可手动详填。
            if (!cancelledRef.current) {
              setHint("");
              setPhase("error");
              run(() => Promise.resolve());
            }
            return;
          }
        }
        if (!cancelledRef.current) {
          setPhase("error");
          run(() => Promise.resolve());
        }
      } catch {
        if (!cancelledRef.current) setPhase("error");
      }
    })();
  }

  return (
    <div
      data-testid="idea-draft-form"
      className="shrink-0 rounded-card border border-brand/30 bg-brand-soft/40 p-2.5"
    >
      <form
        className="flex items-center gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          draft();
        }}
      >
        <Sparkles className="size-4 shrink-0 text-brand" />
        <Input
          aria-label="一句话起选题"
          placeholder="说一句你想做的选题,编导补全成整张卡…"
          value={idea}
          onChange={(e) => setIdea(e.target.value)}
          disabled={phase === "running"}
          className="h-8 flex-1 border-transparent bg-surface text-xs"
        />
        <Button
          type="submit"
          size="sm"
          disabled={!valid || phase === "running"}
          className="h-8 shrink-0 gap-1.5 bg-brand px-3 text-xs text-brand-foreground hover:bg-brand/90"
        >
          {phase === "running" ? "编导起草中…" : "编导起草"}
        </Button>
      </form>
      {phase === "running" && hint ? (
        <p className="mt-1.5 pl-6 text-[11px] text-brand">{hint}</p>
      ) : null}
      {phase === "error" ? (
        <p className="mt-1.5 pl-6 text-[11px] text-muted-foreground">
          补全没成,但裸卡已进池 —— 你可在卡上点「补全选题卡」重试,或手动详填。
        </p>
      ) : null}
    </div>
  );
}

// ── 中栏：选题候选池 ──────────────────────────────────────────────────────────────
function PoolColumn({
  pool,
  sort,
}: {
  readonly pool: CandidateResource[];
  readonly sort: CandidateSortKey;
}) {
  const [q, setQ] = React.useState("");
  const filtered = q.trim()
    ? pool.filter(
        (c) =>
          c.title.includes(q.trim()) ||
          (c.card.oneLiner ?? "").includes(q.trim()),
      )
    : pool;

  return (
    <section className="flex min-h-0 min-w-0 flex-col gap-3 overflow-hidden rounded-card border border-border bg-surface p-4">
      <div className="flex shrink-0 items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-foreground">选题候选池</h3>
        <CreateCandidateForm />
      </div>

      {/* A1 主路径:一句话让编导补全(12 字段表单降级成上面的「手动详填」)。 */}
      <IdeaDraftForm />

      <div className="flex shrink-0 flex-wrap items-center gap-2">
        <span className="relative flex-1">
          <Search className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-text-subtle" />
          <Input
            aria-label="搜索候选"
            placeholder="搜索选题"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            className="h-8 pl-8 text-xs"
          />
        </span>
        <CandidateSortControl sort={sort} />
      </div>

      <ul
        data-testid="candidate-pool"
        data-sort={sort}
        className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto pr-1"
      >
        {filtered.length === 0 ? (
          <li
            data-testid="candidate-empty-state"
            className="rounded-card border border-dashed border-border px-3 py-8 text-center text-sm text-muted-foreground"
          >
            还没有候选。<span className="text-brand">用上面一句话让编导起草</span>
            ，或开一场 AI 选题会 —— 编导基于你的定位 + 评论 + 爆款经验主动出题。
          </li>
        ) : (
          filtered.map((c) => <CandidateCard key={c.id} candidate={c} />)
        )}
      </ul>
    </section>
  );
}

// ── 三栏工作区 (选中态 owner) ──────────────────────────────────────────────────────
export function TopicsWorkspace({
  candidates,
  sources,
  sort,
}: {
  readonly candidates: CandidateResource[];
  readonly sources: TopicsOverviewResource["sources"];
  readonly sort: CandidateSortKey;
}) {
  const pool = candidates.filter((c) => c.status !== "dropped");
  // The user's explicit pick (null until they click). Derived during render — the
  // EFFECTIVE selection falls back to the first card-bearing candidate (else the first)
  // and self-heals when the picked row leaves the pool (drop/promote/refresh), so we
  // never setState in an effect.
  const fallbackId =
    pool.find((c) => c.card.oneLiner)?.id ?? pool[0]?.id ?? null;
  const [pickedId, setPickedId] = React.useState<string | null>(null);
  const selectedId =
    pickedId && pool.some((c) => c.id === pickedId) ? pickedId : fallbackId;

  const selected = pool.find((c) => c.id === selectedId) ?? null;
  // The React Compiler memoizes this object; a manual useMemo would mis-track the stable
  // setter, so we build it inline.
  const ctx: SelectionContext = { selectedId, select: setPickedId };

  return (
    <SelectionCtx.Provider value={ctx}>
      {/* flex-1 min-h-0 → 三栏占满中间剩余高度;每列各自框内滚动 (列内裁切而非整页滚)。
          窄屏 (无 lg) 退回单列纵向、由外层页面统一处理高度。 */}
      <div
        data-testid="topics-three-column"
        className="grid min-h-0 flex-1 grid-cols-1 gap-4 lg:grid-cols-[240px_minmax(0,1fr)_360px]"
      >
        <SourcesColumn sources={sources} />
        <PoolColumn pool={pool} sort={sort} />
        <CandidateDetailPanel candidate={selected} />
      </div>
    </SelectionCtx.Provider>
  );
}

"use client";
import styles from "./topics-workflow.module.css";
import prepareStyles from "./topics-prepare.module.css";
import { TopicWorkflowStep } from "./topics-workflow-step";
import { AudienceTaskDetail } from "./audience-task-detail";

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
 *  - `CandidateCard` title selects the detail; its only action is 丢弃 →
 *    `client.patchCandidate { status:'dropped' }`. Detail actions promote via
 *    `client.ensureProject` then navigate to `/projects/:id`.
 *    选题页只负责选方案：原「补充信息 / 补全选题卡」入口移到项目页的自动处理流水线
 *    项目准备与候选采纳在项目内继续。
 *  - `CandidateSortControl` (推荐排序 / …) → re-issues `candidates.list` with the new
 *    `sort` via a URL search-param navigation.
 *  - [T-244] 左栏来源行(行业热点/手动灵感,可映射到 candidates.source 枚举的两行)→
 *    `?source=` URL 导航按来源过滤候选池;再点同一行取消。其余 5 行映射不了,保持纯展示
 *    (见 SOURCE_ROW_FILTERS 注释,绝不做假过滤)。
 *
 * Determinism (C-5): every visible value comes from props; no Date.now / Math.random /
 * fetch in render. The mutation seam mirrors the monetization/positioning islands.
 */

import * as React from "react";
import {openCopilotLocally} from "@/lib/copilot-navigation";
import { useRouter } from "next/navigation";
import { MessageSquare, Headphones, BookOpen, Flame, TrendingUp, RotateCcw, Lightbulb, Plus, Sparkles, HeartPulse, FileText, Rocket, Trash2, Search, FlaskConical, ExternalLink, type LucideIcon } from "lucide-react";

import { client } from "@/lib/contract-client";
import {creationScopeKey,readCreationScope,useCreationScope} from "@/lib/creation-workspace-scope";
import { copilotDeepLink } from "@/features/copilot/copilot-deeplink";
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
// [T-279] 今日新选题条带卡点击的跨 island 选中信号(条带在本 island 外发,这里订阅)。
import { subscribeTopicFocus } from "./topic-focus-signal";

export type CandidateSortKey =
  | "predictedScore"
  | "positioningFit"
  | "demandCount"
  // [T-216] 防茧房推荐:走护栏排序(偏好注入后分 + 探索位),防 AI 越学越窄。
  | "guardrail";

const SORT_LABELS: Record<CandidateSortKey, string> = {
  predictedScore: "推荐排序",
  positioningFit: "定位契合优先",
  demandCount: "需求热度优先",
  guardrail: "防茧房推荐",
};

// ── [T-244] 来源过滤(左栏来源行 → 候选池)────────────────────────────────────────
// 契约 candidateSource 全枚举(contract/src/primitives.ts:126)—— `?source=` 的合法值域。
// [T-235c] favorites:指定收藏夹采集进池的跟拍候选。
export type CandidateSourceFilter =
  | "trend"
  | "benchmark"
  | "demand"
  | "idea"
  | "favorites";

/**
 * 左栏「选题来源」7 行(overview.sources key)→ candidates.source 枚举的映射。
 * 只有能一对一映射到真 source 枚举的行才可点(点击 = 服务端按该 source 过滤候选池);
 * 映射不了的保持纯展示 —— 绝不做「点了像在过滤、实际筛不准」的假过滤:
 *   - comment(评论问题)/ consultation(客户咨询):计的是 audience_signals 的分布,
 *     二者转化成候选后都落 source='demand'(多对一)。点「评论问题」若筛 demand,
 *     会把咨询来的候选也混进来 —— 名不副实,保持展示态。
 *   - knowledge(知识库资料):计知识卡条数,候选无对应 source 枚举。
 *   - highPerformer(历史爆款):计自己的高表现作品数,不是 benchmark 候选,无映射。
 *   - review(项目复盘):计 learnings 条数,候选无对应 source 枚举。
 *   - trend(行业热点)→ source='trend' ✓;idea(手动灵感)→ source='idea' ✓。
 */
const SOURCE_ROW_FILTERS: Partial<Record<string, CandidateSourceFilter>> = {
  trend: "trend",
  idea: "idea",
};

/** 过滤提示用的人话标签(候选池标题旁「已按来源过滤:X」)。 */
const SOURCE_FILTER_LABELS: Record<CandidateSourceFilter, string> = {
  trend: "行业热点",
  benchmark: "对标博主",
  demand: "观众需求",
  idea: "手动灵感",
  favorites: "收藏夹跟拍", // [T-235c] 指定收藏夹采集进池
};

/** 拼 /topics URL:保留 sort,来源过滤有值才带(与 `?sort=` 同款 URL 导航范式)。 */
function topicsHref(
  sort: CandidateSortKey,
  source: CandidateSourceFilter | null,
): string {
  return source
    ? `/topics?sort=${sort}&source=${source}`
    : `/topics?sort=${sort}`;
}

/** 打开选题 Copilot 时保留候选池状态；关闭浮层后仍回到用户刚才筛过的列表。 */
function preserveTopicsState(
  href: string,
  sort?: CandidateSortKey,
  sourceFilter?: CandidateSourceFilter | null,
): string {
  if (!sort && !sourceFilter) return href;
  const params = new URLSearchParams(href.startsWith("?") ? href.slice(1) : href);
  if (sort) params.set("sort", sort);
  if (sourceFilter) params.set("source", sourceFilter);
  return `?${params.toString()}`;
}

// ── shared mutation seam ────────────────────────────────────────────────────────
// A `pending` guard blocks concurrent writes; on success it runs `after` (defaults to
// router.refresh) so the server re-reads persisted rows.
export function useMutation() {
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
const SOURCE_LABELS = {
  trend: "推荐",
  benchmark: "对标",
  demand: "需求",
  idea: "灵感",
  favorites: "收藏",
} satisfies Record<CandidateSourceFilter, string>;

function candidateSourceLabel(source: string): string {
  return Object.hasOwn(SOURCE_LABELS, source)
    ? SOURCE_LABELS[source as CandidateSourceFilter]
    : "未知来源";
}

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

function SourceReferenceLinks({
  candidate,
  compact = false,
}: {
  readonly candidate: CandidateResource;
  readonly compact?: boolean;
}) {
  const references = candidate.card.sourceReferences ?? [];
  if (references.length === 0) return null;
  return (
    <div
      data-testid="candidate-source-links"
      className={cn("flex flex-wrap items-center", compact ? "gap-1.5" : "gap-2")}
    >
      {references.map((reference) => (
        <a
          key={`${reference.kind}:${reference.url}`}
          href={reference.url}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(event) => event.stopPropagation()}
          className={cn(
            "inline-flex items-center gap-1 text-brand hover:underline",
            compact ? "text-[11px]" : "text-sm",
          )}
        >
          {reference.label}
          <ExternalLink className={compact ? "size-3" : "size-3.5"} />
        </a>
      ))}
    </div>
  );
}

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
  const { selectedId, select } = React.useContext(SelectionCtx);
  const selected = selectedId === candidate.id;
  const card = candidate.card;
  // [T-235d/e] 实验候选(正向归因回流 next_experiments 进池)带 card.attributionId 溯源;
  // 徽标可点开看归因依据(简版:runner 把归因引用写在 angle 里,展开显示,不开新页面)——
  // 「系统在学我」的最强感知点。
  const isExperiment = Boolean(card.attributionId);
  const [attributionOpen, setAttributionOpen] = React.useState(false);

  const meta = [
    { label: "观众", value: card.targetAudience },
    { label: "形式", value: card.format },
    { label: "状态", value: STATUS_LABELS[candidate.status] ?? candidate.status },
  ].filter((item) => Boolean(item.value));

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
      <h3 className={styles.candidateHeading}>
        <button
          type="button"
          aria-pressed={selected}
          aria-label={`查看选题：${candidate.title}`}
          onClick={(event) => { event.stopPropagation(); select(candidate.id); }}
          className={styles.titleButton}
        >
          {candidate.title}
        </button>
      </h3>
      <div className={styles.candidateLabels}>
        <Badge variant="secondary">
          {sourceLabel ?? candidateSourceLabel(candidate.source)}
        </Badge>
        {ROLE_LABELS[candidate.contentRole ?? ""] ? (
          <Badge variant="outline">
            {ROLE_LABELS[candidate.contentRole ?? ""]}
          </Badge>
        ) : null}
            {isExperiment ? (
              <button
                type="button"
                data-testid="experiment-badge"
                title="来自正向归因回流的实验候选,点击看归因依据"
                onClick={(e) => {
                  e.stopPropagation();
                  setAttributionOpen((v) => !v);
                }}
                className={styles.experimentLabel}
              >
                <FlaskConical className="size-3" />
                实验
              </button>
            ) : null}
      </div>

      {/* [T-235d/e] 归因依据展开(实验徽标点开):angle 里携带归因引用(runner 落库时写入),
          无内容诚实提示。 */}
      {isExperiment && attributionOpen ? (
        <p
          data-testid="experiment-attribution"
          className={styles.attributionText}
        >
          {candidate.angle || "该实验候选未携带归因引用文本(可在归因资产里溯源)。"}
        </p>
      ) : null}

      <dl className={styles.candidateMeta}>
        {meta.map(({ label, value }) => (
          <div key={label}>
            <dt>{label}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>

      <SourceReferenceLinks candidate={candidate} compact />

      {/* 4 评分 chip — null 显示「—」(不编). */}
      <div data-slot="candidate-scores" className="flex flex-wrap gap-1.5">
        <ScoreChip label="定位契合" value={candidate.positioningFit} />
        <ScoreChip label="受众痛感" value={card.audiencePainScore} />
        <ScoreChip label="素材充足" value={card.materialScore} />
        <ScoreChip
          label="制作难度"
          value={DIFFICULTY_LABELS[card.productionDifficulty ?? ""] ?? null}
        />
      </div>

      <div data-slot="candidate-actions" className="flex items-center pt-0.5">
        <DropButton candidate={candidate} />
      </div>
    </li>
  );
}

// ── 丢弃(带淘汰原因)────────────────────────────────────────────────────────────
// [T-216 seam③] 点「丢弃」先填一句为什么 → patchCandidate{status:'dropped', dropReason}。
// 原因是防茧房校准的信号源(后端 T-212d 蒸馏它),故不能丢;但允许留空直接丢弃(留空不带
// dropReason)。自带弹窗/mutation,自足小组件。
function DropButton({
  candidate,
}: {
  readonly candidate: CandidateResource;
}) {
  const { pending, run, router } = useMutation();
  const [open, setOpen] = React.useState(false);
  const [reason, setReason] = React.useState("");

  function confirmDrop() {
    const trimmed = reason.trim();
    run(
      () =>
        client.patchCandidate({
          params: { candidateId: candidate.id },
          query: undefined,
          // 留空 → 只带 status(允许直接丢弃);有原因才带 dropReason(校准信号源,不能丢)。
          body: trimmed
            ? { status: "dropped", dropReason: trimmed }
            : { status: "dropped" },
        }),
      () => {
        setReason("");
        setOpen(false);
        router.refresh();
      },
    );
  }

  return (
    <>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="h-7 gap-1 px-2 text-xs text-muted-foreground"
        disabled={pending || candidate.status === "dropped"}
        onClick={(e) => {
          e.stopPropagation();
          setOpen(true);
        }}
      >
        <Trash2 className="size-3.5" />
        丢弃
      </Button>
      <Dialog
        open={open}
        onOpenChange={(v) => {
          if (!pending) setOpen(v);
        }}
      >
        <DialogContent
          data-testid="drop-reason-dialog"
          className="sm:max-w-md"
          onClick={(e) => e.stopPropagation()}
        >
          <DialogHeader>
            <DialogTitle>丢弃选题</DialogTitle>
            <DialogDescription>
              写一句为什么丢弃 —— 编导会据此校准你的偏好(防茧房)。可留空直接丢弃。
            </DialogDescription>
          </DialogHeader>
          <div className="px-6 py-1">
            <Textarea
              aria-label="淘汰原因"
              data-testid="drop-reason-input"
              placeholder="例:太理论了没人看 / 又是复盘不想做…（可留空）"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
              autoFocus
            />
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              disabled={pending}
              onClick={() => setOpen(false)}
            >
              取消
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={pending}
              onClick={confirmDrop}
            >
              {pending ? "丢弃中…" : "确认丢弃"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

// [T-103c] 选题补全的预填话术 —— 只填不发(T-055b),编导据此优先调 topic.enrich。
const TOPIC_ENRICH_PREFILL =
  "基于这条选题,补全一份完整选题卡(观众/痛点/结构/形式),我要采纳进候选池。";

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

// 评分/可行性 —— schema 里是 number(0–100)|null 与 3 档枚举,与上面全字符串的 EMPTY_CARD
// 结构不同,单独用字符串态承接输入(空串 = 留空 = 不 patch,保持「不写空字段」的诚实)。
const EMPTY_SCORES = {
  audiencePainScore: "", // 受众痛感 0–100
  materialScore: "", // 素材充足 0–100
  productionDifficulty: "", // "" | low | mid | high
};

const DIFFICULTY_OPTIONS: ReadonlyArray<{ value: string; label: string }> = [
  { value: "", label: "未评估" },
  { value: "low", label: "低" },
  { value: "mid", label: "中" },
  { value: "high", label: "高" },
];

export function FieldRow({
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
  const [scores, setScores] = React.useState(EMPTY_SCORES);
  const valid = title.trim().length > 0;
  const setField =
    (k: keyof typeof EMPTY_CARD) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      setCard((c) => ({ ...c, [k]: e.target.value }));
  const setScore =
    (k: keyof typeof EMPTY_SCORES) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
      setScores((s) => ({ ...s, [k]: e.target.value }));

  function reset() {
    setTitle("");
    setAngle("");
    setCard(EMPTY_CARD);
    setScores(EMPTY_SCORES);
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
        // 评分/可行性:数字 0–100 越界或非数跳过;难度只收白名单枚举 —— 数据要真,不塞脏值。
        for (const k of ["audiencePainScore", "materialScore"] as const) {
          const raw = scores[k].trim();
          if (!raw) continue;
          const n = Number(raw);
          if (Number.isInteger(n) && n >= 0 && n <= 100) filled[k] = n;
        }
        if (["low", "mid", "high"].includes(scores.productionDifficulty)) {
          filled.productionDifficulty = scores.productionDifficulty;
        }
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
                  评分 / 可行性
                </h4>
                <p className="-mt-1 text-[11px] text-text-subtle">
                  可留空(由 AI 评估补);手填则记你的判断。0–100 分,越界不收。
                </p>
                <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3">
                  <FieldRow label="受众痛感(0–100)">
                    <Input
                      type="number"
                      min={0}
                      max={100}
                      inputMode="numeric"
                      aria-label="受众痛感评分"
                      value={scores.audiencePainScore}
                      onChange={setScore("audiencePainScore")}
                    />
                  </FieldRow>
                  <FieldRow label="素材充足(0–100)">
                    <Input
                      type="number"
                      min={0}
                      max={100}
                      inputMode="numeric"
                      aria-label="素材充足评分"
                      value={scores.materialScore}
                      onChange={setScore("materialScore")}
                    />
                  </FieldRow>
                  <FieldRow label="制作难度">
                    <select
                      aria-label="制作难度"
                      value={scores.productionDifficulty}
                      onChange={setScore("productionDifficulty")}
                      className="h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
                    >
                      {DIFFICULTY_OPTIONS.map((o) => (
                        <option key={o.value} value={o.value}>
                          {o.label}
                        </option>
                      ))}
                    </select>
                  </FieldRow>
                </div>
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
  sourceFilter = null,
}: {
  readonly sort: CandidateSortKey;
  /** [T-244] 当前来源过滤 —— 换排序时保留(URL 导航别把 `?source=` 冲掉)。 */
  readonly sourceFilter?: CandidateSourceFilter | null;
}) {
  const { router } = useMutation();
  function onChange(next: string) {
    if (next === sort) return;
    router.push(topicsHref(next as CandidateSortKey, sourceFilter));
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
// [T-244] 能映射到真 candidates.source 枚举的行(SOURCE_ROW_FILTERS:行业热点/手动灵感)
// 做成真过滤器:点击 → `?source=` URL 导航重发 candidates.list(与 `?sort=` 同款范式),
// 再点同一行取消。其余 5 行仍是纯信息展示(映射不了,见 SOURCE_ROW_FILTERS 注释)——
// T-051「去假可点样式」只对它们继续适用。
function SourcesColumn({
  sources,
  sort,
  sourceFilter,
  candidateCountsBySource,
}: {
  readonly sources: TopicsOverviewResource["sources"];
  readonly sort: CandidateSortKey;
  readonly sourceFilter: CandidateSourceFilter | null;
  /**
   * 全量(未过滤)候选按 source 的在池计数 —— 可点行的禁用判据。
   * 注意不能用行上展示的 overview count 判禁用:trend 行的 count 计的是热点信号存量
   * (无一等存储诚实置 0,candidate.service.ts:631),而 source='trend' 的候选真实存在
   * (信源采集/AI 出题采纳产出)—— 有候选可筛就该可点。
   */
  readonly candidateCountsBySource: Partial<Record<CandidateSourceFilter, number>>;
}) {
  const { router } = useMutation();
  return (
    <aside
      data-testid="topics-sources"
      className="flex min-h-0 flex-col gap-3 overflow-hidden rounded-card border border-border bg-surface p-4"
    >
      <h3 className="shrink-0 text-sm font-semibold text-foreground">选题来源</h3>
      <ul className="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto">
        {sources.map((s) => {
          const Icon = SOURCE_ICONS[s.key] ?? Lightbulb;
          const filter = SOURCE_ROW_FILTERS[s.key] ?? null;
          const displayCount = filter
            ? candidateCountsBySource[filter] ?? 0
            : s.count;
          const content = (
            <>
              <span className="flex size-7 shrink-0 items-center justify-center rounded-control bg-brand-soft text-brand">
                <Icon className="size-4" strokeWidth={2} />
              </span>
              <span className="flex-1 truncate text-left text-foreground">
                {s.label}
              </span>
              <Badge variant="secondary" className="text-[10px] tabular-nums">
                {displayCount}
              </Badge>
            </>
          );
          if (!filter) {
            return (
              <li
                key={s.key}
                data-testid="topics-source-row"
                data-filter-availability="summary-only"
                title="仅统计：这个数量是上游信号或资料存量，现有候选尚不能按该来源精确区分。"
                // [T-051 2c] 纯信息行:无 hover 高亮 / 指针 —— 该来源分类映射不到
                // candidates.source 枚举(见 SOURCE_ROW_FILTERS),做可点就是假过滤。
                className="flex items-center gap-2.5 rounded-control px-2 py-2 text-sm"
              >
                {content}
                <span className="shrink-0 text-[10px] text-text-subtle">仅统计</span>
              </li>
            );
          }
          const active = sourceFilter === filter;
          // 池里没有该来源的候选 → 点了也是空列表,禁用 + 视觉弱化(诚实:没得筛)。
          const disabled = (candidateCountsBySource[filter] ?? 0) === 0;
          return (
            <li key={s.key} className="flex">
              <button
                type="button"
                data-testid="topics-source-row"
                data-source-filter={filter}
                data-active={active ? "true" : "false"}
                aria-pressed={active}
                aria-label={
                  active ? `取消按${s.label}过滤` : `按${s.label}过滤候选池`
                }
                disabled={disabled}
                onClick={() =>
                  // 再点当前已激活的来源 → 清除过滤回全部;保留 sort。
                  router.push(topicsHref(sort, active ? null : filter))
                }
                className={cn(
                  "flex flex-1 cursor-pointer items-center gap-2.5 rounded-control px-2 py-2 text-sm transition-colors",
                  active
                    ? "bg-brand-soft ring-1 ring-inset ring-brand/40"
                    : "hover:bg-surface-subtle",
                  disabled && "cursor-not-allowed opacity-40 hover:bg-transparent",
                )}
              >
                {content}
              </button>
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
      id="topics-review"
      className="flex min-h-0 flex-col gap-3 overflow-hidden rounded-card border border-border bg-surface p-4"
    >
      <div className={styles.reviewHeading}><TopicWorkflowStep step={3} label="核对选题"/><a href="#topics-pick" className={styles.backToPool}>返回候选</a></div>

      {/* 详情体可能较长 → 框内独立滚动 (列内裁切而非整页滚)。 */}
      <div tabIndex={0} role="region" aria-label="选题卡详情" className="flex min-h-0 flex-1 flex-col overflow-y-auto pr-1">
        {candidate === null ? (
          <div
            data-testid="detail-no-selection"
            className="flex flex-1 flex-col items-center justify-center gap-2 py-10 text-center"
          >
            <span className="flex size-10 items-center justify-center rounded-full bg-surface-subtle text-text-subtle">
              <FileText className="size-5" />
            </span>
            <p className="text-sm text-muted-foreground">
              从候选池选一条，查看它的选题卡。
            </p>
          </div>
        ) : !candidate.card.oneLiner && !candidate.card.audienceTask ? (
          // card 为空：不显示空字段,给一个 CTA(不编).
          <div
            data-testid="detail-empty-card"
            className="flex flex-1 flex-col items-start gap-3 py-6"
          >
            <p className="text-base font-medium text-foreground">
              {candidate.title}
            </p>
            <SourceReferenceLinks candidate={candidate} />
            <p className="text-sm text-muted-foreground">
              这条还没有选题卡。升级为项目后，会在项目里自动补全一句话选题、观众痛点、推荐结构等。
            </p>

          </div>
        ) : (
          <CandidateCardDetail candidate={candidate}/>
        )}
      </div>
      <CandidateProjectActions key={candidate?.id??"none"} candidate={candidate}/>
    </aside>
  );
}

function CandidateProjectActions({candidate}:{readonly candidate:CandidateResource|null}) {
  const router=useRouter(),scopeKey=creationScopeKey(useCreationScope());
  const epoch=React.useRef(0),alive=React.useRef(false),inFlight=React.useRef(false);
  const [state,setState]=React.useState<{scopeKey:string;pending:boolean;error:string|null;projectId?:string}>({scopeKey,pending:false,error:null});
  React.useEffect(()=>{const invalidate=()=>{epoch.current++;};alive.current=true;invalidate();inFlight.current=false;return()=>{alive.current=false;invalidate();};},[scopeKey]);
  const visible=state.scopeKey===scopeKey?state:null;
  async function promote(){
    if(!candidate||inFlight.current)return;
    const turn=epoch.current;inFlight.current=true;setState({scopeKey,pending:true,error:null});
    const current=()=>alive.current&&epoch.current===turn&&creationScopeKey(readCreationScope())===scopeKey;
    try{
      const result=await client.ensureProject({params:undefined,query:undefined,body:{source:"topic",candidateId:candidate.id,idempotencyKey:`topic-ensure:${candidate.id}`}});
      if(!current())return;
      setState({scopeKey,pending:false,error:null,projectId:result.project.id});
      router.push(`/projects/${encodeURIComponent(result.project.id)}`);
    }catch(error){if(current())setState({scopeKey,pending:false,error:error instanceof Error?error.message:"项目创建结果暂未确认，请使用原方案重试。"});}
    finally{if(current())inFlight.current=false;}
  }
  return <section id="topics-create" className={styles.createActions} aria-label="升级为项目">
    <TopicWorkflowStep step={4} label="升级为项目"/>
    <p className="text-xs leading-5 text-muted-foreground">选定方案后创建项目；准备进度、补充来源和候选采纳在项目页处理。</p>
    {candidate?<div className="flex flex-wrap items-center gap-2">
      {candidate.status==="promoted"||visible?.projectId?<span className="text-xs text-muted-foreground">项目已创建</span>:null}
      <Button type="button" size="sm" className="h-8 gap-1 bg-brand px-3 text-xs text-brand-foreground hover:bg-brand/90" disabled={visible?.pending} onClick={()=>void promote()}><Rocket className="size-3.5"/>{visible?.pending?"正在读取项目…":candidate.status==="promoted"||visible?.projectId?"查看项目":"升级为项目"}</Button>
    </div>:<p>先选择一条候选，再进入创作。</p>}
    {visible?.error?<p role="alert" className="mt-2 text-sm text-destructive">{visible.error}</p>:null}
  </section>;
}

function CandidateCardDetail({candidate}:{readonly candidate: CandidateResource;}) {
  const card = candidate.card;
  const [radarTranscript, setRadarTranscript] = React.useState("");
  const radarItemId = card.sourceReferences?.find(
    (reference) => reference.intelligenceItemId,
  )?.intelligenceItemId;
  React.useEffect(() => {
    if (!radarItemId || !card.adaptedDraft) return;
    let alive = true;
    void client
      .getIntelligenceItem({
        params: { itemId: radarItemId },
        query: undefined,
        body: undefined,
      })
      .then((result) => {
        const text = (result as { transcript?: { text?: unknown } }).transcript?.text;
        if (alive && typeof text === "string") setRadarTranscript(text);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [card.adaptedDraft, radarItemId]);


  return (
    <div className="flex flex-col gap-3.5">
      <p className="text-base font-semibold leading-snug text-foreground">
        {card.oneLiner}
      </p>

      <SourceReferenceLinks candidate={candidate} />

      {card.adaptedDraft ? (
        <div className="grid gap-3 rounded-control border border-border bg-surface-subtle p-3 md:grid-cols-2">
          <div className="min-w-0">
            <p className="mb-1 text-xs font-semibold text-foreground">对标原稿 · 只读</p>
            <pre className="max-h-72 overflow-auto whitespace-pre-wrap break-words rounded-md bg-surface p-2 text-xs leading-5 text-muted-foreground">
              {radarTranscript || "正在读取对标逐字稿…"}
            </pre>
          </div>
          <div className="min-w-0">
            <p className="mb-1 text-xs font-semibold text-foreground">我的改写初稿</p>
            <pre className="max-h-72 overflow-auto whitespace-pre-wrap break-words rounded-md bg-surface p-2 text-xs leading-5 text-foreground">
              {card.adaptedDraft.contentText}
            </pre>
          </div>
        </div>
      ) : null}

      {card.audienceTask?<AudienceTaskDetail task={card.audienceTask}/>:null}
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


    </div>
  );
}

// ── 编导起草:一句话 → 补全整张选题卡(A1 把"填表"翻成"审稿")────────────────────────
// 人只打一句意图;**T-103c 起改为对话内即时反馈**:编导先建裸卡(createCandidate),再打开 Copilot
// 深链(fn=topic.enrich + selection=新建候选 + 预填话术,不自动发)——补全在对话里流式进行,产 enrich
// 卡逐条采纳落库,不再后台轮询 confirm。裸卡已进池(title 在)，用户可选择方案后进入项目继续准备。
export function IdeaDraftForm({
  sort,
  sourceFilter,
}: {
  readonly sort?: CandidateSortKey;
  readonly sourceFilter?: CandidateSourceFilter | null;
} = {}) {
  const router = useRouter();
  const inputId = React.useId();
  const [idea, setIdea] = React.useState("");
  const [phase, setPhase] = React.useState<"idle" | "opening" | "error">("idle");
  const cancelledRef = React.useRef(false);
  React.useEffect(
    () => () => {
      cancelledRef.current = true;
    },
    [],
  );
  const valid = idea.trim().length > 0;

  function draft() {
    if (!valid || phase === "opening") return;
    setPhase("opening");
    void (async () => {
      try {
        const title = idea.trim();
        const created = (await client.createCandidate({
          params: undefined,
          query: undefined,
          body: { title, angle: "", source: "idea" },
        })) as { id: string };
        if (cancelledRef.current) return;
        // 深链:surface=topics,fn=topic.enrich,selection=刚建的候选(免编导索要 id/标题),预填
        // 话术(不自动发)。query-only href → 就地开 Copilot 浮层不跳页;补全的 enrich 卡对话内采纳。
        const href = copilotDeepLink(
          "topics", "topic.enrich",
          { kind: "candidate", id: created.id, title }, TOPIC_ENRICH_PREFILL,
        );
        if(!openCopilotLocally(href))router.push(preserveTopicsState(href,sort,sourceFilter));
        if (!cancelledRef.current) {
          setIdea("");
          setPhase("idle");
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
      <label htmlFor={inputId} className={prepareStyles.ideaLabel}>一句话起选题</label>
      <form
        className="flex items-center gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          draft();
        }}
      >
        <Sparkles className="size-4 shrink-0 text-brand" aria-hidden="true"/>
        <Input
          id={inputId}
          aria-label="一句话起选题"
          aria-describedby={`${inputId}-hint`}
          placeholder="说说你想做的内容"
          value={idea}
          onChange={(e) => setIdea(e.target.value)}
          disabled={phase === "opening"}
          className="h-8 flex-1 border-transparent bg-surface text-xs"
        />
        <Button
          type="submit"
          size="sm"
          disabled={!valid || phase === "opening"}
          className="h-8 shrink-0 gap-1.5 bg-brand px-3 text-xs text-brand-foreground hover:bg-brand/90"
        >
          {phase === "opening" ? "打开对话中…" : "编导起草"}
        </Button>
      </form>
      <p id={`${inputId}-hint`} className={prepareStyles.ideaHint}>点击后先存为候选，再进入对话补全。</p>
      {phase === "error" ? (
        <p className="mt-1.5 pl-6 text-[11px] text-muted-foreground">
          打开对话出错，请重试。已保存的候选仍在选题池中，可以选定方案后进入项目。
        </p>
      ) : null}
    </div>
  );
}

// ── 中栏：选题候选池 ──────────────────────────────────────────────────────────────
function PoolColumn({
  pool,
  query,
  onQueryChange,
  sort,
  sourceFilter,
  sources,
  candidateCountsBySource,
}: {
  readonly sources: TopicsOverviewResource["sources"];
  readonly candidateCountsBySource: Partial<Record<CandidateSourceFilter, number>>;
  readonly pool: CandidateResource[];
  readonly query: string;
  readonly onQueryChange: (query: string) => void;
  readonly sort: CandidateSortKey;
  /** [T-244] 当前来源过滤 —— 标题旁给「已按来源过滤」提示,换排序时保留。 */
  readonly sourceFilter: CandidateSourceFilter | null;
}) {
  const router = useRouter();
  const filtered = pool;

  return (
    <section id="topics-pick" className={styles.pool}>
      <div className="flex shrink-0 items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <TopicWorkflowStep step={2} label="挑选候选"/>
          {/* [T-244] 过滤态提示:让用户知道池子当前不是全量,以及在哪取消。 */}
          {sourceFilter ? (
            <button
              type="button"
              aria-label="清除来源筛选"
              data-testid="pool-source-filter-hint"
              onClick={() => router.push(topicsHref(sort, null))}
              className="truncate rounded-full bg-brand-soft px-2 py-0.5 text-[11px] text-brand hover:bg-brand/15"
            >
              已筛选：{SOURCE_FILTER_LABELS[sourceFilter]} · 清除
            </button>
          ) : null}
        </div>
        <span className={styles.poolCount}>{filtered.length} 条</span>
      </div>
      <details key={sourceFilter ?? "all"} className={styles.sourceFilters}>
        <summary data-testid="topics-source-toggle">按来源筛选{sourceFilter ? ` · ${SOURCE_FILTER_LABELS[sourceFilter]}` : ""}</summary>
        <SourcesColumn sources={sources} sort={sort} sourceFilter={sourceFilter} candidateCountsBySource={candidateCountsBySource}/>
      </details>

      <div className="flex shrink-0 flex-wrap items-center gap-2">
        <span className="relative flex-1">
          <Search className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-text-subtle" />
          <Input
            aria-label="搜索候选"
            placeholder="搜索选题"
            value={query}
            onChange={(e) => onQueryChange(e.target.value)}
            className="h-8 pl-8 text-xs"
          />
        </span>
        <CandidateSortControl sort={sort} sourceFilter={sourceFilter} />
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
            {query.trim() ? (
              <>没有匹配搜索条件的选题。清空搜索后查看候选。</>
            ) : sourceFilter ? (
              // [T-244] 过滤态空列表 ≠ 真没候选:提示是过滤导致的,别误导用户去建卡。
              <>
                「{SOURCE_FILTER_LABELS[sourceFilter]}」来源下暂无候选
                —— 可在“按来源筛选”中取消过滤，查看全部候选。
              </>
            ) : (
              <>
                还没有候选。<a href="#topics-prepare" className="text-brand underline">前往“补充选题”</a>，用一句话起草或选择 AI 出题依据。
                {/* [T-332 S4·§6.2] 新号无信号的诚实引导:候选为空可能是「这个号的采集
                    作业还没跑 / 跑了但还没攒出信号」——给「跑一次采集」入口,别让用户
                    以为功能坏了。 */}
                <span className="mt-2 block text-xs text-muted-foreground">
                  新账号提示:选题信号来自这个号的采集数据。若还没跑过采集,先到
                  <a
                    href="/automations"
                    data-testid="candidate-empty-run-ingestion"
                    className="mx-0.5 font-medium text-brand underline-offset-4 hover:underline"
                  >
                    自动化中心跑一次采集
                  </a>
                  ,攒到评论/爆款信号后编导出题更准。
                </span>
              </>
            )}
          </li>
        ) : (
          filtered.map((c) => (
            <CandidateCard
              key={c.id}
              candidate={c}
            />
          ))
        )}
      </ul>
    </section>
  );
}

// ── 三栏工作区 (选中态 owner) ──────────────────────────────────────────────────────
export function TopicsWorkspace({
  candidates,
  allCandidates,
  sources,
  sort,
  sourceFilter = null,
}: {
  /** 候选池渲染列表(有来源过滤时已是服务端过滤后的结果)。 */
  readonly candidates: CandidateResource[];
  /**
   * [T-244] 全量(未过滤)候选 —— 来源行禁用判定的计数基。缺省回退 candidates
   * (无过滤时二者相同;老测试调用点不用补)。
   */
  readonly allCandidates?: CandidateResource[];
  readonly sources: TopicsOverviewResource["sources"];
  readonly sort: CandidateSortKey;
  /** [T-244] 当前 `?source=` 过滤态;驱动来源行高亮 + 候选池提示。 */
  readonly sourceFilter?: CandidateSourceFilter | null;
}) {
  const pool = candidates.filter((c) => c.status === "pool");
  const [query, setQuery] = React.useState("");
  const visiblePool = query.trim()
    ? pool.filter((c) => c.title.includes(query.trim()) || (c.card.oneLiner ?? "").includes(query.trim()))
    : pool;
  // [T-244] 可点来源行的禁用判据:全量在池候选按 source 计数(为什么不用 overview
  // count 见 SourcesColumn prop 注释)。
  const candidateCountsBySource: Partial<Record<CandidateSourceFilter, number>> = {};
  for (const c of allCandidates ?? candidates) {
    if (c.status !== "pool") continue;
    const key = c.source as CandidateSourceFilter;
    candidateCountsBySource[key] = (candidateCountsBySource[key] ?? 0) + 1;
  }
  // The user's explicit pick (null until they click). Derived during render — the
  // EFFECTIVE selection falls back to the first card-bearing candidate (else the first)
  // and self-heals when the picked row leaves the pool (drop/promote/refresh), so we
  // never setState in an effect.
  const fallbackId =
    visiblePool.find((c) => c.card.oneLiner)?.id ?? visiblePool[0]?.id ?? null;
  const [pickedId, setPickedId] = React.useState<string | null>(null);
  const selectedId =
    pickedId && visiblePool.some((c) => c.id === pickedId) ? pickedId : fallbackId;

  // [T-279] 订阅「今日新选题」条带卡点击 → 选中该候选 + 把它在候选池里滚进视野
  //   (条带在本 island 外,靠 CustomEvent 跨过来;见 topic-focus-signal)。
  React.useEffect(() => {
    return subscribeTopicFocus((candidateId) => {
      setPickedId(candidateId);
      // 下一帧滚动(等选中态 rerender 后卡在 DOM 里)。
      requestAnimationFrame(() => {
        document
          .querySelector(`[data-candidate-id="${CSS.escape(candidateId)}"]`)
          ?.scrollIntoView({ block: "nearest", behavior: "smooth" });
      });
    });
  }, []);

  const selected = visiblePool.find((c) => c.id === selectedId) ?? null;
  // The React Compiler memoizes this object; a manual useMemo would mis-track the stable
  // setter, so we build it inline.
  const ctx: SelectionContext = { selectedId, select: setPickedId };

  return (
    <SelectionCtx.Provider value={ctx}>
      {/* flex-1 min-h-0 → 三栏占满中间剩余高度;每列各自框内滚动 (列内裁切而非整页滚)。
          窄屏 (无 lg) 退回单列纵向、由外层页面统一处理高度。 */}
      <div data-testid="topics-three-column" className={styles.workspace}>
        <PoolColumn pool={visiblePool} query={query} onQueryChange={setQuery} sort={sort} sourceFilter={sourceFilter} sources={sources} candidateCountsBySource={candidateCountsBySource}/>
        <CandidateDetailPanel
          candidate={selected}
        />
      </div>
    </SelectionCtx.Provider>
  );
}

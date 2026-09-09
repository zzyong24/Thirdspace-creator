/**
 * 定位中心 page (七步①② · SPEC §3.4) — the account-level positioning surface and
 * the upstream constraint source for downstream 选题/评分/变现.
 *
 * Server-component shell with a `viewModel?` test seam (mirrors knowledge/settings).
 * The default render reads `client.getPositioningCenter()` (pages.positioning.get →
 * real SQL via the composite transport). Empty-state (brand-new user, no profile)
 * renders a 「创建定位」 CTA (the draft drawer) instead of the version timeline.
 *
 * Layout (定位中心重建, two-column): 页头 + 新建定位母版 → 两栏 grid:
 *   - 左主栏: 英雄区 当前定位母版 (一句话放大 + 9-facet 图标 chip 网格) → 版本历史表.
 *   - 右规则栏: 「定位规则（供下游模块使用）」 5 条规则卡 (彩色图标 chip + 短文),
 *       prominent / NOT collapsed (these are the constraints the downstream brief injects).
 * The mutating controls live in the client islands `positioning-interactive-region.tsx`
 * (drawer = upsertProfile + createStatement)。定位采集与生成统一进入 Copilot，候选仍须
 * 用户采纳才落库。Built from real shadcn tokens.
 *
 * Determinism (C-5): no Date.now / Math.random / fetch in the render or selectors;
 * the timeline order comes from the version-desc `history` the server composed. Empty
 * facets / empty rules are dropped (never invented) — the fields exist + are editable.
 */

import * as React from "react";
import {
  User,
  Compass,
  Users,
  Ban,
  HeartPulse,
  Sparkles,
  MessageCircle,
  Gem,
  Activity,
  Lightbulb,
  PenLine,
  FolderKanban,
  ShieldAlert,
  Mic2,
  SlidersHorizontal,
  type LucideIcon,
} from "lucide-react";

import { SectionCard } from "@/components/project/section-card";
import { Badge } from "@/components/ui/badge";
import { client as defaultClient } from "@/lib/contract-client.server";
import { cn } from "@/lib/utils";
import type {
  CreatorProfileResource,
  PositioningCenterResource,
  PositioningStatementResource,
} from "@creatoros/backend/modules/positioning";

import { PositioningDiscoveryWorkflow } from "./positioning-discovery-workflow";
import {
  PositioningDraftDrawer,
  ResetPositioningMasterButton,
  RestorePositioningMasterButton,
} from "./positioning-interactive-region";

export type PositioningCenterViewModel = PositioningCenterResource;

/**
 * Structural seam for the server read. The route passes a session-scoped
 * `createServerClient(ctx)` so the positioning read stays user-scoped; the
 * default keeps the singleton (canonical ctx) as the SSR/test fallback seam.
 */
export type PositioningReadClient = Pick<
  typeof defaultClient,
  "getPositioningCenter"
>;

export interface PositioningCenterPageProps {
  /** Override hook for tests; defaults to the server read of pages.positioning.get. */
  readonly viewModel?: PositioningCenterViewModel;
  /**
   * Session-scoped contract client for the production read path. The route
   * passes `createServerClient(session.ctx)`; defaults to the singleton seam.
   */
  readonly client?: PositioningReadClient;
}

export async function PositioningCenterPage({
  viewModel,
  client = defaultClient,
}: PositioningCenterPageProps) {
  const vm =
    viewModel ??
    ((await client.getPositioningCenter({
      params: undefined,
      query: undefined,
      body: undefined,
    })) as PositioningCenterViewModel);
  return <PositioningCenterView viewModel={vm} />;
}

// ── Colored icon chip ─────────────────────────────────────────────────────────
// A small Lucide line icon inside a tinted rounded square. `tone` selects one of the
// design-system soft-backed semantic colors so the facet/rule grid reads as a colorful
// set of chips (not a flat list). Pure presentation — no state.
type ChipTone = "brand" | "info" | "success" | "warning" | "rose" | "violet";

const TONE_CLASS: Record<ChipTone, string> = {
  brand: "bg-brand-soft text-brand",
  info: "bg-info-soft text-info",
  success: "bg-success-soft text-success",
  warning: "bg-warning-soft text-warning",
  rose: "bg-rose-50 text-rose-500",
  violet: "bg-violet-50 text-violet-600",
};

function IconChip({
  icon: Icon,
  tone,
  className,
}: {
  readonly icon: LucideIcon;
  readonly tone: ChipTone;
  readonly className?: string;
}) {
  return (
    <span
      data-slot="icon-chip"
      aria-hidden
      className={cn(
        "flex size-8 shrink-0 items-center justify-center rounded-control",
        TONE_CLASS[tone],
        className,
      )}
    >
      <Icon className="size-[18px]" strokeWidth={2} />
    </span>
  );
}

export function PositioningCenterView({
  viewModel,
}: {
  readonly viewModel: PositioningCenterViewModel;
}) {
  const {
    profile,
    currentStatement,
    keywords,
    productAnchors,
    history,
    activeDiscovery,
  } = viewModel;
  const isEmpty = profile === null;

  return (
    // 固定高度填满：页头 shrink-0 钉住,两栏 flex-1 占满剩余高度、每列各自框内滚。
    <div
      data-slot="positioning-center"
      data-testid="positioning-center"
      className="flex h-full min-h-0 flex-col gap-4"
    >
      <div className="shrink-0">
        <PageHeader isEmpty={isEmpty} />
      </div>

      {isEmpty ? (
        <PositioningDiscoveryWorkflow
          initialSession={activeDiscovery}
          hasCurrentProfile={false}
        />
      ) : (
        // T-666：正式母版永远在前采草稿之前展示。进行中的 scratch / pivot / optimize
        // 只是可恢复草稿，不能再独占整页制造“旧定位已丢失”的错觉。
        <div className="flex min-h-0 flex-1 flex-col gap-section-gap overflow-y-auto pr-1">
          <div className="grid shrink-0 grid-cols-1 gap-section-gap lg:grid-cols-[minmax(0,1fr)_380px]">
            {/* 左列子卡片必须 shrink-0:否则 flex 会把卡片压缩适应列高,卡片自身
                overflow-hidden 无声裁掉内容 → 列 scrollHeight==clientHeight 永不滚 (T-090)。 */}
            <div className="flex min-h-0 min-w-0 flex-col gap-section-gap overflow-y-auto pr-1">
              <HeroMaster
                profile={profile}
                currentStatement={currentStatement}
                keywords={keywords}
                productAnchors={productAnchors}
              />

              <HistoryTable history={history} profile={profile} currentStatementId={currentStatement?.id ?? null} />
            </div>

            <DownstreamRules profile={profile} />
          </div>

          <div className="shrink-0 scroll-mt-4">
            <PositioningDiscoveryWorkflow
              initialSession={activeDiscovery}
              hasCurrentProfile
            />
          </div>
        </div>
      )}
    </div>
  );
}

// 页头：标题 + 副标题 + 右侧主按钮「+ 新建定位母版」(确认后重置真母版并进入 AI 访谈).
function PageHeader({
  isEmpty,
}: {
  readonly isEmpty: boolean;
}) {
  return (
    <header className="flex flex-wrap items-start justify-between gap-3">
      <div className="flex min-w-0 flex-col gap-0.5">
        <h1 className="text-xl font-semibold text-foreground">定位中心</h1>
        <p className="text-sm text-muted-foreground">
          账号的定位母版——下游的选题、评分、素材匹配与发布都以它为约束源。
        </p>
      </div>
      {isEmpty ? null : (
        <ResetPositioningMasterButton />
      )}
    </header>
  );
}

// 英雄区 当前定位母版：当前使用 pill + 最近更新 + 编辑 + 一句话放大 + 9-facet 图标网格.
// Each facet = 彩色 Lucide 图标 chip + 标签 + 一行值; an empty facet is DROPPED.
type Facet = {
  readonly label: string;
  readonly value: string;
  readonly icon: LucideIcon;
  readonly tone: ChipTone;
};

function HeroMaster({
  profile,
  currentStatement,
  keywords,
  productAnchors,
}: {
  readonly profile: CreatorProfileResource;
  readonly currentStatement: PositioningStatementResource | null;
  readonly keywords: readonly string[];
  readonly productAnchors: readonly string[];
}) {
  const f = profile.facets;
  // 完整 9 facet (按 spec 顺序): 我是谁 / 内容范围 / 目标人群 / 不做什么 / 核心痛点 /
  // 表达风格 / 核心价值 / 当前状态 / 差异化视角. Each carries a colored icon chip.
  const facets: ReadonlyArray<Facet> = [
    { label: "我是谁", value: profile.persona, icon: User, tone: "brand" },
    { label: "内容范围", value: f.contentScope, icon: Compass, tone: "info" },
    { label: "目标人群", value: profile.audience, icon: Users, tone: "success" },
    { label: "不做什么", value: f.avoid, icon: Ban, tone: "rose" },
    { label: "核心痛点", value: f.corePain, icon: HeartPulse, tone: "warning" },
    { label: "表达风格", value: f.tone, icon: MessageCircle, tone: "violet" },
    { label: "核心价值", value: f.coreValue, icon: Gem, tone: "brand" },
    { label: "当前状态", value: f.statusNote, icon: Activity, tone: "info" },
    {
      label: "差异化视角",
      value: profile.differentiation,
      icon: Sparkles,
      tone: "violet",
    },
  ];
  const shown = facets.filter((x) => x.value.trim().length > 0);

  // 能力清单 + 产品锚 keep their compact tag rows (secondary signals, not in the 9 grid).
  const capabilities = profile.capabilities.filter((c) => c.trim().length > 0);

  return (
    <SectionCard
      className="shrink-0"
      title="当前定位母版"
      action={
        <div className="flex items-center gap-2">
          {currentStatement ? (
            <Badge
              data-testid="positioning-current-pill"
              className="bg-success/15 text-success"
            >
              当前使用 · v{currentStatement.versionNumber}
            </Badge>
          ) : null}
          {currentStatement ? (
            <span className="text-xs text-text-subtle">
              最近更新 {formatDate(profile.updatedAt)}
            </span>
          ) : null}
          <PositioningDraftDrawer
            profile={profile}
            triggerLabel="编辑"
            triggerVariant="ghost"
            triggerSize="sm"
            triggerIcon="pencil"
            title="编辑当前定位"
            description="更新账号画像，或追加一条新的不可变定位陈述。"
          />
        </div>
      }
    >
      <div className="flex flex-col gap-5 py-1">
        {/* 一句话定位放大 — headline-lg 粗体. */}
        <p
          data-testid="positioning-one-liner"
          className="text-2xl font-bold leading-snug tracking-tight text-foreground"
        >
          {currentStatement?.oneLiner ?? "尚未填写定位陈述"}
        </p>

        {keywords.length > 0 ? (
          <div className="flex flex-wrap gap-1.5">
            {keywords.map((kw) => (
              <Badge
                key={kw}
                variant="secondary"
                className="bg-brand-soft text-brand text-xs"
              >
                {kw}
              </Badge>
            ))}
          </div>
        ) : null}

        {shown.length > 0 ? (
          <dl
            data-testid="positioning-facets"
            className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3"
          >
            {shown.map((facet) => (
              <div
                key={facet.label}
                data-testid="positioning-facet"
                className="flex items-start gap-3 rounded-card border border-border bg-card px-3 py-3 transition-colors hover:border-brand/40"
              >
                <IconChip icon={facet.icon} tone={facet.tone} />
                <div className="flex min-w-0 flex-col gap-0.5">
                  <dt className="text-[11px] font-medium text-text-subtle">
                    {facet.label}
                  </dt>
                  <dd className="text-[13px] leading-snug text-foreground">
                    {facet.value}
                  </dd>
                </div>
              </div>
            ))}
          </dl>
        ) : null}

        {capabilities.length > 0 || productAnchors.length > 0 ? (
          <div className="flex flex-col gap-2 border-t border-border pt-3">
            {capabilities.length > 0 ? (
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-[11px] text-text-subtle">能力清单</span>
                {capabilities.map((c) => (
                  <Badge key={c} variant="outline" className="text-[11px]">
                    {c}
                  </Badge>
                ))}
              </div>
            ) : null}
            {productAnchors.length > 0 ? (
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-[11px] text-text-subtle">产品锚</span>
                {productAnchors.map((a) => (
                  <Badge key={a} variant="outline" className="text-[11px]">
                    {a}
                  </Badge>
                ))}
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
    </SectionCard>
  );
}

// 右规则栏「定位规则（供下游模块使用）」— 5 条规则卡, prominent / not collapsed.
// Each = 彩色图标 chip + 标签 + 短文. Empty rule → that card is dropped (never invented).
// These ARE the fields creative-context injects as HARD constraints into 选题/写稿/项目.
type Rule = {
  readonly label: string;
  readonly value: string;
  readonly icon: LucideIcon;
  readonly tone: ChipTone;
};

function DownstreamRules({
  profile,
}: {
  readonly profile: CreatorProfileResource;
}) {
  const r = profile.downstreamRules;
  const rules: ReadonlyArray<Rule> = [
    { label: "选题规则", value: r.topicRule, icon: Lightbulb, tone: "warning" },
    { label: "写稿规则", value: r.scriptRule, icon: PenLine, tone: "info" },
    {
      label: "项目规则",
      value: r.projectRule,
      icon: FolderKanban,
      tone: "brand",
    },
    {
      label: "禁止事项",
      value: r.forbidRule,
      icon: ShieldAlert,
      tone: "rose",
    },
    {
      label: "表达风格规则",
      value: r.expressionRule,
      icon: Mic2,
      tone: "violet",
    },
  ];
  const shown = rules.filter((x) => x.value.trim().length > 0);

  return (
    // 固定高度下作独立框滚动列 (取代旧的 lg:sticky 整页滚定位)。
    <aside
      data-testid="positioning-downstream"
      className="flex min-h-0 flex-col gap-3 overflow-hidden rounded-card border border-border bg-card p-5"
    >
      <div className="flex shrink-0 flex-col gap-0.5">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-[15px] font-semibold text-foreground">
            定位规则（供下游模块使用）
          </h2>
          <PositioningDraftDrawer
            profile={profile}
            triggerLabel="编辑定位规则"
            triggerVariant="outline"
            triggerSize="sm"
            triggerIcon="pencil"
            title="编辑定位规则"
            description="修改选题 / 写稿 / 项目 / 禁止 / 表达规则；保存后下游 AI 会使用最新规则。"
            initialTab="rules"
          />
        </div>
        <p className="text-xs text-muted-foreground">
          每次 AI 生成（选题 / 写稿 / 项目 / 评分 / Copilot）都会把下面这些规则作为硬约束注入。改规则即改下游所有 AI 的行为。
        </p>
      </div>

      {shown.length > 0 ? (
        <div
          data-testid="positioning-downstream-fields"
          className="flex min-h-0 flex-1 flex-col gap-3.5 overflow-y-auto pr-1"
        >
          {/* 规则卡「一眼可读不挤」(T-090):卡间距 3.5、卡内 padding 拉开、
              标题 13px 半粗 / 正文 12.5px 行高 1.6 形成字号层次。
              [T-154] 加 hover 描边,与左栏 facet 卡视觉一致。 */}
          {shown.map((rule) => (
            <div
              key={rule.label}
              data-testid="positioning-rule-card"
              className="flex items-start gap-3 rounded-control border border-border bg-surface px-3.5 py-3 transition-colors hover:border-brand/40"
            >
              <IconChip icon={rule.icon} tone={rule.tone} className="size-7" />
              <div className="flex min-w-0 flex-col gap-1">
                <span className="text-[13px] font-semibold text-foreground">
                  {rule.label}
                </span>
                <span className="text-[12.5px] leading-[1.6] text-muted-foreground">
                  {rule.value}
                </span>
              </div>
            </div>
          ))}
        </div>
      ) : (
        // [T-154] 空态精致化:旧版一段虚线框文字(粗糙)→ 居中图标 chip + 标题 + 引导 +
        //   5 条规则名预览 + CTA 直接打开「编辑」抽屉填规则。与左栏 AI 强调卡同款 brand 语言。
        <div
          data-testid="positioning-downstream-empty"
          className="flex min-h-0 flex-1 flex-col items-center justify-center gap-4 rounded-control border border-dashed border-border/70 bg-surface-subtle/40 px-5 py-8 text-center"
        >
          <IconChip icon={SlidersHorizontal} tone="brand" className="size-11" />
          <div className="flex flex-col gap-1.5">
            <p className="text-sm font-semibold text-foreground">
              还没有定位规则
            </p>
            <p className="mx-auto max-w-[15rem] text-xs leading-relaxed text-muted-foreground">
              规则是下游 AI 的硬约束——填好后，选题 / 写稿 / 项目 / 评分 / Copilot
              每次生成都照它来。
            </p>
          </div>
          {/* 5 条规则名预览(轻提示要填什么),与规则卡同一套图标语言。 */}
          <ul className="flex flex-wrap items-center justify-center gap-1.5">
            {RULE_HINTS.map((hint) => (
              <li
                key={hint.label}
                className="inline-flex items-center gap-1 rounded-full border border-border bg-surface px-2 py-0.5 text-[11px] text-muted-foreground"
              >
                <hint.icon className="size-3" aria-hidden />
                {hint.label}
              </li>
            ))}
          </ul>
          <PositioningDraftDrawer
            profile={profile}
            triggerLabel="去填定位规则"
            triggerVariant="default"
            triggerSize="sm"
            triggerIcon="pencil"
            title="编辑当前定位"
            description="填写选题 / 写稿 / 项目 / 禁止 / 表达规则,下游 AI 会以它们为硬约束。"
            initialTab="rules"
          />
        </div>
      )}
    </aside>
  );
}

// [T-154] 空态的 5 条规则名预览(与 DownstreamRules 的 rules 同图标语言,静态提示要填什么)。
const RULE_HINTS: ReadonlyArray<{ label: string; icon: LucideIcon }> = [
  { label: "选题规则", icon: Lightbulb },
  { label: "写稿规则", icon: PenLine },
  { label: "项目规则", icon: FolderKanban },
  { label: "禁止事项", icon: ShieldAlert },
  { label: "表达风格", icon: Mic2 },
];

// 历史版本紧凑表：有完整快照走真实恢复；旧版缺快照只诚实复制陈述。
function HistoryTable({
  history,
  profile,
  currentStatementId,
}: {
  readonly currentStatementId: string | null;
  readonly history: readonly PositioningStatementResource[];
  readonly profile: CreatorProfileResource | null;
}) {
  return (
    <SectionCard
      className="shrink-0"
      title="版本历史"
      description="恢复会切换到所选版本，不新增重复定位。历史版本保留。"
    >
      <ol
        data-testid="positioning-history"
        className="flex flex-col gap-2 py-1"
      >
        {history.map((s) => (
          <li
            key={s.id}
            data-testid="positioning-history-row"
            data-version={s.versionNumber}
            className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border px-3 py-2 text-sm"
          >
            <span className="flex min-w-0 items-center gap-2">
              <span className="shrink-0 text-xs font-medium text-muted-foreground">
                v{s.versionNumber}
              </span>
              <span className="truncate text-foreground">{s.oneLiner}</span>
            </span>
            <span className="flex shrink-0 items-center gap-2">
              {s.id === currentStatementId ? <Badge variant="outline" className="text-[10px]">当前使用</Badge> : null}
              {s.createdByType === "ai" ? (
                <Badge variant="outline" className="text-[10px]">
                  AI 建议
                </Badge>
              ) : null}
              {s.masterSnapshot ? (
                <RestorePositioningMasterButton
                  statementId={s.id}
                  versionNumber={s.versionNumber}
                />
              ) : (
                <>
                  <Badge variant="outline" className="text-[10px] text-muted-foreground">
                    旧版仅保留陈述
                  </Badge>
                  <PositioningDraftDrawer
                    profile={profile}
                    triggerLabel="复制定位陈述"
                    triggerVariant="outline"
                    triggerSize="sm"
                    triggerIcon="none"
                    title={`复制 v${s.versionNumber} 的定位陈述`}
                    description="该记录来自旧版，只保存了一句话、关键词和产品锚；画像与规则无法从历史反推。"
                    initialTab="statement"
                    statementSeed={{
                      oneLiner: s.oneLiner,
                      keywords: s.keywords,
                      productAnchorIds: s.productAnchorIds,
                    }}
                  />
                </>
              )}
            </span>
          </li>
        ))}
      </ol>
    </SectionCard>
  );
}

// Deterministic ISO-8601 → YYYY-MM-DD (C-5: no Date.now; parse the stored string only).
function formatDate(iso: string): string {
  return iso.slice(0, 10);
}

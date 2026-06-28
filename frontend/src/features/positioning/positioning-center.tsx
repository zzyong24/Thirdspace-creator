/**
 * 定位中心 page (七步①② · SPEC §3.4) — the account-level positioning surface and
 * the upstream constraint source for downstream 选题/评分/变现.
 *
 * Server-component shell with a `viewModel?` test seam (mirrors knowledge/settings).
 * The default render reads `client.getPositioningCenter()` (pages.positioning.get →
 * real SQL via the composite transport). Empty-state (brand-new user, no profile)
 * renders a 「创建定位」 CTA (the draft drawer) instead of the version timeline.
 *
 * Layout (Stitch redesign-v1, Phase B): 页头 + 新建定位版本 → 英雄区 当前定位母版
 * (一句话放大 + facet 网格) → AI 赋能带 (✨ AI 生成定位建议) → 下游影响 (可折叠,真 facet)
 * → 历史版本紧凑表 (查看 / 复制为草稿). The mutating controls live in the client
 * islands `positioning-interactive-region.tsx` (drawer = upsertProfile +
 * createStatement) and `generate-positioning-island.tsx` (positioning.generate
 * AI task → 采纳 = confirmTask). Built from real shadcn tokens — NOT Stitch HTML.
 *
 * Determinism (C-5): no Date.now / Math.random / fetch in the render or selectors;
 * the timeline order comes from the version-desc `history` the server composed.
 * `/positioning` is annotated "暂不纳入视觉门禁" until stage-12 re-baseline (R2-9).
 */

import * as React from "react";

import { SectionCard } from "@/components/project/section-card";
import { Badge } from "@/components/ui/badge";
import { client as defaultClient } from "@/lib/contract-client.server";
import type {
  CreatorProfileResource,
  PositioningCenterResource,
  PositioningStatementResource,
} from "@/server/modules/positioning";

import { GeneratePositioningIsland } from "./generate-positioning-island";
import { PositioningDraftDrawer } from "./positioning-interactive-region";

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

// Pure render — split out so tests can drive it synchronously with a fixed VM.
export function PositioningCenterView({
  viewModel,
}: {
  readonly viewModel: PositioningCenterViewModel;
}) {
  const { profile, currentStatement, keywords, productAnchors, history } =
    viewModel;
  const isEmpty = profile === null;

  return (
    <div
      data-slot="positioning-center"
      data-testid="positioning-center"
      className="flex flex-col gap-section-gap"
    >
      <PageHeader profile={profile} isEmpty={isEmpty} />

      {isEmpty ? (
        <SectionCard title="账号定位">
          <div
            data-testid="positioning-empty-state"
            className="flex flex-col items-start gap-3 py-4"
          >
            <p className="text-sm text-muted-foreground">
              还没有账号定位。先创建你的账号画像与第一条定位陈述，下游的选题、评分与变现都会以它为约束源。
            </p>
            <PositioningDraftDrawer
              profile={null}
              triggerLabel="创建定位"
              triggerIcon="plus"
              title="创建定位"
              description="填写账号画像与第一条定位陈述。"
            />
          </div>
        </SectionCard>
      ) : (
        <>
          <HeroMaster
            profile={profile}
            currentStatement={currentStatement}
            keywords={keywords}
            productAnchors={productAnchors}
          />

          <div data-testid="positioning-ai-band">
            <GeneratePositioningIsland />
          </div>

          <DownstreamImpact
            profile={profile}
            currentStatement={currentStatement}
          />

          <HistoryTable history={history} profile={profile} />
        </>
      )}
    </div>
  );
}

// 页头：标题 + 副标题 + 右侧主按钮「+ 新建定位版本」(打开草稿抽屉).
function PageHeader({
  profile,
  isEmpty,
}: {
  readonly profile: CreatorProfileResource | null;
  readonly isEmpty: boolean;
}) {
  return (
    <header className="flex flex-wrap items-start justify-between gap-3">
      <div className="flex min-w-0 flex-col gap-0.5">
        <h1 className="text-xl font-semibold text-foreground">定位中心</h1>
        <p className="text-sm text-muted-foreground">
          账号的定位母版——下游的选题、评分、素材匹配与变现都以它为约束源。
        </p>
      </div>
      {isEmpty ? null : (
        <PositioningDraftDrawer
          profile={profile}
          triggerLabel="新建定位版本"
          triggerIcon="plus"
          title="新建定位版本"
          description="更新账号画像，或追加一条新的不可变定位陈述。"
        />
      )}
    </header>
  );
}

// 英雄区 当前定位母版：当前使用 pill + 一句话放大 + facet 网格(只读真字段).
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
  // facet 网格 — ONLY real fields; an empty facet is dropped, never invented.
  const facets: ReadonlyArray<readonly [string, string]> = [
    ["我是谁", profile.persona],
    ["领域 / 赛道", profile.field],
    ["目标人群", profile.audience],
    ["差异化视角", profile.differentiation],
    ["能力清单", profile.capabilities.join("、")],
    ["产品锚", productAnchors.join("、")],
  ];
  const shown = facets.filter(([, v]) => v.trim().length > 0);

  return (
    <SectionCard
      title="当前定位母版"
      action={
        currentStatement ? (
          <Badge
            data-testid="positioning-current-pill"
            className="bg-success/15 text-success"
          >
            当前使用 · v{currentStatement.versionNumber}
          </Badge>
        ) : null
      }
    >
      <div className="flex flex-col gap-4 py-1">
        <p
          data-testid="positioning-one-liner"
          className="text-lg font-semibold leading-snug text-foreground"
        >
          {currentStatement?.oneLiner ?? "尚未填写定位陈述"}
        </p>

        {keywords.length > 0 ? (
          <div className="flex flex-wrap gap-1.5">
            {keywords.map((kw) => (
              <Badge key={kw} variant="secondary" className="text-xs">
                {kw}
              </Badge>
            ))}
          </div>
        ) : null}

        {shown.length > 0 ? (
          <dl
            data-testid="positioning-facets"
            className="grid grid-cols-1 gap-3 sm:grid-cols-2"
          >
            {shown.map(([label, value]) => (
              <div
                key={label}
                data-testid="positioning-facet"
                className="flex flex-col gap-0.5 rounded-control border border-border bg-surface px-3 py-2"
              >
                <dt className="text-[11px] text-text-subtle">{label}</dt>
                <dd className="text-sm text-foreground">{value}</dd>
              </div>
            ))}
          </dl>
        ) : null}

        <div className="pt-1">
          <PositioningDraftDrawer
            profile={profile}
            triggerLabel="编辑"
            triggerVariant="outline"
            triggerSize="sm"
            triggerIcon="pencil"
            title="编辑当前定位"
            description="更新账号画像，或追加一条新的不可变定位陈述。"
          />
        </div>
      </div>
    </SectionCard>
  );
}

// 下游影响（可折叠、次级）：诚实展示这套定位如何约束下游——真 facet 注入下游 AI 提示。
function DownstreamImpact({
  profile,
  currentStatement,
}: {
  readonly profile: CreatorProfileResource;
  readonly currentStatement: PositioningStatementResource | null;
}) {
  // The facets actually injected into every downstream runner's prompt
  // (creative-context.ts formatPositioning). Each row shown only if it has a value.
  const injected: ReadonlyArray<readonly [string, string]> = [
    ["定位一句话", currentStatement?.oneLiner ?? ""],
    ["关键词", (currentStatement?.keywords ?? []).join("、")],
    ["人设", profile.persona],
    ["领域", profile.field],
    ["目标人群", profile.audience],
    ["差异化", profile.differentiation],
    ["能力清单", profile.capabilities.join("、")],
  ];
  const shown = injected.filter(([, v]) => v.trim().length > 0);

  return (
    <details
      data-testid="positioning-downstream"
      className="group rounded-card border border-border bg-card"
    >
      <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-card-padding py-3 text-[15px] font-semibold text-foreground">
        这套定位如何约束下游
        <span className="text-xs font-normal text-muted-foreground group-open:hidden">
          展开
        </span>
        <span className="hidden text-xs font-normal text-muted-foreground group-open:inline">
          收起
        </span>
      </summary>
      <div className="flex flex-col gap-3 px-card-padding pb-card-padding text-sm">
        <p className="text-muted-foreground">
          每次 AI 生成（选题、脚本草稿、评分、素材匹配、一稿多平台改写、Copilot
          回答）都会把下面这些字段注入提示，作为账号一致性的约束源。改定位即改下游所有 AI 的行为。
        </p>
        {shown.length > 0 ? (
          <dl
            data-testid="positioning-downstream-fields"
            className="flex flex-col divide-y divide-border rounded-control border border-border"
          >
            {shown.map(([label, value]) => (
              <div key={label} className="flex gap-3 px-3 py-2">
                <dt className="w-20 shrink-0 text-text-subtle">{label}</dt>
                <dd className="text-foreground">{value}</dd>
              </div>
            ))}
          </dl>
        ) : (
          <p className="text-xs text-muted-foreground">
            当前定位还没有可注入的字段。补全账号画像与一句话定位后，下游 AI 就会以它为约束。
          </p>
        )}
      </div>
    </details>
  );
}

// 历史版本紧凑表：版本号 / 一句话 / 时间 / 状态 pill / 操作（查看 · 复制为草稿）.
function HistoryTable({
  history,
  profile,
}: {
  readonly history: readonly PositioningStatementResource[];
  readonly profile: CreatorProfileResource | null;
}) {
  return (
    <SectionCard title="版本历史" description="定位陈述是不可变版本链，最新在前。">
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
              {s.createdByType === "ai" ? (
                <Badge variant="outline" className="text-[10px]">
                  AI 建议
                </Badge>
              ) : null}
              {/* 复制为草稿 = 预填进新建抽屉的 statement 表单 → createStatement (真 op).
                  「设为当前」无对应 op(statements append-only)故不放. */}
              <PositioningDraftDrawer
                profile={profile}
                triggerLabel="复制为草稿"
                triggerVariant="outline"
                triggerSize="sm"
                triggerIcon="none"
                title={`复制 v${s.versionNumber} 为草稿`}
                description="基于该版本预填，编辑后保存为新版本。"
                statementSeed={{
                  oneLiner: s.oneLiner,
                  keywords: s.keywords,
                  productAnchorIds: s.productAnchorIds,
                }}
              />
            </span>
          </li>
        ))}
      </ol>
    </SectionCard>
  );
}

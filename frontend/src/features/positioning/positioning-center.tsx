/**
 * 定位中心 page (七步①② · SPEC §3.4) — the account-level positioning surface and
 * the upstream constraint source for downstream 选题/评分/变现.
 *
 * Server-component shell with a `viewModel?` test seam (mirrors knowledge/settings).
 * The default render reads `client.getPositioningCenter()` (pages.positioning.get →
 * real SQL via the composite transport). Empty-state (brand-new user, no profile)
 * renders a 「创建定位」 CTA instead of the version timeline. The mutating controls
 * (编辑账号画像 / 保存新版本定位) live in the client island
 * `positioning-interactive-region.tsx`, calling the mapped contract op then
 * `router.refresh()`.
 *
 * Determinism (C-5): no Date.now / Math.random / fetch in the render or selectors;
 * the timeline order comes from the version-desc `history` the server composed.
 * `/positioning` is annotated "暂不纳入视觉门禁" until stage-12 re-baseline (R2-9).
 */

import * as React from "react";

import { SectionCard } from "@/components/project/section-card";
import { Badge } from "@/components/ui/badge";
import { client as defaultClient } from "@/lib/contract-client.server";
import type { PositioningCenterResource } from "@/server/modules/positioning";

import {
  PositioningProfileForm,
  PositioningStatementForm,
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
      {isEmpty ? (
        <SectionCard title="账号定位">
          <div
            data-testid="positioning-empty-state"
            className="flex flex-col items-start gap-3 py-4"
          >
            <p className="text-sm text-muted-foreground">
              还没有账号定位。先创建你的账号画像与第一条定位陈述，下游的选题、评分与变现都会以它为约束源。
            </p>
            <PositioningProfileForm
              profile={null}
              ctaLabel="创建定位"
            />
          </div>
        </SectionCard>
      ) : (
        <>
          <SectionCard title="当前定位">
            <div className="flex flex-col gap-3 py-2">
              <p
                data-testid="positioning-one-liner"
                className="text-base font-medium text-foreground"
              >
                {currentStatement?.oneLiner ?? "尚未填写定位陈述"}
              </p>
              <div className="flex flex-wrap gap-1.5">
                {keywords.map((kw) => (
                  <Badge key={kw} variant="secondary" className="text-xs">
                    {kw}
                  </Badge>
                ))}
              </div>
              {productAnchors.length > 0 ? (
                <div
                  data-testid="positioning-product-anchors"
                  className="text-xs text-muted-foreground"
                >
                  产品锚：{productAnchors.join("、")}
                </div>
              ) : null}
            </div>
          </SectionCard>

          <SectionCard title="账号画像">
            <PositioningProfileForm profile={profile} ctaLabel="保存账号画像" />
          </SectionCard>

          <SectionCard title="保存新版本定位">
            <PositioningStatementForm />
          </SectionCard>

          <SectionCard title="历史版本">
            <ol
              data-testid="positioning-history"
              className="flex flex-col gap-2 py-1"
            >
              {history.map((s) => (
                <li
                  key={s.id}
                  data-testid="positioning-history-row"
                  data-version={s.versionNumber}
                  className="flex items-center justify-between rounded-md border border-border px-3 py-2 text-sm"
                >
                  <span className="truncate text-foreground">{s.oneLiner}</span>
                  <span className="flex shrink-0 items-center gap-2">
                    {s.createdByType === "ai" ? (
                      <Badge variant="outline" className="text-[10px]">
                        AI 建议
                      </Badge>
                    ) : null}
                    <span className="text-xs text-muted-foreground">
                      v{s.versionNumber}
                    </span>
                  </span>
                </li>
              ))}
            </ol>
          </SectionCard>
        </>
      )}
    </div>
  );
}

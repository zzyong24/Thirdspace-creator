/**
 * 变现 / 漏斗中心 page (七步⑦ · SPEC §4.7) — the monetization surface answering
 * spec §9 q6「哪条内容带来了哪笔线索/成交？这条内容为哪个产品铺路？」.
 *
 * Server-component shell with a `viewModel?` test seam (mirrors positioning/
 * knowledge). The default render reads `products.list` + `monetization.funnel.get` +
 * `leads.list` (real SQL via the composite transport). The funnel view ALWAYS shows
 * the honest `unattributed` bucket + ratio (§4.5 — 诚实漏损, never force-allocated).
 * The mutating controls (新建产品 / 退役 / 新增 Offer / 登记线索 / Lead 流转 / 链接产品)
 * live in the client island `monetization-center-interactive-region.tsx`, calling the
 * mapped contract op then `router.refresh()`.
 *
 * Determinism (C-5): no Date.now / Math.random / fetch in the render or selectors.
 * `/monetization` is annotated "暂不纳入视觉门禁" until stage-12 re-baseline.
 */

import * as React from "react";

import { SectionCard } from "@/components/project/section-card";
import { Badge } from "@/components/ui/badge";
import { client as defaultClient } from "@/lib/contract-client.server";
import type {
  ProductResource,
  LeadResource,
  MonetizationFunnelResource,
} from "@creatoros/backend/modules/monetization";

/**
 * Structural seam for the server reads. The route passes a session-scoped
 * `createServerClient(ctx)` so the funnel/products/leads stay user-scoped; the
 * default keeps the singleton (canonical ctx) as the SSR/test fallback seam.
 */
export type MonetizationReadClient = Pick<
  typeof defaultClient,
  "listProducts" | "listLeads" | "getFunnel"
>;

import {
  CreateProductForm,
  ProductRow,
  RegisterLeadForm,
  LeadStatusControl,
} from "./monetization-center-interactive-region";

export interface MonetizationCenterViewModel {
  readonly products: ProductResource[];
  readonly leads: LeadResource[];
  readonly funnel: MonetizationFunnelResource;
}

export interface MonetizationCenterPageProps {
  /** Override hook for tests; defaults to the server reads. */
  readonly viewModel?: MonetizationCenterViewModel;
  /**
   * Session-scoped contract client for the production read path. The route
   * passes `createServerClient(session.ctx)`; defaults to the singleton seam so
   * SSR / direct render still resolves.
   */
  readonly client?: MonetizationReadClient;
}

export async function MonetizationCenterPage({
  viewModel,
  client = defaultClient,
}: MonetizationCenterPageProps) {
  const vm = viewModel ?? (await loadViewModel(client));
  return <MonetizationCenterView viewModel={vm} />;
}

async function loadViewModel(
  client: MonetizationReadClient,
): Promise<MonetizationCenterViewModel> {
  const products = (await client.listProducts({
    params: undefined,
    query: { page: 1, pageSize: 100 },
    body: undefined,
  })) as unknown as ProductResource[];
  const leads = (await client.listLeads({
    params: undefined,
    query: { page: 1, pageSize: 100 },
    body: undefined,
  })) as unknown as LeadResource[];
  const funnel = (await client.getFunnel({
    params: undefined,
    query: {},
    body: undefined,
  })) as unknown as MonetizationFunnelResource;
  return { products, leads, funnel };
}

const STAGE_LABELS: Record<string, string> = {
  profile_visit: "主页访问",
  follow: "关注",
  lead: "线索",
  inquiry: "咨询",
  signup: "报名",
  purchase: "成交",
  repurchase: "复购",
};

// Pure render — split out so tests can drive it synchronously with a fixed VM.
export function MonetizationCenterView({
  viewModel,
}: {
  readonly viewModel: MonetizationCenterViewModel;
}) {
  const { products, leads, funnel } = viewModel;
  const unattributedPct = Math.round(funnel.unattributedRatio * 100);

  return (
    <div
      data-slot="monetization-center"
      data-testid="monetization-center"
      className="flex flex-col gap-section-gap"
    >
      <SectionCard title="转化漏斗">
        <div className="flex flex-col gap-3 py-2">
          <ol
            data-testid="monetization-funnel"
            className="flex flex-col gap-1.5"
          >
            {funnel.stages.map((s) => (
              <li
                key={s.stage}
                data-testid="funnel-stage"
                data-stage={s.stage}
                className="flex items-center justify-between rounded-md border border-border px-3 py-1.5 text-sm"
              >
                <span className="text-foreground">
                  {STAGE_LABELS[s.stage] ?? s.stage}
                </span>
                <span className="text-xs text-muted-foreground">{s.count}</span>
              </li>
            ))}
          </ol>
          {/* 诚实漏损 — the unattributed bucket is ALWAYS shown (§4.5). */}
          <div
            data-testid="funnel-unattributed"
            className="flex items-center justify-between rounded-md border border-dashed border-border bg-muted/40 px-3 py-2 text-sm"
          >
            <span className="text-muted-foreground">
              未归因（诚实漏损）· 线索 {funnel.unattributed.leadCount} · 成交{" "}
              {funnel.unattributed.conversionCount}
            </span>
            <Badge
              variant="outline"
              data-testid="funnel-unattributed-ratio"
              className="text-[10px]"
            >
              占比 {unattributedPct}%
            </Badge>
          </div>
          <div className="flex gap-4 text-xs text-muted-foreground">
            <span data-testid="funnel-revenue-attributed">
              已归因营收 ¥{funnel.revenueAttributed}
            </span>
            <span data-testid="funnel-revenue-unattributed">
              未归因营收 ¥{funnel.unattributed.revenue}
            </span>
          </div>
        </div>
      </SectionCard>

      <SectionCard title="产品">
        <div className="flex flex-col gap-3 py-2">
          <CreateProductForm />
          <ul data-testid="product-list" className="flex flex-col gap-2">
            {products.length === 0 ? (
              <li
                data-testid="product-empty-state"
                className="text-sm text-muted-foreground"
              >
                还没有产品。先新建一个产品，再为它定价（Offer）。
              </li>
            ) : (
              products.map((p) => <ProductRow key={p.id} product={p} />)
            )}
          </ul>
        </div>
      </SectionCard>

      <SectionCard title="线索 / 成交">
        <div className="flex flex-col gap-3 py-2">
          <RegisterLeadForm />
          <ul data-testid="lead-list" className="flex flex-col gap-2">
            {leads.length === 0 ? (
              <li
                data-testid="lead-empty-state"
                className="text-sm text-muted-foreground"
              >
                还没有线索。手工登记一条，或等飞书问卷导入。
              </li>
            ) : (
              leads.map((l) => (
                <li
                  key={l.id}
                  data-testid="lead-row"
                  data-source={l.source}
                  className="flex items-center justify-between rounded-md border border-border px-3 py-2 text-sm"
                >
                  <span className="flex items-center gap-2">
                    <Badge variant="secondary" className="text-[10px]">
                      {l.source}
                    </Badge>
                    <span className="text-muted-foreground">
                      {l.attributedContentId
                        ? `归因内容 ${l.attributedContentId}`
                        : "未归因"}
                    </span>
                  </span>
                  <LeadStatusControl lead={l} />
                </li>
              ))
            )}
          </ul>
        </div>
      </SectionCard>
    </div>
  );
}

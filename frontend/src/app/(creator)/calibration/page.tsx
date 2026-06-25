/**
 * 校准闭环 route entrypoint (七步⑤⑥ · §6.5) — mounts the orphaned 盲预测/校准 surface.
 *
 * The (creator) layout supplies the shared AppShell (Sidebar + TopHeader). This page is
 * a Server Component that reads the canonical 变现加权 Rubric (its current immutable
 * RubricVersion) through the server `client` and renders the calibration island controls:
 *  - 盲预测 (BlindPredictForm)        → client.createPrediction (draft)
 *  - 新建评分维度版本 (BumpRubricVersionButton) → client.bumpRubricVersion
 *  - the decorative 据此修正定位 / 采纳 AI 盲预测 affordances (wired in their own modules)
 *
 * Data source: the rubric is seeded via `calibration.rubrics.get`
 * ({ rubricId: "rubric-canonical" } — the persistence-client canonical seed). GAP-CAL-1:
 * the 盲预测 list is now server-read via `calibration.predictions.list` (loadPredictions)
 * and rendered as `PredictionRow[]` (lock / 回流 entry per real id). Empty state (no rubric
 * / no predictions) renders the create affordance / 「暂无盲预测」 and never crashes.
 *
 * Determinism (C-5): no Date.now / Math.random in the render. `/calibration` is a
 * brand-new page — 暂不纳入视觉门禁 until the stage-12 re-baseline (R2-9).
 *
 * Session-scoped read (lane center-pages): the route resolves the request's
 * session and constructs `createServerClient(session.ctx)` so the 盲预测 list is
 * scoped to the logged-in user — a brand-new empty account reads its own (empty)
 * predictions, not the user-zyongzhu seed. The 变现加权 Rubric is the shared
 * canonical rubric (keyed by `rubric-canonical`), so it resolves the same under any
 * ctx. With no session both reads run through the singleton seam so SSR/tests never
 * crash.
 */

import * as React from "react";

import { SectionCard } from "@/components/project/section-card";
import { Badge } from "@/components/ui/badge";
import {
  client as defaultClient,
  createServerClient,
} from "@/lib/contract-client.server";
import { resolveSession } from "@/lib/session.server";
import type {
  RubricResource,
  PredictionResource,
} from "@/server/modules/calibration";

import {
  BlindPredictForm,
  PredictionRow,
  BumpRubricVersionButton,
  ReviseFromCalibrationButton,
  AdoptAiPredictionButton,
} from "@/features/calibration/calibration-interactive-region";
import { loadPredictions } from "@/features/calibration/calibration-data";

// The canonical 变现加权 rubric seeded by the persistence-client composition root
// (五维: hook 强度 / 利他性 / 人群匹配 / CTA 清晰度 / 为产品铺路程度).
const CANONICAL_RUBRIC_ID = "rubric-canonical";

type RubricReadClient = Pick<typeof defaultClient, "getRubric">;

async function loadRubric(
  client: RubricReadClient,
): Promise<RubricResource | null> {
  try {
    return (await client.getRubric({
      params: { rubricId: CANONICAL_RUBRIC_ID },
      query: undefined,
      body: undefined,
    })) as unknown as RubricResource;
  } catch {
    // No rubric seeded yet → render the create affordance, never crash.
    return null;
  }
}

export default async function CalibrationRoutePage() {
  const session = await resolveSession();
  // Session-scoped client on the production path; singleton seam (canonical ctx)
  // when there is no session so SSR/tests keep resolving against the fixture seed.
  const client = session ? createServerClient(session.ctx) : defaultClient;

  const [rubric, predictions] = await Promise.all([
    loadRubric(client),
    loadPredictions(client),
  ]);
  return <CalibrationView rubric={rubric} predictions={predictions} />;
}

// Pure render — split out so tests can drive it synchronously with a fixed rubric.
export function CalibrationView({
  rubric,
  predictions = [],
}: {
  readonly rubric: RubricResource | null;
  readonly predictions?: readonly PredictionResource[];
}) {
  return (
    <main
      data-app="creatoros"
      data-page="calibration"
      data-testid="calibration"
      className="flex flex-col gap-section-gap"
    >
      <header className="flex flex-col gap-0.5">
        <h1 className="font-heading text-xl font-semibold text-foreground">
          校准闭环
        </h1>
        <p className="text-sm text-muted-foreground">
          发布前盲预测，回流后用真实数据校准评分维度（七步⑤⑥）。
        </p>
      </header>

      {rubric ? (
        <>
          <SectionCard
            title="盲预测"
            description="发布前对内容打分，锁定后不可改"
          >
            <div className="flex flex-col gap-3 py-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="flex items-center gap-2 text-sm text-foreground">
                  <span className="font-medium">{rubric.name}</span>
                  <Badge variant="secondary" className="text-[10px]">
                    v{rubric.currentVersion.versionNumber}
                  </Badge>
                </span>
                <BumpRubricVersionButton rubricId={rubric.id} />
              </div>
              <BlindPredictForm
                rubricVersionId={rubric.currentVersion.id}
                dimensions={rubric.currentVersion.dimensions}
              />
            </div>
          </SectionCard>

          <SectionCard
            title="已锁预测"
            description="发布前盲预测列表，锁定后回流真实数据校准"
          >
            {predictions.length > 0 ? (
              <ul
                data-testid="prediction-list"
                className="flex flex-col gap-2 py-2"
              >
                {predictions.map((prediction) => (
                  <PredictionRow key={prediction.id} prediction={prediction} />
                ))}
              </ul>
            ) : (
              <p
                data-testid="prediction-list-empty"
                className="py-2 text-sm text-muted-foreground"
              >
                暂无盲预测。在上方填内容 id 并打分，提交后即在此回显（含变现加权评分）。
              </p>
            )}
          </SectionCard>

          <SectionCard
            title="评分维度"
            description="当前 RubricVersion 的权重与 0/3/5 锚点"
          >
            <ul
              data-testid="rubric-dimensions"
              className="flex flex-col gap-2 py-2"
            >
              {rubric.currentVersion.dimensions.map((dim) => (
                <li key={dim.key} className="flex flex-col gap-0.5">
                  <span className="flex items-center gap-2">
                    <Badge variant="outline" className="text-[10px]">
                      {dim.label} · {Math.round(dim.weight * 100)}%
                    </Badge>
                  </span>
                  {dim.description ? (
                    <span className="text-[11px] leading-snug text-muted-foreground">
                      {dim.description}
                    </span>
                  ) : null}
                </li>
              ))}
            </ul>
          </SectionCard>

          {/* 飞轮关口 — decorative this wave (wired in positioning/candidate + AI 模块). */}
          <SectionCard title="校准飞轮" description="把校准结果回灌到定位与选题">
            <div className="flex flex-wrap items-center gap-2 py-2">
              <ReviseFromCalibrationButton />
              <AdoptAiPredictionButton />
            </div>
          </SectionCard>
        </>
      ) : (
        <SectionCard title="盲预测" description="还没有评分维度（Rubric）">
          <p
            data-testid="calibration-empty-state"
            className="py-2 text-sm text-muted-foreground"
          >
            还没有评分维度。先创建一个 Rubric，即可开始发布前盲预测。
          </p>
        </SectionCard>
      )}
    </main>
  );
}

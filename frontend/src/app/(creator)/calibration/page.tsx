/**
 * 校准中心 route entrypoint (七步⑤⑥ · §6.5) — the 发布前盲预测 + 发布后回流校准 workbench
 * (校准中心大改 · Slice 2). The single-column 盲预测 form is replaced by a full three-column
 * 校准工作台: a KPI band + rubric/目标 tabs on top, 左待校准内容 / 中发布前预测评分表 /
 * 右AI编导诊断 in the middle, and a 发布后回流对照表 + 经验沉淀 at the bottom.
 *
 * Server Component: reads ALL data through the typed contract `client` (no repo access).
 * `loadCalibrationWorkbench` composes the three real reads — `calibration.overview`
 * (KPI / 待校准内容 / 回流对照 / 经验沉淀), `calibration.predictions.list` (评分表 + 诊断
 * jsonb), `calibration.rubrics.get` (维度 labels/weights) — and resolves subject titles. The
 * client island (`CalibrationWorkbench`) owns the 选中态 + every needs-backend control
 * (开始预测 → ai.tasks.create calibration.diagnose; 锁定预测 → predictions.lock).
 *
 * Session-scoped read: the route resolves the request's session and constructs
 * `createServerClient(session.ctx)` so the workbench is scoped to the logged-in user (a
 * brand-new empty account reads its own empty overview, not the canonical seed). With no
 * session both reads run through the singleton seam so SSR/tests never crash. The 变现加权
 * Rubric is the shared canonical rubric (keyed by `rubric-canonical`).
 *
 * Determinism (C-5): no Date.now / Math.random in render — every visible value comes from the
 * server reads. Empty data is honest: no overview → KPI 显「—」/ 空态, never fabricated.
 */

import * as React from "react";

import {
  client as defaultClient,
  createServerClient,
} from "@/lib/contract-client.server";
import { resolveSession } from "@/lib/session.server";

import { CalibrationWorkbench } from "@/features/calibration/calibration-interactive-region";
import { loadCalibrationWorkbench } from "@/features/calibration/calibration-data";

export default async function CalibrationRoutePage() {
  const session = await resolveSession();
  // Session-scoped client on the production path; the canonical singleton seam when there
  // is no session so SSR/tests keep resolving against the fixture seed.
  const client = session ? createServerClient(session.ctx) : defaultClient;

  const data = await loadCalibrationWorkbench(client);

  return (
    // 固定高度填满：页头 shrink-0 钉住,工作台 flex-1 占满剩余高度并自管内部滚动。
    <main
      data-app="creatoros"
      data-page="calibration"
      data-testid="calibration"
      className="flex h-full min-h-0 flex-col gap-4"
    >
      <header className="flex shrink-0 flex-col gap-0.5">
        <h1 className="font-heading text-xl font-semibold text-foreground">
          校准中心
        </h1>
        <p className="text-sm text-muted-foreground">
          发布前用变现加权评分盲预测，发布后回流真实数据校准 —— 把每条内容的判断变成可迭代的经验。
        </p>
      </header>

      <div className="flex min-h-0 flex-1 flex-col">
        <CalibrationWorkbench
          overview={data.overview}
          predictions={data.predictions}
          rubric={data.rubric}
          subjectTitles={data.subjectTitles}
        />
      </div>
    </main>
  );
}

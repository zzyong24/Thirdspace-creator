/**
 * 校准中心 route entrypoint (七步⑤⑥ · §6.5) — 发布前盲预测 + 发布后回流校准。
 * T-067 布局重做:围绕单一主线「预测一个视频 → 定时任务拉数据回收 → 对照预测准不准」
 * 纵向重排 —— 顶部 3 张真值指标卡,上段「进行中的预测」(每条预测的主线状态机),
 * 中段「发布后回流对照」,右侧栏「发起新预测」补充入口(主入口在稿面发布包区)。
 * 经验沉淀 / AI 编导诊断常驻栏按用户裁决删除(经验归经验模块;诊断是产预测的过程)。
 *
 * Server Component: reads ALL data through the typed contract `client` (no repo access).
 * `loadCalibrationWorkbench` composes the three real reads — `calibration.overview`
 * (KPI / 待校准内容 / 回流对照), `calibration.predictions.list` (评分表 jsonb),
 * `calibration.rubrics.get` (维度 labels/weights) — and resolves subject titles. The
 * client island (`CalibrationWorkbench`) owns every needs-backend control
 * (开始预测 → ai.tasks.create calibration.diagnose; 锁定预测 → predictions.lock;
 * 录入真实表现 → results.create; 拉取抖音真实表现 → ingestion.douyin.refresh).
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

import { z } from "zod";
import { defineEndpoint } from "../endpoints";
import { id, iso8601 } from "../primitives";
import {
  ingestionRunResource,
  douyinThrottleStatusResource,
} from "../resources/ingestion";

const runParams = z.object({ runId: id });

// SPEC §13 "数据采集 (ingestion)" group. Batch-push endpoints accept opaque
// record arrays; the contract validates the run envelope shape only.
export const ingestionOperations = {
  createRun: defineEndpoint({
    id: "ingestion.runs.create",
    method: "POST",
    path: "/ingestion/runs",
    body: z.object({
      externalSourceId: id,
      runType: z.string().min(1),
      idempotencyKey: z.string().min(1),
    }),
    response: ingestionRunResource,
    fr: ["FR-INGESTION-CREATE"],
  }),
  // 抖音真实指标刷新(线 B):一步完成 抓取(复用扫码登录态)→createRun→ingestMetrics→completeRun。
  // 服务端自起持久化 Chromium(.auth/),headless 复用 cookie 抓创作者中心(见 ingestion/douyin-cdp.ts)。
  refreshDouyin: defineEndpoint({
    id: "ingestion.douyin.refresh",
    method: "POST",
    path: "/ingestion/douyin/refresh",
    body: z.object({
      externalSourceId: id,
      capturedAt: iso8601.optional(),
    }),
    response: ingestionRunResource,
    fr: ["FR-INGESTION-DOUYIN"],
  }),
  // 抖音扫码登录(线 B):服务端弹 Chromium 窗口让用户扫码,落 .auth/ 持久化登录态,供 refresh 复用。
  loginDouyin: defineEndpoint({
    id: "ingestion.douyin.login",
    method: "POST",
    path: "/ingestion/douyin/login",
    body: z.object({}).optional(),
    response: z.object({ loggedIn: z.boolean() }),
    fr: ["FR-INGESTION-DOUYIN"],
  }),
  // 抖音登录态被动探针(T-032a):headless 快查 .auth/ 里 sessionid cookie,不弹窗。
  // 设置页「账号绑定」卡据此显「已连接/未连接」徽标;loggedIn=false 亦覆盖「登录态已过期」场景
  // (.auth/ 目录存在≠有效登录 —— cookie 失效即 false,引导重新扫码)。
  statusDouyin: defineEndpoint({
    id: "ingestion.douyin.status",
    method: "GET",
    path: "/ingestion/douyin/status",
    response: z.object({ loggedIn: z.boolean() }),
    fr: ["FR-INGESTION-DOUYIN"],
  }),
  // 抖音采集限流可观测(T-038c / SPEC §4.5 [gate-F4]):只读快照两个 channel 的当前退避态,
  // 让任务中心在 cooldown 时诚实显「⏳ 限流保护中,下次约 N 分钟(已退避 K 次)」而非装死。
  // 读 DouyinRequestGateway.getChannelStatus 的内存镜像(重启由 douyin_throttle_state 恢复);
  // 不落新表、纯实时。未配 gateway(测试/退化)返空 channels 数组(前端诚实不显限流)。
  throttleStatusDouyin: defineEndpoint({
    id: "ingestion.douyin.throttleStatus",
    method: "GET",
    path: "/ingestion/douyin/throttle-status",
    response: douyinThrottleStatusResource,
    fr: ["FR-INGESTION-DOUYIN"],
  }),
  pushMetrics: defineEndpoint({
    id: "ingestion.runs.metrics",
    method: "POST",
    path: "/ingestion/runs/:runId/metrics",
    params: runParams,
    body: z.object({ records: z.array(z.record(z.string(), z.unknown())) }),
    response: ingestionRunResource,
    fr: ["FR-INGESTION-METRICS"],
  }),
  pushKnowledge: defineEndpoint({
    id: "ingestion.runs.knowledge",
    method: "POST",
    path: "/ingestion/runs/:runId/knowledge",
    params: runParams,
    body: z.object({ records: z.array(z.record(z.string(), z.unknown())) }),
    response: ingestionRunResource,
    fr: ["FR-INGESTION-KNOWLEDGE"],
  }),
  pushAssets: defineEndpoint({
    id: "ingestion.runs.assets",
    method: "POST",
    path: "/ingestion/runs/:runId/assets",
    params: runParams,
    body: z.object({ records: z.array(z.record(z.string(), z.unknown())) }),
    response: ingestionRunResource,
    fr: ["FR-INGESTION-ASSETS"],
  }),
  pushArtifacts: defineEndpoint({
    id: "ingestion.runs.artifacts",
    method: "POST",
    path: "/ingestion/runs/:runId/artifacts",
    params: runParams,
    body: z.object({ records: z.array(z.record(z.string(), z.unknown())) }),
    response: ingestionRunResource,
    fr: ["FR-INGESTION-ARTIFACTS"],
  }),
  completeRun: defineEndpoint({
    id: "ingestion.runs.complete",
    method: "POST",
    path: "/ingestion/runs/:runId/complete",
    params: runParams,
    body: z.object({ status: z.string().optional() }),
    response: ingestionRunResource,
    fr: ["FR-INGESTION-COMPLETE"],
  }),
  getRun: defineEndpoint({
    id: "ingestion.runs.get",
    method: "GET",
    path: "/ingestion/runs/:runId",
    params: runParams,
    response: ingestionRunResource,
    fr: ["FR-INGESTION-GET"],
  }),
} as const;

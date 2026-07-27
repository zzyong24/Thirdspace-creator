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
      // [T-136 §D 切片 c] additive 带号 —— 采集绑到「哪个号」:登录态分目录
      // `.auth/douyin/<accountId>` + 采集结果 stamp account_id。缺省(旧调用不传)退化
      // 当前单号/未选号行为(authDir 回退 `_default`,stamp 取 ctx.accountId ?? null)。
      accountId: id.optional(),
    }),
    response: ingestionRunResource,
    fr: ["FR-INGESTION-DOUYIN"],
  }),
  // 抖音扫码登录(线 B):服务端弹 Chromium 窗口让用户扫码,落 .auth/ 持久化登录态,供 refresh 复用。
  loginDouyin: defineEndpoint({
    id: "ingestion.douyin.login",
    method: "POST",
    path: "/ingestion/douyin/login",
    // [T-136 §D 切片 c] additive 带号 —— 扫码建/复用该号独立源 + 登录态落 `.auth/douyin/<accountId>`。
    // body 整体仍 optional(旧空调用不破);不传 accountId 退化单号(authDir `_default`,源用 userId)。
    // [T-330] additive forceNew —— 「扫码绑定新抖音号」置 true:登录走全新 staging 临时目录
    // (空 profile 必出二维码,绝不命中当前号/_default 的旧 sessionid 直接短路),扫码成功后
    // 同步读回身份 → 按 sec_uid upsert 账号 → staging 搬到该号正式目录。不传/false = 现行为
    // (重连当前号复用既有 profile,合理)。
    body: z
      .object({
        accountId: id.optional(),
        forceNew: z.boolean().optional(),
        // [T-546] 内容雷达黑马来源需要的是热点宝 OAuth，不是普通抖音扫码。
        // additive：旧客户端不传时仍走 douyin.com，其他绑定入口行为不变。
        site: z.enum(["douyin.com", "douhot.douyin.com"]).optional(),
      })
      .optional(),
    response: z.object({ loggedIn: z.boolean() }),
    fr: ["FR-INGESTION-DOUYIN"],
  }),
  // 抖音登录态被动探针(T-032a):headless 快查 .auth/ 里 sessionid cookie,不弹窗。
  // 设置页「账号绑定」卡据此显「已连接/未连接」徽标;loggedIn=false 亦覆盖「登录态已过期」场景
  // (.auth/ 目录存在≠有效登录 —— cookie 失效即 false,引导重新扫码)。
  // T-144:additive 加 sourceReady —— 是否已有真实采集源(external_source)。登录态 ≠ 能采集:
  // 缺采集源时设置页显「已扫码,采集源未就绪」而非虚假「可采集」。sourceReady 缺省当 false 兼容旧端。
  statusDouyin: defineEndpoint({
    id: "ingestion.douyin.status",
    method: "GET",
    path: "/ingestion/douyin/status",
    // [T-136 §D 切片 c] additive 带号 query —— status 按号返回:sourceReady 针对该号的源
    // (`.auth/douyin/<accountId>` 登录态 + `extsrc-douyin-<accountId>` 源)。不传退化单号。
    query: z.object({ accountId: id.optional() }),
    response: z.object({
      loggedIn: z.boolean(),
      sourceReady: z.boolean().optional().default(false),
    }),
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
  // [T-248 批C] 四个 batch-push op(ingestion.runs.metrics/knowledge/assets/artifacts)已删 ——
  // 全仓零调用方:真实采集(refreshDouyin 等)在服务端直接走 ingestion service 层
  // (ingestMetrics/ingestKnowledge/…,由 persistence-client 进程内调用),不经契约 dispatch。
  // service 层函数原样保留;此处只收敛契约面。
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

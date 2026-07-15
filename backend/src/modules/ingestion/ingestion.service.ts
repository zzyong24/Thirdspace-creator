import type { RequestContext } from "@creatoros/contract";
import { type Db } from "@creatoros/backend";
import {
  createIngestionRepository,
  type IngestionRepository,
  type IngestionRunRow,
  type IngestionErrorRow,
} from "./ingestion.repository";
import {
  deriveRecordKey,
  parseMetricRecord,
  parseKnowledgeRecord,
  parseAssetRecord,
  parseArtifactRecord,
  type ValidationResult,
  type MetricRecord,
  type DouyinThrottleStatusResource,
} from "./ingestion.schema";

// Ingestion service (foundation §5.3) — RequestContext-taking methods that thread
// `ctx.userId` into a per-request user-scoped repository and fan out to OTHER
// modules' public Services ONLY (SPEC §17.6/.7 — never their repositories). The
// service owns: the run lifecycle (pending→running→completed/partial/failed,
// defined in the plan, not a SPEC §12 machine), the two §17 idempotency invariants
// (createRun returns the original on a duplicate (source, idempotencyKey); a
// re-pushed record_key is skipped), and partial-success batches (per-record errors
// saved with the original payload, §17.5).
//
// Downstream Services are injected as NARROW ports (IngestionPorts) so the service
// stays unit-testable with fakes and carries no hard module edge — the composition
// layer (persistence-client) adapts each module's real public Service onto these
// ports. Artifact pushes go through `createCandidateVersion` (a CANDIDATE version,
// `createdByType:"ingestion"`) — Ingestion NEVER promotes current_version; the
// downstream adopt/confirm gate does (roadmap §401).
//
// Provenance: every downstream call receives a ctx whose `source` is "ingestion"
// and which carries `ingestionRunId` (SPEC §10), so peers can attribute the write.

export interface IngestionPublishingPort {
  resolvePublication(
    ctx: RequestContext,
    ref: { platform: string; externalId: string },
    // [T-321] 返回也带 contentOutputId —— 日拉去重用它反查属主项目(某项目「登记已发布」
    //   把 aweme_id 落 publications.externalId,contentOutputId 指向该项目的 content_output)。
  ): Promise<{ id: string; contentOutputId?: string | null } | null>;
  // [T-177 增量化] 列出该平台库里已知作品的 externalId(=aweme_id)集,供 refreshDouyin 传给
  //   fetch 做翻页 early-stop(某页作品全已知 → 停翻页)。可选 —— 未注入时 refreshDouyin 不传
  //   knownAwemeIds,fetch 退化为原全量滚动(向后兼容旧最小组合/旧 fake,零回归)。
  listPublishedExternalIds?(
    ctx: RequestContext,
    platform: string,
  ): Promise<string[]>;
  // 数据底座(SPEC §1.3):为一条真实已发布作品落 publication(直接 published +
  // external_id=aweme_id)。幂等于 (platform, externalId)。可选(未注入时
  // ensureImportedProject 退化为仅建项目,不建 publication —— 旧组合根不破)。
  createImportedPublication?(
    ctx: RequestContext,
    outputId: string,
    input: {
      platform: string;
      externalId: string;
      externalUrl?: string | null;
      publishedAt?: string | null;
    },
  ): Promise<{ id: string }>;
}

// 数据底座(SPEC §1.3):为一条真实已发布作品就地建历史项目 + content_output 的端口
// (composition root 适配到 projectsService.ensureImportedProject)。可选 —— 未注入时
// refreshDouyin 退回旧行为(未知作品 reject),不破坏既有最小组合。
export interface IngestionProjectsPort {
  ensureImportedProject(
    ctx: RequestContext,
    input: {
      title: string;
      // [T-089] 整篇文案全文(title 已收敛为短标题)→ 新建项目时落 brief(创作资产存证)。
      brief?: string;
      platform: string;
      externalId: string;
      shareUrl?: string;
      publishedAt?: string;
    },
  ): Promise<{ projectId: string; outputId: string; created: boolean }>;
  // [T-321] 反查一个 content_output 的属主项目 id(判「该作品已绑定到某项目」)。可选 ——
  //   未注入时 ensureImportedProject 退回原「先 create imported 后 resolve」路径(旧组合根不破)。
  getProjectIdByOutput?(
    ctx: RequestContext,
    outputId: string,
  ): Promise<string | null>;
  // [T-321] 命中已绑定属主项目 → 合并日拉真实发布数据(不新建重复项目 + 不覆盖用户手写内容 +
  //   跃迁 stage 显已发布)。可选 —— 与 getProjectIdByOutput 成对注入才启用 merge 去重路径。
  mergePublishedWork?(
    ctx: RequestContext,
    projectId: string,
    input: {
      title?: string;
      brief?: string;
      platform: string;
      externalId: string;
      shareUrl?: string;
      publishedAt?: string;
    },
  ): Promise<unknown>;
}

export interface IngestionAnalyticsPort {
  appendSnapshot(
    ctx: RequestContext,
    input: {
      publicationId: string;
      ingestionRunId?: string | null;
      capturedAt: string;
      source: string;
      rawMetrics?: Record<string, unknown>;
    },
  ): Promise<{ created: boolean }>;
}

export interface IngestionKnowledgePort {
  ingest(
    ctx: RequestContext,
    input: { title: string; content: string; knowledgeType: string },
  ): Promise<{ id: string }>;
}

export interface IngestionAssetsPort {
  registerExternalAsset(
    ctx: RequestContext,
    input: { name: string; assetType: string; storageKey: string },
  ): Promise<{ id: string }>;
}

export interface IngestionArtifactsPort {
  createCandidateVersion(
    ctx: RequestContext,
    input: {
      artifactId: string;
      contentText: string;
      contentData: Record<string, unknown>;
      changeSummary: string;
      createdByType: string;
    },
  ): Promise<{ id: string }>;
}

export interface IngestionPorts {
  publishing: IngestionPublishingPort;
  analytics: IngestionAnalyticsPort;
  knowledge: IngestionKnowledgePort;
  assets: IngestionAssetsPort;
  artifacts: IngestionArtifactsPort;
  // 数据底座(SPEC §1.3):导入历史项目端口。可选 —— 未注入时 refreshDouyin 退回旧
  // 行为(未知作品 reject)。composition root 注入 projectsService.ensureImportedProject。
  projects?: IngestionProjectsPort;
}

// T-144 —— 扫码绑定时"确保有一个平台账号"的端口(composition root 适配到 platformAccount
// Service)。可选:未注入时 loginDouyin 仅 ensure external_source(退化,不破旧组合根)。
// 让「设置徽标 / 切换器 / 日历」三处账号状态同源(都基于真实 platform_account + external_source)。
// 幂等:同 (userId, platform, handle) 复用既有账号(handle 拿不到时用占位「我的抖音」)。
// 边界:T-136 §D 会把 account 维度下推到采集/登录态目录;此端口是其单账号退化,兼容扩展。
export interface IngestionPlatformAccountPort {
  // [T-330] additive externalAccountId(sec_uid)—— forceNew 链身份先行:ensureAccount 拿到
  //   真实身份再建/复用账号(实现侧 ensureDouyinAccountUpsert 优先按 sec_uid 幂等命中既有行 =
  //   「同号重扫自动更新,不重复」)。旧调用不传 → 占位 handle 语义不变。
  ensureAccount(
    ctx: RequestContext,
    input: { platform: string; handle: string; externalAccountId?: string | null },
  ): Promise<{ id: string }>;
  // [T-136 §D] 用采集到的真实身份把当前号的占位 handle(「我的抖音」)更新为真实昵称
  //   (幂等:handle 已是真实值 / 传入空 → no-op)。可选 —— 未实现时 refreshDouyin 跳过账号
  //   handle 回填(仅回填 external_source),不破旧组合根。仅当 identity 抓到才调。
  // [T-201b] 顺带把稳定身份锚 externalAccountId(sec_uid)一并透传:实现侧仅当该号身份键为空时
  //   一次性回填(永不覆盖已有 id)。handle 只更显示名,绝不参与身份匹配。
  // [T-214] 顺带把采集到的总粉丝数 followerCount 透传:实现侧仅当 >0 才回填 followerBaseline
  //   (0/null 不覆盖已有值,诚实降级)。范式同 externalAccountId(additive,不破旧调用)。
  updateAccountHandle?(
    ctx: RequestContext,
    input: {
      platform: string;
      handle: string;
      externalAccountId?: string | null;
      followerCount?: number | null;
    },
  ): Promise<void>;
}

// [T-136 §D] 登录用户自己的抖音身份(scraper 从作品列表 XHR 反解 —— 见 douyin-cdp
// parseSelfIdentity)。service 用真实 nickname 替占位「我的抖音」、存 sourceIdentifier(抖音号)。
// 抓不到 → null(诚实降级,保留占位不覆盖)。字段与 douyin-cdp DouyinSelfIdentity 同形(此处独立
// 声明,避免 backend→frontend 反向依赖;composition root 结构化透传)。
export interface DouyinSelfIdentity {
  nickname: string;
  secUid: string;
  douyinId: string;
  // [T-214] 账号总粉丝数(author 反解;缺→null)。service 仅当 >0 才回填 account.followerBaseline
  //   —— 治编导 agent「粉丝数 0」(baseline 从没采集,恒 0)。0/null 不覆盖已有值(诚实降级)。
  followerCount: number | null;
}

// fetch 的返回:向后兼容联合 —— 旧 fake / 旧装配返 `MetricRecord[]`;[T-136 §D] 新装配返
// `{ records, identity }`(identity 为登录用户自己的身份,抓不到 null)。service 用 normalizeFetch
// 归一,故两种形状都吃,旧测试零回归。
export type DouyinFetchResult =
  | MetricRecord[]
  | { records: MetricRecord[]; identity: DouyinSelfIdentity | null };

// 抖音抓取端口 —— composition root 注入 fetchDouyinMetrics(自起持久 context 复用扫码登录态);
// 测试注 fake。`login` 弹窗扫码(headed);`fetch` headless 复刷,未登录抛 DouyinNotLoggedInError。
// [T-136 §D 切片 c] 三方法均 additive 加 `accountId?`(service 从 ctx.accountId 透传)——
// composition root 据此把号拼进登录态目录 `.auth/douyin/<accountId>`(null → `_default` 回退),
// 让每号独立扫码 / 独立 sessionid / 独立采集,互不顶号。旧调用不传 → 单号回退,不破。
export interface DouyinFetchPort {
  fetch(opts: {
    capturedAt: string;
    accountId?: string | null;
    // [T-177 增量化] 库里已知作品 awemeId 集(refreshDouyin 从 publications 反查后透传)。抓取层
    //   据此在倒序作品列表翻页里 early-stop。省略 → fetchDouyinMetrics 退化为原全量滚动。
    knownAwemeIds?: Set<string>;
  }): Promise<DouyinFetchResult>;
  login(opts?: { accountId?: string | null }): Promise<boolean>;
  // 被动探针(T-032a):headless 快查登录态,不弹窗。设置页「账号绑定」徽标读它。
  status(opts?: { accountId?: string | null }): Promise<boolean>;
  // [T-330] 「绑定新号」staging 四步端口(全部可选,additive;组合根未升级装配时 forceNew
  //   诚实报错,不假装支持)。stagingKey 是组合根发的**不透明句柄**(service 不碰文件路径):
  //   - loginNew:在全新 staging 临时目录弹扫码 —— 空 profile 必出二维码,绝不因目录里
  //     已有旧号 sessionid 而被 isLoggedIn 短路(T-330 「扫码绑新号直接登进旧号」的根因)。
  //   - fetchIdentity:staging 登录态下**同步**读回登录用户身份(轻量:作品列表首屏反解);
  //     读不到 → null(调用方诚实失败,绝不猜身份)。
  //   - adoptStaging:身份确认后把 staging 登录态搬到该号正式目录 `.auth/douyin/<accountId>`
  //     (同号重扫 = 旧登录态被替换,即登录态更新)。
  //   - discardStaging:任何失败路径清理 staging(诚实:绝不把无主登录态默默挂 _default/旧号)。
  loginNew?(): Promise<{ loggedIn: boolean; stagingKey: string }>;
  fetchIdentity?(opts: { stagingKey: string }): Promise<DouyinSelfIdentity | null>;
  adoptStaging?(opts: { stagingKey: string; accountId: string }): Promise<void>;
  discardStaging?(opts: { stagingKey: string }): Promise<void>;
}

// [T-136 §D] 归一 fetch 返回:旧数组形状 → { records, identity: null };新对象形状原样返回。
function normalizeFetch(result: DouyinFetchResult): {
  records: MetricRecord[];
  identity: DouyinSelfIdentity | null;
} {
  if (Array.isArray(result)) return { records: result, identity: null };
  return { records: result.records, identity: result.identity };
}

// T-038c 采集限流可观测端口 —— composition root 绑到 DouyinRequestGateway 单例的
// getChannelStatus(读内存镜像,同步、无副作用)。测试注 fake。**与 DouyinFetchPort
// 分离**:抓取(Chromium)与限流态(gateway 内存)语义正交,不揉一个端口。返回两个
// channel 的当前退避快照;未注入时 service 返空 channels(前端诚实不显限流)。
export interface DouyinThrottleStatusPort {
  read(): DouyinThrottleStatusResource;
}

export interface ServiceDeps {
  now: () => string;
  nextId: (prefix: string) => string;
}

export interface CreateRunInput {
  externalSourceId: string;
  runType: string;
  idempotencyKey: string;
}

export interface PushInput {
  runId: string;
  records: Array<Record<string, unknown>>;
}

export interface IngestionService {
  createRun(ctx: RequestContext, input: CreateRunInput): Promise<IngestionRunRow>;
  ingestMetrics(ctx: RequestContext, input: PushInput): Promise<IngestionRunRow>;
  ingestKnowledge(ctx: RequestContext, input: PushInput): Promise<IngestionRunRow>;
  ingestAssets(ctx: RequestContext, input: PushInput): Promise<IngestionRunRow>;
  ingestArtifacts(ctx: RequestContext, input: PushInput): Promise<IngestionRunRow>;
  completeRun(
    ctx: RequestContext,
    input: { runId: string; status?: string },
  ): Promise<IngestionRunRow>;
  getRun(ctx: RequestContext, runId: string): Promise<IngestionRunRow>;
  listErrors(ctx: RequestContext, runId: string): Promise<IngestionErrorRow[]>;
  // 手动数据源:确保该用户有一个 source='manual' 的 ExternalSource,建并完成一次真 run,
  // 返回 runId。用于"人作为数据源"的录入(如校准手动回流),满足 §C-4 溯源铁律(真 run)。
  ensureManualRun(
    ctx: RequestContext,
    idempotencyKey: string,
  ): Promise<string>;
  // 数据底座(SPEC §1.3):确保一条真实已发布作品就地有历史项目 + content_output +
  //   publication(external_id=aweme_id)。幂等于 (userId, platform, externalId)。经
  //   注入端口调 projects/publishing 的 service(不跨模块直连 repo,守 SPEC §22)。
  //   返回 publicationId(挂 metrics 用);projects 端口未注入时返回 null(调用方据此回退)。
  ensureImportedProject(
    ctx: RequestContext,
    input: {
      title: string;
      // [T-089] 文案全文(可选)→ 新建项目落 brief。
      brief?: string;
      platform: string;
      externalId: string;
      shareUrl?: string;
      publishedAt?: string;
    },
  ): Promise<{ projectId: string; outputId: string; publicationId: string } | null>;
  // 抖音真实指标刷新:校验来源→抓取(复用扫码登录态)→ensureImportedProject×N(未知作品
  // 就地建历史项目,治"24 条被 reject")→createRun→ingestMetrics(此时全命中)→completeRun。
  refreshDouyin(
    ctx: RequestContext,
    input: { externalSourceId: string; capturedAt?: string },
  ): Promise<IngestionRunRow>;
  // T-144 —— 确保本 user 有一条确定 id 的真实抖音采集源(无源建、有源复用),返回源 id。
  // 取代采集器写死的已退役 "src-douyin-canonical" fallback(新库查无 → 0 条的根因)。复用
  // ensureManualRun 的确定性 id + 幂等 seed 范式。source_type=douyin,name 用占位「我的抖音」。
  ensureDouyinSource(ctx: RequestContext): Promise<string>;
  // 抖音扫码登录:弹 Chromium 窗口让用户扫码,落 .auth/ 持久化,返回是否成功(供 refresh 复用)。
  // T-144:扫码成功后同时 ensure external_source + platform_account(端口注入时),让三处账号
  // 状态同源(设置徽标/切换器/日历都读真实绑定);失败不建任何东西(不假装绑定)。
  // [T-330] input.forceNew=true(「扫码绑定新抖音号」)→ staging 隔离扫码 → 同步读回身份 →
  //   按 sec_uid upsert 账号 → staging 搬正式目录;身份读不回 → 清 staging + 抛明确错误
  //   (诚实失败)。不传/false = 现行为(重连当前号复用既有 profile)。
  loginDouyin(
    ctx: RequestContext,
    input?: { forceNew?: boolean },
  ): Promise<{ loggedIn: boolean }>;
  // 抖音登录态被动探针(T-032a):headless 快查 sessionid cookie(不弹窗),返回是否有效登录。
  // 设置页「账号绑定」徽标读它;false 覆盖「未连接」与「登录态已过期」两态(cookie 失效即 false)。
  // T-144:additive 返回 sourceReady —— 是否已有真实采集源。登录态有效但 sourceReady=false 时
  // 设置页显「已扫码,采集源未就绪」而非虚假的「可采集」(登录态 ≠ 能采集,缺 external_source)。
  checkDouyinStatus(
    ctx: RequestContext,
  ): Promise<{ loggedIn: boolean; sourceReady: boolean }>;
  // 抖音采集限流可观测(T-038c / SPEC §4.5 [gate-F4]):读 gateway 两个 channel 的当前退避
  // 快照(cooldown 是否激活、剩多久、连续退避几次),供任务中心 cooldown 时诚实显限流文案。
  // 纯读内存镜像(不落新表);未注入 throttleStatus 端口时返空 channels。
  getDouyinThrottleStatus(
    ctx: RequestContext,
  ): Promise<DouyinThrottleStatusResource>;
}

export function createIngestionService(args: {
  deps: ServiceDeps;
  ports: IngestionPorts;
  db: Db;
  douyinFetch?: DouyinFetchPort;
  throttleStatus?: DouyinThrottleStatusPort;
  // T-144:扫码绑定时 ensure 平台账号的端口(可选;未注入时 loginDouyin 仅建 external_source)。
  platformAccount?: IngestionPlatformAccountPort;
  // [T-189a] 绑定成功回调(可选;组合根注入)——扫码成功 + ensure 源/账号后 fire-and-forget 调它,
  //   由组合根「幂等建三个每天定时采集 job + 初始化跑一次(按 self.metrics→self.detail→comments 序)」。
  //   backend 模块**不 import scheduling**(守 SPEC §22),故经此回调把跨模块编排下推到组合根。
  //   未注入(旧最小组合)→ 回退 Bug-13 内联 refreshDouyin 刷昵称(identity backfill,不破旧行为)。
  onDouyinBound?: (ctx: RequestContext) => void;
}): IngestionService {
  const {
    deps,
    ports,
    db,
    douyinFetch,
    throttleStatus,
    platformAccount,
    onDouyinBound,
  } = args;

  // T-144 → [T-136 §D 切片 c] 抖音采集源的确定性 id,**每号独立源**:
  //   `extsrc-douyin-${accountId ?? userId}`。选了号 → 该号独立源;未选号(存量 / 单号)→
  //   回落 user 级源 `extsrc-douyin-${userId}`(与 T-144 存量源同 id,平滑兼容不丢存量)。
  const douyinSourceId = (ctx: RequestContext): string =>
    `extsrc-douyin-${ctx.accountId ?? ctx.userId}`;
  // 存量兼容:T-144 只建过 `extsrc-douyin-${userId}`(无号)。选号后新 id 是
  //   `extsrc-douyin-${accountId}`,查不到存量源;回落到旧 id 复用,避免存量源被孤立。
  const legacyDouyinSourceId = (ctx: RequestContext): string =>
    `extsrc-douyin-${ctx.userId}`;

  // 无号门 repo(accountId=null)—— 查存量 account_id=null 的旧源用(带号门会 miss)。
  function unscopedRepo(ctx: RequestContext): IngestionRepository {
    return createIngestionRepository(db, {
      now: deps.now,
      nextId: deps.nextId,
      userId: ctx.userId,
      accountId: null,
    });
  }

  // 解析「当前号已就绪的抖音源 id」:先当前号新源,再回落存量旧 user 级源;都无 → null。
  // ensureDouyinSource(建/复用)与 checkDouyinStatus(sourceReady)共用同一查找,避免选号后
  // 存量源被判「未就绪」的假阴性。
  async function findDouyinSourceId(
    ctx: RequestContext,
  ): Promise<string | null> {
    const sourceId = douyinSourceId(ctx);
    const existing = await repoFor(ctx).getExternalSource(sourceId);
    if (existing) return sourceId;
    if (ctx.accountId) {
      const legacyId = legacyDouyinSourceId(ctx);
      if (legacyId !== sourceId) {
        const legacy = await unscopedRepo(ctx).getExternalSource(legacyId);
        if (legacy) return legacyId;
      }
    }
    return null;
  }

  function repoFor(ctx: RequestContext): IngestionRepository {
    return createIngestionRepository(db, {
      now: deps.now,
      nextId: deps.nextId,
      userId: ctx.userId,
      // [T-136 §D 切片 c] 按号第二维度下推(null = 未选号 / 存量兜底 → repo 门退化)。
      accountId: ctx.accountId ?? null,
    });
  }

  // The provenance ctx every downstream Service call receives: source="ingestion"
  // + the originating run id (SPEC §10). userId is preserved (the same User owns
  // the fan-out writes — external Skills do NOT bypass user scope, SPEC §17).
  function downstreamCtx(ctx: RequestContext, runId: string): RequestContext {
    return {
      userId: ctx.userId,
      requestId: ctx.requestId,
      source: "ingestion",
      // [T-136 §D 切片 c] 关键:透传当前号 —— metrics/knowledge/assets/artifacts fan-out
      // 到 analytics/publishing/candidate 等下游时,它们的 repo 门据 ctx.accountId stamp
      // account_id。漏传 = 采集数据 stamp null(无号归属),切号看不到该号真实指标(串味)。
      accountId: ctx.accountId ?? null,
      ingestionRunId: runId,
    };
  }

  // [T-136 §D] 把采集到的登录用户真实身份回填到当前号(替占位「我的抖音」)。**仅当抓到真实值
  //   才覆盖**(identity 为 null 或 nickname 空 → 保持占位不清空);幂等(重复采集同一昵称 →
  //   更新到相同值,无副作用);best-effort(回填失败绝不阻断采集主流程,吞错记日志)。
  //   两处同源:①external_source(采集源)name=昵称、sourceIdentifier=抖音号/sec_uid;
  //   ②platform_account(端口注入且实现 updateAccountHandle 时)handle=昵称。
  async function applyDouyinIdentity(
    ctx: RequestContext,
    sourceId: string,
    identity: DouyinSelfIdentity | null,
  ): Promise<void> {
    const nickname = identity?.nickname?.trim();
    if (!identity || !nickname) return; // 抓不到真实昵称 → 保留占位,不覆盖不清空
    // 抖音号(人可读)优先存 sourceIdentifier;无则退化 sec_uid(仍是稳定身份锚)。
    const sourceIdentifier = identity.douyinId || identity.secUid || undefined;
    // ① 采集源:name 替占位为真实昵称;sourceIdentifier 存真实抖音号/sec_uid(有才写)。
    try {
      await repoFor(ctx).updateExternalSource(sourceId, {
        name: nickname,
        ...(sourceIdentifier ? { sourceIdentifier } : {}),
      });
    } catch (err) {
      console.error("[ingestion] applyDouyinIdentity: 回填 external_source 失败:", err);
    }
    // ② 平台账号:把占位 handle 更新为真实昵称 + [T-201b] 顺带回填稳定身份锚 sec_uid(端口实现时)。
    if (platformAccount?.updateAccountHandle) {
      try {
        await platformAccount.updateAccountHandle(ctx, {
          platform: "douyin",
          handle: nickname,
          externalAccountId: identity.secUid || null, // [T-201b] 身份键(空则不回填)
          followerCount: identity.followerCount, // [T-214] 总粉丝数(实现侧仅 >0 才回填 baseline)
        });
      } catch (err) {
        console.error("[ingestion] applyDouyinIdentity: 回填 platform_account handle 失败:", err);
      }
    }
  }

  // [T-330] 「扫码绑定新抖音号」(forceNew)编排 —— 根治「绑新号直接登进旧号,二维码不出现」:
  //   旧链 login 落在当前号/_default 的持久 profile,里面已有旧号 sessionid → douyin-cdp
  //   loginDouyin 首轮 isLoggedIn 即 true 直接 return,永远读回旧号。本链改为:
  //   ① staging 隔离扫码(全新空目录必出二维码)→ ② 同步读回身份(不再依赖 fire-and-forget
  //   刷新;身份是 ensureAccount 的输入)→ ③ 按 sec_uid/昵称 upsert 账号(同号重扫命中既有行
  //   =自动更新不重复)→ ④ staging 搬到 `.auth/douyin/<accountId>` 正式目录 → ⑤ 身份回填 +
  //   每号独立源 → ⑥ 绑定编排(建 job/claimOrphans/初始化采集)沿现链传真号。
  //   诚实(铁律):身份读不回 → 清理 staging + 抛明确错误;**绝不**把 staging 默默挂到
  //   _default/旧号,也绝不建占位账号冒充绑定成功。
  async function loginDouyinForceNew(
    ctx: RequestContext,
  ): Promise<{ loggedIn: boolean }> {
    const fetchPort = douyinFetch!;
    if (
      !fetchPort.loginNew ||
      !fetchPort.fetchIdentity ||
      !fetchPort.adoptStaging ||
      !fetchPort.discardStaging
    ) {
      // 组合根装配未升级 → 诚实报错(绝不静默退回旧链,旧链正是本 bug)。
      throw new Error(
        "抖音抓取端口不支持绑定新号(缺 staging 扫码能力),请升级组合根装配",
      );
    }
    if (!platformAccount) {
      throw new Error("绑定新抖音号需要 platformAccount 端口(未注入)");
    }
    // ① staging 隔离扫码:全新空 profile 必出二维码,不会被旧 sessionid 短路。
    const { loggedIn, stagingKey } = await fetchPort.loginNew();
    const discardStaging = async () => {
      try {
        await fetchPort.discardStaging!({ stagingKey });
      } catch (err) {
        console.error(
          "[ingestion] loginDouyin(forceNew): 清理 staging 登录态失败:",
          err,
        );
      }
    };
    if (!loggedIn) {
      // 未扫/超时 → 清理 staging(不留半截 profile),诚实返回未登录;不建任何东西。
      await discardStaging();
      return { loggedIn: false };
    }
    // ② 同步读回身份(staging 登录态下轻量抓作品列表首屏反解;见组合根 fetchDouyinIdentity)。
    let identity: DouyinSelfIdentity | null = null;
    try {
      identity = await fetchPort.fetchIdentity({ stagingKey });
    } catch (err) {
      await discardStaging();
      throw new Error(
        `扫码成功但读取账号身份失败,已放弃本次绑定(临时登录态已清理),请重试:${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }
    const nickname = identity?.nickname?.trim();
    if (!identity || !nickname) {
      // 诚实失败:读不回身份就没法归属账号 —— 清 staging + 明确报错,绝不默默挂旧号。
      await discardStaging();
      throw new Error(
        "扫码成功但读不回账号身份(该号可能暂无作品),已放弃本次绑定,请重试",
      );
    }
    // ③ 身份 → 账号行:ensureDouyinAccountUpsert 优先按 sec_uid 幂等命中既有行(同号重扫=
    //   复用并更新,不冒第二行),无命中才建新号(真实昵称,不再是占位「我的抖音」)。
    let ensured: { id: string };
    try {
      ensured = await platformAccount.ensureAccount(ctx, {
        platform: "douyin",
        handle: nickname,
        externalAccountId: identity.secUid || null,
      });
    } catch (err) {
      await discardStaging();
      throw new Error(
        `扫码成功但账号登记失败,已放弃本次绑定(临时登录态已清理),请重试:${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }
    // ④ staging → 正式目录(同号重扫:旧目录被替换 = 登录态更新)。失败也诚实:清 staging +
    //   报错(账号行已建/复用无妨 —— 该号显「未连接」,用户可重扫)。
    try {
      await fetchPort.adoptStaging({ stagingKey, accountId: ensured.id });
    } catch (err) {
      await discardStaging();
      throw new Error(
        `扫码成功但登录态归位失败,已清理临时登录态,请重试:${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }
    // ⑤ 之后编排全带真号(boundCtx):每号独立源 + 身份回填(源 name/sourceIdentifier +
    //   账号 handle/sec_uid/粉丝基线 + 占位合并)。best-effort:绑定已真实成功(登录态已归位),
    //   回填失败不翻成失败,吞错记日志(applyDouyinIdentity 内部本就逐步吞错)。
    const boundCtx: RequestContext = { ...ctx, accountId: ensured.id };
    let sourceId: string | null = null;
    try {
      sourceId = await service.ensureDouyinSource(boundCtx);
    } catch (err) {
      console.error(
        "[ingestion] loginDouyin(forceNew): ensure external_source 失败:",
        err,
      );
    }
    if (sourceId) {
      await applyDouyinIdentity(boundCtx, sourceId, identity);
    }
    // ⑥ 绑定成功编排沿现链(T-189a):onDouyinBound(建 job + claimOrphans + 初始化采集)
    //   fire-and-forget,传真号;未注入时回退 Bug-13 内联 refreshDouyin(同现链语义)。
    if (onDouyinBound) {
      try {
        onDouyinBound(boundCtx);
      } catch (err) {
        console.error(
          "[ingestion] loginDouyin(forceNew): onDouyinBound 建 job/初始化触发失败:",
          err,
        );
      }
    } else if (sourceId) {
      void service
        .refreshDouyin(boundCtx, { externalSourceId: sourceId })
        .catch((refreshErr) => {
          console.error(
            "[ingestion] loginDouyin(forceNew): refreshDouyin 初始化刷新失败:",
            refreshErr instanceof Error ? refreshErr.message : refreshErr,
          );
        });
    }
    return { loggedIn: true };
  }

  // Shared per-record loop for the four push methods. Marks the run running,
  // derives + dedupes the record key (§17.2 skip), validates, then either fans out
  // to the mapped Service + marks written, or saves the error + marks rejected
  // (§17.4 partial success / §17.5). Returns the reloaded run row.
  async function runPush<T>(
    ctx: RequestContext,
    input: PushInput,
    parse: (record: Record<string, unknown>, key: string) => ValidationResult<T>,
    write: (dctx: RequestContext, value: T) => Promise<void>,
  ): Promise<IngestionRunRow> {
    const repo = repoFor(ctx);
    await repo.getRun(input.runId); // ownership gate (404 if cross-user/unknown)
    await repo.markRunRunning(input.runId);
    const dctx = downstreamCtx(ctx, input.runId);

    for (let i = 0; i < input.records.length; i++) {
      const record = input.records[i]!;
      const recordKey = deriveRecordKey(record, i);
      // §17.2/.3 — a record already in the ledger is skipped (no re-fan-out, no
      // double-count).
      if (await repo.recordExists(input.runId, recordKey)) continue;

      const parsed = parse(record, recordKey);
      if (!parsed.ok) {
        await repo.appendError({
          ingestionRunId: input.runId,
          recordKey,
          errorCode: parsed.errorCode,
          errorMessage: parsed.errorMessage,
          rejectedPayload: record,
        });
        await repo.markRecordResult(input.runId, recordKey, "rejected");
        continue;
      }
      try {
        await write(dctx, parsed.value);
        await repo.markRecordResult(input.runId, recordKey, "written");
      } catch (err) {
        await repo.appendError({
          ingestionRunId: input.runId,
          recordKey,
          errorCode: "DOWNSTREAM_ERROR",
          errorMessage: err instanceof Error ? err.message : String(err),
          rejectedPayload: record,
        });
        await repo.markRecordResult(input.runId, recordKey, "rejected");
      }
    }
    return repo.getRun(input.runId);
  }

  const service: IngestionService = {
    async createRun(ctx, input) {
      const repo = repoFor(ctx);
      // §17.3 — a duplicate (external_source_id, idempotency_key) returns the
      // ORIGINAL run unchanged (no second row).
      const existing = await repo.findRunByIdempotency(
        input.externalSourceId,
        input.idempotencyKey,
      );
      if (existing) return existing;
      return repo.createRun(input);
    },

    async ensureManualRun(ctx, idempotencyKey) {
      const repo = repoFor(ctx);
      // 1. 确保该用户有一个 source='manual' 的 ExternalSource(确定性 id,幂等 seed)。
      const sourceId = `extsrc-manual-${ctx.userId}`;
      const existingSrc = await repo.getExternalSource(sourceId);
      if (!existingSrc) {
        await repo.seedExternalSources([
          {
            id: sourceId,
            userId: ctx.userId,
            accountId: ctx.accountId ?? null, // [T-136] 按号隔离;无当前号时 NULL(存量兜底)
            sourceType: "manual",
            name: "手动录入",
            sourceIdentifier: "",
            secretReference: "",
            configuration: {},
            createdAt: deps.now(),
          },
        ]);
      }
      // 2. 建一次真 run(幂等 key → 同一录入复用同一 run)并标完成(actuals 可追溯)。
      const run = await service.createRun(ctx, {
        externalSourceId: sourceId,
        runType: "manual",
        idempotencyKey,
      });
      await service.completeRun(ctx, { runId: run.id, status: "completed" });
      return run.id;
    },

    async ensureImportedProject(ctx, input) {
      // 数据底座(SPEC §1.3)。projects 端口未注入(旧最小组合)→ 返回 null,调用方回退。
      if (!ports.projects) return null;
      // [T-321] 主去重键 = publications.externalId(不是 projects.platform_ref)。先按
      //   (platform, externalId) 查既有 publication:命中即该作品已绑定到某属主项目
      //   (用户手建 manual 项目「登记已发布」把 aweme_id 落这里,或上一轮日拉建的 imported
      //   项目)。用它反查属主 → merge 更新(不新建重复)。这样 manual 项目也能被再次命中而
      //   不重建(旧 findImportedByRef 只认 source='imported',对 manual 视而不见 → 建重复)。
      const boundPub = await ports.publishing.resolvePublication(ctx, {
        platform: input.platform,
        externalId: input.externalId,
      });
      if (
        boundPub?.contentOutputId &&
        ports.projects.getProjectIdByOutput &&
        ports.projects.mergePublishedWork
      ) {
        const ownerProjectId = await ports.projects.getProjectIdByOutput(
          ctx,
          boundPub.contentOutputId,
        );
        if (ownerProjectId) {
          // 命中已绑定属主项目 → 合并更新(补真实发布数据 + 显已发布,不覆盖用户手写内容,
          //   保持原 source)。**不 create 新项目**。幂等:重复日拉稳定落同一项目。
          await ports.projects.mergePublishedWork(ctx, ownerProjectId, {
            title: input.title,
            brief: input.brief,
            platform: input.platform,
            externalId: input.externalId,
            shareUrl: input.shareUrl,
            publishedAt: input.publishedAt,
          });
          return {
            projectId: ownerProjectId,
            outputId: boundPub.contentOutputId,
            publicationId: boundPub.id,
          };
        }
      }
      // 未命中既有 publication(真·纯导入新作品)→ 原「create imported + 建 publication」路径不变。
      const ensured = await ports.projects.ensureImportedProject(ctx, {
        title: input.title,
        brief: input.brief, // [T-089] 文案全文透传(新建项目落 brief)
        platform: input.platform,
        externalId: input.externalId,
        shareUrl: input.shareUrl,
        publishedAt: input.publishedAt,
      });
      // 确保对应 publication 存在(external_id=externalId),metrics 才能命中。既有查询
      // 已在上方 boundPub 完成(复用,不重复查);无则经 publishing 端口建(端口未提供 create
      // 时退回 resolve,缺则报错 —— 不静默)。
      let publicationId = boundPub?.id ?? null;
      if (!publicationId) {
        if (!ports.publishing.createImportedPublication) {
          throw new Error(
            "ensureImportedProject: publishing.createImportedPublication 端口未配置,无法落 publication",
          );
        }
        const pub = await ports.publishing.createImportedPublication(
          ctx,
          ensured.outputId,
          {
            platform: input.platform,
            externalId: input.externalId,
            publishedAt: input.publishedAt ?? null,
          },
        );
        publicationId = pub.id;
      }
      return {
        projectId: ensured.projectId,
        outputId: ensured.outputId,
        publicationId,
      };
    },

    async ingestMetrics(ctx, input) {
      return runPush(
        ctx,
        input,
        parseMetricRecord,
        async (dctx, value) => {
          // Metrics fan-out (SPEC §277-281): resolvePublication → appendSnapshot.
          const pub = await ports.publishing.resolvePublication(dctx, {
            platform: value.platform,
            externalId: value.externalId,
          });
          if (!pub) {
            throw new Error(
              `publication not found for ${value.platform}:${value.externalId}`,
            );
          }
          await ports.analytics.appendSnapshot(dctx, {
            publicationId: pub.id,
            ingestionRunId: dctx.ingestionRunId ?? null,
            capturedAt: value.capturedAt,
            source: "ingestion",
            rawMetrics: value.metrics,
          });
        },
      );
    },

    async ingestKnowledge(ctx, input) {
      return runPush(
        ctx,
        input,
        parseKnowledgeRecord,
        async (dctx, value) => {
          await ports.knowledge.ingest(dctx, {
            title: value.title,
            content: value.content,
            knowledgeType: value.knowledgeType,
          });
        },
      );
    },

    async ingestAssets(ctx, input) {
      return runPush(
        ctx,
        input,
        parseAssetRecord,
        async (dctx, value) => {
          await ports.assets.registerExternalAsset(dctx, {
            name: value.name,
            assetType: value.assetType,
            storageKey: value.storageKey,
          });
        },
      );
    },

    async ingestArtifacts(ctx, input) {
      return runPush(
        ctx,
        input,
        parseArtifactRecord,
        async (dctx, value) => {
          // CANDIDATE only — never current_version (roadmap §401). The adopt gate
          // downstream promotes it.
          await ports.artifacts.createCandidateVersion(dctx, {
            artifactId: value.artifactId,
            contentText: value.contentText,
            contentData: value.contentData,
            changeSummary: value.changeSummary,
            createdByType: "ingestion",
          });
        },
      );
    },

    async completeRun(ctx, input) {
      const repo = repoFor(ctx);
      const run = await repo.getRun(input.runId); // ownership gate
      // Explicit status wins (e.g. "failed"); else completed/partial by reject count.
      const status =
        input.status ?? (run.recordsRejected > 0 ? "partial" : "completed");
      return repo.completeRun(input.runId, { status, completedAt: deps.now() });
    },

    async getRun(ctx, runId) {
      return repoFor(ctx).getRun(runId);
    },

    async listErrors(ctx, runId) {
      return repoFor(ctx).listErrors(runId);
    },

    async refreshDouyin(ctx, input) {
      if (!douyinFetch) {
        throw new Error("抖音抓取端口未配置(douyinFetch)");
      }
      const repo = repoFor(ctx);
      // [T-136 §D 切片 c] 源校验:先带号门查(当前号的源);查不到再回落无号门(存量源
      //   account_id=null,选号后带号门会 miss —— ensureDouyinSource 回落复用存量旧 id 时正是
      //   此情形)。无号门仍是同 user 内(按 userId+id 查确定源 id),不构成越权。
      let src = await repo.getExternalSource(input.externalSourceId);
      if (!src && ctx.accountId) {
        src = await unscopedRepo(ctx).getExternalSource(input.externalSourceId);
      }
      if (!src) {
        throw new Error(`外部来源不存在:${input.externalSourceId}`);
      }
      if (src.sourceType !== "douyin") {
        throw new Error("该外部来源不是抖音(sourceType≠douyin)");
      }
      const capturedAt = input.capturedAt ?? deps.now();
      // [T-177 增量化] 反查库里已知作品 awemeId 集,传给抓取层做翻页 early-stop(某页作品全已知 → 停)。
      //   端口可选:未注入 → undefined → fetchDouyinMetrics 退化为原全量滚动(向后兼容,零回归)。
      const knownAwemeIds = ports.publishing.listPublishedExternalIds
        ? new Set(
            await ports.publishing.listPublishedExternalIds(ctx, "douyin"),
          )
        : undefined;
      // 真抓(CDP)→ records + identity;失败/无登录态会抛,run 不会被建(快速失败)。
      // [T-136 §D 切片 c] 带当前号 → composition root 用 `.auth/douyin/<accountId>` 登录态复刷。
      const { records, identity } = normalizeFetch(
        await douyinFetch.fetch({
          capturedAt,
          accountId: ctx.accountId ?? null,
          knownAwemeIds, // [T-177] 翻页 early-stop 锚(undefined → 全量)
        }),
      );
      // [T-136 §D] 抓到登录用户真实身份 → 回填当前号占位:external_source.name=真实昵称、
      //   sourceIdentifier=抖音号/sec_uid;platform_account.handle=真实昵称(仅抓到才覆盖,
      //   幂等、best-effort:回填失败绝不阻断采集主流程)。抓不到 identity=null → 保留占位。
      await applyDouyinIdentity(ctx, src.id, identity);
      // 数据底座(SPEC §1.3):抓到的每条作品先 ensureImportedProject(幂等于
      //   (userId, platform, externalId))—— 未知作品就地建历史项目 + content_output +
      //   publication(external_id=aweme_id),治"24 条被 reject"。projects 端口未注入
      //   (旧最小组合)时 ensureImportedProject 返回 null,退回旧行为(下方 ingestMetrics
      //   未命中即 reject),不破坏既有最小组合。每条 ensure 失败不应整批挂:吞掉单条错误
      //   (该条 metrics 后续 resolvePublication 未命中会被正常 reject,计入 partial)。
      if (ports.projects) {
        for (const r of records) {
          try {
            await service.ensureImportedProject(ctx, {
              // [T-089] title 已是短标题语义(官方 title / desc 首行截 40,见
              // douyin-cdp deriveWorkTitle);兜底占位名不变。desc 全文 → brief。
              title: r.title ?? `抖音作品 ${r.externalId}`,
              brief: r.desc,
              platform: r.platform,
              externalId: r.externalId,
              shareUrl: r.shareUrl,
              publishedAt: r.publishedAt,
            });
          } catch {
            // 单条导入失败不阻断整批 —— 该条 metrics 将在 ingestMetrics 因
            // resolvePublication 未命中而 reject(计入 partial),不静默丢真实错误归属。
          }
        }
      }
      const run = await service.createRun(ctx, {
        externalSourceId: input.externalSourceId,
        runType: "douyin_metrics",
        idempotencyKey: capturedAt,
      });
      await service.ingestMetrics(ctx, {
        runId: run.id,
        records: records as unknown as Array<Record<string, unknown>>,
      });
      return service.completeRun(ctx, { runId: run.id });
    },

    async ensureDouyinSource(ctx) {
      // T-144 → [T-136 §D 切片 c] 每号独立源。无源 seed 一条真实 source_type=douyin,有源
      //   (onConflictDoNothing)复用不覆盖用户自定义 name/handle。
      // 1) 当前号新源 or 存量旧源已在 → 复用其 id(存量不孤立,见 findDouyinSourceId)。
      const resolved = await findDouyinSourceId(ctx);
      if (resolved) return resolved;

      // 2) 无任何存量 → seed 该号的新源(stamp 当前号;未选号时 accountId=null)。
      const sourceId = douyinSourceId(ctx);
      await repoFor(ctx).seedExternalSources([
        {
          id: sourceId,
          userId: ctx.userId,
          accountId: ctx.accountId ?? null, // [T-136] 按号隔离;无当前号时 NULL(存量兜底)
          sourceType: "douyin",
          // handle 在扫码阶段拿不到(登录态 cookie 不含昵称)→ 占位;真实昵称由 T-136 §D
          // 采集到主页信息后回填(此处不阻塞采集能用)。
          name: "我的抖音",
          sourceIdentifier: "",
          secretReference: "",
          configuration: {},
          createdAt: deps.now(),
        },
      ]);
      // 3) §9 MINOR-3 —— 同 account 下同 handle 多条 external_source(历史 bug / 重试)去重:
      //    保留最新其余标 deprecated;不同 account 相同 handle 视独立源各留。best-effort。
      try {
        await repoFor(ctx).deduplicateDouyinSources();
      } catch (err) {
        console.error("[ingestion] ensureDouyinSource: 去重 external_sources 失败:", err);
      }
      return sourceId;
    },

    async loginDouyin(ctx, input) {
      if (!douyinFetch) {
        throw new Error("抖音抓取端口未配置(douyinFetch)");
      }
      // [T-330] 「扫码绑定新抖音号」→ staging 隔离链(见 loginDouyinForceNew)。非 forceNew
      //   (重连当前号)保持现行为:复用 `.auth/douyin/<accountId>`/_default 既有 profile 合理。
      if (input?.forceNew) {
        return loginDouyinForceNew(ctx);
      }
      // 弹 Chromium 窗口扫码;成功后登录态落 .auth/,后续 refreshDouyin 直接 headless 复用。
      // [T-136 §D 切片 c] 带当前号 → 落 `.auth/douyin/<accountId>` 独立登录态(每号各自扫码)。
      const loggedIn = await douyinFetch.login({ accountId: ctx.accountId ?? null });
      // T-144 —— 扫码成功才建绑定(诚实:失败不假装);同时 ensure external_source(采集源)+
      // platform_account(端口注入时),让「设置徽标 / 切换器 / 日历」三处同源。ensure 是尽力
      // 而为:建绑定失败绝不把"已成功的扫码"翻成失败(登录态已落 .auth/,是真的)。
      if (loggedIn) {
        try {
          await service.ensureDouyinSource(ctx);
        } catch (err) {
          console.error("[ingestion] loginDouyin: ensure external_source 失败:", err);
        }
        // [T-201a] 绑定成功后 ctx.accountId 常为 null(新绑,号是本次 ensureAccount 刚建/复用的)。
        //   捕获其 id 派生 boundCtx,让下游(建 job / claimOrphans 认领存量 / 初始化采集)全落**真号**,
        //   而非 null → 根治「采集/认领全落 null 号 → webview 带真号严格 eq 0 命中 → 封面 OwnershipError
        //   紫色」(Bug-1)。ctx.accountId 已有(已有账户刷新路径)则尊重它,不覆盖。
        let boundCtx = ctx;
        if (platformAccount) {
          try {
            const ensured = await platformAccount.ensureAccount(ctx, {
              platform: "douyin",
              handle: "我的抖音",
            });
            boundCtx = { ...ctx, accountId: ctx.accountId ?? ensured.id };
          } catch (err) {
            console.error("[ingestion] loginDouyin: ensure platform_account 失败:", err);
          }
        }
        // [T-189a] 绑定成功 → 组合根 bootstrap:幂等建三个每天定时采集 job(self.metrics /
        //   self.detail / comments)+ 立即初始化跑一次拉全量(按序,gate-F5 串行链)。fire-and-forget
        //   (回调内部 void,不阻塞绑定返回)。「已有账户」路径也复用 loginDouyin,故此处同样触发。
        //   identity backfill 由初始化的 self.metrics(=refreshDouyin→applyDouyinIdentity)顺带完成,
        //   故 onDouyinBound 注入时**不再**跑下方 Bug-13 内联 refreshDouyin(避免双跑 Chromium 抢号)。
        //   [T-201a] 传 boundCtx(带真号)→ claimOrphans 认领存量 null 数据落真号、建的 job/初始化采集
        //   ctx 也带真号(triggerScheduledJob 由 job.accountId 派生采集 ctx)。
        if (onDouyinBound) {
          try {
            onDouyinBound(boundCtx);
          } catch (err) {
            console.error("[ingestion] loginDouyin: onDouyinBound 建 job/初始化触发失败:", err);
          }
        } else if (platformAccount) {
          // [Bug-13 T-029] 扫码后**立即** fire-and-forget 跑 refreshDouyin(cookies 刚落了 .auth/,
          // 直接 headless 复用)→ applyDouyinIdentity 把 accountHandle 从占位「我的抖音」改成
          // 真实抖音昵称。**这步之前**:sidebar 显空 handle(占位)、后续 collector 用 _default/
          // 找不到 accountId、jobs 触发时 needs_reconnect —— 用户实操「扫码完立刻叉掉提示→建任务→跑
          // 必坏」的真根。**这步之后**:sidebar 显真实昵称 + 后续 collector 拿得到 accountId + source
          // 就绪,端到端扫码即齐活。失败吞掉(不把已成功的扫码翻成失败,登录态已落是真的)。
          // [Bug-13] 用 findDouyinSourceId 拿真源 ID(上一步 ensureDouyinSource 刚建过,这里能拿到),
          // 不能传空串(refreshDouyin 会因「外部来源不存在」抛错,反而把成功扫码翻失败)。
          try {
            const sourceId = await findDouyinSourceId(ctx);
            if (sourceId) {
              void service
                .refreshDouyin(ctx, { externalSourceId: sourceId })
                .catch((refreshErr) => {
                  console.error(
                    "[ingestion] loginDouyin: refreshDouyin 刷新昵称失败(cookies 可能没就绪):",
                    refreshErr instanceof Error
                      ? refreshErr.message
                      : refreshErr,
                  );
                });
            }
          } catch (refreshErr) {
            console.error(
              "[ingestion] loginDouyin: refreshDouyin 同步调度失败:",
              refreshErr instanceof Error ? refreshErr.message : refreshErr,
            );
          }
        }
      }
      return { loggedIn };
    },

    async checkDouyinStatus(ctx) {
      if (!douyinFetch) {
        throw new Error("抖音抓取端口未配置(douyinFetch)");
      }
      // headless 快查 .auth/ 里的 sessionid cookie(不弹窗);cookie 失效即 false(登录态过期)。
      // [T-136 §D 切片 c] 带当前号 → 查 `.auth/douyin/<accountId>` 该号独立登录态。
      const loggedIn = await douyinFetch.status({ accountId: ctx.accountId ?? null });
      // T-144 → [T-136] sourceReady:是否已有该号真实采集源(当前号新源 or 存量回落)。
      // 设置页据此把「可采集」承诺收敛到真实能力(登录态有效 + 源就绪);去虚假承诺。选号后
      // 存量源仍算就绪(findDouyinSourceId 回落),不因换 id 判假阴性。
      const sourceId = await findDouyinSourceId(ctx);
      return { loggedIn, sourceReady: Boolean(sourceId) };
    },

    async getDouyinThrottleStatus() {
      // 端口未注入(测试/退化)→ 空 channels(前端诚实不显限流,不 throw 阻断任务中心)。
      if (!throttleStatus) return { channels: [] };
      // 读 gateway 内存镜像(同步、无 IO);包成 Promise 满足接口(与其余 async 一致)。
      return throttleStatus.read();
    },
  };
  return service;
}

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
  ): Promise<{ id: string } | null>;
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
  ensureAccount(
    ctx: RequestContext,
    input: { platform: string; handle: string },
  ): Promise<{ id: string }>;
}

// 抖音抓取端口 —— composition root 注入 fetchDouyinMetrics(自起持久 context 复用扫码登录态);
// 测试注 fake。`login` 弹窗扫码(headed);`fetch` headless 复刷,未登录抛 DouyinNotLoggedInError。
export interface DouyinFetchPort {
  fetch(opts: { capturedAt: string }): Promise<MetricRecord[]>;
  login(): Promise<boolean>;
  // 被动探针(T-032a):headless 快查登录态,不弹窗。设置页「账号绑定」徽标读它。
  status(): Promise<boolean>;
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
  loginDouyin(ctx: RequestContext): Promise<{ loggedIn: boolean }>;
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
}): IngestionService {
  const { deps, ports, db, douyinFetch, throttleStatus, platformAccount } =
    args;

  // T-144 —— 抖音采集源的确定性 id(user 级单源;与 ensureManualRun 的
  // `extsrc-manual-${userId}` 同范式)。external_sources 表无 account_id 列 → 最小修复是
  // user 级单源;T-136 §D 多账号时可换成 `extsrc-douyin-${accountId}`(向下兼容)。
  const douyinSourceId = (userId: string): string => `extsrc-douyin-${userId}`;

  function repoFor(ctx: RequestContext): IngestionRepository {
    return createIngestionRepository(db, {
      now: deps.now,
      nextId: deps.nextId,
      userId: ctx.userId,
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
      ingestionRunId: runId,
    };
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
      const ensured = await ports.projects.ensureImportedProject(ctx, {
        title: input.title,
        brief: input.brief, // [T-089] 文案全文透传(新建项目落 brief)
        platform: input.platform,
        externalId: input.externalId,
        shareUrl: input.shareUrl,
        publishedAt: input.publishedAt,
      });
      // 确保对应 publication 存在(external_id=externalId),metrics 才能命中。先查既有,
      // 无则经 publishing 端口建(端口未提供 create 时退回 resolve,缺则报错 —— 不静默)。
      const existing = await ports.publishing.resolvePublication(ctx, {
        platform: input.platform,
        externalId: input.externalId,
      });
      let publicationId = existing?.id ?? null;
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
      const src = await repo.getExternalSource(input.externalSourceId);
      if (!src) {
        throw new Error(`外部来源不存在:${input.externalSourceId}`);
      }
      if (src.sourceType !== "douyin") {
        throw new Error("该外部来源不是抖音(sourceType≠douyin)");
      }
      const capturedAt = input.capturedAt ?? deps.now();
      // 真抓(CDP)→ records;失败/无登录态会抛,run 不会被建(快速失败)。
      const records = await douyinFetch.fetch({ capturedAt });
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
      // T-144 —— 复用 ensureManualRun 的确定性 id + 幂等 seed 范式:无源 seed 一条真实
      // source_type=douyin,有源(onConflictDoNothing)复用不覆盖用户自定义 name/handle。
      const repo = repoFor(ctx);
      const sourceId = douyinSourceId(ctx.userId);
      const existing = await repo.getExternalSource(sourceId);
      if (!existing) {
        await repo.seedExternalSources([
          {
            id: sourceId,
            userId: ctx.userId,
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
      }
      return sourceId;
    },

    async loginDouyin(ctx) {
      if (!douyinFetch) {
        throw new Error("抖音抓取端口未配置(douyinFetch)");
      }
      // 弹 Chromium 窗口扫码;成功后登录态落 .auth/,后续 refreshDouyin 直接 headless 复用。
      const loggedIn = await douyinFetch.login();
      // T-144 —— 扫码成功才建绑定(诚实:失败不假装);同时 ensure external_source(采集源)+
      // platform_account(端口注入时),让「设置徽标 / 切换器 / 日历」三处同源。ensure 是尽力
      // 而为:建绑定失败绝不把"已成功的扫码"翻成失败(登录态已落 .auth/,是真的)。
      if (loggedIn) {
        try {
          await service.ensureDouyinSource(ctx);
        } catch (err) {
          console.error("[ingestion] loginDouyin: ensure external_source 失败:", err);
        }
        if (platformAccount) {
          try {
            await platformAccount.ensureAccount(ctx, {
              platform: "douyin",
              handle: "我的抖音",
            });
          } catch (err) {
            console.error("[ingestion] loginDouyin: ensure platform_account 失败:", err);
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
      const loggedIn = await douyinFetch.status();
      // T-144 —— sourceReady:是否已有真实采集源(user 级确定 id 的 external_source 存在)。
      // 设置页据此把「可采集」承诺收敛到真实能力(登录态有效 + 源就绪);去虚假承诺。
      const src = await repoFor(ctx).getExternalSource(douyinSourceId(ctx.userId));
      return { loggedIn, sourceReady: Boolean(src) };
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

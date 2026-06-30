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
}

// 抖音抓取端口 —— composition root 注入 fetchDouyinMetrics(自起持久 context 复用扫码登录态);
// 测试注 fake。`login` 弹窗扫码(headed);`fetch` headless 复刷,未登录抛 DouyinNotLoggedInError。
export interface DouyinFetchPort {
  fetch(opts: { capturedAt: string }): Promise<MetricRecord[]>;
  login(): Promise<boolean>;
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
  // 抖音真实指标刷新:校验来源→抓取(复用扫码登录态)→createRun→ingestMetrics→completeRun。
  refreshDouyin(
    ctx: RequestContext,
    input: { externalSourceId: string; capturedAt?: string },
  ): Promise<IngestionRunRow>;
  // 抖音扫码登录:弹 Chromium 窗口让用户扫码,落 .auth/ 持久化,返回是否成功(供 refresh 复用)。
  loginDouyin(ctx: RequestContext): Promise<{ loggedIn: boolean }>;
}

export function createIngestionService(args: {
  deps: ServiceDeps;
  ports: IngestionPorts;
  db: Db;
  douyinFetch?: DouyinFetchPort;
}): IngestionService {
  const { deps, ports, db, douyinFetch } = args;

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

    async loginDouyin() {
      if (!douyinFetch) {
        throw new Error("抖音抓取端口未配置(douyinFetch)");
      }
      // 弹 Chromium 窗口扫码;成功后登录态落 .auth/,后续 refreshDouyin 直接 headless 复用。
      const loggedIn = await douyinFetch.login();
      return { loggedIn };
    },
  };
  return service;
}

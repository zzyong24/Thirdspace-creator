import type { RequestContext } from "@creatoros/contract";
import type { Db } from "@creatoros/backend";
import {
  createCandidateRepository,
  type CandidateRepository,
  type RepoDeps,
  type CandidateSort,
} from "./candidate.repository";
import {
  toCandidateDto,
  toAudienceSignalDto,
  toTopicPromotionDto,
  type CandidateResource,
  type AudienceSignalResource,
  type TopicPromotionResource,
} from "./candidate.schema";
import {
  PromoteStateError,
  DanglingRunError,
} from "./candidate.errors";

// Candidate service (foundation §5.3) — every public method takes
// `(ctx: RequestContext, …)` and builds a repository bound to `ctx.userId`
// (createCandidateRepository(db, { now, nextId, userId: ctx.userId })) so scoping is
// structural. The service owns the lightweight Candidate pool (pool/promoted/
// dropped), the AudienceSignal → demand_count aggregation, and Candidate → promote →
// Project (类比 promoteReviewInsight). It is the only entry other modules import (via
// index.ts), and exposes `createFromAIResult` for the AI confirm formalize (C-3) and
// `ingestAudienceSignal` for the Ingestion intake (C-4).
//
// Peers are reached ONLY through injected narrow PORTS (mirrors positioning/
// monetization) — no cross-module repository import (SPEC §22):
//   - projects (HARD dep): createProject for promote → Project (Research-stage seed).
//   - positioning (SOFT dep): a nullable gate port — fit=null when Positioning is not
//     yet wired; the page renders the Candidate ungated.
//   - ingestion: a run-existence port for the C-4 / RISK-005 dangling-run guard.
//
// C-3: createFromAIResult ONLY persists a formalized AITaskResult into a candidates
// row (source∈{trend,benchmark,demand}, aiTaskId set). It NEVER sets/tracks
// awaiting/confirmed on candidates (that machine lives on the AITask). Re-calling
// with the same aiTaskId is idempotent (no duplicate Candidate).

export interface CandidateProjectsPort {
  // Ownership-stamped project create for promote → Project (Research-stage seed).
  // Returns at least the new project id.
  createProject(
    ctx: RequestContext,
    cmd: {
      title: string;
      brief?: string;
      contentType?: string;
      creationMode?: string;
      targetPlatforms?: string[];
    },
  ): Promise<{ id: string }>;
}

export interface CandidatePositioningPort {
  // Deterministic advisory 0–100 fit for a candidate subject (SOFT dep — absent ⇒
  // positioningFit:null). Pure of Date.now/Math.random (C-5).
  evaluateFit(
    ctx: RequestContext,
    subject: {
      title: string;
      angle: string;
      contentRole?: string | null;
      productAnchorId?: string | null;
    },
  ): Promise<number>;
}

export interface CandidateIngestionPort {
  // RISK-005 — the run must be a REAL IngestionRun (cross-user / unknown →
  // OwnershipError). Asserted BEFORE any audience_signals row references the runId.
  assertRunExists(ctx: RequestContext, runId: string): Promise<void>;
}

export interface ServiceDeps {
  db: Db;
  now: () => string;
  nextId: (prefix: string) => string;
  projects: CandidateProjectsPort;
  positioning?: CandidatePositioningPort;
  ingestion: CandidateIngestionPort;
}

export interface CreateCandidateInput {
  title: string;
  angle?: string;
  contentRole?: "traffic" | "trust" | "conversion" | null;
  productAnchorId?: string | null;
}

export interface PatchCandidateInput {
  title?: string;
  angle?: string;
  contentRole?: "traffic" | "trust" | "conversion" | null;
  productAnchorId?: string | null;
  status?: "pool" | "dropped";
}

export interface ListCandidatesQuery {
  status?: string;
  source?: string;
  sort?: CandidateSort;
  limit: number;
  offset: number;
}

export interface ListSignalsQuery {
  source?: string;
  demandTag?: string;
  linkedCandidateId?: string;
  limit: number;
  offset: number;
}

// The AI confirm formalize input (C-3). resultType pins to a Candidate result; the
// AITask owns the awaiting/confirmed machine — this is the AI-free formalize callee.
export interface CandidateAIResult {
  aiTaskId: string;
  resultType: "candidate";
  resultData: {
    title: string;
    angle?: string;
    source: "trend" | "benchmark" | "demand";
    contentRole?: "traffic" | "trust" | "conversion" | null;
    productAnchorId?: string | null;
    predictedScore?: number | null;
  };
}

// An Ingestion intake record (typed shape; Ingestion hands opaque records validated
// by candidate.schema's parseAudienceSignalRecord at the transport/adapter edge).
export interface IngestSignalInput {
  source: string; // comment|dm|consultation|review
  rawText: string;
  demandTag?: string | null;
  payingIntent?: string | null;
  linkedCandidateRef?: string | null;
}

export interface CandidateService {
  listCandidates(
    ctx: RequestContext,
    query: ListCandidatesQuery,
  ): Promise<{ rows: CandidateResource[]; total: number }>;
  createCandidate(
    ctx: RequestContext,
    input: CreateCandidateInput,
  ): Promise<CandidateResource>;
  getCandidate(
    ctx: RequestContext,
    candidateId: string,
  ): Promise<CandidateResource>;
  patchCandidate(
    ctx: RequestContext,
    candidateId: string,
    patch: PatchCandidateInput,
  ): Promise<CandidateResource>;
  // Candidate → Project (类比 promoteReviewInsight). No double-promote.
  promote(
    ctx: RequestContext,
    candidateId: string,
  ): Promise<TopicPromotionResource>;

  // C-3 formalize seam — called by the AI module's confirmResult (AI-free). NOT a
  // contract op. Idempotent on aiTaskId.
  createFromAIResult(
    ctx: RequestContext,
    result: CandidateAIResult,
  ): Promise<CandidateResource>;

  // C-4 intake seam — called by the Ingestion module per record. NOT a contract op.
  // Requires ctx.ingestionRunId; rejects 悬空 runId (RISK-005); bumps demandCount.
  ingestAudienceSignal(
    ctx: RequestContext,
    record: IngestSignalInput,
  ): Promise<AudienceSignalResource>;

  listSignals(
    ctx: RequestContext,
    query: ListSignalsQuery,
  ): Promise<{ rows: AudienceSignalResource[]; total: number }>;
  // "评论/客户问题一键转 Candidate" (spec §5.5). Omit candidateId → spawn a new
  // demand Candidate from the signal, then link; bumps demandCount.
  linkSignalToCandidate(
    ctx: RequestContext,
    signalId: string,
    candidateId: string | undefined,
  ): Promise<CandidateResource>;
}

export function createCandidateService(deps: ServiceDeps): CandidateService {
  const { db, now, nextId, projects, positioning, ingestion } = deps;

  function repoFor(ctx: RequestContext): CandidateRepository {
    const repoDeps: RepoDeps = { now, nextId, userId: ctx.userId };
    return createCandidateRepository(db, repoDeps);
  }

  async function fitFor(
    ctx: RequestContext,
    subject: {
      title: string;
      angle: string;
      contentRole?: string | null;
      productAnchorId?: string | null;
    },
  ): Promise<number | null> {
    if (!positioning) return null; // SOFT dep — gate skipped, candidate ungated.
    return positioning.evaluateFit(ctx, subject);
  }

  return {
    async listCandidates(ctx, query) {
      const { rows, total } = await repoFor(ctx).listCandidates(query);
      return { rows: rows.map(toCandidateDto), total };
    },

    async createCandidate(ctx, input) {
      const repo = repoFor(ctx);
      const angle = input.angle ?? "";
      const positioningFit = await fitFor(ctx, {
        title: input.title,
        angle,
        contentRole: input.contentRole ?? null,
        productAnchorId: input.productAnchorId ?? null,
      });
      const row = await repo.createCandidate({
        title: input.title,
        angle,
        source: "idea", // manual entry only — AI-sourced go via createFromAIResult.
        contentRole: input.contentRole ?? null,
        productAnchorId: input.productAnchorId ?? null,
        positioningFit,
        predictedScore: null,
        aiTaskId: null,
      });
      return toCandidateDto(row);
    },

    async getCandidate(ctx, candidateId) {
      return toCandidateDto(await repoFor(ctx).getCandidate(candidateId));
    },

    async patchCandidate(ctx, candidateId, patch) {
      const row = await repoFor(ctx).patchCandidate(candidateId, patch);
      return toCandidateDto(row);
    },

    async promote(ctx, candidateId) {
      const repo = repoFor(ctx);
      const cand = await repo.getCandidate(candidateId); // ownership gate (404)
      if (cand.status === "promoted") {
        throw new PromoteStateError(
          `PromoteStateError: candidate ${candidateId} is already promoted`,
        );
      }
      // 1. create the Research-stage Project (类比 promoteReviewInsight). The
      //    ProjectsService stamps ctx.userId on the new project.
      const project = await projects.createProject(ctx, {
        title: cand.title,
        brief: cand.angle,
      });
      // 2. flip the candidate to promoted + 3. write the topic_promotions row.
      //    pglite is in-process synchronous; the writes run back-to-back inside this
      //    one service method (the realized modules do not wrap a tx — no UnitOfWork
      //    helper is exported; the unique index on candidate_id is the backstop).
      await repo.setPromoted(candidateId);
      const promo = await repo.createPromotion({
        candidateId,
        projectId: project.id,
      });
      return toTopicPromotionDto(promo);
    },

    async createFromAIResult(ctx, result) {
      const repo = repoFor(ctx);
      // Idempotent on aiTaskId — confirmResult may retry; never duplicate.
      const existing = await repo.findCandidateByAiTaskId(result.aiTaskId);
      if (existing) return toCandidateDto(existing);
      const { resultData } = result;
      const angle = resultData.angle ?? "";
      const positioningFit = await fitFor(ctx, {
        title: resultData.title,
        angle,
        contentRole: resultData.contentRole ?? null,
        productAnchorId: resultData.productAnchorId ?? null,
      });
      const row = await repo.createCandidate({
        title: resultData.title,
        angle,
        source: resultData.source, // trend|benchmark|demand (AI-sourced)
        contentRole: resultData.contentRole ?? null,
        productAnchorId: resultData.productAnchorId ?? null,
        positioningFit,
        predictedScore: resultData.predictedScore ?? null,
        aiTaskId: result.aiTaskId, // provenance; status stays 'pool' (no parallel machine)
      });
      return toCandidateDto(row);
    },

    async ingestAudienceSignal(ctx, record) {
      const runId = ctx.ingestionRunId;
      if (!runId) {
        // C-4 — AudienceSignal writes ride an Ingestion run; no run ⇒ reject.
        throw new DanglingRunError(
          "DanglingRunError: ingestAudienceSignal requires ctx.ingestionRunId (C-4)",
        );
      }
      // RISK-005 — the run must be a REAL IngestionRun (cross-user / unknown →
      // OwnershipError) BEFORE any signal row references it.
      await ingestion.assertRunExists(ctx, runId);
      const repo = repoFor(ctx);
      const signal = await repo.createSignal({
        source: record.source,
        rawText: record.rawText,
        demandTag: record.demandTag ?? null,
        payingIntent: record.payingIntent ?? null,
        linkedCandidateId: record.linkedCandidateRef ?? null,
        ingestionRunId: runId,
      });
      if (record.linkedCandidateRef) {
        // bump the linked Candidate's demand_count (recompute keeps it honest).
        await repo.recomputeDemandCount(record.linkedCandidateRef);
      }
      return toAudienceSignalDto(signal);
    },

    async listSignals(ctx, query) {
      const { rows, total } = await repoFor(ctx).listSignals(query);
      return { rows: rows.map(toAudienceSignalDto), total };
    },

    async linkSignalToCandidate(ctx, signalId, candidateId) {
      const repo = repoFor(ctx);
      const signal = await repo.getSignal(signalId); // ownership gate (404)
      let targetId = candidateId;
      if (!targetId) {
        // Spawn a new demand Candidate from the signal's rawText/demandTag.
        const title = signal.rawText.slice(0, 60);
        const created = await repo.createCandidate({
          title,
          angle: signal.demandTag ?? "",
          source: "demand",
          contentRole: null,
          productAnchorId: null,
          positioningFit: await fitFor(ctx, {
            title,
            angle: signal.demandTag ?? "",
          }),
          predictedScore: null,
          aiTaskId: null,
        });
        targetId = created.id;
      } else {
        await repo.getCandidate(targetId); // ownership gate on the target (404)
      }
      await repo.linkSignal(signalId, targetId);
      await repo.recomputeDemandCount(targetId);
      return toCandidateDto(await repo.getCandidate(targetId));
    },
  };
}

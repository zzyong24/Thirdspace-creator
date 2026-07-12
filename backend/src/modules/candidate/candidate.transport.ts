import type { Endpoint, RequestContext, Transport } from "@creatoros/contract";
import {
  AuthenticationError,
  UnsupportedOperationError,
} from "./candidate.errors";
import type { CandidateService } from "./candidate.service";

// Candidate transport (foundation §5.4) — the module's 7 contract ops served over
// REAL SQL behind the same /api/v1/dispatch route. Mirrors the realized positioning/
// monetization transports: a `Transport` whose request(endpoint,input,ctx) switches
// on endpoint.id, threads ctx into the service, and returns the SPEC §14 envelope
// (list for the *.list ops, single-resource otherwise). A persisted op reached with
// NO ctx is an unauthenticated dispatch → AuthenticationError (→401). Ops this
// transport does not own throw UnsupportedOperationError so the composite never masks
// a real error.
//
// The opId list is the registry this module owns; persistence-client builds
// PERSISTED_OPS from CANDIDATE_OP_IDS (adding the module = registering it). NO AI
// submit_candidate/confirm op is duplicated here (C-3): AI-sourced candidates arrive
// via the service's createFromAIResult, not a contract op. AudienceSignal has NO
// write op here (C-4): writes ride Ingestion's intake (ingestAudienceSignal).

export const CANDIDATE_OP_IDS = [
  "candidates.list",
  "candidates.create",
  "candidates.get",
  "candidates.patch",
  "candidates.promote",
  "audienceSignals.list",
  "publications.comments.list",
  "audienceSignals.linkToCandidate",
  "topics.overview",
] as const;

type Input = { params?: unknown; query?: unknown; body?: unknown };

export function createCandidateTransport(
  serviceFactory: () => CandidateService,
): Transport {
  return {
    async request(endpoint: Endpoint, input, ctx) {
      if (!ctx) throw new AuthenticationError();
      const service = serviceFactory();
      const requestId = (ctx as RequestContext).requestId;
      const { params, query, body } = (input ?? {}) as Input;
      const p = (params ?? {}) as {
        candidateId?: string;
        signalId?: string;
        publicationId?: string;
      };

      switch (endpoint.id) {
        case "candidates.list": {
          const q = (query ?? {}) as {
            page?: number;
            pageSize?: number;
            status?: string;
            source?: string;
            // [T-216] guardrail = 防茧房推荐排序(service.listCandidates 路由到护栏排序)。
            sort?:
              | "predictedScore"
              | "positioningFit"
              | "demandCount"
              | "guardrail";
          };
          const page = q.page ?? 1;
          const pageSize = q.pageSize ?? 100;
          const { rows, total } = await service.listCandidates(ctx, {
            status: q.status,
            source: q.source,
            sort: q.sort,
            limit: pageSize,
            offset: (page - 1) * pageSize,
          });
          return { data: rows, meta: { requestId, page, pageSize, total } };
        }
        case "candidates.create": {
          const b = (body ?? {}) as {
            title: string;
            angle?: string;
            // [T-235c] favorites:收藏夹跟拍候选(contract candidateSource 同步扩枚举)。
            source?: "trend" | "benchmark" | "demand" | "idea" | "favorites";
            contentRole?: "traffic" | "trust" | "conversion";
            productAnchorId?: string;
          };
          const created = await service.createCandidate(ctx, {
            title: b.title,
            angle: b.angle ?? "",
            source: b.source ?? "idea", // 透传采纳侧来源(T-149);缺省仍 idea(手动新建)。
            contentRole: b.contentRole ?? null,
            productAnchorId: b.productAnchorId ?? null,
          });
          return { data: created, meta: { requestId } };
        }
        case "candidates.get": {
          const got = await service.getCandidate(ctx, p.candidateId ?? "");
          return { data: got, meta: { requestId } };
        }
        case "candidates.patch": {
          const b = (body ?? {}) as {
            title?: string;
            angle?: string;
            contentRole?: "traffic" | "trust" | "conversion";
            productAnchorId?: string;
            status?: "pool" | "dropped";
            card?: Record<string, unknown>;
            dropReason?: string;
          };
          const patched = await service.patchCandidate(ctx, p.candidateId ?? "", {
            title: b.title,
            angle: b.angle,
            contentRole: b.contentRole,
            productAnchorId: b.productAnchorId,
            status: b.status,
            // 选题卡可编辑 — the partial card is sanitized in the service before merge.
            card: b.card,
            // [T-212d] 淘汰原因(蒸馏偏好信号原料)。
            dropReason: b.dropReason,
          });
          return { data: patched, meta: { requestId } };
        }
        case "candidates.promote": {
          const promo = await service.promote(ctx, p.candidateId ?? "");
          return { data: promo, meta: { requestId } };
        }
        case "audienceSignals.list": {
          const q = (query ?? {}) as {
            page?: number;
            pageSize?: number;
            source?: string;
            demandTag?: string;
            linkedCandidateId?: string;
          };
          const page = q.page ?? 1;
          const pageSize = q.pageSize ?? 100;
          const { rows, total } = await service.listSignals(ctx, {
            source: q.source,
            demandTag: q.demandTag,
            linkedCandidateId: q.linkedCandidateId,
            limit: pageSize,
            offset: (page - 1) * pageSize,
          });
          return { data: rows, meta: { requestId, page, pageSize, total } };
        }
        case "publications.comments.list": {
          // 复盘每作品评论 (T-030 D6) — 前 limit 条 (默认 100), user-scoped list envelope.
          const q = (query ?? {}) as { limit?: number };
          const limit = q.limit ?? 100;
          const rows = await service.listCommentsForPublication(
            ctx,
            p.publicationId ?? "",
            limit,
          );
          return {
            data: rows,
            meta: { requestId, page: 1, pageSize: limit, total: rows.length },
          };
        }
        case "audienceSignals.linkToCandidate": {
          const b = (body ?? {}) as { candidateId?: string };
          const candidate = await service.linkSignalToCandidate(
            ctx,
            p.signalId ?? "",
            b.candidateId,
          );
          return { data: candidate, meta: { requestId } };
        }
        case "topics.overview": {
          const overview = await service.getTopicsOverview(ctx);
          return { data: overview, meta: { requestId } };
        }
        default:
          throw new UnsupportedOperationError(endpoint.id);
      }
    },
  };
}

import type { Endpoint, RequestContext, Transport } from "@creatoros/contract";
import {
  AuthenticationError,
  OwnershipError,
  UnsupportedOperationError,
} from "./positioning.errors";
import type { PositioningService } from "./positioning.service";

// Positioning transport (foundation §5.4) — the module's 9 contract ops served over
// REAL SQL behind the same /api/v1/dispatch route. Mirrors the realized learnings
// transport: a `Transport` whose request(endpoint,input,ctx) switches on
// endpoint.id, threads ctx into the service, and returns the SPEC §14 envelope
// (list for statements.list, single-resource otherwise). A persisted op reached
// with NO ctx is an unauthenticated dispatch → AuthenticationError (→401). Ops this
// transport does not own throw UnsupportedOperationError so the composite never
// masks a real error.
//
// The opId list is the registry this module owns; persistence-client builds
// PERSISTED_OPS from POSITIONING_OP_IDS (adding the module = registering it).
//
// `positioning.profile.get` returns the profile or 404 if none — the FE 定位中心
// page reads via pages.positioning.get (empty-state safe) instead; the bare
// profile.get is the contract op (nullable-or-404 per the table). Here we map a
// null profile to an OwnershipError-equivalent 404 by returning the contract DTO
// only when present; the service.getProfile returns null, so we throw via the
// shared OwnershipError to surface 404 (cross-tenant-safe, never reveals existence).

export const POSITIONING_OP_IDS = [
  "positioning.discovery.start",
  "positioning.discovery.answer.update",
  "positioning.discovery.research",
  "positioning.discovery.evidence.set",
  "positioning.discovery.confirm",
  "positioning.profile.get",
  "positioning.profile.upsert",
  "positioning.master.reset",
  "positioning.master.restore",
  "positioning.statements.list",
  "positioning.statements.create",
  "positioning.statements.get",
  "positioning.gate.evaluate",
  "pages.positioning.get",
] as const;

type Input = { params?: unknown; query?: unknown; body?: unknown };

export function createPositioningTransport(
  serviceFactory: () => PositioningService,
): Transport {
  return {
    async request(endpoint: Endpoint, input, ctx) {
      if (!ctx) throw new AuthenticationError();
      const service = serviceFactory();
      const requestId = (ctx as RequestContext).requestId;
      const { params, query, body } = (input ?? {}) as Input;
      const p = (params ?? {}) as {
        statementId?: string;
        sessionId?: string;
        evidenceId?: string;
      };

      switch (endpoint.id) {
        case "positioning.discovery.start": {
          const b = (body ?? {}) as {
            sourceMode: "optimize" | "pivot" | "scratch";
          };
          return {
            data: await service.startDiscovery(ctx, b.sourceMode),
            meta: { requestId },
          };
        }
        case "positioning.discovery.answer.update": {
          const b = (body ?? {}) as {
            themeId: "goal" | "strength" | "audience" | "need" | "proof" | "expression";
            selectedOptionIds?: string[];
            customText?: string;
            skipped?: boolean;
            expectedRevision: number;
          };
          return {
            data: await service.updateDiscoveryAnswer(ctx, {
              sessionId: p.sessionId ?? "",
              themeId: b.themeId,
              selectedOptionIds: b.selectedOptionIds ?? [],
              customText: b.customText ?? "",
              skipped: b.skipped ?? false,
              expectedRevision: b.expectedRevision,
            }),
            meta: { requestId },
          };
        }
        case "positioning.discovery.research": {
          const b = (body ?? {}) as {
            query: string;
            purpose: string;
            targetThemeId: "goal" | "strength" | "audience" | "need" | "proof" | "expression";
            market?: "cn" | "global";
            language?: "zh-CN" | "any";
            expectedRevision: number;
          };
          return {
            data: await service.researchDiscovery(ctx, {
              sessionId: p.sessionId ?? "",
              ...b,
              market: b.market ?? "cn",
              language: b.language ?? "zh-CN",
            }),
            meta: { requestId },
          };
        }
        case "positioning.discovery.evidence.set": {
          const b = (body ?? {}) as {
            adopted: boolean;
            expectedRevision: number;
          };
          return {
            data: await service.setDiscoveryEvidence(ctx, {
              sessionId: p.sessionId ?? "",
              evidenceId: p.evidenceId ?? "",
              ...b,
            }),
            meta: { requestId },
          };
        }
        case "positioning.discovery.confirm": {
          const b = (body ?? {}) as {
            candidateId: string;
            candidateRevision: number;
            expectedCurrentStatementId: string | null;
            idempotencyKey: string;
            proposal: Parameters<PositioningService["confirmDiscovery"]>[1]["proposal"];
          };
          return {
            data: await service.confirmDiscovery(ctx, {
              sessionId: p.sessionId ?? "",
              ...b,
            }),
            meta: { requestId },
          };
        }
        case "positioning.profile.get": {
          const profile = await service.getProfile(ctx);
          if (!profile) {
            // Nullable-or-404 (contract table). No profile → 404 (cross-tenant
            // -safe). The FE page reads pages.positioning.get (empty-state safe).
            throw new OwnershipError("OwnershipError: no creator profile");
          }
          return { data: profile, meta: { requestId } };
        }
        case "positioning.profile.upsert": {
          const b = (body ?? {}) as {
            persona?: string;
            field?: string;
            audience?: string;
            differentiation?: string;
            capabilities?: string[];
            facets?: Record<string, string>;
            downstreamRules?: Record<string, string>;
          };
          const profile = await service.upsertProfile(ctx, {
            persona: b.persona ?? "",
            field: b.field ?? "",
            audience: b.audience ?? "",
            differentiation: b.differentiation ?? "",
            capabilities: b.capabilities ?? [],
            // facets/rules are optional (defaulted in the contract body); the service
            // normalizes a partial/absent object to the full key set.
            facets: b.facets,
            downstreamRules: b.downstreamRules,
          });
          return { data: profile, meta: { requestId } };
        }
        case "positioning.master.reset": {
          const profile = await service.resetMaster(ctx);
          return { data: profile, meta: { requestId } };
        }
        case "positioning.master.restore": {
          const b = (body ?? {}) as { statementId?: string };
          const restored = await service.restoreMaster(
            ctx,
            b.statementId ?? "",
          );
          return { data: restored, meta: { requestId } };
        }
        case "positioning.statements.list": {
          const q = (query ?? {}) as { page?: number; pageSize?: number };
          const page = q.page ?? 1;
          const pageSize = q.pageSize ?? 20;
          const { rows, total } = await service.listStatements(ctx, {
            limit: pageSize,
            offset: (page - 1) * pageSize,
          });
          return { data: rows, meta: { requestId, page, pageSize, total } };
        }
        case "positioning.statements.create": {
          const b = (body ?? {}) as {
            oneLiner: string;
            keywords: string[];
            productAnchorIds?: string[];
            changeReason?: string;
          };
          const statement = await service.createStatementVersion(ctx, {
            oneLiner: b.oneLiner,
            keywords: b.keywords,
            productAnchorIds: b.productAnchorIds ?? [],
            // [T-231⑥] 修改原因透传(缺省 "" —— 契约 body 已 default)。
            changeReason: b.changeReason ?? "",
          });
          return { data: statement, meta: { requestId } };
        }
        case "positioning.statements.get": {
          const statement = await service.getStatement(
            ctx,
            p.statementId ?? "",
          );
          return { data: statement, meta: { requestId } };
        }
        case "positioning.gate.evaluate": {
          const b = (body ?? {}) as {
            subjectType: "candidate" | "project";
            subjectId: string;
            statementId?: string;
          };
          const result = await service.evaluateGate(ctx, b);
          return { data: result, meta: { requestId } };
        }
        case "pages.positioning.get": {
          const center = await service.getPositioningCenter(ctx);
          return { data: center, meta: { requestId } };
        }
        default:
          throw new UnsupportedOperationError(endpoint.id);
      }
    },
  };
}

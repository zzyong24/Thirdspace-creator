import type { Endpoint, RequestContext, Transport } from "@creatoros/contract";
import {
  AuthenticationError,
  UnsupportedOperationError,
} from "./scheduling.errors";
import type { SchedulingService } from "./scheduling.service";

// Scheduling transport (foundation §5.4) — the module's 7 contract ops (scheduled_job
// CRUD + job_run reads) served over REAL SQL behind the same /api/v1/dispatch route.
// Mirrors the candidate/projects transports: a `Transport` whose request(endpoint,input,
// ctx) switches on endpoint.id, threads ctx into the service, and returns the SPEC §14
// envelope (list for the *.list ops, single-resource otherwise). A persisted op reached
// with NO ctx is an unauthenticated dispatch → AuthenticationError (→401). Ops this
// transport does not own throw UnsupportedOperationError so the composite never masks a
// real error.
//
// The opId list is the registry this module owns; persistence-client builds PERSISTED_OPS
// from SCHEDULING_OP_IDS (adding the module = registering it). job_run has NO write op
// here (D1): runs are created/回填 by the scheduler (D3) / 「立即运行」 (D5) via the
// service's createRun/updateRun, not a contract op — the wire only reads runs.

export const SCHEDULING_OP_IDS = [
  "scheduledJobs.create",
  "scheduledJobs.list",
  "scheduledJobs.get",
  "scheduledJobs.update",
  "scheduledJobs.setEnabled",
  "jobRuns.listByJob",
  "jobRuns.get",
] as const;

type Input = { params?: unknown; query?: unknown; body?: unknown };

export function createSchedulingTransport(
  serviceFactory: () => SchedulingService,
): Transport {
  return {
    async request(endpoint: Endpoint, input, ctx) {
      if (!ctx) throw new AuthenticationError();
      const service = serviceFactory();
      const requestId = (ctx as RequestContext).requestId;
      const { params, query, body } = (input ?? {}) as Input;
      const p = (params ?? {}) as { jobId?: string; runId?: string };

      switch (endpoint.id) {
        case "scheduledJobs.create": {
          const b = (body ?? {}) as {
            name: string;
            prompt?: string;
            sourceKind: string;
            target?: Record<string, unknown>;
            schedule: string;
            toolGrants?: unknown[];
          };
          const created = await service.createJob(ctx, {
            name: b.name,
            prompt: b.prompt ?? "",
            sourceKind: b.sourceKind,
            target: b.target ?? {},
            schedule: b.schedule,
            toolGrants: b.toolGrants ?? [],
          });
          return { data: created, meta: { requestId } };
        }
        case "scheduledJobs.list": {
          const q = (query ?? {}) as {
            page?: number;
            pageSize?: number;
            sourceKind?: string;
            enabled?: boolean;
          };
          const page = q.page ?? 1;
          const pageSize = q.pageSize ?? 100;
          const { rows, total } = await service.listJobs(ctx, {
            sourceKind: q.sourceKind,
            enabled: q.enabled,
            limit: pageSize,
            offset: (page - 1) * pageSize,
          });
          return { data: rows, meta: { requestId, page, pageSize, total } };
        }
        case "scheduledJobs.get": {
          const got = await service.getJob(ctx, p.jobId ?? "");
          return { data: got, meta: { requestId } };
        }
        case "scheduledJobs.update": {
          const b = (body ?? {}) as {
            name?: string;
            prompt?: string;
            schedule?: string;
            target?: Record<string, unknown>;
            toolGrants?: unknown[];
            enabled?: boolean;
          };
          const updated = await service.updateJob(ctx, p.jobId ?? "", {
            name: b.name,
            prompt: b.prompt,
            schedule: b.schedule,
            target: b.target,
            toolGrants: b.toolGrants,
            enabled: b.enabled,
          });
          return { data: updated, meta: { requestId } };
        }
        case "scheduledJobs.setEnabled": {
          const b = (body ?? {}) as { enabled: boolean };
          const updated = await service.setEnabled(ctx, p.jobId ?? "", b.enabled);
          return { data: updated, meta: { requestId } };
        }
        case "jobRuns.listByJob": {
          const q = (query ?? {}) as { page?: number; pageSize?: number };
          const page = q.page ?? 1;
          const pageSize = q.pageSize ?? 100;
          const { rows, total } = await service.listRunsByJob(ctx, p.jobId ?? "", {
            limit: pageSize,
            offset: (page - 1) * pageSize,
          });
          return { data: rows, meta: { requestId, page, pageSize, total } };
        }
        case "jobRuns.get": {
          const got = await service.getRun(ctx, p.runId ?? "");
          return { data: got, meta: { requestId } };
        }
        default:
          throw new UnsupportedOperationError(endpoint.id);
      }
    },
  };
}

import { createHash } from "node:crypto";
import { sql, type Db } from "@creatoros/backend";
import { createPersistentTaskService } from "@creatoros/backend/modules/execution";
import type { RequestContext } from "@creatoros/contract";
import type { ObservabilityCollector } from "./collector";
export type AttemptObservation = {
  taskId: string;
  userId: string;
  attempt: number;
  createdAt: string;
  startedAt: string;
};
export type SettlementObservation = {
  taskId: string;
  userId: string;
  attempt: number;
  kind: string;
  status: string;
  occurredAt: string;
};
// SEMANTIC_BOUNDARY_ALLOW: 原正式状态的固定协议投影，不读取call正文或推测模型/业务语义。
const taskResults: Record<
  string,
  "success" | "failed" | "partial" | "cancelled" | "unknown"
> = {
  succeeded: "success",
  failed: "failed",
  partial: "partial",
  cancelled: "cancelled",
  unknown_result: "unknown",
};
const attemptResults: Record<string, string> = {
  succeeded: "success",
  failed: "failed",
  retry_wait: "failed",
  cancelled: "cancelled",
  unknown_result: "unknown",
  partial: "partial",
};
export function createObservabilityTaskLedger(
  db: Db,
  collector: ObservabilityCollector,
  source = createPersistentTaskService(db),
) {
  const api = {
    async observeAttempt(event: AttemptObservation) {
      await db.execute(
        sql`INSERT INTO observability_attempt_clocks(task_id,attempt,user_id,created_at,started_at) SELECT ${event.taskId},${event.attempt},${event.userId},${event.createdAt},${event.startedAt} WHERE EXISTS(SELECT 1 FROM observability_consents WHERE user_id=${event.userId} AND metrics_enabled=TRUE) ON CONFLICT(task_id,attempt) DO NOTHING`,
      );
    },
    async observeSettlement(event: SettlementObservation) {
      const result = attemptResults[event.status];
      if (!result) return;
      await db.execute(
        sql`UPDATE observability_attempt_clocks SET finished_at=${event.occurredAt},was_unknown=was_unknown OR COALESCE(result='unknown',FALSE) OR ${result}='unknown',result=${result},kind=${event.kind},reported=FALSE WHERE task_id=${event.taskId} AND user_id=${event.userId} AND attempt=${event.attempt} AND (finished_at IS NULL OR (result='unknown' AND ${result}<>'unknown'))`,
      );
    },
    isBusy: (ctx: RequestContext) => source.hasActiveTasks(ctx),
    async sweep(ctx: RequestContext) {
      if (!(await collector.status(ctx)).metricsEnabled) return 0;
      const saved = (
        await db.execute(
          sql`SELECT updated_at,task_id FROM observability_task_cursor WHERE user_id=${ctx.userId}`,
        )
      ).rows[0] as { updated_at: string; task_id: string } | undefined;
      const consent = (
        await db.execute(
          sql`SELECT changed_at,metrics_granted_at FROM observability_consents WHERE user_id=${ctx.userId}`,
        )
      ).rows[0] as { changed_at: string; metrics_granted_at: string | null };
      const grantAt = consent.metrics_granted_at ?? consent.changed_at;
      const cursor = {
        updatedAt:
          saved && Date.parse(saved.updated_at) >= Date.parse(grantAt)
            ? saved.updated_at
            : grantAt,
        taskId:
          saved && Date.parse(saved.updated_at) >= Date.parse(grantAt)
            ? saved.task_id
            : "",
      };
      const rows = await source.readObservabilityLedger(ctx, cursor);
      for (const row of rows) {
        await api.observeSettlement({
          taskId: row.id,
          userId: row.user_id,
          attempt: row.attempt,
          kind: row.kind,
          status: row.status,
          occurredAt: row.updated_at,
        });
        const result = taskResults[row.status];
        if (result) {
          const eventId = createHash("sha256")
            .update(
              `task:${row.id}:${row.attempt}:${row.status}:${row.updated_at}`,
            )
            .digest("hex");
          await collector.recordOutcome(ctx, {
            eventId,
            operationId: `task.${row.kind}`,
            measurement: "task",
            result,
            occurredAt: row.updated_at,
          });
        }
        await db.execute(
          sql`INSERT INTO observability_task_cursor(user_id,updated_at,task_id) VALUES(${ctx.userId},${row.updated_at},${row.id}) ON CONFLICT(user_id) DO UPDATE SET updated_at=excluded.updated_at,task_id=excluded.task_id`,
        );
      }
      // 每个原attempt只结算一次；统计按结算原发生窗口，不把call当attempt或重算历史。
      const attempts = (
        await db.execute(
          sql`SELECT task_id,attempt,kind,created_at,started_at,finished_at,result,was_unknown FROM observability_attempt_clocks WHERE user_id=${ctx.userId} AND finished_at IS NOT NULL AND reported=FALSE AND started_at>=${grantAt} ORDER BY finished_at,task_id,attempt LIMIT 200`,
        )
      ).rows as Array<{
        task_id: string;
        attempt: number;
        kind: string;
        created_at: string;
        started_at: string;
        finished_at: string;
        result: "success" | "failed" | "partial" | "cancelled" | "unknown";
        was_unknown: boolean;
      }>;
      for (const attempt of attempts) {
        const eventId = createHash("sha256")
          .update(
            `attempt:${attempt.task_id}:${attempt.attempt}:${attempt.result}`,
          )
          .digest("hex");
        await collector.recordOutcome(ctx, {
          eventId,
          measurement: "task",
          operationId: `task.${attempt.kind}`,
          result: attempt.result,
          count: 0,
          occurredAt: attempt.finished_at,
          attemptSuccess: attempt.result === "success" ? 1 : 0,
          attemptFailed: attempt.result === "failed" ? 1 : 0,
          attemptCancelled: attempt.result === "cancelled" ? 1 : 0,
          queueSeconds:
            attempt.attempt === 1 &&
            (!attempt.was_unknown || attempt.result === "unknown")
              ? (Date.parse(attempt.started_at) -
                  Date.parse(attempt.created_at)) /
                1000
              : null,
          executionSeconds: attempt.was_unknown
            ? null
            : (Date.parse(attempt.finished_at) -
                Date.parse(attempt.started_at)) /
              1000,
        });
        await db.execute(
          sql`UPDATE observability_attempt_clocks SET reported=TRUE WHERE task_id=${attempt.task_id} AND attempt=${attempt.attempt}`,
        );
      }
      return rows.length + attempts.length;
    },
  };
  return api;
}

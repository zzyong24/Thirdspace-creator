import { randomUUID, createHash } from "node:crypto";
import { sql, type Db } from "@creatoros/backend";
import {
  DEFAULT_OBSERVABILITY_CONFIG,
  observabilityConfig,
  observabilityBatch,
  exceptionCapture,
  logReportingConsent,
  REQUEST_OPERATION_IDS,
  TASK_OPERATION_IDS,
  DURATION_BOUNDS,
  type RequestContext,
  type ObservabilityConfig,
  type ObservabilityOperation,
  type ExceptionCapture,
} from "@creatoros/contract";
export type Outcome = {
  eventId: string;
  operationId: string;
  measurement: "request" | "task";
  result: ObservabilityOperation["result"];
  occurredAt: string;
  attemptSuccess?: number;
  attemptFailed?: number;
  attemptCancelled?: number;
  queueSeconds?: number | null;
  executionSeconds?: number | null;
  count?: number;
};
type Ports = {
  now: () => string;
  uploadAvailable: () => boolean;
  writeEncryptedContext: (event: ExceptionCapture) => void;
  logSessionId?: () => Promise<string | null>;
  onRevoke?: () => void;
};
type Installation = {
  installation_alias: string;
  last_attempt_at: string | null;
  changed_at: string | null;
  last_uploaded_at: string | null;
  last_receipt_id: string | null;
  last_error_code: string | null;
  config: ObservabilityConfig | null;
  sequence: number;
  last_data_kind: string | null;
};
type Consent = {
  log_enabled: boolean;
  metrics_enabled: boolean;
  consent_version: number;
  changed_at: string;
  metrics_granted_at: string | null;
};
const hash = (text: string) => createHash("sha256").update(text).digest("hex");
function duration(seconds: number | null | undefined) {
  if (
    seconds == null ||
    !Number.isFinite(seconds) ||
    seconds < 0 ||
    seconds > 86400
  )
    return null;
  const buckets = Array(13).fill(0);
  const index = DURATION_BOUNDS.findIndex((b) => seconds <= b);
  buckets[index < 0 ? 12 : index] = 1;
  return { buckets, count: 1, sumSeconds: seconds };
}
export function createObservabilityCollector(db: Db, ports: Ports) {
  const bootId = randomUUID();
  const firstContexts = new Set<string>();
  const init = async () => {
    await db.execute(
      sql`INSERT INTO observability_installation(id,installation_alias) VALUES('installation',${randomUUID()}) ON CONFLICT(id) DO NOTHING`,
    );
  };
  const installation = async () => {
    await init();
    return (
      await db.execute(
        sql`SELECT * FROM observability_installation WHERE id='installation'`,
      )
    ).rows[0] as Installation;
  };
  const consent = async (ctx: RequestContext) =>
    (
      await db.execute(
        sql`SELECT * FROM observability_consents WHERE user_id=${ctx.userId}`,
      )
    ).rows[0] as Consent | undefined;
  const effective = (saved: ObservabilityConfig | null) => {
    const checked = observabilityConfig.safeParse(saved);
    if (!checked.success) return { ...DEFAULT_OBSERVABILITY_CONFIG };
    if (Date.parse(checked.data.expiresAt) <= Date.parse(ports.now()))
      return {
        ...DEFAULT_OBSERVABILITY_CONFIG,
        enabled: checked.data.enabled,
        reportIntervalHours: Math.max(24, checked.data.reportIntervalHours),
        revision: checked.data.revision,
      };
    const config = checked.data;
    return config.captureLevel === "debug" &&
      Date.parse(config.debugExpiresAt!) <= Date.parse(ports.now())
      ? { ...config, captureLevel: "error" as const }
      : config;
  };
  const prune = async () => {
    const expired = (
      await db.execute(
        sql`SELECT snapshot_sha256,user_id FROM observability_log_pending WHERE created_at<${new Date(Date.parse(ports.now()) - 30 * 86400000).toISOString()} LIMIT 64`,
      )
    ).rows;
    for (const row of expired)
      await api.dropPendingLog(
        {
          userId: row.user_id as string,
          requestId: "observability-prune",
          source: "ingestion",
        },
        row.snapshot_sha256 as string,
        "LOG_PENDING_EXPIRED",
      );
    const before = new Date(
      Date.parse(ports.now()) - 90 * 86400000,
    ).toISOString();
    await db.execute(
      sql`DELETE FROM observability_exception_seen WHERE seen_at<${before}`,
    );
    await db.execute(
      sql`DELETE FROM observability_events WHERE occurred_at<${before}`,
    );
    await db.execute(
      sql`DELETE FROM observability_outbox WHERE created_at<${before}`,
    );
    await db.execute(
      sql`DELETE FROM observability_attempt_clocks WHERE started_at<${before}`,
    );
    await db.execute(
      sql`DELETE FROM observability_log_receipts WHERE received_at<${before}`,
    );
  };
  const insert = async (
    ctx: RequestContext,
    id: string,
    at: string,
    kind: string,
    payload: object,
  ) => {
    await db.execute(
      sql`INSERT INTO observability_events(id,user_id,occurred_at,kind,payload) SELECT ${id},${ctx.userId},${at},${kind},${JSON.stringify(payload)}::jsonb WHERE EXISTS(SELECT 1 FROM observability_consents WHERE user_id=${ctx.userId} AND metrics_enabled=TRUE AND consent_version=2) ON CONFLICT(id) DO NOTHING`,
    );
  };
  const api = {
    async status(ctx: RequestContext) {
      const [state, grant, count] = await Promise.all([
        installation(),
        consent(ctx),
        db.execute(
          sql`SELECT count(*)::integer AS n FROM observability_events WHERE user_id=${ctx.userId}`,
        ),
      ]);
      const config = effective(state.config);
      return {
        consentVersion: 2 as const,
        enabled: !!grant?.log_enabled && grant.consent_version === 2,
        metricsEnabled: !!grant?.metrics_enabled && grant.consent_version === 2,
        installationAlias: state.installation_alias,
        changedAt: grant?.changed_at ?? null,
        lastAttemptAt: state.last_attempt_at,
        nextAttemptAt: state.last_attempt_at
          ? new Date(
              Date.parse(state.last_attempt_at) +
                config.reportIntervalHours * 3600000,
            ).toISOString()
          : null,
        lastUploadedAt: state.last_uploaded_at,
        lastReceiptId: state.last_receipt_id,
        pendingCount: Number(count.rows[0]?.n ?? 0),
        lastErrorCode: state.last_error_code,
        uploadAvailable: ports.uploadAvailable(),
        remotePaused: !config.enabled,
      };
    },
    async setConsent(ctx: RequestContext, input: unknown) {
      const value = logReportingConsent.parse(input);
      await init();
      if (value.enabled && !ports.uploadAvailable())
        throw Error("LOG_SOURCE_UNAVAILABLE");
      const stamp = ports.now();
      await db.transaction(async (tx) => {
        await tx.execute(
          sql`INSERT INTO observability_consents(user_id,log_enabled,metrics_enabled,consent_version,changed_at,metrics_granted_at) VALUES(${ctx.userId},${value.enabled},${value.metricsEnabled},2,${stamp},${value.metricsEnabled ? stamp : null}) ON CONFLICT(user_id) DO UPDATE SET log_enabled=excluded.log_enabled,metrics_granted_at=CASE WHEN observability_consents.metrics_enabled=TRUE AND excluded.metrics_enabled=TRUE THEN observability_consents.metrics_granted_at ELSE excluded.metrics_granted_at END,metrics_enabled=excluded.metrics_enabled,consent_version=2,changed_at=excluded.changed_at`,
        );
        await tx.execute(
          sql`UPDATE observability_installation SET last_attempt_at=COALESCE(last_attempt_at,${stamp}) WHERE id='installation'`,
        );
        if (!value.enabled)
          await tx.execute(
            sql`DELETE FROM observability_log_pending WHERE user_id=${ctx.userId}`,
          );
        if (!value.metricsEnabled) {
          await tx.execute(
            sql`DELETE FROM observability_outbox WHERE user_id=${ctx.userId}`,
          );
          await tx.execute(
            sql`DELETE FROM observability_events WHERE user_id=${ctx.userId}`,
          );
        }
      });
      if (!value.enabled || !value.metricsEnabled) ports.onRevoke?.();
      return api.status(ctx);
    },
    async claimRound(ctx: RequestContext) {
      const state = await installation();
      const config = effective(state.config);
      const stamp = ports.now();
      const threshold = new Date(
        Date.parse(stamp) - Math.max(24, config.reportIntervalHours) * 3600000,
      ).toISOString();
      const result = await db.execute(
        sql`UPDATE observability_installation SET last_attempt_at=${stamp},sequence=sequence+1 WHERE id='installation' AND last_attempt_at IS NOT NULL AND last_attempt_at<=${threshold} AND EXISTS(SELECT 1 FROM observability_consents WHERE user_id=${ctx.userId} AND consent_version=2 AND (log_enabled=TRUE OR metrics_enabled=TRUE)) RETURNING installation_alias,sequence`,
      );
      if (!result.rows.length) return null;
      return {
        installationAlias: state.installation_alias,
        config,
        sequence: Number(result.rows[0]!.sequence),
        preferLogs: state.last_data_kind === "metrics",
      };
    },
    async saveConfig(input: unknown) {
      const value = observabilityConfig.parse(input);
      const state = await installation();
      if (
        value.revision < (state.config?.revision ?? 0) ||
        Date.parse(value.expiresAt) <= Date.parse(ports.now())
      )
        throw Error("OBSERVABILITY_CONFIG_STALE");
      await db.execute(
        sql`UPDATE observability_installation SET config=${JSON.stringify(value)}::jsonb WHERE id='installation'`,
      );
      return effective(value);
    },
    async recordOutcome(ctx: RequestContext, input: Outcome) {
      input = {
        ...input,
        occurredAt: new Date(Date.parse(input.occurredAt)).toISOString(),
      };
      const grant = await consent(ctx);
      if (!grant?.metrics_enabled || grant.consent_version !== 2) return;
      const ids =
        input.measurement === "task"
          ? TASK_OPERATION_IDS
          : REQUEST_OPERATION_IDS;
      const operationId = ids.includes(input.operationId as never)
        ? input.operationId
        : "unclassified";
      const payload: ObservabilityOperation = {
        measurement: input.measurement,
        operationId,
        result: input.result,
        count: input.count ?? 1,
        attemptSuccess: input.attemptSuccess ?? 0,
        attemptFailed: input.attemptFailed ?? 0,
        attemptCancelled: input.attemptCancelled ?? 0,
        queueDuration: duration(input.queueSeconds),
        executionDuration: duration(input.executionSeconds),
      };
      if (input.measurement === "request") {
        await init();
        await db.transaction(async (tx) => {
          const state = (
            await tx.execute(
              sql`SELECT sequence FROM observability_installation WHERE id='installation' FOR UPDATE`,
            )
          ).rows[0] as { sequence: number };
          const id = hash(
            `request:${ctx.userId}:${state.sequence}:${input.occurredAt.slice(0, 16)}:${operationId}:${input.result}`,
          );
          const prior = (
            await tx.execute(
              sql`SELECT payload FROM observability_events WHERE id=${id} AND batch_id IS NULL FOR UPDATE`,
            )
          ).rows[0] as { payload: ObservabilityOperation } | undefined;
          if (prior) {
            const saved = prior.payload;
            saved.count++;
            saved.attemptSuccess += payload.attemptSuccess;
            saved.attemptFailed += payload.attemptFailed;
            saved.attemptCancelled += payload.attemptCancelled;
            for (const field of [
              "queueDuration",
              "executionDuration",
            ] as const) {
              const value = payload[field];
              if (!value) continue;
              if (!saved[field]) saved[field] = value;
              else {
                saved[field]!.count += value.count;
                saved[field]!.sumSeconds += value.sumSeconds;
                value.buckets.forEach(
                  (n, i) =>
                    (saved[field]!.buckets[i] =
                      (saved[field]!.buckets[i] ?? 0) + n),
                );
              }
            }
            await tx.execute(
              sql`UPDATE observability_events SET payload=${JSON.stringify(saved)}::jsonb WHERE id=${id}`,
            );
          } else
            await tx.execute(
              sql`INSERT INTO observability_events(id,user_id,occurred_at,kind,payload) SELECT ${id},${ctx.userId},${input.occurredAt},'operation',${JSON.stringify(payload)}::jsonb WHERE EXISTS(SELECT 1 FROM observability_consents WHERE user_id=${ctx.userId} AND metrics_enabled=TRUE AND consent_version=2) ON CONFLICT(id) DO NOTHING`,
            );
        });
      } else
        await insert(
          ctx,
          input.eventId,
          input.occurredAt,
          "operation",
          payload,
        );
    },
    async recordException(ctx: RequestContext, input: unknown) {
      const parsedEvent = exceptionCapture.parse(input);
      const event = {
        ...parsedEvent,
        occurredAt: new Date(Date.parse(parsedEvent.occurredAt)).toISOString(),
      };
      const grant = await consent(ctx);
      if (
        !grant ||
        grant.consent_version !== 2 ||
        (!grant.log_enabled && !grant.metrics_enabled)
      )
        return false;
      const config = effective((await installation()).config);
      if (!config.scopeModules.includes(event.module)) return false;
      // 首次事件确定性保留现场；重复eventId不再次写入，计数永不采样。
      const prior = await db.execute(
        sql`SELECT event_id FROM observability_exception_seen WHERE event_id=${event.eventId}`,
      );
      if (prior.rows.length) return false;
      // SEMANTIC_BOUNDARY_ALLOW: 仅按原栈精确hash与60秒桶去重代表现场，不归类异常语义。
      const contextKey = `${config.revision}:${event.module}:${event.code}:${hash(event.stack)}:${Math.floor(Date.parse(event.occurredAt) / 60000)}`;
      const first = !firstContexts.has(contextKey);
      const sampled =
        parseInt(hash(event.eventId).slice(0, 8), 16) / 0x100000000 <
        config.exceptionSampleRate;
      if (first || sampled) {
        firstContexts.add(contextKey);
        if (firstContexts.size > 1000)
          firstContexts.delete(firstContexts.values().next().value!);
        const maxStack =
          config.captureLevel === "debug"
            ? 24000
            : config.captureLevel === "info"
              ? 18000
              : config.captureLevel === "warn"
                ? 12000
                : 8000;
        try {
          ports.writeEncryptedContext({
            ...event,
            stack: event.stack.slice(0, maxStack),
          });
        } catch {
          /* 加密日志故障不改变业务异常 */
        }
      }
      const session = ports.logSessionId
        ? await ports.logSessionId().catch(() => null)
        : null;
      if (grant.metrics_enabled)
        await db.transaction(async (tx) => {
          const claimed = await tx.execute(
            sql`INSERT INTO observability_exception_seen(event_id,user_id,seen_at) SELECT ${event.eventId},${ctx.userId},${ports.now()} WHERE EXISTS(SELECT 1 FROM observability_consents WHERE user_id=${ctx.userId} AND metrics_enabled=TRUE AND consent_version=2) ON CONFLICT(event_id) DO NOTHING RETURNING event_id`,
          );
          if (claimed.rows.length)
            await tx.execute(
              sql`INSERT INTO observability_events(id,user_id,occurred_at,kind,payload) VALUES(${event.eventId},${ctx.userId},${event.occurredAt},'exception',${JSON.stringify({ eventId: event.eventId, code: event.code, module: event.module, occurredAt: event.occurredAt, count: 1, logSessionId: session, referenceId: event.referenceId })}::jsonb) ON CONFLICT(id) DO NOTHING`,
            );
        });
      else
        await db.execute(
          sql`INSERT INTO observability_exception_seen(event_id,user_id,seen_at) VALUES(${event.eventId},${ctx.userId},${ports.now()}) ON CONFLICT(event_id) DO NOTHING`,
        );
      return true;
    },
    async sealBatch(
      ctx: RequestContext,
      identity: { appVersion: string; osName: "macos" | "windows" | "linux" },
    ) {
      const batches = await api.sealBatches(ctx, identity, 1);
      return batches[0] ?? null;
    },
    async sealBatches(
      ctx: RequestContext,
      identity: { appVersion: string; osName: "macos" | "windows" | "linux" },
      maxBatches = 4,
      maxBodyBytes = 262144,
    ) {
      if (!(await consent(ctx))?.metrics_enabled) return [];
      await prune();
      return db.transaction(async (tx) => {
        await tx.execute(
          sql`SELECT id FROM observability_installation WHERE id='installation' FOR UPDATE`,
        );
        const batches = (
          await tx.execute(
            sql`SELECT batch_id,body,body_sha256 FROM observability_outbox WHERE user_id=${ctx.userId} ORDER BY created_at,batch_id LIMIT ${maxBatches}`,
          )
        ).rows.map((row) => ({
          batchId: row.batch_id as string,
          body: row.body as string,
          bodySha256: row.body_sha256 as string,
        }));
        while (batches.length < maxBatches) {
          const first = (
            await tx.execute(
              sql`SELECT occurred_at FROM observability_events WHERE user_id=${ctx.userId} AND batch_id IS NULL ORDER BY occurred_at,id LIMIT 1`,
            )
          ).rows[0] as { occurred_at: string } | undefined;
          if (!first) break;
          const day = first.occurred_at.slice(0, 10);
          const from = day + "T00:00:00.000Z";
          const until = new Date(Date.parse(from) + 86400000).toISOString();
          const durationFields = ["queueDuration", "executionDuration"]
            .flatMap((field) => [
              ...Array.from(
                { length: 13 },
                (_, i) =>
                  `SUM(COALESCE((payload->'${field}'->'buckets'->>${i})::numeric,0)) AS "${field}_${i}"`,
              ),
              `SUM(COALESCE((payload->'${field}'->>'count')::numeric,0)) AS "${field}_count"`,
              `SUM(COALESCE((payload->'${field}'->>'sumSeconds')::numeric,0)) AS "${field}_sum"`,
            ])
            .join(",");
          const groups = (
            await tx.execute(
              sql`SELECT payload->>'measurement' AS measurement,payload->>'operationId' AS operation_id,payload->>'result' AS result,min(occurred_at) AS first_at,max(occurred_at) AS last_at,sum((payload->>'count')::numeric) AS count,sum((payload->>'attemptSuccess')::numeric) AS attempt_success,sum((payload->>'attemptFailed')::numeric) AS attempt_failed,sum((payload->>'attemptCancelled')::numeric) AS attempt_cancelled,${sql.raw(durationFields)} FROM observability_events WHERE user_id=${ctx.userId} AND batch_id IS NULL AND kind='operation' AND occurred_at>=${from} AND occurred_at<${until} GROUP BY payload->>'measurement',payload->>'operationId',payload->>'result' ORDER BY min(occurred_at),payload->>'operationId',payload->>'result' LIMIT 100`,
            )
          ).rows;
          const errors = (
            await tx.execute(
              sql`SELECT id,occurred_at,payload FROM observability_events WHERE user_id=${ctx.userId} AND batch_id IS NULL AND kind='exception' AND occurred_at>=${from} AND occurred_at<${until} ORDER BY occurred_at,id LIMIT 100`,
            )
          ).rows;
          if (!groups.length && !errors.length) break;
          const duration = (row: Record<string, unknown>, field: string) =>
            Number(row[field + "_count"]) > 0
              ? {
                  buckets: Array.from({ length: 13 }, (_, i) =>
                    Number(row[field + "_" + i]),
                  ),
                  count: Number(row[field + "_count"]),
                  sumSeconds: Number(row[field + "_sum"]),
                }
              : null;
          const operations = groups.map((row) => ({
            measurement: row.measurement,
            operationId: row.operation_id,
            result: row.result,
            count: Number(row.count),
            attemptSuccess: Number(row.attempt_success),
            attemptFailed: Number(row.attempt_failed),
            attemptCancelled: Number(row.attempt_cancelled),
            queueDuration: duration(row, "queueDuration"),
            executionDuration: duration(row, "executionDuration"),
          }));
          const times = [
            ...groups.flatMap((row) => [
              row.first_at as string,
              row.last_at as string,
            ]),
            ...errors.map((row) => row.occurred_at as string),
          ].sort();
          const state = (
            await tx.execute(
              sql`SELECT * FROM observability_installation WHERE id='installation'`,
            )
          ).rows[0] as Installation;
          const batchId = randomUUID();
          const payload = observabilityBatch.parse({
            schemaVersion: "creatoros-observability-v1",
            batchId,
            installationAlias: state.installation_alias,
            bootId,
            sequence: state.sequence,
            windowStart: times[0],
            windowEnd: times[times.length - 1],
            configRevision: effective(state.config).revision,
            ...identity,
            operations,
            exceptions: errors.map((row) => row.payload),
          });
          let body = JSON.stringify(payload);
          while (Buffer.byteLength(body) > Math.min(262144, maxBodyBytes)) {
            if (payload.exceptions.length) payload.exceptions.pop();
            else if (payload.operations.length > 1) payload.operations.pop();
            else throw Error("OBSERVABILITY_BATCH_TOO_LARGE");
            body = JSON.stringify(payload);
          }
          const selectedGroups = groups.slice(0, payload.operations.length);
          const selectedErrors = errors.slice(0, payload.exceptions.length);
          const bodySha256 = hash(body);
          await tx.execute(
            sql`INSERT INTO observability_outbox(batch_id,user_id,body,body_sha256,created_at) VALUES(${batchId},${ctx.userId},${body},${bodySha256},${ports.now()})`,
          );
          for (const group of selectedGroups)
            await tx.execute(
              sql`UPDATE observability_events SET batch_id=${batchId} WHERE user_id=${ctx.userId} AND batch_id IS NULL AND kind='operation' AND occurred_at>=${from} AND occurred_at<${until} AND payload->>'measurement'=${group.measurement as string} AND payload->>'operationId'=${group.operation_id as string} AND payload->>'result'=${group.result as string}`,
            );
          for (const error of selectedErrors)
            await tx.execute(
              sql`UPDATE observability_events SET batch_id=${batchId} WHERE id=${error.id as string}`,
            );
          await tx.execute(
            sql`UPDATE observability_installation SET sequence=sequence+1 WHERE id='installation'`,
          );
          batches.push({ batchId, body, bodySha256 });
        }
        return batches;
      });
    },
    async acknowledgeBatch(
      ctx: RequestContext,
      batchId: string,
      sha256: string,
      receiptId: string,
    ) {
      await db.transaction(async (tx) => {
        const saved = await tx.execute(
          sql`DELETE FROM observability_outbox WHERE user_id=${ctx.userId} AND batch_id=${batchId} AND body_sha256=${sha256} RETURNING batch_id`,
        );
        if (!saved.rows.length) throw Error("OBSERVABILITY_RECEIPT_MISMATCH");
        await tx.execute(
          sql`DELETE FROM observability_events WHERE user_id=${ctx.userId} AND batch_id=${batchId}`,
        );
        await tx.execute(
          sql`UPDATE observability_installation SET last_uploaded_at=${ports.now()},last_receipt_id=${receiptId},last_data_kind='metrics',last_error_code=NULL WHERE id='installation'`,
        );
      });
    },
    async dropPendingLog(ctx: RequestContext, sha256: string, reason: string) {
      const config = effective((await installation()).config);
      await db.transaction(async (tx) => {
        const removed = await tx.execute(
          sql`DELETE FROM observability_log_pending WHERE user_id=${ctx.userId} AND snapshot_sha256=${sha256} RETURNING metadata`,
        );
        if (!removed.rows.length) return;
        await tx.execute(
          sql`UPDATE observability_installation SET dropped_log_count=dropped_log_count+1,last_error_code=${reason} WHERE id='installation'`,
        );
        if (!config.scopeModules.includes("collector")) return;
        const metadata = removed.rows[0]!.metadata as { sessionId: string };
        const eventId = hash(`log-discard:${sha256}`);
        await tx.execute(
          sql`INSERT INTO observability_events(id,user_id,occurred_at,kind,payload) SELECT ${eventId},${ctx.userId},${ports.now()},'exception',${JSON.stringify({ eventId, code: reason, module: "collector", occurredAt: ports.now(), count: 1, logSessionId: metadata.sessionId, referenceId: null })}::jsonb WHERE EXISTS(SELECT 1 FROM observability_consents WHERE user_id=${ctx.userId} AND metrics_enabled=TRUE AND consent_version=2) ON CONFLICT(id) DO NOTHING`,
        );
      });
    },
    async pendingLogs(ctx: RequestContext) {
      return (
        await db.execute(
          sql`SELECT metadata FROM observability_log_pending WHERE user_id=${ctx.userId} ORDER BY created_at,snapshot_sha256 LIMIT 64`,
        )
      ).rows.map(
        (row) =>
          row.metadata as {
            fileName: string;
            sessionId: string;
            sha256: string;
            byteLength: number;
            logDate: string;
          },
      );
    },
    async enqueueLog(
      ctx: RequestContext,
      metadata: {
        fileName: string;
        sessionId: string;
        sha256: string;
        byteLength: number;
        logDate: string;
      },
    ) {
      await db.execute(
        sql`INSERT INTO observability_log_pending(snapshot_sha256,user_id,metadata,created_at) VALUES(${metadata.sha256},${ctx.userId},${JSON.stringify(metadata)}::jsonb,${ports.now()}) ON CONFLICT(snapshot_sha256) DO NOTHING`,
      );
    },
    async wasLogAcknowledged(sha256: string) {
      return (
        (
          await db.execute(
            sql`SELECT snapshot_sha256 FROM observability_log_receipts WHERE snapshot_sha256=${sha256}`,
          )
        ).rows.length > 0
      );
    },
    async acknowledgeLog(sessionId: string, sha256: string, receiptId: string) {
      await db.transaction(async (tx) => {
        await tx.execute(
          sql`INSERT INTO observability_log_receipts(snapshot_sha256,session_id,receipt_id,received_at) VALUES(${sha256},${sessionId},${receiptId},${ports.now()}) ON CONFLICT(snapshot_sha256) DO NOTHING`,
        );
        await tx.execute(
          sql`DELETE FROM observability_log_pending WHERE snapshot_sha256=${sha256}`,
        );
        await tx.execute(
          sql`UPDATE observability_installation SET last_uploaded_at=${ports.now()},last_receipt_id=${receiptId},last_data_kind='log',last_error_code=NULL WHERE id='installation'`,
        );
      });
    },
    async recordNativeException(
      ctx: RequestContext,
      event: {
        eventId: string;
        code: string;
        occurredAt: string;
        logSessionId: string;
      },
    ) {
      event = {
        ...event,
        occurredAt: new Date(Date.parse(event.occurredAt)).toISOString(),
      };
      const grant = await consent(ctx);
      const module = event.code === "NODE_UNCAUGHT_EXCEPTION" ? "backend" : "host";
      const config = effective((await installation()).config);
      if (
        !grant?.metrics_enabled || grant.consent_version !== 2 ||
        !config.scopeModules.includes(module) ||
        Date.parse(event.occurredAt) <
          Date.parse(grant.metrics_granted_at ?? grant.changed_at)
      )
        return false;
      return db.transaction(async (tx) => {
        const claimed = await tx.execute(
          sql`INSERT INTO observability_exception_seen(event_id,user_id,seen_at) SELECT ${event.eventId},${ctx.userId},${ports.now()} WHERE EXISTS(SELECT 1 FROM observability_consents WHERE user_id=${ctx.userId} AND metrics_enabled=TRUE AND consent_version=2) ON CONFLICT(event_id) DO NOTHING RETURNING event_id`,
        );
        if (!claimed.rows.length) return false;
        await tx.execute(
          sql`INSERT INTO observability_events(id,user_id,occurred_at,kind,payload) VALUES(${event.eventId},${ctx.userId},${event.occurredAt},'exception',${JSON.stringify({ ...event, module, count: 1, referenceId: null })}::jsonb) ON CONFLICT(id) DO NOTHING`,
        );
        return true;
      });
    },
    async setError(code: string | null) {
      await db.execute(
        sql`UPDATE observability_installation SET last_error_code=${code} WHERE id='installation'`,
      );
    },
    prune,
  };
  return api;
}
export type ObservabilityCollector = ReturnType<
  typeof createObservabilityCollector
>;

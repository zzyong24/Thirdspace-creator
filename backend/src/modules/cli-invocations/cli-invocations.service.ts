import { and, desc, eq, lt } from "drizzle-orm";
import { CONTRACT_VERSION, WORKSPACE_OPERATION_SCOPES, type EndpointId, type CliEffect, type RequestContext } from "@creatoros/contract";

import {assertWritableWorkspace,requireWorkspace} from "../../workspace-scope";
import {requireAccountId} from "../../errors";
import type { Db } from "../../db";
import { decryptSecret, encryptSecret } from "../../secret-crypto";
import {
  cliInvocationResults,
  cliInvocations,
  type CliInvocationRow,
} from "../../schema/cli-invocations";

const RESULT_TTL_MS = 24 * 60 * 60 * 1000;
const UNKNOWN_AFTER_MS = 5 * 60 * 1000;
const USER_SCOPE = "__user__";
const RESPONSE_SCHEMA_VERSION = `contract:${CONTRACT_VERSION}`;

export interface CliInvocationReceipt {
  readonly duplicate: true;
  readonly requestId: string;
  readonly status: string;
  readonly taskId: string | null;
  readonly targetRefs: readonly string[];
  readonly resultExpired: boolean;
  readonly outcomeUnknown: boolean;
  readonly manualReconcileRequired: boolean;
}

export type BeginCliInvocationResult =
  | { readonly kind: "execute"; readonly invocationId: string }
  | { readonly kind: "cached"; readonly response: unknown; readonly receipt: CliInvocationReceipt }
  | { readonly kind: "receipt"; readonly receipt: CliInvocationReceipt }
  | { readonly kind: "conflict"; readonly requestId: string };

export interface BeginCliInvocationInput {
  readonly operation: string;
  readonly effect: CliEffect;
  readonly clientId: string;
  readonly idempotencyKey: string | null;
  readonly inputHash: string;
  readonly targetRefs: readonly string[];
}

export interface CliInvocationService {
  begin(ctx: RequestContext, input: BeginCliInvocationInput): Promise<BeginCliInvocationResult>;
  succeed(invocationId: string, response: unknown): Promise<void>;
  fail(invocationId: string, errorCode: string | null): Promise<void>;
  recentStatus(ctx: RequestContext): Promise<{ lastInvocationAt: string | null }>;
}

interface ServiceDeps {
  readonly db: Db;
  readonly masterKey: Buffer;
  readonly now: () => string;
  readonly nextId: (prefix: string) => string;
}

function receipt(row: CliInvocationRow, overrides: Partial<CliInvocationReceipt> = {}): CliInvocationReceipt {
  return {
    duplicate: true,
    requestId: row.requestId,
    status: row.status,
    taskId: row.taskId,
    targetRefs: row.targetRefs,
    resultExpired: false,
    outcomeUnknown: row.status === "outcome_unknown",
    manualReconcileRequired: row.status === "outcome_unknown",
    ...overrides,
  };
}

function extractTaskId(response: unknown): string | null {
  if (!response || typeof response !== "object") return null;
  const data = "data" in response ? (response as { data: unknown }).data : response;
  if (!data || typeof data !== "object") return null;
  for (const key of ["taskId", "runId", "id"] as const) {
    const value = (data as Record<string, unknown>)[key];
    if (typeof value === "string" && value.trim()) return value;
  }
  return null;
}

export function createCliInvocationService(deps: ServiceDeps): CliInvocationService {
  // SEMANTIC_BOUNDARY_ALLOW: 按正式操作权限声明生成缓存命名空间，不作内容判断，旧行/摘要不重写。
  function scope(ctx:RequestContext,operation:string):string {
    const policy=WORKSPACE_OPERATION_SCOPES[operation as EndpointId];
    if(!policy)throw new Error("CLI_OPERATION_SCOPE_UNDECLARED");
    if(policy==="user")return USER_SCOPE;
    if(policy==="platform-account")return requireAccountId(ctx.accountId,"CLI platform operation");
    requireWorkspace(ctx);
    return ctx.groupId?`group:${ctx.groupId}`:requireAccountId(ctx.accountId,"CLI legacy operation");
  }
  const byIdempotency = (ctx: RequestContext, input: BeginCliInvocationInput) =>
    and(
      eq(cliInvocations.userId, ctx.userId),
      eq(cliInvocations.accountScope, scope(ctx,input.operation)),
      eq(cliInvocations.operation, input.operation),
      eq(cliInvocations.idempotencyKey, input.idempotencyKey!),
    );

  async function replay(row:CliInvocationRow,input:BeginCliInvocationInput,now:string):Promise<BeginCliInvocationResult>{
      if (row.inputHash !== input.inputHash) {
        return { kind: "conflict", requestId: row.requestId };
      }

      if (row.status === "succeeded") {
        const results = await deps.db
          .select()
          .from(cliInvocationResults)
          .where(eq(cliInvocationResults.invocationId, row.id))
          .limit(1);
        const result = results[0];
        const resultLive = result !== undefined && Date.parse(result.resultExpiresAt) > Date.parse(now);
        if (resultLive && result && result.responseSchemaVersion === RESPONSE_SCHEMA_VERSION) {
          try {
            return {
              kind: "cached",
              response: JSON.parse(decryptSecret(result.resultEncrypted, deps.masterKey)),
              receipt: receipt(row),
            };
          } catch {
            // 密文损坏或 master key 改变时绝不重放写入，只返回稳定收据。
          }
        }
        if (result) {
          await deps.db
            .delete(cliInvocationResults)
            .where(eq(cliInvocationResults.invocationId, row.id));
        }
        return { kind: "receipt", receipt: receipt(row, { resultExpired: true }) };
      }
      if (row.status === "running") {
        const age = Date.parse(now) - Date.parse(row.updatedAt);
        if (Number.isFinite(age) && age > UNKNOWN_AFTER_MS) {
          await deps.db
            .update(cliInvocations)
            .set({
              status: "outcome_unknown",
              errorCode: "manual_reconcile_required",
              updatedAt: now,
              finishedAt: now,
            })
            .where(eq(cliInvocations.id, row.id));
          return {
            kind: "receipt",
            receipt: receipt({ ...row, status: "outcome_unknown" }, {
              outcomeUnknown: true,
              manualReconcileRequired: true,
            }),
          };
        }
        return { kind: "receipt", receipt: receipt(row) };
      }
      return { kind: "receipt", receipt: receipt(row) };
  }

  return {
    async begin(ctx, input) {
      scope(ctx,input.operation);
      const policy=WORKSPACE_OPERATION_SCOPES[input.operation as EndpointId];
      if((policy==="group"||policy==="project-derived")&&ctx.groupId)await assertWritableWorkspace(deps.db,ctx,{allowArchived:true});
      const now = deps.now();
      // 成功调用是原历史事实：当前组仍须属于原用户，但归档不应重执行或隐藏精确旧回执。
      // 新调用继续经过 active 门；hash/密文/版本规则与旧回执均不改。
      if((policy==="group"||policy==="project-derived")&&ctx.groupId&&input.effect!=="read"&&input.idempotencyKey){
        const [prior]=await deps.db.select().from(cliInvocations).where(byIdempotency(ctx,input)).limit(1);
        if(prior?.status==="succeeded")return replay(prior,input,now);
      }
      if((policy==="group"||policy==="project-derived")&&ctx.groupId)await assertWritableWorkspace(deps.db,ctx,{allowArchived:input.effect==="read"});
      const invocationId = deps.nextId("cli-inv");
      // 短期结果缓存不是审计：任何新调用顺手物理删除已过期密文，审计行继续保留稳定收据。
      await deps.db
        .delete(cliInvocationResults)
        .where(lt(cliInvocationResults.resultExpiresAt, now));

      if (input.effect === "read") {
        await deps.db.insert(cliInvocations).values({
          id: invocationId,
          userId: ctx.userId,
          accountId: (WORKSPACE_OPERATION_SCOPES[input.operation as EndpointId]==="group"||WORKSPACE_OPERATION_SCOPES[input.operation as EndpointId]==="project-derived")&&ctx.groupId?null:ctx.accountId??null,
          accountScope: scope(ctx,input.operation),
          clientId: input.clientId,
          operation: input.operation,
          effect: input.effect,
          idempotencyKey: null,
          inputHash: input.inputHash,
          targetRefs: [...input.targetRefs],
          requestId: ctx.requestId,
          status: "running",
          receivedAt: now,
          updatedAt: now,
        });
        return { kind: "execute", invocationId };
      }

      if (!input.idempotencyKey) {
        throw new Error("CLI_IDEMPOTENCY_REQUIRED");
      }
      await deps.db
        .insert(cliInvocations)
        .values({
          id: invocationId,
          userId: ctx.userId,
          accountId: (WORKSPACE_OPERATION_SCOPES[input.operation as EndpointId]==="group"||WORKSPACE_OPERATION_SCOPES[input.operation as EndpointId]==="project-derived")&&ctx.groupId?null:ctx.accountId??null,
          accountScope: scope(ctx,input.operation),
          clientId: input.clientId,
          operation: input.operation,
          effect: input.effect,
          idempotencyKey: input.idempotencyKey,
          inputHash: input.inputHash,
          targetRefs: [...input.targetRefs],
          requestId: ctx.requestId,
          status: "running",
          receivedAt: now,
          updatedAt: now,
        })
        .onConflictDoNothing();

      const rows = await deps.db
        .select()
        .from(cliInvocations)
        .where(byIdempotency(ctx, input))
        .limit(1);
      const row = rows[0];
      if (!row) throw new Error("CLI_INVOCATION_NOT_PERSISTED");
      if (row.id === invocationId) return { kind: "execute", invocationId };
      return replay(row,input,now);
    },

    async succeed(invocationId, response) {
      const now = deps.now();
      const resultExpiresAt = new Date(Date.parse(now) + RESULT_TTL_MS).toISOString();
      const resultEncrypted = encryptSecret(JSON.stringify(response), deps.masterKey);
      await deps.db
        .insert(cliInvocationResults)
        .values({
          invocationId,
          resultEncrypted,
          responseSchemaVersion: RESPONSE_SCHEMA_VERSION,
          resultExpiresAt,
          createdAt: now,
        })
        .onConflictDoUpdate({
          target: cliInvocationResults.invocationId,
          set: {
            resultEncrypted,
            responseSchemaVersion: RESPONSE_SCHEMA_VERSION,
            resultExpiresAt,
            createdAt: now,
          },
        });
      await deps.db
        .update(cliInvocations)
        .set({
          status: "succeeded",
          taskId: extractTaskId(response),
          updatedAt: now,
          finishedAt: now,
        })
        .where(eq(cliInvocations.id, invocationId));
    },

    async fail(invocationId, errorCode) {
      const now = deps.now();
      await deps.db
        .update(cliInvocations)
        .set({
          status: "failed",
          errorCode,
          updatedAt: now,
          finishedAt: now,
        })
        .where(eq(cliInvocations.id, invocationId));
    },

    async recentStatus(ctx) {
      const rows = await deps.db
        .select({ updatedAt: cliInvocations.updatedAt })
        .from(cliInvocations)
        .where(eq(cliInvocations.userId, ctx.userId))
        .orderBy(desc(cliInvocations.updatedAt))
        .limit(1);
      return { lastInvocationAt: rows[0]?.updatedAt ?? null };
    },
  };
}

import {redactProviderErrorDetail} from "@creatoros/contract/provider-error-detail";
import {executionBudgetSchema as budgetSchema, executionBudgetDeadline} from "@creatoros/contract/execution-worker";
import { isDeepStrictEqual } from "node:util";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { and, asc, eq, executionCalls, executionTasks, type Db } from "@creatoros/backend";
import { workerProviderReceiptSchema, workerUsageSchema, type ExecutionRef } from "@creatoros/contract/execution-worker";
import { createExecutionLeaseService } from "./execution-lease.service";
import { ConflictError,ExecutionBudgetError } from "./execution.errors";

const count = z.number().int().nonnegative().max(2_000_000_000);

const reservationSchema = z.object({
  operationKey: z.string().min(1).max(256), kind: z.enum(["model", "tool"]),
  inputDigest: z.string().regex(/^sha256:[a-f0-9]{64}$/), reservedTokens: count,
  accountingBasis: z.enum(["tokens", "requests"]).default("tokens"),
  retryOfCallId: z.string().min(1).optional(),
  parentCallId: z.string().min(1).optional(),
}).strict();
const settlementSchema = z.discriminatedUnion("status", [
  z.object({status: z.literal("settled"), usage: workerUsageSchema, resultRef: z.string().min(1).max(512).optional(), resultText: z.string().min(1).max(2_000_000).optional(), providerResult: workerProviderReceiptSchema.optional()}).strict(),
  z.object({status: z.literal("unknown")}).strict(),
  z.object({status: z.literal("superseded")}).strict(),
  z.object({status: z.literal("rejected"), rejectionCode: z.enum(["STRUCTURED_PROTOCOL_UNSUPPORTED","CHAT_MODEL_RETRYABLE_REJECTION","ASR_HTTP_400","ASR_HTTP_401","ASR_HTTP_402","ASR_HTTP_403","ASR_HTTP_404","ASR_HTTP_405","ASR_HTTP_413","ASR_HTTP_415","ASR_HTTP_422","ASR_HTTP_429"]).optional(),errorDetail:z.string().max(512).optional()}).strict(),
]);
type Call = typeof executionCalls.$inferSelect;
type Budget = z.infer<typeof budgetSchema>;
type Transaction = Parameters<Parameters<Db["transaction"]>[0]>[0];

/** 只允许顶层工具拥有模型子调用；业务授权由命名端口另行核验。 */
function assertParent(calls: Call[], child: {kind:string;parentCallId?:string|null}, attempt?:number) {
  if (!child.parentCallId) return;
  const parent = calls.find(call => call.id === child.parentCallId);
  if (child.kind !== "model" || !parent || parent.kind !== "tool" || parent.parentCallId) throw new ConflictError("子模型父工具归属无效");
  if (attempt !== undefined && (parent.status !== "started" || parent.startedAttempt !== attempt)) throw new ConflictError("父工具当前不可创建或启动子调用");
}

function totals(calls: Call[]) {
  const knownSpentTokens = calls.reduce((sum, call) => sum + (call.totalTokens ?? 0), 0);
  const unknownUsage = calls.some(call => call.status === "unknown" || (call.status === "settled" && call.totalTokens === null));
  return {
    knownSpentTokens,
    spentTokens: unknownUsage ? null : knownSpentTokens,
    reservedTokens: calls.reduce((sum, call) => sum + (call.status === "rejected" || call.totalTokens !== null ? 0 : call.reservedTokens), 0),
    unknownUsage,
  };
}

/** 后端单一账本；所有变化与租约校验共享父任务行锁。模型配置、原始提示和凭据不写此表。 */
export function createExecutionCallLedgerService(db: Db, deps: {now?: () => string; budget: Budget}) {
  const now = deps.now ?? (() => new Date().toISOString());
  const configuredBudget = budgetSchema.parse(deps.budget);
  const leases = createExecutionLeaseService(db, {now});
  const readCalls = (tx: Transaction, taskId: string) => tx.select().from(executionCalls)
    .where(eq(executionCalls.executionTaskId, taskId)).orderBy(asc(executionCalls.sequence));
  function assertResolved(calls: Call[], attempt: number) {
    if (calls.some(c => c.status === "unknown" || (c.status === "settled" && c.totalTokens === null && c.accountingBasis !== "requests")) || calls.some(c => c.status === "started" && c.startedAttempt !== attempt)) {
      throw new ConflictError("已有调用结果或用量未知，须先按原调用对账");
    }
  }
  return {
    async initializeBudget(ref: ExecutionRef) {
      return leases.withLease(ref,"admission",async({tx,task})=>{
        const budget=task.executionBudget===null?configuredBudget:budgetSchema.parse(task.executionBudget);
        const deadlineAt=task.deadlineAt ?? executionBudgetDeadline(budget,task.createdAt);
        if(deadlineAt !== null && !(Date.parse(deadlineAt)>Date.parse(now())))throw new ConflictError("执行截止时间已到");
        if(task.executionBudget===null || task.deadlineAt===null)await tx.update(executionTasks).set({executionBudget:budget,deadlineAt}).where(eq(executionTasks.id,task.id));
        return {budget,deadlineAt};
      });
    },
    async inspect(ref: ExecutionRef) {
      return leases.withLease(ref, "settlement", async ({tx, task}) => {
        const calls = await readCalls(tx, task.id);
        return {budget: task.executionBudget === null ? null : budgetSchema.parse(task.executionBudget), deadlineAt: task.deadlineAt, calls, ...totals(calls)};
      });
    },
    async reserve(ref: ExecutionRef, raw: z.input<typeof reservationSchema>, validate?: (calls: Call[], task: typeof executionTasks.$inferSelect) => void) {
      const input = reservationSchema.parse(raw);
      if (input.accountingBasis === "requests" && (input.reservedTokens !== 0 || input.kind !== "model" || input.parentCallId)) throw new ConflictError("请求计量仅用于独立的非 token 预算调用");
      return leases.withLease(ref, "admission", async ({tx, task}) => {
        const budget = task.executionBudget === null ? configuredBudget : budgetSchema.parse(task.executionBudget);
        const deadlineAt = task.deadlineAt ?? executionBudgetDeadline(budget,task.createdAt);
        if (deadlineAt !== null && !(Date.parse(deadlineAt) > Date.parse(now()))) throw new ConflictError("执行截止时间已到");
        const calls = await readCalls(tx, task.id);
        validate?.(calls, task);
        assertParent(calls, input);
        const previous = calls.filter(c => c.operationKey === input.operationKey).at(-1);
        if (previous) {
          if (previous.accountingBasis !== input.accountingBasis || previous.inputDigest !== input.inputDigest || previous.kind !== input.kind || previous.reservedTokens !== input.reservedTokens || previous.parentCallId !== (input.parentCallId ?? null)) {
            throw new ConflictError("同一操作键不能改换调用内容");
          }
          if (!input.retryOfCallId || previous.retryOfCallId === input.retryOfCallId) return previous;
          if (previous.id !== input.retryOfCallId || !["rejected","superseded"].includes(previous.status) || (previous.status === "superseded" && previous.kind !== "model")) {
            throw new ConflictError("只有明确拒绝或已废弃的模型调用可按原操作键重试");
          }
        } else if (input.retryOfCallId) throw new ConflictError("重试来源不存在");
        assertParent(calls, input, ref.attempt);
        assertResolved(calls, ref.attempt);
        const used = totals(calls);
        if ((budget.maxCalls !== null && calls.length >= budget.maxCalls) || (budget.maxTokens !== null && used.knownSpentTokens + used.reservedTokens + input.reservedTokens > budget.maxTokens)) {
          throw new ExecutionBudgetError("执行调用次数或用量预算不足");
        }
        if (task.executionBudget === null || task.deadlineAt === null) {
          await tx.update(executionTasks).set({executionBudget: budget, deadlineAt}).where(eq(executionTasks.id, task.id));
        }
        const [created] = await tx.insert(executionCalls).values({
          id: `call_${randomUUID()}`, executionTaskId: task.id, sequence: calls.length + 1,
          operationKey: input.operationKey, retryOfCallId: input.retryOfCallId ?? null, parentCallId: input.parentCallId ?? null, kind: input.kind,
          inputDigest: input.inputDigest, reservedTokens: input.reservedTokens, accountingBasis: input.accountingBasis, status: "reserved",
          createdAt: now(), updatedAt: now(),
        }).returning();
        if (!created) throw new ConflictError("调用预留失败");
        return created;
      });
    },
    async start(ref: ExecutionRef, callId: string, validate?: (call: Call, calls: Call[], task: typeof executionTasks.$inferSelect) => void) {
      return leases.withLease(ref, "admission", async ({tx, task}) => {
        const calls = await readCalls(tx, task.id);
        const call = calls.find(c => c.id === callId);
        if (!call || call.status !== "reserved") throw new ConflictError("调用不可重复启动");
        validate?.(call, calls, task);
        assertParent(calls, call, ref.attempt);
        assertResolved(calls, ref.attempt);
        const budget = budgetSchema.parse(task.executionBudget);
        const used = totals(calls);
        if (budget.maxTokens !== null && used.knownSpentTokens + used.reservedTokens > budget.maxTokens) throw new ConflictError("实际用量已超预算");
        const [started] = await tx.update(executionCalls).set({status: "started", startedAttempt: ref.attempt, updatedAt: now()})
          .where(eq(executionCalls.id, callId)).returning();
        return started!;
      });
    },
    async settle(ref: ExecutionRef, callId: string, raw: z.infer<typeof settlementSchema>, validate?: (call: Call) => void, validateTree?: (calls: Call[], task: typeof executionTasks.$inferSelect) => void) {
      const input = settlementSchema.parse(raw);
      if (input.status === "settled" && input.providerResult) {
        const receipt = input.providerResult.usage;
        const canonical = workerUsageSchema.parse({inputTokens:receipt.inputTokens.total,outputTokens:receipt.outputTokens.total,
          inputTokenDetails:{noCacheTokens:receipt.inputTokens.noCache,cacheReadTokens:receipt.inputTokens.cacheRead,cacheWriteTokens:receipt.inputTokens.cacheWrite},
          outputTokenDetails:{textTokens:receipt.outputTokens.text,reasoningTokens:receipt.outputTokens.reasoning},
        });
        for (const field of ["inputTokens","outputTokens","totalTokens"] as const) {
          const value=input.usage[field];if(value===undefined)continue;
          if(canonical[field]!==undefined && canonical[field]!==value)throw new ConflictError("模型回执与结算用量不符");
          canonical[field]=value;
        }
        for(const field of ["inputTokenDetails","outputTokenDetails"] as const){
          const target=canonical[field] as Record<string,number|undefined>;
          for(const [key,value] of Object.entries(input.usage[field] ?? {})){
            if(value===undefined)continue;
            if(target[key]!==undefined && target[key]!==value)throw new ConflictError("模型回执与结算分项不符");
            target[key]=value;
          }
        }
        input.usage=canonical;
      }
      return leases.withLease(ref, "settlement", async ({tx, task}) => {
        const [call] = await tx.select().from(executionCalls).where(and(eq(executionCalls.id, callId), eq(executionCalls.executionTaskId, task.id)));
        if (!call || call.status === "reserved") throw new ConflictError("只能结算已有启动事实的调用");
        if (call.providerJob !== null && ["rejected","superseded"].includes(input.status)) throw new ConflictError("供应商已经接受任务，不能标记为可重试终态");
        if (input.status === "superseded" && call.kind !== "model") throw new ConflictError("只有无副作用的模型生成可废弃续跑");
        validate?.(call);
        if (validateTree) validateTree(await readCalls(tx, task.id), task);
        if(input.status==="unknown" && call.kind==="tool" && !call.toolExecutionClaimId && ["waiting_user","retry_wait","failed"].includes(task.status)){
          const children=(await readCalls(tx,task.id)).filter(child=>child.parentCallId===call.id);
          // 结构修复可有已结算前缀；挂起事实已经确认尾调用被拒绝，迟到 ACK 不能擦掉它。
          const confirmed=children.every(child=>["rejected","superseded"].includes(child.status) || (child.kind==="model" && child.status==="settled" && child.totalTokens!==null && workerProviderReceiptSchema.safeParse(child.providerResult).success));
          if(children.length && confirmed && ["rejected","superseded"].includes(children.at(-1)!.status) && (children.at(-1)!.id===task.retryOfCallId || task.status==="failed"))throw new ConflictError("可恢复失败已挂起，不能因回执丢失改成未知");
        }
        if (input.status === "rejected" && call.kind === "tool" && (await readCalls(tx, task.id)).some(child => child.parentCallId === call.id)) throw new ConflictError("已有子调用的父工具不能标记为未执行拒绝");
        if (input.status === "settled" && (call.kind === "tool" || call.parentCallId)) {
          const calls = await readCalls(tx, task.id);
          assertParent(calls, call);
          if (call.parentCallId && !(input.providerResult ?? call.providerResult)) throw new ConflictError("子模型成功缺少供应商回执");
          const children = calls.filter(child => child.parentCallId === call.id);
          if (children.some(child => !["rejected","superseded"].includes(child.status) && (child.status !== "settled" || child.totalTokens === null || !child.providerResult))) throw new ConflictError("父工具仍有未确认的子模型调用");
        }
        if (call.status === "settled" && input.status === "unknown") return call;
        if (call.status === "settled" && ["rejected","superseded"].includes(input.status)) throw new ConflictError("已确认结果不能变成可重试终态");
        if (call.status === "rejected") {
          if (input.status !== "rejected" || (input.rejectionCode && input.rejectionCode !== call.rejectionCode)) throw new ConflictError("已确认拒绝不能改写");
          return call;
        }
        if (call.status === "superseded") {
          if (input.status !== "superseded") throw new ConflictError("已废弃模型调用不能改写");
          return call;
        }
        if (["rejected","superseded"].includes(input.status) && call.status !== "started") throw new ConflictError("未知提交不能变成可重试终态");
        const previousUsage = call.usage === null ? null : workerUsageSchema.parse(call.usage);
        const observed=(task.payload as {codexCalls?:Record<string,{observedUsage?:unknown}>}).codexCalls?.[callId]?.observedUsage;
        const nativeObserved=previousUsage!==null&&observed!==undefined&&isDeepStrictEqual(workerUsageSchema.parse(observed),previousUsage)&&call.status!=='settled';
        const usage = input.status === "settled" || input.status==='unknown'&&nativeObserved ? {...(previousUsage ?? {})} : null;
        if (usage && input.status === "settled") {
          for (const field of ["totalTokens", "inputTokens", "outputTokens"] as const) {
            if (input.usage[field] !== undefined) usage[field] = input.usage[field];
          }
          for (const field of ["inputTokenDetails", "outputTokenDetails"] as const) {
            if (input.usage[field]) {
              const merged = {...previousUsage?.[field]};
              for (const [key, value] of Object.entries(input.usage[field])) {
                if (value === undefined) continue;
                const previous = (merged as Record<string, number>)[key];
                if (previous !== undefined && previous !== value) throw new ConflictError("已确认缓存或输出分项不能改写");
                (merged as Record<string, number>)[key] = value;
              }
              usage[field] = merged;
            }
          }
        }
        if (usage) {
          const inputParts = Object.values(usage.inputTokenDetails ?? {}).reduce((sum, value) => sum + (value ?? 0), 0);
          const outputParts = Object.values(usage.outputTokenDetails ?? {}).reduce((sum, value) => sum + (value ?? 0), 0);
          if ((usage.inputTokens != null && inputParts > usage.inputTokens) ||
            (usage.outputTokens != null && outputParts > usage.outputTokens) ||
            (usage.totalTokens != null && Math.max(usage.inputTokens ?? 0, inputParts) + Math.max(usage.outputTokens ?? 0, outputParts) > usage.totalTokens) ||
            (usage.totalTokens != null && usage.inputTokens != null && usage.outputTokens != null && usage.totalTokens !== usage.inputTokens + usage.outputTokens)) {
            throw new ConflictError("调用用量相互矛盾");
          }
        }
        if (input.status === "settled" && previousUsage) {
          for (const field of ["totalTokens", "inputTokens", "outputTokens"] as const) {
            if (previousUsage[field] != null && input.usage[field] != null && (nativeObserved?input.usage[field]!<previousUsage[field]!:previousUsage[field] !== input.usage[field])) {
              throw new ConflictError("已确认用量不能改写");
            }
          }
        }
        if (input.status === "settled" && call.providerResult && input.providerResult && !isDeepStrictEqual(call.providerResult,input.providerResult)) {
          throw new ConflictError("已确认模型回执不能改写");
        }
        if (input.status === "settled" && call.resultText && input.resultText && call.resultText !== input.resultText) {
          throw new ConflictError("已确认正文不能改写");
        }
        if (input.status === "settled" && call.resultRef && input.resultRef && call.resultRef !== input.resultRef) {
          throw new ConflictError("已确认结果不能改写");
        }
        // SDK total/input 已包含缓存分项，不能再次相加；缺计量保持未知，不记作零。
        const totalTokens = usage ? usage.totalTokens ?? (usage.inputTokens != null && usage.outputTokens != null ? usage.inputTokens + usage.outputTokens : null) : null;
        if (totalTokens !== null) count.parse(totalTokens);
        const [settled] = await tx.update(executionCalls).set({
          status: input.status, usage, totalTokens, rejectionCode: input.status === "rejected" ? input.rejectionCode ?? null : null, providerResult: input.status === "settled" ? input.providerResult ?? call.providerResult : null, resultText: input.status === "settled" ? input.resultText ?? call.resultText : input.status === "rejected" ? (input.errorDetail ? redactProviderErrorDetail(input.errorDetail) : call.resultText) : null, resultRef: input.status === "settled" ? input.resultRef ?? call.resultRef : null, updatedAt: now(),
        }).where(eq(executionCalls.id, callId)).returning();
        return settled!;
      });
    },
  };
}

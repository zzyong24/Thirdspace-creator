import {workspaceFilter} from "../../workspace-scope";
import { isDeepStrictEqual } from "node:util";
import {
  and,
  eq,
  asc,
  desc,
  gte,
  lt,
  sql,
  executionTasks,
  executionCalls,
  executionStreamEvents,
  OwnershipError,
  type Db,
} from "@creatoros/backend";
import type { RequestContext } from "@creatoros/contract";
import { workbenchResultSchema, type WorkbenchResult } from "@creatoros/contract/agent-workbench";
import {
  chatWorkerInputSchema, appendExecutionStreamSchema,
  readExecutionStreamSchema,
  type ExecutionRef,
} from "@creatoros/contract/execution-worker";
import { createExecutionLeaseService } from "./execution-lease.service";
import { ConflictError } from "./execution.errors";
/** 流内容先落库再发布；终态只从execution_tasks读取，UI finish事件没有状态权。 */
export function createExecutionStreamService(
  db: Db,
  deps: { now?: () => string } = {},
) {
  const now = deps.now ?? (() => new Date().toISOString()),
    leases = createExecutionLeaseService(db, { now });
  return {
    /** 仅供 backend 宿主调用；Worker 的 appendStreamEvents 端口不得接收工具进度。 */
    async appendWorkbenchProgress(ref: ExecutionRef, callId: string, raw: unknown) {
      const parsed = workbenchResultSchema.parse(raw);
      if (parsed.status !== "running" || parsed.operationId !== callId ||
        Buffer.byteLength(JSON.stringify(parsed), "utf8") > 4096)
        throw new ConflictError("工具进度内容或调用标识无效");
      const progress: Extract<WorkbenchResult, {status:"running"}> = parsed;
      const chunk = {type:"data-workbench-progress", id:callId, data:{
        operationId:callId, progressCursor:progress.progressCursor, content:progress.content,
      }};
      return leases.withLease(ref, "admission", async ({tx,task}) => {
        const [call] = await tx.select().from(executionCalls).where(and(
          eq(executionCalls.id,callId), eq(executionCalls.executionTaskId,task.id),
        ));
        if (!call || call.kind !== "tool" || call.parentCallId || call.status !== "started" ||
          call.startedAttempt !== ref.attempt || !call.toolExecutionClaimId)
          throw new ConflictError("当前调用不是已启动的宿主工具");
        const [duplicate] = await tx.select().from(executionStreamEvents)
          .where(and(eq(executionStreamEvents.callId,callId),
            sql`${executionStreamEvents.chunk} = ${JSON.stringify(chunk)}::jsonb`)).limit(1);
        if (duplicate) return {nextIndex:duplicate.callIndex+1,lastSequence:duplicate.sequence};
        const [lastCall] = await tx.select().from(executionStreamEvents)
          .where(eq(executionStreamEvents.callId,callId))
          .orderBy(desc(executionStreamEvents.callIndex)).limit(1);
        const [last] = await tx.select().from(executionStreamEvents)
          .where(eq(executionStreamEvents.executionTaskId,task.id))
          .orderBy(desc(executionStreamEvents.sequence)).limit(1);
        const callIndex = lastCall?.callIndex ?? -1;
        const sequence = (last?.sequence ?? 0)+1;
        await tx.insert(executionStreamEvents).values({
          executionTaskId:task.id,sequence,callId,callIndex:callIndex+1,chunk,createdAt:now(),
        });
        return {nextIndex:callIndex+2,lastSequence:sequence};
      });
    },
    async append(ref: ExecutionRef, raw: unknown) {
      const input = appendExecutionStreamSchema.parse(raw),
        end = input.startIndex + input.chunks.length;
      return leases.withLease(ref, "settlement", async ({ tx, task }) => {
        const [call] = await tx
          .select()
          .from(executionCalls)
          .where(
            and(
              eq(executionCalls.id, input.callId),
              eq(executionCalls.executionTaskId, task.id),
            ),
          );
        if (!call || call.parentCallId || !["model", "tool"].includes(call.kind))
          throw new ConflictError("流内容没有所属调用");
        if(chatWorkerInputSchema.safeParse((task.payload as Record<string,unknown>).modelInput).success &&
          (call.kind!=="model" || input.chunks.some(chunk=>!["text-start","text-delta","text-end","reasoning-start","reasoning-delta","reasoning-end","source-url","source-document","file","reasoning-file"].includes(chunk.type))))
          throw new ConflictError("聊天Worker只能追加模型展示内容，工具卡由后端回执生成");
        const existing = await tx
          .select()
          .from(executionStreamEvents)
          .where(
            and(
              eq(executionStreamEvents.callId, call.id),
              gte(executionStreamEvents.callIndex, input.startIndex),
              lt(executionStreamEvents.callIndex, end),
            ),
          )
          .orderBy(asc(executionStreamEvents.callIndex));
        if (existing.length) {
          if (
            existing.length !== input.chunks.length ||
            existing.some(
              (row, i) =>
                row.callIndex !== input.startIndex + i ||
                !isDeepStrictEqual(row.chunk, input.chunks[i]),
            )
          )
            throw new ConflictError("已保存流事件不可改写或部分覆盖");
          return { nextIndex: end, lastSequence: existing.at(-1)!.sequence };
        }
        if (
          !["running", "pause_requested", "cancel_requested"].includes(
            task.status,
          ) ||
          call.status !== "started" ||
          call.startedAttempt !== ref.attempt
        )
          throw new ConflictError("只能保存当前已开始调用的流内容");
        const [lastCall] = await tx
          .select()
          .from(executionStreamEvents)
          .where(eq(executionStreamEvents.callId, call.id))
          .orderBy(desc(executionStreamEvents.callIndex))
          .limit(1);
        if (input.startIndex !== (lastCall ? lastCall.callIndex + 1 : 0))
          throw new ConflictError("流内容必须连续追加");
        const [last] = await tx
          .select()
          .from(executionStreamEvents)
          .where(eq(executionStreamEvents.executionTaskId, task.id))
          .orderBy(desc(executionStreamEvents.sequence))
          .limit(1);
        const sequence = last?.sequence ?? 0,
          stamp = now();
        await tx
          .insert(executionStreamEvents)
          .values(
            input.chunks.map((chunk, i) => ({
              executionTaskId: task.id,
              sequence: sequence + i + 1,
              callId: call.id,
              callIndex: input.startIndex + i,
              chunk,
              createdAt: stamp,
            })),
          );
        return { nextIndex: end, lastSequence: sequence + input.chunks.length };
      });
    },
    async read(ctx: RequestContext, taskId: string, raw: unknown = {}) {
      const input = readExecutionStreamSchema.parse(raw);
      return db.transaction(async (tx) => {
        const [task] = await tx
          .select()
          .from(executionTasks)
          .where(
            and(
              eq(executionTasks.id, taskId),
              eq(executionTasks.userId, ctx.userId),
              workspaceFilter(executionTasks,ctx),
            ),
          )
          .for("share");
        if (!task) throw new OwnershipError("执行任务不存在");
        const rows = await tx
          .select()
          .from(executionStreamEvents)
          .where(
            and(
              eq(executionStreamEvents.executionTaskId, task.id),
              gte(executionStreamEvents.sequence, input.afterSequence + 1),
            ),
          )
          .orderBy(asc(executionStreamEvents.sequence))
          .limit(input.limit + 1);
        const events = rows
          .slice(0, input.limit)
          .map(({ sequence, callId, callIndex, chunk }) => ({
            sequence,
            callId,
            callIndex,
            chunk,
          }));
        return {
          events,
          nextSequence: events.at(-1)?.sequence ?? input.afterSequence,
          hasMore: rows.length > input.limit,
          status: task.status,
          attempt: task.attempt,
        };
      });
    },
  };
}

/** 订阅只读持久事件。关闭页面仅结束这个迭代器，不拥有取消任务的能力。 */
export async function* subscribeExecutionStream(
  service: Pick<ReturnType<typeof createExecutionStreamService>, "read">,
  ctx: RequestContext,
  taskId: string,
  options: { afterSequence?: number; signal: AbortSignal; pollMs?: number },
) {
  let cursor = options.afterSequence ?? 0,
    lastState = "";
  while (!options.signal.aborted) {
    const page = await service.read(ctx, taskId, { afterSequence: cursor });
    if (options.signal.aborted) return;
    const state = JSON.stringify([page.status, page.attempt]);
    if (page.events.length || state !== lastState) {
      lastState = state;
      cursor = page.nextSequence;
      yield page;
    }
    if (page.hasMore) continue;
    if (["succeeded", "partial", "failed", "cancelled"].includes(page.status))
      return;
    await new Promise<void>((resolve) => {
      const done = () => {
        clearTimeout(timer);
        options.signal.removeEventListener("abort", done);
        resolve();
      };
      const timer = setTimeout(done, Math.max(10, options.pollMs ?? 100));
      options.signal.addEventListener("abort", done, { once: true });
      if (options.signal.aborted) done();
    });
  }
}

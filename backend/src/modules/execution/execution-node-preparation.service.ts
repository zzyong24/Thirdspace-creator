import { awaitPreparation } from "./await-preparation";
import { createHash } from "node:crypto";
import { z } from "zod";
import { eq, executionCalls, executionTasks, type Db } from "@creatoros/backend";
import type { ExecutionRef } from "@creatoros/contract/execution-worker";
import { canonicalJson } from "../ai/canonical-json";
import { createExecutionLeaseService } from "./execution-lease.service";
import { ConflictError } from "./execution.errors";

const entrySchema = z.object({ schemaVersion:z.literal(1), inputDigest:z.string(), nodeVersion:z.string(), value:z.json(), digest:z.string().regex(/^sha256:[a-f0-9]{64}$/) }).strict();
const entriesSchema = z.record(z.string(), entrySchema);
const digest = (value: unknown) => `sha256:${createHash("sha256").update(canonicalJson(value)).digest("hex")}`;
/** 仅保存宿主可信准备函数的 JSON；调用者仍负责真实工具绑定、模型身份与授权。 */
export function createExecutionNodePreparationService(db: Db, deps: { now?: () => string } = {}) {
  const leases = createExecutionLeaseService(db, deps);
  return {
    async readOrPrepare<T>(ref: ExecutionRef, key: { parentCallId:string; inputDigest:string; nodeVersion:string }, schema: z.ZodType<T>, prepare: () => Promise<T>, signal?: AbortSignal): Promise<T> {
      const binding = { ...key }, execution = { ...ref };
      const access = <R>(apply: (state: Awaited<ReturnType<typeof scope>>) => Promise<R>) => leases.withLease(execution, "admission", async lease => apply(await scope(lease)));
      async function scope(lease: Parameters<Parameters<typeof leases.withLease>[2]>[0]) {
        signal?.throwIfAborted();
        const { tx, task } = lease;
        const [parent] = await tx.select().from(executionCalls).where(eq(executionCalls.id, binding.parentCallId));
        if (!parent || parent.executionTaskId !== task.id || parent.kind !== "tool" || parent.parentCallId || parent.toolExecutionClaimId || !["started","settled"].includes(parent.status) || parent.inputDigest !== binding.inputDigest) throw new ConflictError("节点准备与原父调用不符");
        const payload = z.record(z.string(), z.json()).parse(task.payload);
        const entries = entriesSchema.parse(payload.nodePreparations ?? {});
        const existing = entries[binding.parentCallId];
        if (existing && (existing.inputDigest !== binding.inputDigest || existing.nodeVersion !== binding.nodeVersion || existing.digest !== digest({ inputDigest:existing.inputDigest, nodeVersion:existing.nodeVersion, value:existing.value }))) throw new ConflictError("已保存节点准备与原绑定不符");
        return { tx, task, payload, entries, existing };
      }
      const initial = await access(async state => state.existing ? { value: schema.parse(state.existing.value) } : null);
      if (initial) return structuredClone(initial.value);
      signal?.throwIfAborted();
      const prepared = schema.parse(await awaitPreparation(prepare, signal));
      signal?.throwIfAborted();
      const value = z.json().parse(JSON.parse(JSON.stringify(prepared)));
      // 不在读资料期间持有数据库事务；并发首次准备由当前任务租约锁决定唯一胜者。
      return access(async state => {
        if (state.existing) return structuredClone(schema.parse(state.existing.value));
        const identity = { inputDigest:binding.inputDigest, nodeVersion:binding.nodeVersion, value };
        const entry = entrySchema.parse({ schemaVersion:1, ...identity, digest:digest(identity) });
        const entries = { ...state.entries, [binding.parentCallId]:entry };
        signal?.throwIfAborted();
        await state.tx.update(executionTasks).set({payload:{...state.payload,nodePreparations:entries}}).where(eq(executionTasks.id,state.task.id));
        return structuredClone(schema.parse(value));
      });
    },
  };
}

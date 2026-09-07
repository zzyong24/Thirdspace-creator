import { isDeepStrictEqual } from "node:util";
import { createHash } from "node:crypto";
import { z } from "zod";
import { eq, executionTasks, type Db } from "@creatoros/backend";
import {
  workerModelSpecSchema,
  workerTaskInputSchema,
  type ExecutionRef,
} from "@creatoros/contract/execution-worker";
import { createExecutionLeaseService } from "./execution-lease.service";
import { ConflictError } from "./execution.errors";

export const executionModelIdentitySchema = workerModelSpecSchema
  .omit({ token: true, baseUrl: true })
  .extend({
    schemaVersion: z.literal(1),
    capability: z.string().min(1),
    baseUrlDigest: z.string().regex(/^sha256:[a-f0-9]{64}$/),
    customEndpoint: z.boolean(),
  })
  .strict();
const payloadSchema = z.record(z.string(), z.json());

/** 统一无秘密身份投影；根模型与聊天子模型使用同一规则。 */
export function prepareExecutionModelIdentity(capability: string, raw: unknown) {
      const credential = workerModelSpecSchema.parse(raw);
      const { token: _token, baseUrl, ...spec } = credential;
      const baseUrlDigest = `sha256:${createHash("sha256").update(JSON.stringify(baseUrl)).digest("hex")}`;
      const identity = executionModelIdentitySchema.parse(
        JSON.parse(
          JSON.stringify({
            schemaVersion: 1,
            capability,
            ...spec,
            baseUrlDigest,
            customEndpoint: Boolean(baseUrl),
          }),
        ),
      );
      return { credential, identity };
}

/** 凭据仅在当前租约中返回；任务只保存第一次解析的无秘密模型规格。 */
export function createExecutionModelIdentityService(
  db: Db,
  deps: { now?: () => string } = {},
) {
  const leases = createExecutionLeaseService(db, deps);
  return {
    async pin(ref: ExecutionRef, capability: string, raw: unknown) {
      const { credential, identity } = prepareExecutionModelIdentity(capability, raw);
      await leases.withLease(ref, "admission", async ({ tx, task }) => {
        const payload = payloadSchema.parse(task.payload),
          input = workerTaskInputSchema.parse(payload.modelInput);
        if (task.kind !== "ai_task" || input.kind === "transcribe.douyin" || input.capability !== capability)
          throw new ConflictError("模型能力与原任务不符");
        if (payload.modelIdentity !== undefined) {
          const existing = executionModelIdentitySchema.parse(payload.modelIdentity);
          if (!isDeepStrictEqual(existing, identity))
            throw new ConflictError("模型配置与原执行身份不符");
          return;
        }
        // 仅补充宿主执行元数据；原 modelInput 与 hostContext 及其摘要均保持原样。
        await tx
          .update(executionTasks)
          .set({ payload: { ...payload, modelIdentity: identity } })
          .where(eq(executionTasks.id, task.id));
      });
      return credential;
    },
    read(ref: ExecutionRef) {
      return leases.withLease(ref, "admission", async ({ task }) => {
        const payload = payloadSchema.parse(task.payload),
          input = workerTaskInputSchema.parse(payload.modelInput);
        if (task.kind !== "ai_task" || payload.modelIdentity === undefined)
          throw new ConflictError("任务尚未绑定真实模型身份");
        const identity = executionModelIdentitySchema.parse(payload.modelIdentity);
        if (input.kind === "transcribe.douyin" || identity.capability !== input.capability)
          throw new ConflictError("模型身份与原任务能力不符");
        return identity;
      });
    },
  };
}

import Ajv, { type ValidateFunction } from "ajv";
import {
  workbenchCapabilitySchema,
  workbenchHostCallSchema,
  workbenchResultSchema,
  type WorkbenchCapability,
  type WorkbenchHostCall,
  type WorkbenchResult,
} from "@creatoros/contract/agent-workbench";
import { agenticToolOutcomeSchema, type AgenticToolOutcome } from "@creatoros/contract/execution-worker";
import { boundProgressText } from "./result-pages";

type Platform = WorkbenchCapability["platforms"][number];
type Progress = Extract<WorkbenchResult, { status: "running" }>;
export interface WorkbenchGatewayPort {
  /** 后端在当前 execution lease 下构造 host call，并由原工具回执端口结算。 */
  dispatch(call: WorkbenchHostCall, options: { signal: AbortSignal; onProgress: (update: WorkbenchResult) => void }): Promise<WorkbenchResult>;
}
export interface WorkbenchGatewayOptions extends WorkbenchGatewayPort {
  platform: Platform;
  /** 可信宿主授予的能力，不能从模型 invocation 中读取。 */
  capabilities: readonly string[];
}

/** 无任务状态、无旁路费用账本；目录只决定能否向已授权的宿主端口调用。 */
export function createWorkbenchGateway(catalog: readonly WorkbenchCapability[], options: WorkbenchGatewayOptions) {
  if (catalog.length > 100) throw new Error("GATEWAY_CATALOG_TOO_LARGE");
  const ajv = new Ajv({ strict: false, allErrors: true });
  const entries = new Map<string, { descriptor: WorkbenchCapability; input: ValidateFunction; result: ValidateFunction }>();
  for (const raw of catalog) {
    const descriptor = workbenchCapabilitySchema.parse(raw);
    if (entries.has(descriptor.name)) throw new Error(`GATEWAY_DUPLICATE_CAPABILITY:${descriptor.name}`);
    // JSON Schema 来自可信能力包。无效 schema 在装配时失败，不能留到真实调用后。
    const input = ajv.compile(descriptor.inputSchema);
    const result = ajv.compile(descriptor.resultSchema);
    entries.set(descriptor.name, { descriptor: structuredClone(descriptor), input, result });
  }
  const granted = new Set(options.capabilities);
  const available = (entry: { descriptor: WorkbenchCapability }) =>
    entry.descriptor.platforms.includes(options.platform) &&
    entry.descriptor.requiredCapabilities.every(capability => granted.has(capability));
  return {
    catalog(): WorkbenchCapability[] {
      return [...entries.values()].filter(available).map(entry => structuredClone(entry.descriptor));
    },
    async invoke(rawCall: WorkbenchHostCall, signal: AbortSignal, onProgress?: (update: Progress) => void): Promise<WorkbenchResult> {
      signal.throwIfAborted();
      const call = workbenchHostCallSchema.parse(rawCall);
      const entry = entries.get(call.invocation.name);
      if (!entry || !available(entry)) throw new Error("GATEWAY_CAPABILITY_UNAVAILABLE");
      if (call.invocation.schemaVersion !== entry.descriptor.schemaVersion) throw new Error("GATEWAY_SCHEMA_VERSION_MISMATCH");
      if (!entry.input(call.invocation.input)) throw new Error("GATEWAY_INPUT_INVALID");
      const hostCall = structuredClone(call);
      let active = true;
      const progress = (rawUpdate: WorkbenchResult) => {
        try {
          if (!active || signal.aborted) return;
          const update = workbenchResultSchema.parse(rawUpdate);
          if (update.operationId !== call.context.operationId || update.status !== "running") throw new Error("GATEWAY_PROGRESS_INVALID");
          onProgress?.({ ...update, content: update.content.map(item => ({ type: "text", text: boundProgressText(item.text) })) });
        } catch {
          // 进度是可选投影；最终可信回执已到时，不因坏进度或 UI 回调失败反杀整单。
        }
      };
      try {
        // 进入此端口后，断线不证明外部动作没发生；必须让原 operationId 对账。
        const rawResult = await options.dispatch(hostCall, { signal, onProgress: progress });
        signal.throwIfAborted();
        const result = workbenchResultSchema.parse(rawResult);
        if (result.operationId !== call.context.operationId) throw new Error("GATEWAY_OPERATION_MISMATCH");
        if (result.status === "succeeded" && !entry.result(result)) throw new Error("GATEWAY_RESULT_INVALID");
        return result;
      } catch (error) {
        if (signal.aborted) throw error;
        return {
          operationId: call.context.operationId, status: "unknown", artifactRefs: [], progressCursor: null,
          error: { code: "GATEWAY_RESULT_UNKNOWN", retryable: false, dispatched: true, nextAction: "reconcile" },
        };
      } finally {
        active = false;
      }
    },
  };
}

/** 转入原 AgenticToolOutcome 回执；费用、重放和取消仍由原执行链处理。 */
export function toAgenticToolOutcome(result: WorkbenchResult, descriptor: WorkbenchCapability): AgenticToolOutcome {
  workbenchCapabilitySchema.parse(descriptor);
  workbenchResultSchema.parse(result);
  if (result.status === "running") throw new Error("GATEWAY_RUNNING_RESULT_NOT_SETTLEABLE");
  const unknown = result.status === "unknown" || (result.status === "failed" && result.error.dispatched);
  const sideEffect = unknown ? "unknown" : result.status === "succeeded"
    ? descriptor.effects.some(effect => effect === "external_write" || effect === "process" || effect === "task_write") ? "committed"
      : descriptor.effects.includes("domain_candidate") ? "proposal" : "none"
    : "none";
  const summary = result.status === "succeeded"
    ? (result.content.find(part => part.type === "text")?.text ?? "工具已完成").slice(0, 10000)
    : `工具${unknown ? "回执待核对" : "调用失败"}：${result.error.code}`;
  const errorCode = result.status === "succeeded" ? null : unknown ? "unknown_commit"
    : result.error.nextAction === "fix_input" ? "invalid_input"
    : result.error.nextAction === "login" ? "needs_login"
    : result.error.nextAction === "contact_support" ? "no_evidence" : "transient";
  const outcome: AgenticToolOutcome = {
    status: result.status === "succeeded" ? "ok" : errorCode === "needs_login" ? "blocked" : "error",
    summary, evidence: [], data: { workbench: result },
    error: result.status === "succeeded" ? null : {
      code: errorCode!,
      retryable: !unknown && result.error.retryable,
      recovery: unknown ? "按原 operationId 核对回执后继续；不要重新执行。" : `按 ${result.error.nextAction} 处理`,
    },
    continuation: null, sideEffect,
  };
  return agenticToolOutcomeSchema.parse(outcome);
}

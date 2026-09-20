import type { RequestContext } from "@creatoros/contract";
import { jsonSchema } from "ai";
import {
  workbenchCapabilitySchema, workbenchHostCallSchema, workbenchResultSchema,
  type WorkbenchCapability, type WorkbenchHostContext, type WorkbenchHostCall, type WorkbenchResult,
} from "@creatoros/contract/agent-workbench";
import { workbenchToolOutcome, type ExecutionRef } from "@creatoros/contract/execution-worker";
import type { ChatWorkerDispatcherDeps } from "../execution/model-worker-dispatcher";
import { defineWorkbenchChatTool } from "./chat-tool-gate";
import { prepareChatToolDefinitions } from "./chat-tool-definitions";
import { prepareChatToolParameters } from "./chat-tool-parameters";
import { canonicalJson } from "../ai/canonical-json";

export interface ChatWorkbenchCapabilityHost {
  catalog: readonly WorkbenchCapability[];
  platform: WorkbenchCapability["platforms"][number];
  capabilities: readonly string[];
  /** 未注入此端口即未装配。文件、浏览器等能力不能靠目录声明自行启用。 */
  dispatch(call: WorkbenchHostCall, options: { signal: AbortSignal; onProgress: (result: WorkbenchResult) => void }): Promise<WorkbenchResult>;
  progress?(call: WorkbenchHostCall, update: Extract<WorkbenchResult, { status: "running" }>): void;
}

/** 目录只能由可信宿主给出；冻结前过滤平台和实际授权。 */
export function availableWorkbenchCapabilities(host: ChatWorkbenchCapabilityHost): WorkbenchCapability[] {
  if (typeof host.dispatch !== "function") return [];
  if (host.catalog.length > 100) throw new Error("WORKBENCH_CATALOG_TOO_LARGE");
  const names = new Set<string>(), granted = new Set(host.capabilities);
  return host.catalog.map(raw => {
    const descriptor = workbenchCapabilitySchema.parse(raw);
    if (names.has(descriptor.name)) throw new Error("WORKBENCH_CAPABILITY_DUPLICATE");
    names.add(descriptor.name);
    return structuredClone(descriptor);
  }).filter(item => item.platforms.includes(host.platform) && item.requiredCapabilities.every(capability => granted.has(capability)));
}

type LeaseContext = Omit<WorkbenchHostContext, "operationId">;
/** 原动态工具解析器只构造冻结能力的后端执行端口；身份每次执行前按真实租约重读。 */
export function createChatWorkbenchCapabilityHost(
  host: ChatWorkbenchCapabilityHost,
  readLease: (ref: ExecutionRef) => Promise<LeaseContext>,
): NonNullable<ChatWorkerDispatcherDeps["resolveTools"]> {
  return async (owner, input, _ref, signal) => {
    signal.throwIfAborted();
    const available = new Map(availableWorkbenchCapabilities(host).map(item => [item.name, item]));
    const frozen = input.workbenchCapabilities ?? [];
    const tools = Object.fromEntries(frozen.map(descriptor => {
      const installed = available.get(descriptor.name);
      if (!installed || canonicalJson(installed) !== canonicalJson(descriptor)) throw new Error("WORKBENCH_FROZEN_CAPABILITY_UNAVAILABLE");
      return [descriptor.name, defineWorkbenchChatTool(descriptor, async () => { throw new Error("WORKBENCH_REQUIRES_ORIGINAL_TASK_LEASE"); })];
    }));
    if (!frozen.length) return {};
    const prepared = await prepareChatToolDefinitions(tools, { workbenchCapabilities: frozen });
    const resultValidators = await Promise.all(frozen.map(async descriptor => [descriptor.name, (await prepareChatToolParameters(jsonSchema(descriptor.resultSchema))).parameters] as const));
    const resultByName = new Map(resultValidators);
    const bindings = Object.fromEntries(prepared.definitions.map(definition => {
      const descriptor = available.get(definition.name)!;
      const declared = input.tools.find(tool => tool.name === definition.name);
      if (!declared || declared.version !== definition.version || declared.effect !== definition.effect || declared.execution !== definition.execution) throw new Error("WORKBENCH_FROZEN_DEFINITION_MISMATCH");
      return [definition.name, {
        version: definition.version, effect: definition.effect,
        parameters: prepared.parameters[definition.name]!.parameters,
        async approve() { return { status: "not-applicable" as const }; },
        async execute(context: RequestContext, raw: unknown, scope: { execution: ExecutionRef; callId: string; signal: AbortSignal }) {
          scope.signal.throwIfAborted();
          const identity = await readLease(scope.execution);
          if (identity.userId !== owner.userId || identity.accountId !== owner.accountId || identity.userId !== context.userId || identity.accountId !== context.accountId || identity.taskId !== scope.execution.executionTaskId || identity.attempt !== scope.execution.attempt || identity.fenceToken !== scope.execution.fenceToken) throw new Error("WORKBENCH_LEASE_IDENTITY_CHANGED");
          const parsed = prepared.parameters[definition.name]!.parameters.parse(raw) as Record<string, unknown>;
          const call = workbenchHostCallSchema.parse({ context: { ...identity, operationId: scope.callId }, invocation: { name: definition.name, schemaVersion: descriptor.schemaVersion, input: parsed } });
          let result: WorkbenchResult;
          try {
            const returned = await host.dispatch(call, { signal: scope.signal, onProgress: rawProgress => {
              // 进度仅是观察投影；坏进度或订阅者退出不能覆写最终回执。
              const progress = workbenchResultSchema.safeParse(rawProgress);
              if (progress.success && progress.data.status === "running" && progress.data.operationId === scope.callId && !scope.signal.aborted) {
                try { host.progress?.(call, progress.data); } catch { /* 观察者故障不覆盖最终回执。 */ }
              }
            } });
            scope.signal.throwIfAborted();
            result = workbenchResultSchema.parse(returned);
            if (result.operationId !== scope.callId || result.status === "running" || (result.status === "succeeded" && !resultByName.get(definition.name)!.safeParse(result).success)) throw new Error("WORKBENCH_RESULT_INVALID");
          } catch (error) {
            if (scope.signal.aborted) throw error;
            result = { operationId: scope.callId, status: "unknown", artifactRefs: [], progressCursor: null,
              error: { code: "WORKBENCH_RESULT_UNKNOWN", retryable: false, dispatched: true, nextAction: "reconcile" } };
          }
          return workbenchToolOutcome(result, descriptor);
        },
      }];
    }));
    signal.throwIfAborted();
    return bindings;
  };
}

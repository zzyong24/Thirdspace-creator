import {isChatReadToolName} from "./chat-read-tool-names";
import { z } from "zod";
import type { ToolSet } from "ai";
import type { RequestContext } from "@creatoros/contract";
import { agenticToolOutcomeSchema, type ExecutionRef } from "@creatoros/contract/execution-worker";
import type { ChatBackendTool } from "../execution/execution-chat-tool-ports.service";
import { prepareChatToolDefinitions } from "./chat-tool-definitions";
import { CHAT_TOOL_ERROR_ENVELOPES, getChatToolApprovalDecider, getChatToolNativeExecutor } from "./chat-tool-gate";
import { classifyLlmError } from "./llm/retry-policy";

// 经实际调用链审计的领域只读端口；none 不能推导为可留在宿主的短操作。

type Resolve = (context: RequestContext, execution: ExecutionRef, signal?: AbortSignal) => Promise<ToolSet>;
const outcome = (status: "error" | "blocked", code: "transient" | "no_evidence" | "permission" | "cancelled", retryable: boolean, summary: string) => agenticToolOutcomeSchema.parse({status, summary, evidence: [], error: {code, retryable, recovery: summary}, continuation: null, sideEffect: "none"});

/**
 * 原型只提供参数与版本；每次执行重新按宿主ctx和任务加载工具，不使用原型的账号闭包。
 * resolve必须读取该任务已冻结的可信上下文和当前领域权限；不能接受模型自报ctx。
 * 本适配器不领取任务或自行重试，须装入 createExecutionChatToolPorts 使用其执行权/账本。
 */
export async function createChatReadToolHost(prototypes: ToolSet, resolve: Resolve): Promise<Record<string, ChatBackendTool>> {
  const prepared = await prepareChatToolDefinitions(prototypes);
  for (const definition of prepared.definitions) if (!isChatReadToolName(definition.name) || definition.effect !== "none") throw new Error(`工具不是已审计的宿主只读操作：${definition.name}`);
  return Object.fromEntries(prepared.definitions.map(definition => {
    const parameters = prepared.parameters[definition.name]!.parameters;
    const failure = (...args: Parameters<typeof outcome>) => {
      const result = outcome(...args), envelope = CHAT_TOOL_ERROR_ENVELOPES[definition.name]!;
      return agenticToolOutcomeSchema.parse({ ...result, data: { ...envelope.extras, kind: envelope.kind, error: result.summary } });
    };
    async function current(ctx: RequestContext, execution: ExecutionRef, signal?: AbortSignal) {
      signal?.throwIfAborted();
      if (!ctx.userId || !ctx.accountId) throw new Error("只读工具缺少真实账号上下文");
      const available = await resolve(ctx, execution, signal);
      signal?.throwIfAborted();
      const tool = Object.hasOwn(available, definition.name) ? available[definition.name] : undefined;
      if (!tool) throw new Error("工具已不在当前任务允许范围");
      const resolved = await prepareChatToolDefinitions({ [definition.name]: tool });
      if (resolved.definitions[0]!.version !== definition.version) throw new Error("工具定义已改变，不能沿用旧参数执行");
      return tool;
    }
    return [definition.name, {
      version: definition.version, effect: "none", parameters,
      async approve(ctx, input, scope) {
        try {
          const tool = await current(ctx, scope.execution, scope.signal);
          if (!parameters.safeParse(input).success) return { status: "unavailable" };
          return await getChatToolApprovalDecider(tool)?.(input) ?? { status: "not-applicable" };
        } catch { return { status: "unavailable" }; }
      },
      async execute(ctx, input, scope) {
        try {
          const tool = await current(ctx, scope.execution, scope.signal);
          const checked = parameters.safeParse(input);
          if (!checked.success) return agenticToolOutcomeSchema.parse({status:"error",summary:"工具参数不符合定义",evidence:[],error:{code:"invalid_input",retryable:false,recovery:"修正参数后继续"},continuation:null,sideEffect:"none"});
          const approval = await getChatToolApprovalDecider(tool)?.(checked.data);
          if (approval && approval.status !== "not-applicable") return failure("blocked", "permission", false, "本次读取需要恢复工具授权");
          scope.signal.throwIfAborted();
          const result = await getChatToolNativeExecutor(tool)!(checked.data, { abortSignal: scope.signal });
          // 沿用旧工具的JSON序列化，省略DTO可选undefined；不改变卡片字段和实际内容。
          const data = z.json().parse(JSON.parse(JSON.stringify(result)));
          const record = data && typeof data === "object" && !Array.isArray(data) ? data : {};
          if (record.kind !== definition.name) throw new Error("只读结果类型与工具不符");
          const failed = typeof record.error === "string" && record.error.length > 0;
          return agenticToolOutcomeSchema.parse({ status: failed ? "error" : "ok", summary: failed ? "读取未完成，请查看工具结果" : "已读取当前工具结果", evidence: [], data, error: failed ? {code:"no_evidence",retryable:false,recovery:"检查工具结果后继续"} : null, continuation: null, sideEffect: "none" });
        } catch (error) {
          if (scope.signal.aborted) return failure("error", "cancelled", false, "读取已停止");
          const classified = classifyLlmError(error);
          if (classified.reason === "auth_401" || classified.reason === "auth_403") return failure("blocked", "permission", false, "当前读取权限不可用");
          return failure("error", classified.retryable ? "transient" : "no_evidence", classified.retryable, "读取未完成，可检查权限与目标状态后继续");
        }
      },
    } satisfies ChatBackendTool];
  }));
}

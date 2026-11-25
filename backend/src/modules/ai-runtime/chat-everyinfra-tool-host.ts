import type { createChatHostContextReader } from "../ai/chat-host-context.service";
import type { ChatBackendTool } from "../execution/execution-chat-tool-ports.service";
import type { ChatWorkerDispatcherDeps } from "../execution/model-worker-dispatcher";
import { prepareChatToolDefinitions } from "./chat-tool-definitions";
import { buildEveryInfraTool } from "./chat-everyinfra-tool";
import { canonicalJson } from "../ai/canonical-json";

const toolName = "everyinfra.query";
export function createChatEveryInfraTaskToolHost(
  reader: Pick<ReturnType<typeof createChatHostContextReader>, "read">,
): NonNullable<ChatWorkerDispatcherDeps["resolveTools"]> {
  return async (context, input, ref, signal): Promise<Record<string, ChatBackendTool>> => {
    signal.throwIfAborted();
    if (!input.tools.some(tool => tool.name === toolName)) return {};
    const restored = await reader.read({ ...ref });
    signal.throwIfAborted();
    const frozen = restored.modelInput.tools.find(tool => tool.name === toolName);
    if (!frozen) return {};
    const matches = (left: typeof context, right: typeof context) =>
      left.userId === right.userId && (left.accountId ?? null) === (right.accountId ?? null) &&
        (left.groupId ?? null) === (right.groupId ?? null);
    if (!context.userId || (!context.accountId && !context.groupId) || !matches(context, restored.context)) {
      throw new Error("万有引擎工具归属与原任务不符");
    }
    const prepared = await prepareChatToolDefinitions({ [toolName]: buildEveryInfraTool() });
    if (canonicalJson(frozen) !== canonicalJson(prepared.definitions[0])) {
      throw new Error("万有引擎工具定义与原任务不符");
    }
    return {
      [toolName]: {
        version: frozen.version,
        effect: "committed",
        execution: "worker.everyinfra",
        parameters: prepared.parameters[toolName]!.parameters,
        async approve(current, _input, scope) {
          scope.signal?.throwIfAborted();
          const latest = await reader.read({ ...scope.execution });
          scope.signal?.throwIfAborted();
          return matches(latest.context, current) ? { status: "not-applicable" } : { status: "unavailable" };
        },
      },
    };
  };
}

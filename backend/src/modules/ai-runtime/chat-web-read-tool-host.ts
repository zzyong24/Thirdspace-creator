import type { ChatBackendTool } from "../execution/execution-chat-tool-ports.service";
import type { createChatHostContextReader } from "../ai/chat-host-context.service";
import type { ChatWorkerDispatcherDeps } from "../execution/model-worker-dispatcher";
import { buildChatTools, type ChatToolDeps } from "./chat-tools";
import { prepareChatToolDefinitions } from "./chat-tool-definitions";
import { canonicalJson } from "../ai/canonical-json";

/** 宿主只恢复冻结定义和真实归属，网页动作由 Worker 执行。 */
export function createChatWebReadTaskToolHost(reader: Pick<ReturnType<typeof createChatHostContextReader>, "read">): NonNullable<ChatWorkerDispatcherDeps["resolveTools"]> {
  return async (context, _input, ref, signal): Promise<Record<string, ChatBackendTool>> => {
    const owner = { userId: context.userId, accountId: context.accountId };
    signal.throwIfAborted(); const restored = await reader.read({ ...ref }); signal.throwIfAborted();
    if (!owner.userId || !owner.accountId || restored.context.userId !== owner.userId || restored.context.accountId !== owner.accountId) throw new Error("网页工具账号与原任务不符");
    const frozen = restored.modelInput.tools.find((tool) => tool.name === "web.read");
    if (!frozen) return {};
    const prepared = await prepareChatToolDefinitions(buildChatTools(["web.read"], {} as ChatToolDeps), { workerWebRead: true });
    if (canonicalJson(frozen) !== canonicalJson(prepared.definitions[0])) throw new Error("网页工具定义与原任务不符");
    return { "web.read": { version: frozen.version, effect: "committed", execution: "worker.web-read", parameters: prepared.parameters["web.read"]!.parameters,
      async approve(current, _input, scope) {
        scope.signal?.throwIfAborted(); const latest = await reader.read({ ...scope.execution }); scope.signal?.throwIfAborted();
        return latest.context.userId === current.userId && latest.context.accountId === current.accountId ? { status: "not-applicable" as const } : { status: "unavailable" as const };
      },
    } };
  };
}

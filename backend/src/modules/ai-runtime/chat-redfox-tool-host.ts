import type { ChatBackendTool } from "../execution/execution-chat-tool-ports.service";
import type { createChatHostContextReader } from "../ai/chat-host-context.service";
import type { ChatWorkerDispatcherDeps } from "../execution/model-worker-dispatcher";
import { buildChatTools, type ChatToolDeps } from "./chat-tools";
import { prepareChatToolDefinitions } from "./chat-tool-definitions";
import { canonicalJson } from "../ai/canonical-json";

/** 宿主只恢复冻结定义和真实归属，RedFox动作由 Worker 执行。 */
export function createChatRedfoxTaskToolHost(reader: Pick<ReturnType<typeof createChatHostContextReader>, "read">): NonNullable<ChatWorkerDispatcherDeps["resolveTools"]> {
  return async (context, _input, ref, signal): Promise<Record<string, ChatBackendTool>> => {
    const owner = { userId: context.userId, accountId: context.accountId??null,groupId:context.groupId??null };
    signal.throwIfAborted(); const restored = await reader.read({ ...ref }); signal.throwIfAborted();
    if (!owner.userId || (!owner.accountId && !owner.groupId) || restored.context.userId !== owner.userId || (restored.context.accountId??null)!==owner.accountId || (restored.context.groupId??null)!==owner.groupId) throw new Error("RedFox工具账号与原任务不符");
    const frozen = restored.modelInput.tools.find((tool) => tool.name === "redfox.query");
    if (!frozen) return {};
    const prepared = await prepareChatToolDefinitions(buildChatTools(["redfox.query"], {} as ChatToolDeps), {});
    if (canonicalJson(frozen) !== canonicalJson(prepared.definitions[0])) throw new Error("RedFox工具定义与原任务不符");
    return { "redfox.query": { version: frozen.version, effect: "committed", execution: "worker.redfox", parameters: prepared.parameters["redfox.query"]!.parameters,
      async approve(current, _input, scope) {
        scope.signal?.throwIfAborted(); const latest = await reader.read({ ...scope.execution }); scope.signal?.throwIfAborted();
        return latest.context.userId === current.userId && latest.context.accountId === current.accountId ? { status: "not-applicable" as const } : { status: "unavailable" as const };
      },
    } };
  };
}

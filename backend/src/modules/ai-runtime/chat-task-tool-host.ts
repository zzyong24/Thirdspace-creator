import type {createChatHostContextReader} from "../ai/chat-host-context.service";
import type {ChatWorkerDispatcherDeps} from "../execution/model-worker-dispatcher";
import type {ContextReaders} from "./chat-runner";
import {createChatReadTaskToolHost} from "./chat-read-tool-resolver";
import {createChatHooksTaskToolHost} from "./chat-hooks-tool-host";
import {createChatCandidateTaskToolHost} from "./chat-candidate-tool-host";

/** 同一租约装配已迁移工具；完整冻结清单仍由调度器验证，未迁移工具不可静默删掉。 */
export function createChatTaskToolHost(
 reader:Pick<ReturnType<typeof createChatHostContextReader>,"read">,
 readers:ContextReaders,
):NonNullable<ChatWorkerDispatcherDeps["resolveTools"]>{
 const read=createChatReadTaskToolHost(reader,readers),hooks=createChatHooksTaskToolHost(reader),candidates=createChatCandidateTaskToolHost(reader,readers);
 return async(context,input,execution,signal)=>{
  const [readTools,hookTools,candidateTools]=await Promise.all([read(context,input,execution,signal),hooks(context,input,execution,signal),candidates(context,input,execution,signal)]);
  signal.throwIfAborted();
  return {...readTools,...hookTools,...candidateTools};
 };
}

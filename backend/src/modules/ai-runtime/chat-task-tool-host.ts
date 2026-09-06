import {createChatWebReadTaskToolHost} from "./chat-web-read-tool-host";
import {createChatResearchTaskToolHost} from "./chat-research-tool-host";
import {createChatStructuredTaskToolHost,type ChatStructuredToolPorts} from "./chat-structured-tool-host";
import {createChatLocalTaskToolHost,type ChatLocalToolPorts} from "./chat-local-tool-host";
import {createChatPlanningTaskHost,type ChatPlanningTaskPorts} from "./chat-planning-task-host";
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
 ports:{webRead?:boolean;research?:boolean;planning?:ChatPlanningTaskPorts;local?:ChatLocalToolPorts;structured?:ChatStructuredToolPorts}={},
):NonNullable<ChatWorkerDispatcherDeps["resolveTools"]>{
 const webRead=ports.webRead?createChatWebReadTaskToolHost(reader):null;
 const research=ports.research?createChatResearchTaskToolHost(reader):null;
 const structured=ports.structured?createChatStructuredTaskToolHost(reader,ports.structured):null;
 const read=createChatReadTaskToolHost(reader,readers),hooks=createChatHooksTaskToolHost(reader),candidates=createChatCandidateTaskToolHost(reader,readers);
 const planning=ports.planning?createChatPlanningTaskHost(reader,ports.planning):null,local=ports.local?createChatLocalTaskToolHost(reader,ports.local):null;
 return async(context,input,execution,signal)=>{
  const groups=await Promise.all([webRead?.(context,input,execution,signal)??{},research?.(context,input,execution,signal)??{},read(context,input,execution,signal),hooks(context,input,execution,signal),candidates(context,input,execution,signal),planning?.(context,input,execution,signal)??{},local?.(context,input,execution,signal)??{},structured?.(context,input,execution,signal)??{}]);
  signal.throwIfAborted();
  return Object.assign({},...groups);
 };
}

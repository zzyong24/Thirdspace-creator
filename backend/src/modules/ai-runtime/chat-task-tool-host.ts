import {createChatCoverTaskHost,type ChatCoverTaskPorts} from "./chat-cover-task-host";
import {createChatAgenticResearchTaskHost,type ChatAgenticResearchTaskPorts} from "./chat-agentic-research-task-host";
import {createChatPublishTaskHost,type ChatPublishTaskPorts} from "./chat-publish-task-host";
import {createChatScriptDraftTaskHost,type ChatScriptDraftTaskPorts} from "./chat-script-draft-tool-host";
import {createChatVideoEditTaskToolHost,type ChatVideoEditPorts} from "./chat-video-edit-tool-host";
import {createChatReviewTaskHost,type ChatReviewTaskPorts} from "./chat-review-task-host";
import {createChatScriptPatchTaskToolHost,type ChatScriptPatchPorts} from "./chat-script-patch-tool-host";
import {createChatWebReadTaskToolHost} from "./chat-web-read-tool-host";
import {createChatLocalReadTaskToolHost,type ChatLocalReadPorts} from "./chat-local-read-tool-host";
import {createChatResearchTaskToolHost} from "./chat-research-tool-host";
import {createChatStructuredTaskToolHost,type ChatStructuredToolPorts} from "./chat-structured-tool-host";
import {createChatLocalTaskToolHost,type ChatLocalToolPorts} from "./chat-local-tool-host";
import {createChatPlanningTaskHost,type ChatPlanningTaskPorts} from "./chat-planning-task-host";
import {createChatMaterialTaskHost,type ChatMaterialTaskPorts} from "./chat-material-task-host";
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
 ports:{cover?:ChatCoverTaskPorts;agenticResearch?:ChatAgenticResearchTaskPorts;publish?:ChatPublishTaskPorts;scriptDraft?:ChatScriptDraftTaskPorts;videoEdit?:ChatVideoEditPorts;review?:ChatReviewTaskPorts;scriptPatch?:ChatScriptPatchPorts;webRead?:boolean;research?:boolean;planning?:ChatPlanningTaskPorts;material?:ChatMaterialTaskPorts;local?:ChatLocalToolPorts;localRead?:ChatLocalReadPorts;structured?:ChatStructuredToolPorts}={},
):NonNullable<ChatWorkerDispatcherDeps["resolveTools"]>{
 const agenticResearch=ports.agenticResearch?createChatAgenticResearchTaskHost(reader,ports.agenticResearch):null;
 const publish=ports.publish?createChatPublishTaskHost(reader,ports.publish):null;
 const scriptDraft=ports.scriptDraft?createChatScriptDraftTaskHost(reader,ports.scriptDraft):null;
 const webRead=ports.webRead?createChatWebReadTaskToolHost(reader):null;
 const videoEdit=ports.videoEdit?createChatVideoEditTaskToolHost(reader,ports.videoEdit):null;
 const localRead=ports.localRead?createChatLocalReadTaskToolHost(reader,ports.localRead):null;
 const research=ports.research?createChatResearchTaskToolHost(reader):null;
 const structured=ports.structured?createChatStructuredTaskToolHost(reader,ports.structured):null;
 const review=ports.review?createChatReviewTaskHost(reader,ports.review):null;
 const scriptPatch=createChatScriptPatchTaskToolHost(reader,readers,ports.scriptPatch);
 const read=createChatReadTaskToolHost(reader,readers),hooks=createChatHooksTaskToolHost(reader),candidates=createChatCandidateTaskToolHost(reader,readers);
 const planning=ports.planning?createChatPlanningTaskHost(reader,ports.planning):null,local=ports.local?createChatLocalTaskToolHost(reader,ports.local):null;
 const cover=ports.cover?createChatCoverTaskHost(reader,readers,ports.cover):null;
 const material=ports.material?createChatMaterialTaskHost(reader,readers,ports.material):null;
 return async(context,input,execution,signal)=>{
  const groups=await Promise.all([cover?.(context,input,execution,signal)??{},agenticResearch?.(context,input,execution,signal)??{},review?.(context,input,execution,signal)??{},scriptPatch(context,input,execution,signal),webRead?.(context,input,execution,signal)??{},localRead?.(context,input,execution,signal)??{},research?.(context,input,execution,signal)??{},read(context,input,execution,signal),hooks(context,input,execution,signal),candidates(context,input,execution,signal),planning?.(context,input,execution,signal)??{},material?.(context,input,execution,signal)??{},local?.(context,input,execution,signal)??{},structured?.(context,input,execution,signal)??{}]);
  groups.push(await publish?.(context,input,execution,signal)??{});
  groups.push(await scriptDraft?.(context,input,execution,signal)??{});
  groups.push(await videoEdit?.(context,input,execution,signal)??{});
  signal.throwIfAborted();
  return Object.assign({},...groups);
 };
}

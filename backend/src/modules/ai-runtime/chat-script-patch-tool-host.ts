import type {RequestContext} from "@creatoros/contract";
import type {createChatHostContextReader} from "../ai/chat-host-context.service";
import type {ChatWorkerDispatcherDeps} from "../execution/model-worker-dispatcher";
import type {ContextReaders} from "./chat-assembly-types";
import {buildChatTools,type ChatToolDeps} from "./chat-tools";
import {prepareChatToolDefinitions} from "./chat-tool-definitions";
import {canonicalJson} from "../ai/canonical-json";
import {createChatHostToolAdapter,type ResolveChatHostTools} from "./chat-host-tool-adapter";
export interface ChatScriptPatchPorts {
 resolveSelection(context:RequestContext,input:{artifactId:string;versionId?:string;sectionId:string;sectionIndex?:number;excerpt:string}):Promise<{artifactId:string;versionId:string;sectionId:string;originalText:string}|null>;
}
const effects=Object.freeze({"script.patch":"proposal"} as const);
/** 只投影模型已经提出的单段候选；原文、版本与归属均由宿主当前读源校验。 */
export function createChatScriptPatchTaskToolHost(
 reader:Pick<ReturnType<typeof createChatHostContextReader>,"read">,
 readers:Pick<ContextReaders,"getArtifactText">,
 ports?:ChatScriptPatchPorts,
):NonNullable<ChatWorkerDispatcherDeps["resolveTools"]>{
 const resolve:ResolveChatHostTools=async(context,execution,signal)=>{
  const owner={userId:context.userId,accountId:context.accountId??null,groupId:context.groupId??null};signal?.throwIfAborted();
  const restored=structuredClone(await reader.read({...execution}));signal?.throwIfAborted();
  if(!owner.userId || (!owner.accountId && !owner.groupId) || restored.context.userId!==owner.userId || (restored.context.accountId??null)!==owner.accountId || (restored.context.groupId??null)!==owner.groupId)throw new Error("改稿工具账号与原任务不符");
  const definitions=restored.modelInput.tools.filter(tool=>tool.name==="script.patch");
  if(!definitions.length)return {};
  const {projectId,selection}=restored.hostContext.chatContext;
  const readArtifact=async()=>{
   if(!projectId || !readers.getArtifactText)throw new Error("当前稿读取端口未装配");
   signal?.throwIfAborted();const value=await readers.getArtifactText(restored.context,{projectId,artifactType:"output_script"});signal?.throwIfAborted();return value;
  };
  let anchor:ChatToolDeps["scriptPatchAnchor"];
  let validateScriptPatchAnchor:ChatToolDeps["validateScriptPatchAnchor"];
  if(selection?.kind==="script_section" && selection.artifactId?.trim() && selection.versionId?.trim() && selection.ids[0]?.trim() && selection.excerpt?.trim()){
   anchor={artifactId:selection.artifactId.trim(),versionId:selection.versionId.trim(),sectionId:selection.ids[0].trim(),originalText:selection.excerpt};
   const frozenAnchor=anchor;
   validateScriptPatchAnchor=async()=>{
    signal?.throwIfAborted();
    let current:typeof frozenAnchor|null=null;
    if(ports){current=await ports.resolveSelection(restored.context,{artifactId:frozenAnchor.artifactId,versionId:frozenAnchor.versionId,sectionId:frozenAnchor.sectionId,sectionIndex:selection.sectionIndex,excerpt:frozenAnchor.originalText});signal?.throwIfAborted();}
    else {
     const raw=await readArtifact(),matches=raw?.sections?.filter(section=>section.sectionRef===frozenAnchor.sectionId)??[];
     if(raw?.artifactId && raw.currentVersionId && matches.length===1)current={artifactId:raw.artifactId,versionId:raw.currentVersionId,sectionId:matches[0]!.sectionRef,originalText:matches[0]!.body};
    }
    if(!current || current.artifactId!==frozenAnchor.artifactId || current.versionId!==frozenAnchor.versionId || current.sectionId!==frozenAnchor.sectionId || current.originalText!==frozenAnchor.originalText)throw new Error("选中段落或版本已改变，请重新读取当前稿后生成补丁");
   };
  }

  const tools=buildChatTools(["script.patch"],{boundProjectId:projectId??undefined,...(anchor?{scriptPatchAnchor:anchor}:{}),getArtifactText:readArtifact,validateScriptPatchAnchor} as unknown as ChatToolDeps);
  if(canonicalJson((await prepareChatToolDefinitions(tools)).definitions)!==canonicalJson(definitions))throw new Error("改稿工具定义与原任务不符");
  signal?.throwIfAborted();return tools;
 };
 return async(context,_input,execution,signal)=>{
  const prototypes=await resolve(context,execution,signal);
  return createChatHostToolAdapter(prototypes,resolve,effects);
 };
}

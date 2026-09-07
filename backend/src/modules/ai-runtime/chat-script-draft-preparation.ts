import {clampExtraBrief,resolveScriptDraftSourceSnapshots,resolveVerbatimSource,type VerbatimSource,type ScriptDraftSourceSnapshot} from "./chat-tools";
import {prepareScriptImportAuthorization,parseSemanticVerbatimSelection} from "./chat-script-import-authorization";

export interface ScriptDraftGenerateInput {
 topic?:string;angle?:string;targetDurationSeconds?:number;extraBrief?:string;
 instruction?:string;sourceSnapshots?:ScriptDraftSourceSnapshot[];
}
export interface ScriptDraftVerbatimInput {
 draftMode:"verbatim";verbatimSourceRef:string;verbatimSourceText:string;
 verbatimSourceLength:number;verbatimSourceSha256:string;
}
export type PreparedScriptDraftInput=
 |{mode:"generate";dispatchInput:ScriptDraftGenerateInput}
 |{mode:"verbatim";source:VerbatimSource;authorization:{prompt:string;system:string}};

/** 仅从宿主来源恢复输入；不执行模型，也不接受调用参数中的正文或授权字段。 */
export function prepareScriptDraftInput(args:Record<string,unknown>,sources:readonly VerbatimSource[],latestUserInstruction:string):PreparedScriptDraftInput {
 const {mode,topic,angle,targetDurationSeconds,extraBrief,instruction,sourceRefs,sourceRef,startAnchor,endAnchor}=args;
 if(mode==="verbatim"){
  const selectedRef=typeof sourceRef==="string"?sourceRef.trim():"";
  const selected=sources.find(item=>item.ref===selectedRef);
  if(!selected)throw new Error(selectedRef?"原稿引用已失效，请在当前对话中重新选择或粘贴原文。":"原文保真需要选择一条受信来源，请重新指定原稿。");
  const source=structuredClone(selected);
  return {mode:"verbatim",source,authorization:prepareScriptImportAuthorization({source,latestUserInstruction,
   ...(typeof startAnchor==="string" && startAnchor?{suggestedStartAnchor:startAnchor}:{}),
   ...(typeof endAnchor==="string" && endAnchor?{suggestedEndAnchor:endAnchor}:{})})};
 }
 return {mode:"generate",dispatchInput:{
  topic:typeof topic==="string" && topic.trim()?topic.trim():undefined,
  angle:typeof angle==="string" && angle.trim()?angle.trim():undefined,
  targetDurationSeconds:typeof targetDurationSeconds==="number"?targetDurationSeconds:undefined,
  extraBrief:clampExtraBrief(extraBrief),
  ...(Array.isArray(sourceRefs) && sourceRefs.length>0?{
   instruction:typeof instruction==="string" && instruction.trim()?instruction.trim().slice(0,4000):(()=>{throw new Error("基于资料创作时需要保留用户本轮调整方向，请重新发起。");})(),
   sourceSnapshots:resolveScriptDraftSourceSnapshots(sources,sourceRefs),
  }:{}),
 }};
}

/** prepared 必须由宿主冻结准备恢复；rawModelText 必须来自宿主确认的模型回执。 */
export function finalizeScriptDraftImport(prepared:Extract<PreparedScriptDraftInput,{mode:"verbatim"}>,rawModelText:string):ScriptDraftVerbatimInput {
 const decision=parseSemanticVerbatimSelection(rawModelText);
 if(!decision)throw new Error("AI 没能可靠识别完整稿件边界，请再明确哪一段是稿件正文后重试。");
 if(!decision.authorized)throw new Error(decision.reason?.trim() || "这轮只收到了稿件，还没有明确要求写入稿面；请确认后再生成候选。");
 const resolved=resolveVerbatimSource([prepared.source],{sourceRef:prepared.source.ref,startAnchor:decision.startAnchor,endAnchor:decision.endAnchor});
 return {draftMode:"verbatim",verbatimSourceRef:resolved.ref,verbatimSourceText:resolved.text,verbatimSourceLength:resolved.length,verbatimSourceSha256:resolved.sha256};
}

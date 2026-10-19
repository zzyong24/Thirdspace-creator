"use client";

import * as React from "react";
import {TriangleAlert, HelpCircle} from "lucide-react";

type Phase="read"|"candidate"|"queued"|"running"|"completed"|"partial"|"error"|"blocked"|"unknown";
export type ChatToolOutcomeView={data:unknown;phase:Phase;blocksData:boolean;reason:string|null;recovery:string|null;callId:string|null};
const object=(value:unknown):Record<string,unknown>|null=>value!==null&&typeof value==="object"&&!Array.isArray(value)?value as Record<string,unknown>:null;
// SEMANTIC_BOUNDARY_ALLOW: 仅阻止诊断路径、凭据和堆栈进入提示，不判断创作语义或选择内容。
function safeText(value:unknown,fallback:string){
 if(typeof value!=="string"||!value.trim())return fallback;
 if(value.length>600||/https?:\/\/|(?:\/Users\/|\/home\/|[A-Z]:\\)|(?:api[_-]?key|authorization|password|secret|token)\s*[:=]|sk-[\w-]+|-----BEGIN|\bat\s+\S+\s*\([^)]*:\d+|\.[cm]?[jt]sx?:\d+/i.test(value))return fallback;
 return value.trim();
}
const candidateKinds=new Set(["work.editor.candidate","work.creation.propose","canvas.proposal","canvas.create.proposal","canvas.generate.proposal","system.action.proposal","topic.candidates"]);
/** 展示协议只剥离宿主字段，不修改消息；业务卡继续使用原来的严格合同。折叠时不序列化。 */
export function readChatToolOutcome(raw:unknown):ChatToolOutcomeView{
 const record=object(raw),host=record?object(record.__creatorosOutcome):null;
 const {__creatorosOutcome:_,...business}=record??{};
 const data=record&&Object.hasOwn(record,"__creatorosOutcome")?business:raw;
 const legacyOutcome=record&&typeof record.status==="string"&&typeof record.sideEffect==="string"?record:null;
 const outcome=host??legacyOutcome,error=object(outcome?.error),businessError=object(data)?.error;
 let phase:Phase="read";
 if(record&&Object.hasOwn(record,"__creatorosOutcome")&&(!host||host.schemaVersion!==1||typeof host.callId!=="string"||!["ok","partial","error","blocked"].includes(String(host.status))))phase="unknown";
 else if(outcome?.sideEffect==="unknown"||error?.code==="unknown_commit")phase="unknown";
 else if(outcome?.status==="error")phase="error";
 else if(outcome?.status==="blocked")phase="blocked";
 else if(typeof businessError==="string"&&businessError.trim())phase="error";
 else if(outcome?.status==="partial")phase="partial";
 else if(object(data)?.status==="queued")phase="queued";
 else if(object(data)?.status==="running")phase="running";
 else if(outcome?.sideEffect==="proposal"||candidateKinds.has(String(object(data)?.kind)))phase="candidate";
 else if(outcome?.sideEffect==="committed")phase="completed";
 const blocksData=phase==="error"||phase==="blocked"||phase==="unknown";
 const reason=blocksData||phase==="partial"?safeText(businessError??outcome?.summary,phase==="unknown"?"这次操作的结果尚未确认。":"这次操作未完整完成。"):null;
 const recovery=phase==="unknown"?"核对原任务或原操作的结果后继续；请勿重复提交。":blocksData||phase==="partial"?safeText(error?.recovery,phase==="blocked"?"补齐所需输入或权限后，继续原操作。":"保留当前内容，核对原任务的原因后继续。"):null;
 return {data,phase,blocksData,reason,recovery,callId:typeof host?.callId==="string"?host.callId:null};
}

/** 只呈现真实原因与下一步，不制造重试按钮或空数据成功卡。 */
export function ChatToolOutcomeNotice({outcome}:{outcome:ChatToolOutcomeView}){
 if(!outcome.blocksData&&outcome.phase!=="partial")return null;
 const Icon=outcome.phase==="unknown"?HelpCircle:TriangleAlert;
 return <div role="status" data-slot="copilot-tool-outcome-notice" className="mt-2 flex items-start gap-2 rounded-lg border border-border bg-surface-subtle px-3 py-2.5 text-sm">
  <Icon aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-warning"/>
  <div className="min-w-0 space-y-1"><p className="break-words text-foreground">{outcome.reason}</p><p className="break-words text-xs leading-relaxed text-muted-foreground">{outcome.recovery}</p></div>
 </div>;
}

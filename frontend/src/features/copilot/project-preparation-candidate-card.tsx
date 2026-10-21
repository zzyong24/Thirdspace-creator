"use client";

import * as React from "react";
import {useRouter} from "next/navigation";
import type {ProjectPreparationCandidate} from "@creatoros/contract";
import {Button} from "@/components/ui/button";
import {useProjectPreparation} from "@/features/draft-workbench/project-preparation-context";
import {useDraftChatRequest} from "@/features/draft-workbench/draft-chat-request";

const FIELDS=[['targetAudience','目标观众'],['contentGoal','内容目标'],['contentFormat','内容形式'],['coreMessage','核心信息'],['durationEstimate','预估时长'],['successCriteria','成功标准']] as const;
export interface PreparationCardProps {candidate:ProjectPreparationCandidate;projectId:string;current?:Record<string,unknown>|null}

export function ProjectPreparationCandidateCard({candidate,projectId,current}:PreparationCardProps){
  const state=useProjectPreparation(),chat=useDraftChatRequest(),router=useRouter();
  const [expanded,setExpanded]=React.useState(false),[pending,setPending]=React.useState(false),[message,setMessage]=React.useState<string|null>(null),[saved,setSaved]=React.useState(false);
  const flight=React.useRef(false);
  const content=candidate.content;
  const accepted=saved||candidate.status==="accepted";
  const adopt=async()=>{
    if(flight.current||!state||state.projectId!==projectId)return;
    flight.current=true;setPending(true);setMessage(null);
    try{
      const isCurrent=content?.kind==="draft"?chat.captureScriptAdoption(projectId,state.scopeKey):()=>true;
      const receipt=await state.accept(candidate);
      if(receipt.projectId!==projectId||receipt.candidateId!==candidate.id)throw Error("采纳回执不属于当前项目，请重新读取。");
      setSaved(true);
      if(!isCurrent()){setMessage("候选已保存；期间的输入已保留，请核对正式版本，未覆盖当前稿。");return;}
      // 只读回后端正式版本；不把候选正文直接灌入编辑器或触发第二次自动保存。
      router.refresh();
    }catch(error){setMessage(error instanceof Error?error.message:"采纳未完成，请核对原回执。");}
    finally{flight.current=false;setPending(false);}
  };
  return <div data-slot="preparation-candidate-card" data-candidate-id={candidate.id} className="mb-3 rounded-card border border-border bg-surface p-3">
    <h3 className="text-sm font-semibold">{candidate.kind==="brief"?"资料补全候选":"初稿候选"} · {accepted?"已采纳":"待采纳"}</h3>
    {accepted?<p role="status" className="mt-2 text-sm text-success">已取得采纳回执，正式内容由服务端保存。</p>:null}
    {candidate.contentError?<p role="alert" className="mt-2 text-sm text-destructive">{candidate.contentError}</p>:null}
    {!accepted&&content?<Button type="button" size="sm" variant="ghost" aria-expanded={expanded} onClick={()=>setExpanded(value=>!value)}>{expanded?"收起候选":"展开候选"}</Button>:null}
    {expanded&&content?.kind==="draft"?<p className="max-h-80 overflow-auto whitespace-pre-wrap break-words text-sm leading-6">{content.text}</p>:null}
    {expanded&&content?.kind==="brief"?<div className="max-h-80 overflow-auto"><table className="w-full text-left text-xs"><thead><tr><th>字段</th><th>现值</th><th>建议值</th></tr></thead><tbody>{FIELDS.map(([field,label])=><tr key={field} className="border-t border-border align-top"><th className="py-2 pr-2 font-medium">{label}</th><td className="max-w-40 whitespace-pre-wrap break-words py-2 pr-2">{typeof current?.[field]==="string"?String(current[field])||"未填":"未填"}</td><td className="max-w-40 whitespace-pre-wrap break-words py-2 text-brand">{typeof content.briefDetail[field]==="string"?String(content.briefDetail[field])||"未填":"未填"}</td></tr>)}</tbody></table></div>:null}
    {!accepted&&content&&candidate.baseline&&!candidate.contentError&&candidate.status==="pending"?<Button type="button" className="mt-2" size="sm" disabled={pending||state?.busy||!state} onClick={()=>void adopt()}>{pending?"采纳中…":candidate.kind==="brief"?"采纳资料补全":"采纳初稿"}</Button>:null}
    {message?<p role={accepted?"status":"alert"} className="mt-2 text-sm">{message}</p>:null}
  </div>;
}

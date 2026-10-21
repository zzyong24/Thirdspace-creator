"use client";

import * as React from "react";
import { CheckCircle2, Circle, Loader2, MinusCircle } from "lucide-react";
import type {ProjectSource,ProjectPreparationStepStatus} from "@creatoros/contract";
import {Button} from "@/components/ui/button";
import {useProjectPreparation} from "./project-preparation-context";

export type PipelineOrigin=ProjectSource;
export const BRIEF_FILL_PREFILL="请根据项目已有资料提出补全候选，保留真实信息，等待我采纳。";
const ORIGIN_LABEL:Record<ProjectSource,string>={manual:"手动新建",topic:"来自选题",radar:"来自内容雷达",imported:"真实导入作品",assistant:"来自助手",quick_create:"快速创作"};
const STATE_LABEL:Record<ProjectPreparationStepStatus,string>={not_required:"不需要",pending:"待处理",queued:"排队中",running:"进行中",waiting_user:"等待补充",candidate_ready:"候选已生成，待采纳",done:"已完成",failed:"失败",blocked:"准备受阻",unknown_result:"结果待确认",paused:"已暂停",cancelled:"已取消"};
const STEP_LABEL={transcript:"转写正文",source_draft:"来源拆解与初稿",brief:"资料补全"};
const showsCurrentError=(status:ProjectPreparationStepStatus)=>["failed","blocked","waiting_user","unknown_result","paused"].includes(status);

export function ProjectPipelinePanel({projectId,origin="manual"}:{projectId:string;title?:string;origin?:ProjectSource}) {
  const state=useProjectPreparation();
  const [message,setMessage]=React.useState<string|null>(null);
  const [manual,setManual]=React.useState(false),[text,setText]=React.useState("");
  const [referenceId,setReferenceId]=React.useState("");
  const preparation=state?.projectId===projectId?state.preparation:null;
  const run=async(action:()=>Promise<unknown>)=>{setMessage(null);try{await action();}catch(error){setMessage(error instanceof Error?error.message:"操作未完成，请核对原任务。");}};
  const references=preparation?.sourceReferences??[];
  const transcript=preparation?.steps.find(step=>step.name==="transcript");
  const selected=references.find(ref=>ref.id===referenceId)??(references.length===1?references[0]:null);
  const doneCount=preparation?.steps.filter(step=>["done","not_required"].includes(step.status)).length??0;
  return <section id="pipeline" data-slot="project-pipeline" aria-labelledby="project-pipeline-title" className="scroll-mt-20 rounded-card border border-border bg-surface p-5">
    <h2 id="project-pipeline-title" className="text-base font-semibold text-foreground">项目准备</h2>
    <p className="mt-1 text-sm text-muted-foreground">{ORIGIN_LABEL[preparation?.origin??origin]}{preparation?.registration==="registered"?` · 已完成 ${doneCount}/${preparation.steps.length} 步`:""}</p>
    {state?.error?<p role="alert" className="mt-3 text-sm text-destructive">状态暂时无法读取：{state.error}</p>:null}
    {!preparation&&!state?.error?<p role="status" className="mt-3 text-sm text-muted-foreground">正在读取项目准备状态…</p>:null}
    {message?<p role="alert" className="mt-3 text-sm text-destructive">{message}</p>:null}
    {preparation?.lastError&&preparation.steps.some(step=>showsCurrentError(step.status))?<p className="mt-3 text-sm text-warning">{preparation.lastError.message}</p>:null}
    {state?<Button type="button" size="sm" variant="ghost" disabled={state.busy} onClick={()=>void run(state.reload)}>重新读取状态</Button>:null}
    <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(200px,0.8fr)_minmax(0,2fr)]">
      <div data-slot="pipeline-source" className="min-w-0 rounded-xl bg-surface-subtle p-4">
        <h3 className="text-sm font-semibold">来源素材</h3>
        {references.length?<ul className="mt-2 space-y-2">{references.map(ref=><li key={ref.id} className="min-w-0 text-sm">
          {ref.url?<a className="break-all text-brand hover:underline" href={ref.url} target="_blank" rel="noreferrer">{ref.sourceKind==="platform_work"?`${ref.platform} · ${ref.externalId}`:"查看原始素材"}</a>:<span>{ref.sourceKind==="platform_work"?`${ref.platform} · ${ref.externalId}`:"原始素材"}</span>}
          <span className="block text-xs text-text-subtle">{ref.bodyAvailable?"来源正文可用":"待补充来源正文"}</span>
        </li>)}</ul>:<p className="mt-2 text-sm text-muted-foreground">{preparation?"未记录外部来源，可继续手写和保存。":"来源状态待读取。"}</p>}
      </div>
      <div className="min-w-0">
        {preparation?.registration==="not_registered"?<div className="rounded-xl border border-border p-4"><p className="text-sm">未登记准备流程</p><p className="mt-2 text-sm text-muted-foreground">按需启动准备；已有资料和稿件仍可继续编辑。</p>{preparation.availableActions.includes("start")?<Button className="mt-3" size="sm" disabled={state?.busy} onClick={()=>void run(()=>state!.start(null))}>启动项目准备</Button>:null}</div>:null}
        <ol aria-label="项目自动处理步骤" className="grid min-w-0 gap-3 md:grid-cols-3">{preparation?.steps.map(step=>{
          const candidates=preparation.candidates.filter(candidate=>candidate.kind===(step.name==="brief"?"brief":"draft")&&candidate.status!=="rejected");
          const accepted=step.status==="candidate_ready"&&candidates.length>0&&candidates.every(candidate=>candidate.acceptanceReceipt!==null);
          const Icon=step.status==="done"?CheckCircle2:step.status==="not_required"?MinusCircle:step.status==="running"?Loader2:Circle;
          return <li key={step.name} data-step={step.name} data-state={step.status} className="flex min-w-0 flex-col gap-2 rounded-xl border border-border p-4">
            <h3 className="text-sm font-semibold">{STEP_LABEL[step.name]}</h3>
            <p className="flex items-center gap-1.5 text-xs"><Icon className={`size-3.5 ${step.status==="running"?"animate-spin motion-reduce:animate-none":""}`} aria-hidden="true"/>{accepted?"候选已采纳":STATE_LABEL[step.status]}</p>
            {step.lastError&&showsCurrentError(step.status)?<p className="text-sm text-warning">{step.lastError.message}</p>:null}
            {step.status==="unknown_result"?<p className="text-sm text-muted-foreground">请核对原任务回执；不会重新发送供应商请求。</p>:null}
            {step.status==="candidate_ready"?<p className="text-sm text-muted-foreground">{accepted?"已取得真实采纳回执，正式版本已保存。":"请在项目编导栏核对候选并点采纳。"}</p>:null}
            {step.status==="done"&&step.reasonCode==="TRANSCRIPT_ALREADY_AVAILABLE"?<p className="text-sm text-muted-foreground">逐字稿就绪，本次无需再转写。</p>:null}
            {step.status==="done"&&step.reasonCode==="BRIEF_UNCHANGED"?<p className="text-sm text-muted-foreground">本次建议与已有资料一致，无需采纳。</p>:null}
            {step.status==="not_required"?<p className="text-sm text-muted-foreground">{step.reasonCode==="NO_SUPPORTED_TRANSCRIPTION_SOURCE"?"当前来源不适用自动转写；已有正文仍可按需准备初稿。":"本步骤不需要执行；已有内容仍保留。"}</p>:null}
            {step.availableActions.includes("retry")||step.availableActions.includes("resume")?<Button type="button" size="sm" variant="outline" disabled={state?.busy} onClick={()=>void run(()=>state!.start(step.name))}>{step.availableActions.includes("resume")?"继续本步骤":"重试本步骤"}</Button>:null}
            {step.availableActions.includes("check_result")?<Button type="button" size="sm" variant="outline" disabled={state?.busy} onClick={()=>void run(()=>state!.start(step.name))}>核对原任务状态</Button>:null}
            {step.name==="transcript"&&step.availableActions.includes("provide_transcript")?<Button type="button" size="sm" variant="outline" disabled={state?.busy} onClick={()=>setManual(value=>!value)}>手工补逐字稿</Button>:null}
          </li>;
        })}</ol>
        {manual&&transcript&&preparation?.registration==="registered"?<div className="mt-3 rounded-xl border border-border p-4">
          <label className="block text-sm">补充的来源{references.length>1?<select aria-label="补充逐字稿的来源" className="mt-2 w-full rounded-control border border-border p-2" value={referenceId} onChange={event=>setReferenceId(event.target.value)}><option value="">请选择原始来源</option>{references.map(ref=><option key={ref.id} value={ref.id}>{ref.url??ref.sourceKey}</option>)}</select>:null}</label>
          <label className="mt-3 block text-sm">逐字稿<textarea aria-label="逐字稿" rows={6} className="mt-2 w-full rounded-control border border-border bg-surface p-2" value={text} onChange={event=>setText(event.target.value)}/></label>
          <Button className="mt-2" size="sm" disabled={state?.busy||!text.trim()||!selected?.sourceDigest} onClick={()=>void run(async()=>{await state!.provide({inputMode:"paste",parentTaskId:preparation.preparationTaskId,referenceId:selected!.id,expectedSourceDigest:selected!.sourceDigest!,expectedStepRevision:transcript.revision,text});setManual(false);setText("");})}>提交逐字稿</Button>
        </div>:null}
        {preparation?<div className="mt-3 flex flex-wrap gap-2"><Button size="sm" variant="outline" disabled={state?.busy} onClick={()=>void run(()=>state!.start("brief"))}>让编导补全资料</Button></div>:null}
      </div>
    </div>
  </section>;
}

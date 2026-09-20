"use client";

import * as React from "react";
import type {WorkbenchPlan} from "@creatoros/contract/agent-workbench";

const statusLabel:Record<WorkbenchPlan["steps"][number]["status"],string>={
 pending:"待执行",running:"进行中",waiting_user:"等待你处理",succeeded:"已完成",
 failed:"失败",cancelled:"已取消",skipped:"已跳过",
};
const PREVIEW_STEPS=5;

/** 从原任务保存的计划回执渲染；默认只渲前五步，长计划按需展开。 */
export function WorkbenchPlanCard({plan}:{plan:WorkbenchPlan}){
 const [expanded,setExpanded]=React.useState(false);
 const done=plan.steps.filter(step=>step.status==="succeeded").length;
 const shown=expanded?plan.steps:plan.steps.slice(0,PREVIEW_STEPS);
 return <section aria-label="执行计划" className="rounded-xl border border-border bg-surface p-3">
  <div className="flex items-baseline justify-between gap-3"><strong>执行计划 · 第 {plan.planRevision} 版</strong>
   <span className="text-xs text-muted-foreground">已完成 {done}/{plan.steps.length} 步</span></div>
  <ol className="mt-2 space-y-2">{shown.map(step=><li key={step.stepId} className="flex min-w-0 items-start gap-2 text-sm">
   <span aria-hidden="true" className="mt-1 size-2 shrink-0 rounded-full bg-brand"/>
   <div className="min-w-0 flex-1"><span className="break-words">{step.title}</span>
    <span className="ml-2 text-xs text-muted-foreground">{statusLabel[step.status]}</span>
    {step.status==="succeeded"?(step.operationRefs.length||step.artifactRefs.length)?
     <span className="ml-2 text-xs text-muted-foreground">已核对 {step.operationRefs.length} 项操作、{step.artifactRefs.length} 份产物</span>:null:null}
   </div>
  </li>)}</ol>
  {plan.steps.length>PREVIEW_STEPS?<button type="button" className="mt-2 text-sm text-brand" aria-expanded={expanded}
   onClick={()=>setExpanded(value=>!value)}>{expanded?"收起步骤":`查看全部 ${plan.steps.length} 步`}</button>:null}
 </section>;
}

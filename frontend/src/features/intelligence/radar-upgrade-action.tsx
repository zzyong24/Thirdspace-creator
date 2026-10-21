"use client";
import Link from "next/link";
import {ChevronRight,Sparkles} from "lucide-react";
import {Button} from "@/components/ui/button";
import type {RadarProjectState} from "./use-project-upgrade-queue";

export function RadarUpgradeAction({state,submitting,onUpgrade,compact=false}:{state?:RadarProjectState;submitting:boolean;onUpgrade?:()=>void;compact?:boolean}) {
 const needsAttention=state?.preparation?.steps.some(step=>["failed","blocked","unknown_result","waiting_user","cancelled","partial"].includes(step.status));
 const label=state?.readError?"状态暂时无法读取":needsAttention?"已建项目·准备需处理":state?.preparing?"准备中":"项目已创建";
 return <div data-slot="radar-upgrade-action" className={compact?"border-t border-border/50 px-3.5 py-2":"mt-3 rounded-xl border border-border bg-surface p-4"}>
  <div className="flex flex-wrap items-center gap-2">
   {state?.projectId?<><span className="text-xs text-muted-foreground">{label}</span><Link href={`/projects/${encodeURIComponent(state.projectId)}`} data-slot="radar-upgrade-open-project" className="ml-auto inline-flex min-h-9 items-center gap-1 text-sm text-primary">查看项目<ChevronRight className="size-4" aria-hidden="true"/></Link></>:onUpgrade?<Button type="button" size="sm" data-slot="radar-upgrade-button" disabled={submitting} aria-busy={submitting} onClick={onUpgrade} className="gap-1.5"><Sparkles className="size-4" aria-hidden="true"/>{submitting?"正在创建…":"升级为项目"}</Button>:<p className="text-xs text-muted-foreground">当前环境暂不支持升级为项目。</p>}
  </div>
 </div>;
}

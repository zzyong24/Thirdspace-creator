"use client";
import * as React from "react";
import {productionPlanV2,productionOverlayMediaSlot,type ProductionPlanV2} from "@creatoros/contract";
import {parseProductionSeconds,formatProductionSeconds} from "./production-time-input";
const button="rounded border px-3 py-2 text-sm disabled:opacity-40";
type Props={plan:ProductionPlanV2;duration:number;durationUs?:number;disabled:boolean;onSave:(plan:ProductionPlanV2)=>Promise<void>};
export function ProductionMediaSlotPanel(props:Props){const [open,setOpen]=React.useState(false);return <details open={open} className="min-w-0 rounded border p-3" onToggle={event=>setOpen(event.currentTarget.open)}><summary className="cursor-pointer text-sm font-medium">图片、视频与画布材料位置</summary>{open&&<Contents {...props}/>}</details>;}
function Contents({plan,duration,durationUs,disabled,onSave}:Props){
 const maximumUs=durationUs??Math.round(duration*1e6);
 const [name,setName]=React.useState(""),[sceneId,setSceneId]=React.useState(""),[start,setStart]=React.useState("0"),[end,setEnd]=React.useState(formatProductionSeconds(maximumUs)),[busy,setBusy]=React.useState(false),[error,setError]=React.useState<string|null>(null);const active=React.useRef(true),flight=React.useRef(false);
 React.useEffect(()=>{active.current=true;return()=>{active.current=false;};},[]);
 async function save(role:"image-card"|"broll"){
  if(disabled||flight.current)return;flight.current=true;setBusy(true);setError(null);
  try{
   // SEMANTIC_BOUNDARY_ALLOW: 仅按用户明确名称、位置和技术类型创建空槽位，不匹配场景或选择材料。
   const startUs=parseProductionSeconds(start),endUs=parseProductionSeconds(end);if(!name.trim()||!Number.isSafeInteger(startUs)||!Number.isSafeInteger(endUs)||startUs<0||endUs<=startUs||endUs>maximumUs)throw Error("请填写名称和成片范围内的起止时间");
   const next=structuredClone(plan),anchor={kind:"timeline" as const,startUs,endUs},id=crypto.randomUUID();let selectedScene=sceneId;
   if(role==="image-card"){
    if(sceneId==="new"){selectedScene=crypto.randomUUID();next.overlayDraft.scenes.push({id:selectedScene,title:name.trim(),startSec:startUs/1e6,endSec:endUs/1e6,cards:[],anchor});}
    else if(!next.overlayDraft.scenes.some(scene=>scene.id===sceneId))throw Error("请明确选择已有场景或新增图片场景");
   }
   next.overlayDraft.mediaSlots=[...(next.overlayDraft.mediaSlots??[]),productionOverlayMediaSlot.parse({id,role,anchor,label:name.trim(),...(role==="image-card"?{sceneId:selectedScene}:{})})];await onSave(productionPlanV2.parse(next));if(active.current){setName("");setSceneId("");}
  }catch(reason){if(active.current)setError(reason instanceof Error?reason.message:"保存未确认，位置输入已保留");}finally{flight.current=false;if(active.current)setBusy(false);}
 }
 return <div className="mt-3 space-y-3"><p className="text-sm text-muted-foreground">先保存材料位置，再到作品组合选择具体图片或视频文件。空位置不会生成素材或覆盖已采用材料。</p>{(plan.overlayDraft.mediaSlots??[]).length>0&&<ul className="space-y-1 text-sm">{plan.overlayDraft.mediaSlots!.map(slot=><li key={slot.id}>{slot.label} · {slot.role==="image-card"?"图片位置":"视频位置"} · 待选文件</li>)}</ul>}<fieldset disabled={disabled||busy} className="grid gap-3 sm:grid-cols-2"><label className="grid min-w-0 gap-1 text-sm sm:col-span-2">材料位置名称<input aria-label="材料位置名称" className="min-w-0 rounded border bg-background p-2" value={name} onChange={event=>setName(event.target.value)}/></label><label className="grid gap-1 text-sm">材料开始时间（成片秒）<input className="rounded border bg-background p-2" inputMode="decimal" value={start} onChange={event=>setStart(event.target.value)}/></label><label className="grid gap-1 text-sm">材料结束时间（成片秒）<input className="rounded border bg-background p-2" inputMode="decimal" value={end} onChange={event=>setEnd(event.target.value)}/></label><label className="grid min-w-0 gap-1 text-sm sm:col-span-2">图片所在场景<select className="min-w-0 rounded border bg-background p-2" value={sceneId} onChange={event=>setSceneId(event.target.value)}><option value="">明确选择场景（视频位置无需选择）</option>{plan.overlayDraft.scenes.map((scene,index)=><option key={scene.id} value={scene.id}>场景 {index+1} · {scene.title}</option>)}<option value="new">按上述名称与时间新增图片场景</option></select></label><div className="flex flex-wrap gap-2 sm:col-span-2"><button className={button} disabled={!duration||!name.trim()||!sceneId} onClick={()=>void save("image-card")}>保存空图片位置</button><button className={button} disabled={!duration||!name.trim()} onClick={()=>void save("broll")}>保存空视频位置</button></div></fieldset>{error&&<p role="alert" className="text-sm text-destructive">{error}</p>}</div>;
}

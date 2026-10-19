"use client";
import * as React from "react";
import {productionPlanV2,mapProductionMainTrack,type ProductionPlanV2} from "@creatoros/contract";
import {ProductionEditableItemFields} from "./production-editor-fields";
import {parseProductionSeconds,formatProductionSeconds} from "./production-time-input";
type Props={plan:ProductionPlanV2;durationUs:number;disabled:boolean;onSave:(plan:ProductionPlanV2)=>Promise<void>};
type Entry={id:string;kind:"caption"|"card"|"broll"|"scene";raw:Record<string,unknown>;sceneId?:string;title:string};
const button="rounded border px-3 py-2 text-sm disabled:opacity-40",input="min-w-0 rounded border bg-background p-2";
function entries(plan:ProductionPlanV2):Entry[]{return [...plan.overlayDraft.captions.map((raw,index)=>({id:raw.id,kind:"caption" as const,raw,title:`字幕 ${index+1} · ${raw.cn.slice(0,30)}`})),...plan.overlayDraft.scenes.flatMap((scene,index)=>[{id:scene.id,kind:"scene" as const,raw:scene,title:`场景 ${index+1} · ${scene.title}`},...scene.cards.map((raw,cardIndex)=>({id:raw.id,kind:"card" as const,raw,sceneId:scene.id,title:`卡片 ${index+1}-${cardIndex+1} · ${String("text" in raw?raw.text:"label" in raw?raw.label:"title" in raw?raw.title:({quote:"引述卡",stat:"数据卡",list:"列表卡",compare:"对比卡",code:"代码卡",image:"图片卡"} as Record<string,string>)[raw.kind]??"画面卡片").slice(0,30)}`}))]),...plan.overlayDraft.broll.map((raw,index)=>({id:raw.id,kind:"broll" as const,raw,title:`插入视频 ${index+1} · ${raw.label}`}))];}
// SEMANTIC_BOUNDARY_ALLOW: 仅把已保存锚点映射到真实成片时间，不推断字幕、场景或创作选择。
function savedRange(plan:ProductionPlanV2,raw:Record<string,unknown>){
 const anchor=raw.anchor as {kind:string;startUs?:number;endUs?:number;clipId?:string;sourceInTicks?:number;sourceOutTicks?:number}|undefined;
 if(anchor?.kind==="timeline")return {startUs:anchor.startUs!,endUs:anchor.endUs!};
 if(anchor?.kind==="clip"){
  const clip=plan.mainTrack.clips.find(row=>row.clipId===anchor.clipId),source=plan.mainTrack.sources.find(row=>row.sourceId===clip?.sourceId),span=mapProductionMainTrack(plan.mainTrack).find(row=>row.clipId===clip?.clipId);
  if(clip&&source&&span){const start=Math.max(clip.sourceInTicks,anchor.sourceInTicks!),end=Math.min(clip.sourceOutTicks,anchor.sourceOutTicks!);if(end>start)return {startUs:span.startUs+Math.round((start-clip.sourceInTicks)*source.timebase.num/source.timebase.den*1e6),endUs:span.startUs+Math.round((end-clip.sourceInTicks)*source.timebase.num/source.timebase.den*1e6)};}
 }
 if(raw.startSec!==undefined&&raw.endSec!==undefined)return {startUs:Math.round(Number(raw.startSec)*1e6),endUs:Math.round(Number(raw.endSec)*1e6)};
 return null;
}
function userRange(start:string,end:string,maximum:number){const startUs=parseProductionSeconds(start),endUs=parseProductionSeconds(end);if(endUs<=startUs||endUs>maximum)throw Error("请填写成片范围内非空的起止时间");return {kind:"timeline" as const,startUs,endUs};}
export function ProductionOverlayPanel(props:Props){const [open,setOpen]=React.useState(false);return <details open={open} className="min-w-0 rounded border p-3" onToggle={event=>setOpen(event.currentTarget.open)}><summary className="cursor-pointer text-sm font-medium">字幕、画面卡片与插入视频</summary>{open&&<Contents {...props}/>}</details>;}
function Contents(props:Props){
 const [selected,setSelected]=React.useState(""),[page,setPage]=React.useState(0),[text,setText]=React.useState(""),[start,setStart]=React.useState("0"),[end,setEnd]=React.useState(formatProductionSeconds(props.durationUs)),[sceneId,setSceneId]=React.useState(""),[busy,setBusy]=React.useState(false),[error,setError]=React.useState<string|null>(null);const active=React.useRef(true),flight=React.useRef(false);
 React.useEffect(()=>{active.current=true;return()=>{active.current=false;};},[]);
 const rows=entries(props.plan),entry=rows.find(row=>row.id===selected),visible=rows.slice(page*100,(page+1)*100),locked=props.disabled||busy;
 async function add(kind:"caption"|"quote"){
  if(locked||flight.current)return;flight.current=true;setBusy(true);setError(null);
  try{
   if(!text.trim())throw Error("请填写要显示的文字");const anchor=userRange(start,end,props.durationUs),next=structuredClone(props.plan),id=crypto.randomUUID();
   if(kind==="caption")next.overlayDraft.captions.push({id,cn:text.trim(),start:anchor.startUs/1e6,end:anchor.endUs/1e6,anchor});
   else{let scene=next.overlayDraft.scenes.find(row=>row.id===sceneId);if(sceneId==="new"){scene={id:crypto.randomUUID(),title:text.trim(),startSec:anchor.startUs/1e6,endSec:anchor.endUs/1e6,cards:[],anchor};next.overlayDraft.scenes.push(scene);}if(!scene)throw Error("请明确选择卡片场景或新增场景");scene.cards.push({kind:"quote",id,text:text.trim(),tone:"muted",at:anchor.startUs/1e6,endSec:anchor.endUs/1e6,anchor});}
   await props.onSave(productionPlanV2.parse(next));if(active.current)setText("");
  }catch(reason){if(active.current)setError(reason instanceof Error?reason.message:"保存未确认，文字已保留");}finally{flight.current=false;if(active.current)setBusy(false);}
 }
 return <div className="mt-3 min-w-0 space-y-4"><p className="text-sm text-muted-foreground">字幕、卡片和插入视频与上方预览共用已保存版本。修改文字不改变原始转写；保存后可从历史恢复。</p><label className="grid min-w-0 gap-1 text-sm">编辑画面项<select className={input} disabled={locked} value={selected} onChange={event=>setSelected(event.target.value)}><option value="">选择已保存字幕、卡片、场景或视频</option>{visible.map(row=><option key={row.id} value={row.id}>{row.title}</option>)}{entry&&!visible.includes(entry)&&<option value={entry.id}>{entry.title}</option>}</select></label>{rows.length>100&&<div className="flex flex-wrap items-center gap-2 text-sm"><button className={button} disabled={locked||page===0} onClick={()=>setPage(value=>value-1)}>上一组画面项</button><span>{page+1} / {Math.ceil(rows.length/100)}</span><button className={button} disabled={locked||(page+1)*100>=rows.length} onClick={()=>setPage(value=>value+1)}>下一组画面项</button></div>}{entry&&<ItemEditor key={entry.id} {...props} disabled={locked} entry={entry}/>}
  <details className="rounded border p-3"><summary className="cursor-pointer text-sm">手工新增字幕或文字卡片</summary><fieldset disabled={locked} className="mt-3 grid min-w-0 gap-3 sm:grid-cols-2"><label className="grid min-w-0 gap-1 text-sm sm:col-span-2">新增画面文本<textarea className={input} rows={3} value={text} onChange={event=>setText(event.target.value)}/></label><label className="grid gap-1 text-sm">新增画面开始（成片秒）<input className={input} inputMode="decimal" value={start} onChange={event=>setStart(event.target.value)}/></label><label className="grid gap-1 text-sm">新增画面结束（成片秒）<input className={input} inputMode="decimal" value={end} onChange={event=>setEnd(event.target.value)}/></label><label className="grid min-w-0 gap-1 text-sm sm:col-span-2">文字卡片场景<select className={input} value={sceneId} onChange={event=>setSceneId(event.target.value)}><option value="">明确选择场景（新增字幕无需选择）</option>{props.plan.overlayDraft.scenes.map((scene,index)=><option key={scene.id} value={scene.id}>场景 {index+1} · {scene.title}</option>)}<option value="new">按用户文字和时间新增场景</option></select></label><div className="flex flex-wrap gap-2 sm:col-span-2"><button className={button} disabled={!text.trim()||!props.durationUs} onClick={()=>void add("caption")}>新增字幕并保存</button><button className={button} disabled={!text.trim()||!sceneId||!props.durationUs} onClick={()=>void add("quote")}>新增文字卡片并保存</button></div></fieldset></details>{error&&<p role="alert" className="text-sm text-destructive">{error}</p>}
 </div>;
}
function ItemEditor({plan,durationUs,disabled,onSave,entry}:Props&{entry:Entry}){
 const range=savedRange(plan,entry.raw),originalStart=range?formatProductionSeconds(range.startUs):"",originalEnd=range?formatProductionSeconds(range.endUs):"";
 const [draft,setDraft]=React.useState(()=>structuredClone(entry.raw)),[start,setStart]=React.useState(originalStart),[end,setEnd]=React.useState(originalEnd),[sceneTitle,setSceneTitle]=React.useState(plan.overlayDraft.scenes.find(scene=>scene.id===entry.sceneId)?.title),[busy,setBusy]=React.useState(false),[error,setError]=React.useState<string|null>(null);const active=React.useRef(true),flight=React.useRef(false);React.useEffect(()=>{active.current=true;return()=>{active.current=false;};},[]);
 async function save(remove=false){
  if(disabled||flight.current)return;flight.current=true;setBusy(true);setError(null);
  try{
   const next=structuredClone(plan),collection=entry.kind==="caption"?next.overlayDraft.captions:entry.kind==="broll"?next.overlayDraft.broll:entry.kind==="scene"?next.overlayDraft.scenes:next.overlayDraft.scenes.find(scene=>scene.id===entry.sceneId)!.cards;
   const index=collection.findIndex(row=>row.id===entry.id);if(index<0)throw Error("所选画面项已变化，请重新读取");
   if(remove){if(entry.kind==="scene")throw Error("请先明确处理场景内的卡片和材料位置");collection.splice(index,1);}
   else{
    const raw=structuredClone(draft);if(raw.en===null){delete raw.en;delete (collection[index]! as Record<string,unknown>).en;}
    const timeChanged=start!==originalStart||end!==originalEnd;if(timeChanged){const anchor=userRange(start,end,durationUs);raw.anchor=anchor;if(entry.kind==="caption"){raw.start=anchor.startUs/1e6;raw.end=anchor.endUs/1e6;}else if(entry.kind==="scene"){raw.startSec=anchor.startUs/1e6;raw.endSec=anchor.endUs/1e6;}else{raw.at=anchor.startUs/1e6;if(entry.kind==="broll")raw.durationSec=(anchor.endUs-anchor.startUs)/1e6;else raw.endSec=anchor.endUs/1e6;}}
    if(entry.kind==="caption"&&(raw.cn!==entry.raw.cn||timeChanged)){delete raw.emphasis;delete (collection[index]! as Record<string,unknown>).emphasis;}
    Object.assign(collection[index]!,raw);if(entry.sceneId&&sceneTitle!==undefined){const scene=next.overlayDraft.scenes.find(row=>row.id===entry.sceneId);if(scene)scene.title=sceneTitle;}
   }
   await onSave(productionPlanV2.parse(next));
  }catch(reason){if(active.current)setError(reason instanceof Error?reason.message:"保存未确认，手工修改已保留");}finally{flight.current=false;if(active.current)setBusy(false);}
 }
 return <fieldset disabled={disabled||busy} className="grid min-w-0 gap-3 rounded border p-3">{entry.kind==="scene"?<label className="grid gap-1 text-sm">场景标题<input className={input} value={String(draft.title)} onChange={event=>setDraft(raw=>({...raw,title:event.target.value}))}/></label>:<ProductionEditableItemFields raw={draft} kind={entry.kind} skipTime patch={patch=>setDraft(raw=>({...raw,...patch}))} remove={()=>void save(true)} sceneTitle={sceneTitle} onSceneTitle={setSceneTitle}/>}
  <p className="text-xs text-muted-foreground">{(entry.raw.anchor as {kind?:string}|undefined)?.kind==="clip"?"此项随原片片段定位。修改以下时间后，会固定到成片时间轴。":"以下时间为此项在成片中的位置。"}</p><div className="grid gap-3 sm:grid-cols-2"><label className="grid gap-1 text-sm">画面开始（成片秒）<input className={input} inputMode="decimal" value={start} onChange={event=>setStart(event.target.value)}/></label><label className="grid gap-1 text-sm">画面结束（成片秒）<input className={input} inputMode="decimal" value={end} onChange={event=>setEnd(event.target.value)}/></label></div><button className={button} onClick={()=>void save()}>保存所选画面项</button>{error&&<p role="alert" className="text-sm text-destructive">{error}</p>}
 </fieldset>;
}

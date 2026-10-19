"use client";
import * as React from "react";
import type {ProductionPlanV2} from "@creatoros/contract";
export type TranscriptCutSelection={clipId:string;transcriptId:string;tokenIds:string[];granularity:"word"|"segment"};
type Props={plan:ProductionPlanV2;disabled:boolean;onRemove:(selection:TranscriptCutSelection)=>Promise<void>;onLocate:(clipId:string,sourceTick:number)=>void};
const button="rounded border px-3 py-2 text-sm disabled:opacity-40";
export function ProductionTranscriptCutPanel(props:Props){
 const [open,setOpen]=React.useState(false);
 return <details open={open} className="min-w-0 rounded border p-3" onToggle={event=>setOpen(event.currentTarget.open)}><summary className="cursor-pointer text-sm font-medium">按词句剪视频</summary>{open&&<Contents {...props}/>}</details>;
}
// 大转写按保存对象缓存；解析后的 union 被编译器视为可变，只隔离此纯计算的自动 memo 推断。
function useIntersectingTokens(transcript:ProductionPlanV2["sourceTranscripts"][number]|undefined,clip:ProductionPlanV2["mainTrack"]["clips"][number]|undefined){
 "use no memo";
 return React.useMemo(()=>transcript&&transcript.granularity!=="text"&&clip?transcript.tokens.filter(token=>token.endTicks>clip.sourceInTicks&&token.startTicks<clip.sourceOutTicks):[],[transcript,clip]);
}
function Contents({plan,disabled,onRemove,onLocate}:Props){
 const [transcriptId,setTranscriptId]=React.useState(""),[clipId,setClipId]=React.useState(""),[chosen,setChosen]=React.useState<string[]>([]),[page,setPage]=React.useState(0),[clipPage,setClipPage]=React.useState(0),[busy,setBusy]=React.useState(false),[error,setError]=React.useState<string|null>(null);
 const active=React.useRef(true),flight=React.useRef(false);
 React.useEffect(()=>{active.current=true;return()=>{active.current=false;};},[]);
 const timed=plan.sourceTranscripts.filter(row=>row.granularity!=="text"&&row.tokens.length>0);
 const transcript=timed.find(row=>row.transcriptId===transcriptId),source=plan.mainTrack.sources.find(row=>row.sourceId===transcript?.sourceId);
 const clips=plan.mainTrack.clips.filter(row=>row.sourceId===transcript?.sourceId),clip=clips.find(row=>row.clipId===clipId);
 // SEMANTIC_BOUNDARY_ALLOW: 仅显示供应商已保存时间码与用户明确片段实例的非空交集，不推断词句时间或决定删留。
 const tokens=useIntersectingTokens(transcript,clip);
 const selected=tokens.filter(token=>chosen.includes(token.tokenId)),visible=tokens.slice(page*100,(page+1)*100);
 const locked=disabled||busy;
 const seconds=(tick:number)=>source?(tick*source.timebase.num/source.timebase.den).toFixed(6).replace(/\.?0+$/,""):"";
 async function remove(){
  if(locked||flight.current||!clip||!transcript||transcript.granularity==="text"||!selected.length)return;
  flight.current=true;setBusy(true);setError(null);
  try{await onRemove({clipId:clip.clipId,transcriptId:transcript.transcriptId,tokenIds:selected.map(token=>token.tokenId),granularity:transcript.granularity});if(active.current)setChosen([]);}
  catch(reason){if(active.current)setError(reason instanceof Error?reason.message:"保存未确认，词句选择已保留");}
  finally{flight.current=false;if(active.current)setBusy(false);}
 }
 return <div className="mt-3 min-w-0 space-y-3">
  <p className="text-sm text-muted-foreground">原始转写用于剪切音视频，可编辑字幕在字幕区保存。同一原片重复出现时，请明确选择要修改的片段实例。</p>
  {!timed.length?<p className="text-sm">暂无真实词句时间码。全文转写仍可查看；可以用原片入出点手工剪切。</p>:<>
   <fieldset disabled={locked} className="grid min-w-0 gap-3 sm:grid-cols-2">
    <label className="grid min-w-0 gap-1 text-sm">剪切转写来源<select className="min-w-0 rounded border bg-background p-2" value={transcriptId} onChange={event=>{setTranscriptId(event.target.value);setClipId("");setChosen([]);setPage(0);setClipPage(0);}}><option value="">明确选择已有时间码的转写</option>{timed.map((row,index)=><option key={row.transcriptId} value={row.transcriptId}>转写 {index+1} · {row.granularity==="word"?"词级":"句级"} · {row.text.slice(0,36)}</option>)}</select></label>
    <label className="grid min-w-0 gap-1 text-sm">文字对应片段实例<select className="min-w-0 rounded border bg-background p-2" value={clipId} onChange={event=>{setClipId(event.target.value);setChosen([]);setPage(0);}}><option value="">明确选择同源片段实例</option>{clips.slice(clipPage*50,(clipPage+1)*50).map(row=><option key={row.clipId} value={row.clipId}>片段 {plan.mainTrack.clips.findIndex(item=>item.clipId===row.clipId)+1} · 原片 {seconds(row.sourceInTicks)}–{seconds(row.sourceOutTicks)} 秒</option>)}{clip&&!clips.slice(clipPage*50,(clipPage+1)*50).includes(clip)&&<option value={clip.clipId}>当前已选片段 {plan.mainTrack.clips.indexOf(clip)+1}</option>}</select></label>
   </fieldset>
   {clips.length>50&&<div className="flex flex-wrap items-center gap-2 text-sm"><button className={button} disabled={locked||clipPage===0} onClick={()=>setClipPage(value=>value-1)}>上一组片段</button><span>片段组 {clipPage+1} / {Math.ceil(clips.length/50)}</span><button className={button} disabled={locked||(clipPage+1)*50>=clips.length} onClick={()=>setClipPage(value=>value+1)}>下一组片段</button></div>}
   {transcript&&clip&&<>
    <p className="text-sm">{transcript.granularity==="word"?"当前回执提供词级时间码。":"当前回执提供句级时间码，选中后删除对应整句范围。"} 已选 {selected.length} 项，仅修改所选片段实例。</p>
    {tokens.length===0?<p className="text-sm text-muted-foreground">此片段范围内没有真实词句时间码，可用入出点手工剪切。</p>:<ul className="max-h-80 space-y-2 overflow-y-auto">{visible.map((token,index)=>{const ordinal=page*100+index+1;return <li key={token.tokenId} className="flex min-w-0 flex-wrap items-center gap-2 rounded border p-2 text-sm"><label className="flex min-w-0 flex-1 items-start gap-2"><input type="checkbox" aria-label={`选择剪切词句 ${ordinal}`} checked={chosen.includes(token.tokenId)} disabled={locked} onChange={event=>setChosen(values=>event.target.checked?[...values,token.tokenId]:values.filter(id=>id!==token.tokenId))}/><span className="min-w-0 break-words">{token.text||"（该时间范围未返回文字）"}<span className="block text-xs text-muted-foreground">原片 {seconds(Math.max(token.startTicks,clip.sourceInTicks))}–{seconds(Math.min(token.endTicks,clip.sourceOutTicks))} 秒</span></span></label><button className={button} aria-label={`定位词句 ${ordinal}`} disabled={locked} onClick={()=>onLocate(clip.clipId,Math.max(token.startTicks,clip.sourceInTicks))}>定位</button></li>;})}</ul>}
    {tokens.length>100&&<div className="flex flex-wrap items-center gap-2 text-sm"><button className={button} disabled={locked||page===0} onClick={()=>setPage(value=>value-1)}>上一页词句</button><span>词句 {page+1} / {Math.ceil(tokens.length/100)}</span><button className={button} disabled={locked||(page+1)*100>=tokens.length} onClick={()=>setPage(value=>value+1)}>下一页词句</button></div>}
    <button className={button} disabled={locked||selected.length===0} onClick={()=>void remove()}>删除所选词句对应音视频并保存</button>
   </>}
  </>}
  {error&&<p role="alert" className="text-sm text-destructive">{error}</p>}
 </div>;
}

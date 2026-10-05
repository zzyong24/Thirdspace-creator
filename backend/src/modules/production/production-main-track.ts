import {randomUUID} from "node:crypto";
import {mapProductionMainTrack,productionMainTrack,productionMainTrackEdit,productionPlanV2,type ProductionMainTrack,type ProductionPlanV2} from "@creatoros/contract";
import {itemDigest} from "./production-editor-plan";
import {ConflictError} from "./production.errors";

export function mapMainTrack(input:ProductionMainTrack){try{return mapProductionMainTrack(input);}catch(error){throw new ConflictError(error instanceof Error?error.message:"主轨时间无效");}}

// SEMANTIC_BOUNDARY_ALLOW: 前值摘要、实例身份、范围和用户指定转写 token 只作机械校验与切除。
export type ProductionOverlayMechanicalLineage={parentItemId:string;childItemId:string;role:"image-card"|"broll"};
export function applyMainTrackEdits(input:ProductionPlanV2,edits:unknown[],nextId:()=>string=()=>randomUUID(),onMediaChild?:(value:ProductionOverlayMechanicalLineage)=>void):ProductionPlanV2 {
 if(edits.length>1000)throw new ConflictError("一次编辑超过1000项，请分批操作");
 const plan=productionPlanV2.parse(structuredClone(input));
 for(const raw of edits){
  const edit=productionMainTrackEdit.parse(raw),clips=plan.mainTrack.clips;
  let rebound:{oldId:string;replacements:typeof clips}|null=null;
  if(edit.type==="reorderMainClips" || edit.type==="addMainClip"){
   if(itemDigest(clips.map(c=>c.clipId))!==edit.expectedOrderDigest)throw new ConflictError("片段顺序已变化，请重新读取");
   if(edit.type==="reorderMainClips"){
    const byId=new Map(clips.map(c=>[c.clipId,c]));
    if(edit.clipIds.length!==clips.length || edit.clipIds.some(id=>!byId.has(id)))throw new ConflictError("排序必须包含全部现有片段");
    plan.mainTrack.clips=edit.clipIds.map(id=>byId.get(id)!);
   }else{
    if(clips.some(c=>c.clipId===edit.clipId))throw new ConflictError("新片段身份已存在");
    const at=edit.afterClipId===null?-1:clips.findIndex(c=>c.clipId===edit.afterClipId);
    if(edit.afterClipId!==null && at<0)throw new ConflictError("插入位置已失效");
    clips.splice(at+1,0,{clipId:edit.clipId,sourceId:edit.sourceId,sourceInTicks:edit.sourceInTicks,sourceOutTicks:edit.sourceOutTicks});
   }
  }else{
   const at=clips.findIndex(c=>c.clipId===edit.clipId),clip=clips[at];
   if(!clip || itemDigest(clip)!==edit.expectedItemDigest)throw new ConflictError("所选片段已变化，请重新读取；原稿已保留");
   if(edit.type==="removeMainClip"){
    const children=clips.filter(c=>c.derivedFromClipId===clip.clipId);
    rebound={oldId:clip.clipId,replacements:children};
    for(const child of children){if(clip.derivedFromClipId)child.derivedFromClipId=clip.derivedFromClipId;else delete child.derivedFromClipId;}
    clips.splice(at,1);
   }
   else if(edit.type==="trimMainClip")Object.assign(clip,{sourceInTicks:edit.sourceInTicks,sourceOutTicks:edit.sourceOutTicks});
   else if(edit.type==="splitMainClip"){
    if(edit.sourceSplitTick<=clip.sourceInTicks || edit.sourceSplitTick>=clip.sourceOutTicks || clips.some(c=>c.clipId===edit.newClipId))throw new ConflictError("分割点或新片段身份无效");
    clips.splice(at+1,0,{...clip,clipId:edit.newClipId,sourceInTicks:edit.sourceSplitTick,derivedFromClipId:clip.clipId});
    clip.sourceOutTicks=edit.sourceSplitTick;
    rebound={oldId:clip.clipId,replacements:[clip,clips[at+1]!]};
   }else{
    const transcript=plan.sourceTranscripts.find(t=>t.transcriptId===edit.transcriptId);
    if(!transcript || transcript.sourceId!==clip.sourceId || transcript.granularity==="text" || transcript.granularity!==edit.granularity || itemDigest(transcript)!==edit.transcriptDigest)throw new ConflictError("转写来源或粒度已变化，无法删除选区");
    const byId=new Map(transcript.tokens.map(t=>[t.tokenId,t]));
    if(new Set(edit.tokenIds).size!==edit.tokenIds.length || edit.tokenIds.some(id=>!byId.has(id)))throw new ConflictError("转写选区身份无效");
    const ranges=edit.tokenIds.map(id=>byId.get(id)!).sort((a,b)=>a.startTicks-b.startTicks);
    if(ranges.some(t=>t.startTicks<clip.sourceInTicks || t.endTicks>clip.sourceOutTicks))throw new ConflictError("转写选区不完全属于该片段实例");
    let cursor=clip.sourceInTicks;
    const retained:Array<{start:number;end:number}>=[];
    for(const range of ranges){if(range.startTicks>cursor)retained.push({start:cursor,end:range.startTicks});cursor=Math.max(cursor,range.endTicks);}
    if(cursor<clip.sourceOutTicks)retained.push({start:cursor,end:clip.sourceOutTicks});
    const generated=new Set(clips.map(c=>c.clipId));
    const replacements=retained.map((r,i)=>{
     const clipId=i===0?clip.clipId:nextId();
     if(i>0 && generated.has(clipId))throw new ConflictError("分割片段身份重复");generated.add(clipId);
     return {...clip,clipId,sourceInTicks:r.start,sourceOutTicks:r.end,...(i>0?{derivedFromClipId:clip.clipId}:{})};
    });
    clips.splice(at,1,...replacements);
    rebound={oldId:clip.clipId,replacements};
   }
  }
  if(rebound){
   const {oldId,replacements}=rebound;
   const rebind=<T extends {id:string;anchor?:{kind:string;clipId?:string;sourceInTicks?:number;sourceOutTicks?:number}}>(items:T[],media=false,sentence=false,role?:"image-card"|"broll"):T[]=>items.flatMap(item=>{
    const anchor=item.anchor;if(anchor?.kind!=="clip"||anchor.clipId!==oldId)return [item];
    const ranges=replacements.flatMap(c=>{const start=Math.max(c.sourceInTicks,anchor.sourceInTicks!),end=Math.min(c.sourceOutTicks,anchor.sourceOutTicks!);return end>start?[{kind:"clip",clipId:c.clipId,sourceInTicks:start,sourceOutTicks:end}]:[];});
    // 无范围的可选图层保留原稿，由编译器明确提示；不静默丢弃。
    if(!ranges.length)return [item];
    const sourceId=replacements[0]?.sourceId,source=plan.mainTrack.sources.find(s=>s.sourceId===sourceId);
    return ranges.map((range,i)=>{const id=i===0?item.id:nextId();
      if(i>0&&role&&(role==="broll"||(item as unknown as {kind?:string}).kind==="image"))onMediaChild?.({parentItemId:item.id,childItemId:id,role});
      return {...structuredClone(item),id,anchor:range,
      ...(sentence?{timeNeedsReview:true}:{}),
      ...(media&&source?{mediaStartSec:((item as unknown as {mediaStartSec?:number}).mediaStartSec??0)+(range.sourceInTicks-anchor.sourceInTicks!)*source.timebase.num/source.timebase.den}:{})} as T;});
   });
   plan.overlayDraft.captions=rebind(plan.overlayDraft.captions,false,true);
   plan.overlayDraft.broll=rebind(plan.overlayDraft.broll,true,false,"broll");
   plan.overlayDraft.scenes=plan.overlayDraft.scenes.flatMap(scene=>{
    const cards=rebind(scene.cards,false,false,"image-card");
    // 卡片有自己的锚点，不随场景克隆；编译器按卡片锚点分配至最终场景。
    return rebind([scene]).map((part,index)=>({...part,cards:index===0?cards:[]}));
   });
  }
  productionMainTrack.parse(plan.mainTrack);
 }
 mapMainTrack(plan.mainTrack);
 return productionPlanV2.parse(plan);
}

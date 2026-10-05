import {createHash} from "node:crypto";
import {productionPlanV2,videoRenderProps,type ProductionPlanV2,type VideoRenderProps} from "@creatoros/contract";
import {mapMainTrack} from "./production-main-track";
import {overlayReferences,isProductionOverlayReference,type ProductionOverlayBinding} from './production-overlay-capture';
import {ConflictError} from "./production.errors";

type Anchor=ProductionPlanV2["overlayDraft"]["captions"][number]["anchor"];
export type CompiledMediaBinding={mountAs:string;assetId:string;assetFileId:string;fileDigest:string;probeDigest?:string;role?:'image-card'|'broll'};
// SEMANTIC_BOUNDARY_ALLOW: 编译只落实用户保存的实例、血缘、顺序和时间，绝不判断内容或删留。
export function compileV2RenderablePlan(input:ProductionPlanV2,exactOverlays:ProductionOverlayBinding[]=[]) {
 const plan=productionPlanV2.parse(input),mappings=mapMainTrack(plan.mainTrack);
 const durationUs=mappings.at(-1)?.endUs;
 if(!durationUs)throw new ConflictError("请保留或添加至少一段视频");
 const sources=new Map(plan.mainTrack.sources.map(s=>[s.sourceId,s]));
 const clips=new Map(plan.mainTrack.clips.map(c=>[c.clipId,c]));
 const warnings:string[]=(plan.overlayDraft.mediaSlots??[]).map(slot=>`素材位置 ${slot.id} 尚未选择素材，原位置已保留`),mediaBindings:CompiledMediaBinding[]=[];
 const overlayRefs=overlayReferences(plan);
 const exactItem=(itemId:string,role:'image-card'|'broll',reference:string)=>{const ref=overlayRefs.find(r=>r.itemId===itemId&&r.role===role&&r.reference===reference);return !!ref&&exactOverlays.some(b=>b.location===ref.location&&b.itemId===ref.itemId&&b.role===ref.role&&b.reference===ref.reference);};
 const alias=(clipId:string)=>`main-${createHash("sha256").update(clipId).digest("hex")}.mp4`;
 const seconds=(ticks:number,sourceId:string)=>{const s=sources.get(sourceId)!;return ticks*s.timebase.num/s.timebase.den;};
 const lineage=(clipId:string,ancestor:string)=>{
  const visited=new Set<string>();let current:string|undefined=clipId;
  while(current&&!visited.has(current)){if(current===ancestor)return true;visited.add(current);current=clips.get(current)?.derivedFromClipId;}
  return false;
 };
 function project(anchor:Anchor):Array<{start:number;end:number;croppedSec:number}> {
  if(anchor.kind==="timeline"){
   const start=Math.max(0,anchor.startUs),end=Math.min(durationUs!,anchor.endUs);
   return end>start?[{start:start/1e6,end:end/1e6,croppedSec:(start-anchor.startUs)/1e6}]:[];
  }
  return mappings.filter(m=>lineage(m.clipId,anchor.clipId)).flatMap(m=>{
   const start=Math.max(m.sourceInTicks,anchor.sourceInTicks),end=Math.min(m.sourceOutTicks,anchor.sourceOutTicks);
   if(end<=start)return [];
   const startUs=Math.max(m.startUs,Math.min(m.endUs,m.startUs+Math.round(seconds(start-m.sourceInTicks,m.sourceId)*1e6)));
   const endUs=Math.min(m.endUs,m.startUs+Math.round(seconds(end-m.sourceInTicks,m.sourceId)*1e6));
   return endUs>startUs?[{start:startUs/1e6,end:endUs/1e6,croppedSec:seconds(start-anchor.sourceInTicks,m.sourceId)}]:[];
  });
 }
 const captions:VideoRenderProps["captions"]=[];
 for(const caption of plan.overlayDraft.captions){
  const ranges=project(caption.anchor);
  if(!ranges.length)warnings.push(`字幕 ${caption.id} 没有保留范围，原内容已保留，需重新定位`);
  ranges.forEach((r,i)=>{
   // 句级截断仍保留原句；重点时间不能冒充新词边界，交由用户复核。
   const captionAnchor=caption.anchor;
   const expectedDuration=captionAnchor.kind==="timeline"
    ? (captionAnchor.endUs-captionAnchor.startUs)/1e6
    : (()=>{const clip=clips.get(captionAnchor.clipId);return clip?seconds(captionAnchor.sourceOutTicks-captionAnchor.sourceInTicks,clip.sourceId):Infinity;})();
   if(caption.timeNeedsReview===true || ranges.length!==1 || r.croppedSec>0 || r.end-r.start<expectedDuration-.000001)warnings.push(`字幕 ${caption.id} 已裁切时间，仍保留完整原句，请复核`);
   if(caption.emphasis?.length)warnings.push(`字幕 ${caption.id} 的重点标记需按新时间复核`);
   captions.push({...caption,id:`${caption.id}@${i}`,start:r.start,end:r.end,emphasis:undefined});
  });
 }
 const cards:VideoRenderProps["scenes"][number]["cards"]=[];
 for(const scene of plan.overlayDraft.scenes)for(const card of scene.cards){
  if(card.hidden===true){warnings.push(`卡片 ${card.id} 已按用户选择隐藏，原内容已保留`);continue;}
  if(card.kind==='image'&&isProductionOverlayReference(card.file)&&!exactItem(card.id,'image-card',card.file)){warnings.push(`卡片 ${card.id} 尚无该位置的精确文件证明，本次隐藏该可选项，原内容已保留`);continue;}
  const ranges=project(card.anchor);
  if(!ranges.length)warnings.push(`卡片 ${card.id} 没有保留范围，原内容已保留，需重新定位`);
  ranges.forEach((r,i)=>cards.push({...card,id:`${card.id}@${i}`,at:r.start,endSec:r.end}));
 }
 const broll:VideoRenderProps["broll"]=[];
 for(const item of plan.overlayDraft.broll){
  if(item.hidden===true){warnings.push(`素材 ${item.id} 已按用户选择隐藏，原内容已保留`);continue;}
  if(isProductionOverlayReference(item.file)&&!exactItem(item.id,'broll',item.file)){warnings.push(`素材 ${item.id} 尚无该位置的精确文件证明，本次隐藏该可选项，原内容已保留`);continue;}
  const ranges=project(item.anchor);
  if(!ranges.length)warnings.push(`素材 ${item.id} 没有保留范围，原内容已保留，需重新定位`);
  ranges.forEach((r,i)=>broll.push({...item,id:`${item.id}@${i}`,at:r.start,durationSec:r.end-r.start,mediaStartSec:(item.mediaStartSec??0)+r.croppedSec}));
 }
 const headClips=mappings.map(m=>{
  const mountAs=alias(m.clipId),s=sources.get(m.sourceId)!;
  mediaBindings.push({mountAs,assetId:m.assetId,assetFileId:m.assetFileId,fileDigest:m.fileDigest,probeDigest:m.probeDigest});
  return {clipId:m.clipId,file:mountAs,startSec:m.startUs/1e6,endSec:m.endUs/1e6,sourceInSec:seconds(m.sourceInTicks,m.sourceId),hasAudio:s.hasAudio};
 });
 // 场景标题不烧进画面。保留明确绝对/片段锚点，裁切后以边界切出不重叠场景，不另做语义分场。
 const projectedScenes=plan.overlayDraft.scenes.flatMap(scene=>project(scene.anchor??{kind:"timeline",startUs:Math.round(scene.startSec*1e6),endUs:Math.round(scene.endSec*1e6)}).map(r=>({scene,...r})));
 const boundaries=[...new Set([0,durationUs/1e6,...projectedScenes.flatMap(s=>[s.start,s.end])])].sort((a,b)=>a-b);
 const scenes=boundaries.slice(0,-1).map((start,i)=>{
  const end=boundaries[i+1]!,owners=projectedScenes.filter(s=>s.start<=start&&s.end>=end);
  if(owners.length>1)warnings.push(`时间 ${start}–${end} 的场景重叠，使用基础布局，原场景已保留`);
  const scene=owners.length===1?owners[0]!.scene:undefined;
  return {id:`scene-${i}`,label:" ",title:scene?.title||"粗剪",role:"body" as const,startSec:start,endSec:end,
   cards:cards.filter(c=>c.at<end&&(c.endSec??end)>start).map(c=>({...c,id:`${c.id}@scene-${i}`,at:Math.max(start,c.at),endSec:Math.min(end,c.endSec??end)}))};
 });
 const sceneBroll=broll.flatMap(item=>scenes.flatMap(scene=>{
  const start=Math.max(item.at,scene.startSec),end=Math.min(item.at+(item.durationSec??durationUs/1e6),scene.endSec);
  return end>start?[{...item,id:`${item.id}@${scene.id}`,at:start,durationSec:end-start,mediaStartSec:(item.mediaStartSec??0)+start-item.at}]:[];
 }));
 if(plan.overlayDraft.direction)warnings.push("原动效方向需按剪切后的时间复核，本次使用基础布局，原方案已保留");
 const props=videoRenderProps.parse({meta:{title:typeof plan.overlayDraft.meta.title==="string"&&plan.overlayDraft.meta.title?plan.overlayDraft.meta.title:"粗剪",brandLabel:typeof plan.overlayDraft.meta.brandLabel==="string"?plan.overlayDraft.meta.brandLabel:""},
  talkingHead:{file:headClips[0]!.file,durationSec:durationUs/1e6,hasAudio:headClips.some(c=>c.hasAudio),clips:headClips},captions,scenes,broll:sceneBroll,delivery:plan.overlayDraft.delivery});
 const visibleRefs=new Set([...props.broll.map(b=>b.file),...props.scenes.flatMap(s=>s.cards.filter(c=>c.kind==='image').map(c=>(c as {file:string}).file))]);
 for(const ref of overlayReferences(plan)){const b=exactOverlays.find(b=>b.location===ref.location&&b.itemId===ref.itemId&&b.role===ref.role&&b.reference===ref.reference);if(b&&visibleRefs.has(b.reference))mediaBindings.push({mountAs:b.reference,assetId:b.assetId,assetFileId:b.assetFileId,fileDigest:b.fileDigest,role:b.role});}
 return {props,mappings,mediaBindings,warnings};
}

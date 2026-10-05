import {productionEditorEdit,productionMainTrackEdit,productionPlanV2,type ProductionPlanV2} from "@creatoros/contract";
import {applyMainTrackEdits,type ProductionOverlayMechanicalLineage} from "./production-main-track";
import {itemDigest} from "./production-editor-plan";
import {ConflictError} from "./production.errors";
// SEMANTIC_BOUNDARY_ALLOW: 仅落实明确选定项及前值，整批失败不修改输入，未涉及字段保留。
export function applyV2EditorEdits(input:ProductionPlanV2,raw:unknown[],nextId:()=>string,onMediaChild?:(value:ProductionOverlayMechanicalLineage)=>void):ProductionPlanV2 {
 let plan=productionPlanV2.parse(structuredClone(input));
 const edits=raw.map(e=>productionEditorEdit.parse(e));
 for(const edit of edits){
  if(productionMainTrackEdit.safeParse(edit).success){plan=applyMainTrackEdits(plan,[edit],nextId,onMediaChild);continue;}
  const overlay=plan.overlayDraft;
  if(edit.type==="addBroll"){
   const anchor=(edit.broll as Record<string,unknown>).anchor;
   if(!anchor)throw new ConflictError("请明确新增素材的片段或成片时间范围");
   overlay.broll.push({...edit.broll,id:edit.broll.id??nextId(),anchor} as typeof overlay.broll[number]);continue;
  }
  if(!("itemId" in edit))throw new ConflictError("编辑类型无效");
  const entries=[...(overlay.mediaSlots??[]).map(item=>({kind:"slot",item,container:overlay.mediaSlots!})),...overlay.captions.map(item=>({kind:"caption",item,container:overlay.captions})),...overlay.broll.map(item=>({kind:"broll",item,container:overlay.broll})),
   ...overlay.scenes.map(item=>({kind:"scene",item,container:overlay.scenes})),...overlay.scenes.flatMap(s=>s.cards.map(item=>({kind:"card",item,container:s.cards})))];
  const entry=entries.find(e=>e.item.id===edit.itemId);
  if(!entry||itemDigest(entry.item)!==edit.expectedItemDigest)throw new ConflictError("选中片段已变化，请重新读取；原稿已保留");
  const expected=edit.type==="updateCaption"?"caption":edit.type==="updateBroll"?"broll":edit.type==="updateCard"?"card":edit.type==="updateSceneTitle"?"scene":undefined;
  if(expected&&expected!==entry.kind||edit.type==="removeItem"&&entry.kind==="scene")throw new ConflictError("修改类型与所选片段不符");
  if(edit.type==="removeItem"){const container=entry.container as Array<{id:string}>;container.splice(container.findIndex(i=>i.id===edit.itemId),1);continue;}
  const item=entry.item as Record<string,unknown>;
  if(edit.type==="updateSceneTitle"){item.title=edit.title;continue;}
  if(edit.type==="updateCard"){
   if(edit.card.id&&edit.card.id!==item.id)throw new ConflictError("不能修改片段身份");
   const oldAt=Number(item.at),oldAnchor=item.anchor as {kind:string;startUs?:number;endUs?:number};
   Object.assign(item,structuredClone(edit.card));
   if(edit.card.at!==undefined&&Number(edit.card.at)!==oldAt){
    const oldDuration=oldAnchor.kind==="timeline"?(oldAnchor.endUs!-oldAnchor.startUs!)/1e6:undefined;
    const duration=typeof edit.card.endSec==="number"?edit.card.endSec-Number(edit.card.at):oldDuration;
    if(duration===undefined)throw new ConflictError("请明确卡片在成片中的结束时间");
    item.anchor={kind:"timeline",startUs:Math.round(Number(edit.card.at)*1e6),endUs:Math.round((Number(edit.card.at)+duration)*1e6)};
   }
   continue;
  }
  if(edit.type==="updateCaption"||edit.type==="updateBroll"){
   Object.assign(item,structuredClone(edit.patch));
   if(edit.type==="updateCaption"){
    if(edit.patch.en===null)delete item.en;
    delete item.emphasis;
    if(edit.patch.start!==undefined||edit.patch.end!==undefined)item.anchor={kind:"timeline",startUs:Math.round(Number(item.start)*1e6),endUs:Math.round(Number(item.end)*1e6)};
   }else if(edit.patch.at!==undefined||edit.patch.durationSec!==undefined){
    const anchor=item.anchor as {kind:string;startUs?:number;endUs?:number};
    const duration=Number(item.durationSec??(anchor.kind==="timeline"?(anchor.endUs!-anchor.startUs!)/1e6:NaN));
    if(!Number.isFinite(duration))throw new ConflictError("请同时指定素材在成片中的开始时间和时长");
    item.anchor={kind:"timeline",startUs:Math.round(Number(item.at)*1e6),endUs:Math.round((Number(item.at)+duration)*1e6)};
   }
  }
  plan=productionPlanV2.parse(plan);
 }
 return productionPlanV2.parse(plan);
}

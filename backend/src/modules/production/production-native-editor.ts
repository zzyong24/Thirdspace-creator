import {productionReferencePlan,readProductionNativeScene,validateNativeSceneTracksCandidate,sourceNativeTick,type ProductionNativeMedia,type NativeSerializedTimelineTracks as NativeSerializedSceneTracks,type ProductionEditorEdit,type ProductionReferencePlan} from '@creatoros/contract';
import {itemDigest} from './production-editor-plan';
import {ConflictError} from './production.errors';

/** SEMANTIC_BOUNDARY_ALLOW: 精确scene/tracks替换、前值digest及duration数学；不挑选素材或删留内容。 */
export function applyNativeEditorEdits(raw:Record<string,unknown>,edits:readonly ProductionEditorEdit[],media:readonly ProductionNativeMedia[]):ProductionReferencePlan{
 const plan=productionReferencePlan.parse(structuredClone(raw));
 const document=plan.referenceEditor.nativeDocument;
 if(document.version!==31)throw new ConflictError('原生工程版本不支持编导编辑');
 const changed=new Set<string>();
 for(const edit of edits){
  if(edit.type!=='replaceNativeSceneTracks')throw new ConflictError('当前原生工程仅支持明确scene轨道候选');
  if(changed.has(edit.sceneId))throw new ConflictError('同一scene不能重复替换');changed.add(edit.sceneId);
  const scene=readProductionNativeScene(plan,edit.sceneId);
  if(!scene||itemDigest(scene.tracks)!==edit.expectedBeforeDigest)throw new ConflictError('场景轨道前值已变化，请重新读取');
  const after=structuredClone(edit.tracks) as unknown as NativeSerializedSceneTracks;
  try{validateNativeSceneTracksCandidate(scene.tracks as unknown as NativeSerializedSceneTracks,after,media);}catch(error){throw new ConflictError(error instanceof Error?error.message:'原生候选无效');}
  scene.tracks=after as unknown as typeof scene.tracks;
  // readProductionNativeScene解析产生独立对象，按真实ID写回完整原document；保其它scene/metadata。
  const scenes=document.scenes as unknown as Array<Record<string,unknown>>;
  const index=scenes.findIndex(value=>value.id===edit.sceneId);scenes[index]={...scenes[index],tracks:after as never};
 }
 const scenes=document.scenes as unknown as Array<{tracks:{main:{elements:Array<{startTime:number;duration:number}>};overlay:Array<{elements:Array<{startTime:number;duration:number}>}>;audio:Array<{elements:Array<{startTime:number;duration:number}>}>}}>;
 const duration=Math.max(0,...scenes.flatMap(scene=>[scene.tracks.main,...scene.tracks.overlay,...scene.tracks.audio].flatMap(track=>track.elements.map(element=>element.startTime+element.duration))));
 if(!Number.isSafeInteger(duration))throw new ConflictError('原生工程时间范围溢出');
 if(document.metadata&&typeof document.metadata==='object'&&!Array.isArray(document.metadata))document.metadata={...document.metadata,duration};
 return plan;
}
export function nativeProbeMediaCatalog(plan:ProductionReferencePlan):ProductionNativeMedia[]{
 return (plan.nativeSources??[]).map(binding=>({mediaId:binding.mediaId,kind:'video' as const,durationTick:sourceNativeTick(binding.source.durationTicks,binding.source)}));
}

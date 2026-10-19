import {productionPlanV2,type ProductionPlanV2} from './production-main-track';
import {productionReferencePlan,type ProductionReferencePlan} from './reference-editor';
export const PRODUCTION_NATIVE_TICKS_PER_SECOND=120000 as const;
export type ProductionNativeElement=Record<string,unknown>&{id:string;type:string;mediaId?:string;startTime:number;duration:number;trimStart:number;trimEnd:number;retime?:{rate?:number};params:Record<string,unknown>};
export type ProductionNativeTrack=Record<string,unknown>&{id:string;type:string;elements:ProductionNativeElement[]};
export type ProductionNativeScene=Record<string,unknown>&{id:string;tracks:{main:ProductionNativeTrack;overlay:ProductionNativeTrack[];audio:ProductionNativeTrack[]}};
function integer(v:unknown):v is number{return typeof v==='number'&&Number.isSafeInteger(v)&&v>=0;}
// SEMANTIC_BOUNDARY_ALLOW: 校验真实ID/有限时间与结构，机械换算时间，不作语义删留或素材选择。
export function readProductionNativeScene(raw:unknown,sceneId?:string):ProductionNativeScene|null{
 const p=productionReferencePlan.parse(raw),doc=p.referenceEditor.nativeDocument;
 if(doc.version!==31||!Array.isArray(doc.scenes))throw Error('原生工程版本或场景不支持');
 const id=sceneId??doc.currentSceneId,scenes=doc.scenes as unknown as ProductionNativeScene[],scene=scenes.find(s=>s?.id===id);
 if(!scene)return null;
 if(scenes.filter(s=>s?.id===id).length!==1||!scene.tracks?.main||!Array.isArray(scene.tracks.overlay)||!Array.isArray(scene.tracks.audio))throw Error('原生场景身份或轨道无效');
 const tracks=[scene.tracks.main,...scene.tracks.overlay,...scene.tracks.audio],ids=new Set<string>(),trackIds=new Set<string>();
 for(const t of tracks){if(typeof t.id!=='string'||!t.id||trackIds.has(t.id)||!Array.isArray(t.elements))throw Error('原生轨道身份无效');trackIds.add(t.id);for(const e of t.elements){if(typeof e.id!=='string'||!e.id||ids.has(e.id)||typeof e.type!=='string'||!integer(e.startTime)||!integer(e.duration)||!integer(e.trimStart)||!integer(e.trimEnd)||!integer(e.startTime+e.duration))throw Error('原生片段身份或时间无效');ids.add(e.id);}}
 return scene;
}
export function nativeSourceTick(nativeTick:number,source:ProductionPlanV2['mainTrack']['sources'][number]):number{
 if(!integer(nativeTick))throw Error('原生时间无效');const n=BigInt(nativeTick)*BigInt(source.timebase.den),d=BigInt(PRODUCTION_NATIVE_TICKS_PER_SECOND)*BigInt(source.timebase.num),v=(n+d/BigInt(2))/d;if(v>BigInt(Number.MAX_SAFE_INTEGER))throw Error('源时间越界');return Number(v);
}
export function sourceNativeTick(sourceTick:number,source:ProductionPlanV2['mainTrack']['sources'][number]):number{
 if(!integer(sourceTick))throw Error('源时间无效');const n=BigInt(sourceTick)*BigInt(source.timebase.num)*BigInt(PRODUCTION_NATIVE_TICKS_PER_SECOND),d=BigInt(source.timebase.den),v=(n+d/BigInt(2))/d;if(v>BigInt(Number.MAX_SAFE_INTEGER))throw Error('原生时间越界');return Number(v);
}
export function sourceNativeTickExact(sourceTick:number,source:ProductionPlanV2['mainTrack']['sources'][number]):number|null{if(!integer(sourceTick))return null;const n=BigInt(sourceTick)*BigInt(source.timebase.num)*BigInt(PRODUCTION_NATIVE_TICKS_PER_SECOND),d=BigInt(source.timebase.den);return n%d===BigInt(0)&&n/d<=BigInt(Number.MAX_SAFE_INTEGER)?Number(n/d):null;}
export function nativeRate(element:ProductionNativeElement){const rate=element.retime?.rate;return typeof rate==='number'&&Number.isFinite(rate)&&rate>0?Math.min(5,Math.max(.01,rate)):1;}
export function projectProductionRoughPlan(raw:unknown,{sceneId}: {sceneId?:string}={}):ProductionPlanV2|null{
 if((raw as {editorVersion?:number}|null)?.editorVersion===2)return productionPlanV2.parse(structuredClone(raw));
 const p=productionReferencePlan.parse(raw),scene=readProductionNativeScene(p,sceneId);if(!scene)return null;
 const sources=(p.nativeSources??[]).map(s=>s.source),clips:ProductionPlanV2['mainTrack']['clips']=[];
 for(const e of scene.tracks.main.elements){if(e.type!=='video')continue;const binding=p.nativeSources?.find(s=>s.mediaId===e.mediaId);if(!binding)continue;const ref=p.referenceEditor.mediaRefs.find(r=>r.mediaId===e.mediaId);if(!ref||ref.assetId!==binding.source.assetId||ref.assetFileId!==binding.source.assetFileId)continue;const a=nativeSourceTick(e.trimStart,binding.source),b=Math.min(binding.source.durationTicks,nativeSourceTick(e.trimStart+Math.round(e.duration*nativeRate(e)),binding.source));if(b>a)clips.push({clipId:e.id,sourceId:binding.source.sourceId,sourceInTicks:a,sourceOutTicks:b});}
 const dimensions=(p.referenceEditor.nativeDocument.settings as {canvasSize?:{width?:number;height?:number}}|undefined)?.canvasSize;
 return productionPlanV2.parse({editorVersion:2,mainTrack:{sources,clips},sourceTranscripts:p.sourceTranscripts??[],overlayDraft:{meta:{},scenes:[],captions:[],broll:[],delivery:{width:dimensions?.width??1920,height:dimensions?.height??1080,fps:30}}});
}
export function productionSourceCatalog(raw:unknown):ProductionPlanV2['mainTrack']['sources']{return (raw as {editorVersion?:number}|null)?.editorVersion===3?(productionReferencePlan.parse(raw).nativeSources??[]).map(v=>v.source):productionPlanV2.parse(raw).mainTrack.sources;}
export function productionTranscriptCatalog(raw:unknown):ProductionPlanV2['sourceTranscripts']{return (raw as {editorVersion?:number}|null)?.editorVersion===3?productionReferencePlan.parse(raw).sourceTranscripts??[]:productionPlanV2.parse(raw).sourceTranscripts;}
export function withProductionTranscript(raw:unknown,value:ProductionPlanV2['sourceTranscripts'][number]):ProductionPlanV2|ProductionReferencePlan{if((raw as {editorVersion?:number}|null)?.editorVersion===3){const plan=productionReferencePlan.parse(structuredClone(raw));plan.sourceTranscripts=[...(plan.sourceTranscripts??[]),value];return productionReferencePlan.parse(plan);}const plan=productionPlanV2.parse(structuredClone(raw));plan.sourceTranscripts.push(value);return productionPlanV2.parse(plan);}

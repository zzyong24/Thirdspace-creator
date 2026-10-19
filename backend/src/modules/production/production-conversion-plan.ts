import {productionPlanV2,productionSourceMedia,type ProductionPlanV2} from '@creatoros/contract';
import {ConflictError} from './production.errors';
const object=(v:unknown):Record<string,unknown>=>v!==null&&typeof v==='object'&&!Array.isArray(v)?v as Record<string,unknown>:{};
/** SEMANTIC_BOUNDARY_ALLOW: Convert saved absolute timing and identities only; never select content. */
export function convertLegacyProductionPlan(legacy:Record<string,unknown>|null,source:unknown|null,nextId:(prefix:string)=>string):{plan:ProductionPlanV2;warnings:string[]}{
 if(legacy&&[2,3].includes(Number(legacy.editorVersion)))throw new ConflictError('该工程已经使用原片主轨');
 const snapshot=structuredClone(legacy??{}),render=object(snapshot.renderProps),talking=object(render.talkingHead),warnings:string[]=[],ids=new Set<string>(),legacyIdMap:Array<{oldId:string|null;newId:string}>=[];
 if(source===null&&(typeof talking.file==='string'&&talking.file.length>0||Array.isArray(talking.clips)&&talking.clips.length>0))throw new ConflictError('旧工程已有主媒体，不能以空稿转换清空');
 const identity=(value:unknown,prefix:string)=>{const oldId=typeof value==='string'&&value.length?value:null;let id=oldId;if(!id||ids.has(id)){id=nextId(prefix);if(oldId)warnings.push('旧工程存在重复标识，已为明确编辑保留原标识映射');}if(ids.has(id))throw new ConflictError('生成工程标识重复');ids.add(id);legacyIdMap.push({oldId,newId:id});return id;};
 const anchor=(start:unknown,end:unknown)=>{if(typeof start!=='number'||typeof end!=='number'||!Number.isFinite(start)||!Number.isFinite(end)||start<0||end<=start)throw new ConflictError('旧稿保存的时间范围损坏');const startUs=Math.round(start*1e6),endUs=Math.round(end*1e6);if(!Number.isSafeInteger(startUs)||!Number.isSafeInteger(endUs)||endUs<=startUs)throw new ConflictError('旧稿时间量化后为空，保留原输入待修复');return{kind:'timeline' as const,startUs,endUs};};
 const frozen=source===null?null:productionSourceMedia.parse(source),clipId=frozen?identity(null,'converted-clip'):null;
 const scenes=(Array.isArray(render.scenes)?render.scenes:[]).map(raw=>{const scene=object(raw),sceneAnchor=anchor(scene.startSec,scene.endSec);return{...scene,startSec:scene.startSec as number,endSec:scene.endSec as number,id:identity(scene.id,'converted-scene'),title:typeof scene.title==='string'?scene.title:'',anchor:sceneAnchor,cards:(Array.isArray(scene.cards)?scene.cards:[]).map(value=>{const card=object(value);const a=anchor(card.at,typeof card.endSec==='number'?card.endSec:scene.endSec);return{...card,id:identity(card.id,'converted-card'),anchor:a};})};});
 const captions=(Array.isArray(render.captions)?render.captions:[]).map(raw=>{const c=object(raw);return{...c,id:identity(c.id,'converted-caption'),anchor:anchor(c.start,c.end)};});
 const broll=(Array.isArray(render.broll)?render.broll:[]).map(raw=>{const b=object(raw);return{...b,id:identity(b.id,'converted-broll'),anchor:anchor(b.at,typeof b.durationSec==='number'&&typeof b.at==='number'?b.at+b.durationSec:scenes.find(scene=>typeof b.at==='number'&&Number(scene.startSec)<=b.at&&Number(scene.endSec)>b.at)?.endSec??talking.durationSec)};});
 const {renderProps:_discard,editorVersion:_version,...extensions}=snapshot;
 if(frozen)warnings.push('旧时间图层按保存的成片时间保留；超出新原片的可选内容由同一编译器裁切或隐藏');
 const plan=productionPlanV2.parse({...extensions,editorVersion:2,legacySnapshot:snapshot,legacyIdMap,mainTrack:{sources:frozen?[frozen]:[],clips:frozen?[{clipId:clipId!,sourceId:frozen.sourceId,sourceInTicks:0,sourceOutTicks:frozen.durationTicks}]:[]},overlayDraft:{...render,meta:object(render.meta),scenes,captions,broll,delivery:render.delivery??{width:1920,height:1080,fps:30}},sourceTranscripts:[]});
 // talkingHead/duration are immutable legacy evidence only; v2 writes one mainTrack.
 delete (plan.overlayDraft as Record<string,unknown>).talkingHead;delete (plan.overlayDraft as Record<string,unknown>).durationSec;
 return{plan:productionPlanV2.parse(plan),warnings};
}

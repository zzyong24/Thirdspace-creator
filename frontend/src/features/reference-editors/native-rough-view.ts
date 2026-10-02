import type {ProductionNativeScene,ProductionNativeRoughImpact,ProductionEditorDocument} from '@creatoros/contract';
export type NativeRoughScope={sceneId:string;trackId:string;scene:ProductionNativeScene;selectedClipIds?:string[]};
export type SavedNativeAction={requestId:string;expectedRevision:number};
export type PrepareNativeDocument=()=>Promise<ProductionEditorDocument>;
export function isKnownNativeConflict(error:unknown){const e=error as {code?:string;status?:number}|null;return e?.code==='ConflictError'&&e.status===409;}
// SEMANTIC_BOUNDARY_ALLOW: 仅合并后端给出的精确删除窗口并计算时间位移；不决定删留、图层关联或内容。
export function summarizeNativeImpact(scene:ProductionNativeScene,impact:ProductionNativeRoughImpact,ids:string[]){
 if(scene.id!==impact.sceneId||scene.tracks.main.id!==impact.trackId)throw Error('建议对应的场景已改变，请重新读取。');
 const selected=new Set(ids),ranges=impact.suggestions.filter(s=>selected.has(s.suggestionId)).flatMap(s=>s.removedRanges).map(r=>({...r})).sort((a,b)=>a.startTick-b.startTick);
 const union:Array<{startTick:number;endTick:number}>=[];
 for(const r of ranges){if(!Number.isSafeInteger(r.startTick)||!Number.isSafeInteger(r.endTick)||r.startTick<0||r.endTick<=r.startTick)throw Error('建议时间范围尚未核对。');const prev=union.at(-1);if(prev&&r.startTick<=prev.endTick)prev.endTick=Math.max(prev.endTick,r.endTick);else union.push(r);}
 const overlap=(start:number,end:number)=>union.reduce((n,r)=>n+Math.max(0,Math.min(end,r.endTick)-Math.max(start,r.startTick)),0);
 const removedBefore=(time:number)=>union.reduce((n,r)=>n+Math.max(0,Math.min(time,r.endTick)-r.startTick),0);
 const shifted=scene.tracks.main.elements.filter(e=>overlap(e.startTime,e.startTime+e.duration)<e.duration&&removedBefore(e.startTime)>0);
 const mainEnd=Math.max(0,...scene.tracks.main.elements.map(e=>e.startTime+e.duration)),first=union[0]?.startTick??Infinity;
 const independent=[...scene.tracks.overlay,...scene.tracks.audio].flatMap(track=>track.elements.filter(e=>e.startTime+e.duration>first&&e.startTime<mainEnd).map(e=>({trackId:track.id,elementId:e.id,type:e.type,name:typeof e.name==='string'&&e.name?e.name:typeof e.content==='string'&&e.content?e.content:'',startTick:e.startTime,endTick:e.startTime+e.duration})));
 return{ranges:union,removedTicks:union.reduce((n,r)=>n+r.endTick-r.startTick,0),shifted,independent};
}

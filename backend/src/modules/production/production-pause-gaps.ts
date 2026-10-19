import {productionReferencePlan,readProductionNativeScene,sourceNativeTickExact,productionPauseGap,type ProductionPauseGap,type ProductionRoughCutSuggestion} from '@creatoros/contract';
import {assetAsrAggregate} from '@creatoros/contract/execution-worker';
import {itemDigest} from './production-editor-plan';
import {ConflictError} from './production.errors';
/** SEMANTIC_BOUNDARY_ALLOW: 只枚举同源相邻真实token的正时间间隙和精确格点，不判静音、不按阈值选创作范围。 */
export function buildProductionPauseGaps(raw:unknown,sceneId:string,clipIds:readonly string[]):ProductionPauseGap[]{
 const plan=productionReferencePlan.parse(raw),scene=readProductionNativeScene(plan,sceneId);if(!scene)return [];
 const result:ProductionPauseGap[]=[];
 for(const clipId of clipIds){const e=scene.tracks.main.elements.find(e=>e.id===clipId);if(!e||e.type!=='video'||(e.retime?.rate??1)!==1||e.animations&&Object.keys(e.animations as object).length||Array.isArray(e.effects)&&e.effects.length||Array.isArray(e.masks)&&e.masks.length)continue;
 const source=plan.nativeSources?.find(s=>s.mediaId===e.mediaId)?.source,ref=plan.referenceEditor.mediaRefs.find(r=>r.mediaId===e.mediaId);if(!source||ref?.assetId!==source.assetId||ref.assetFileId!==source.assetFileId)continue;
 for(const t of plan.sourceTranscripts??[]){if(t.sourceId!==source.sourceId||t.assetFileId!==source.assetFileId||t.granularity==='text')continue;
 const timing=assetAsrAggregate.shape.timingReceipt.safeParse(t.providerEvidence.timingReceipt);if(!timing.success||!timing.data)continue;
 // 既有owner先验证完整timing映射/单call账本；这里只消费已保存不可变transcript，顺序异常不拼接或排序洗绿。
 if(new Set(t.tokens.map(x=>x.tokenId)).size!==t.tokens.length||t.tokens.some((x,i)=>x.endTicks>source.durationTicks||i>0&&x.startTicks<t.tokens[i-1]!.endTicks))continue;
 for(let i=1;i<t.tokens.length;i++){const left=t.tokens[i-1]!,right=t.tokens[i]!,start=sourceNativeTickExact(left.endTicks,source),end=sourceNativeTickExact(right.startTicks,source);if(start===null||end===null||end<=start||start<e.trimStart||end>e.trimStart+e.duration)continue;
 const identity={clipId,sourceId:source.sourceId,transcriptId:t.transcriptId,leftTokenId:left.tokenId,rightTokenId:right.tokenId,sourceStartTicks:left.endTicks,sourceEndTicks:right.startTicks,sourceTimebase:source.timebase},gapDigest=itemDigest({protocol:'production.pause-gap.v3',identity,sceneId,element:e,source,transcript:t});result.push(productionPauseGap.parse({...identity,gapDigest,gapId:`gap-${gapDigest.slice(7)}`}));}
 }}return result;
}
export function productionPauseGapRange(raw:unknown,sceneId:string,suggestion:ProductionRoughCutSuggestion,frozenGaps:readonly ProductionPauseGap[]){
 const target=suggestion.target;if(target.kind!=='pause_gap'||suggestion.decision!=='review')throw new ConflictError('停顿候选须明确听审');
 const frozen=frozenGaps.find(g=>g.gapId===target.gapId&&g.clipId===target.clipId&&g.transcriptId===target.transcriptId),actual=buildProductionPauseGaps(raw,sceneId,[target.clipId]).find(g=>g.gapId===target.gapId);if(!frozen||!actual||itemDigest(actual)!==itemDigest(frozen))throw new ConflictError('原停顿证据已改变');
 if(target.retainedTicks>=frozen.sourceEndTicks-frozen.sourceStartTicks)throw new ConflictError('保留停顿范围不能等于或超过真实间隙');
 const plan=productionReferencePlan.parse(raw),scene=readProductionNativeScene(plan,sceneId)!,e=scene.tracks.main.elements.find(e=>e.id===target.clipId)!,source=plan.nativeSources!.find(x=>x.source.sourceId===frozen.sourceId)!.source,start=sourceNativeTickExact(frozen.sourceStartTicks+target.retainedTicks,source),end=sourceNativeTickExact(frozen.sourceEndTicks,source);
 if(start===null||end===null||end<=start)throw new ConflictError('停顿切点不能精确落在原生格点');return{startTick:e.startTime+start-e.trimStart,endTick:e.startTime+end-e.trimStart};
}

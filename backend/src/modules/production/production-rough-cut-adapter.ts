import type {RequestContext} from '@creatoros/contract';
import {productionRoughCutModelOutput} from '@creatoros/contract';
import {productionRoughCutTaskInput} from '@creatoros/contract/execution-worker';
import type {StructuredBusinessAdapter} from '../ai-runtime/structured-business-execution.service';
/** Original structured worker performs the semantic judgement; owner only freezes and validates identity. */
export function createProductionRoughCutBusinessAdapter(ownerFor:(ctx:RequestContext)=>{readFrozenTask(ctx:RequestContext,taskId:string,input:unknown):Promise<{modelContext:unknown;candidateId:string;frozenInputDigest:string}>}):StructuredBusinessAdapter{
 return{skillId:'production.rough-cut',capability:'script.draft',async prepare(ctx,task){const frozen=await ownerFor(ctx).readFrozenTask(ctx,task.id,task.inputData);return{roughCutContext:JSON.stringify(frozen.modelContext),__productionRoughCutFrozen:JSON.stringify({candidateId:frozen.candidateId,frozenInputDigest:frozen.frozenInputDigest})};},project(input,object,execution){const identity=productionRoughCutTaskInput.parse(input);if(execution?.structuredResult?.validation?.status==='partial')return{resultType:'production_rough_cut_partial',resultData:{...identity,value:object}};const value=productionRoughCutModelOutput.parse(object);return{resultType:'production_rough_cut',resultData:{...identity,value}};}};
}

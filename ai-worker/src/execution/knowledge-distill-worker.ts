import {z} from 'zod';
import type {LanguageModel} from 'ai';
import type {WorkerStructuredResult} from '@creatoros/contract/execution-worker';
import {knowledgeDistillSchema} from '../prompt/templates/knowledge-distill';
import {getEffectiveTemplate} from '../prompt/effective-skill-runtime';
import {runStructuredNode} from '../nodes/structured-node';
import {GenerationFailure} from './generation-error';
const planSchema=z.object({chunks:z.array(z.string().min(1)).min(1),coverage:z.object({inputChars:z.number().int().nonnegative(),processedChars:z.number().int().nonnegative(),truncatedChars:z.number().int().nonnegative(),chunkCount:z.number().int().positive()})});
/** 单个冻结任务按原顺序生成全篇；传入同一个durable模型与原lease信号，失败不交付部分候选。 */
export async function runKnowledgeDistillInWorker(raw:string,deps:{model:LanguageModel;signal:AbortSignal;maxOutputTokens:number}):Promise<{object:{parts:z.infer<typeof knowledgeDistillSchema>[]};generation:WorkerStructuredResult['generation']}>{
 const plan=planSchema.parse(JSON.parse(raw));if(plan.chunks.length!==plan.coverage.chunkCount||plan.chunks.reduce((sum,content)=>sum+content.length,0)!==plan.coverage.processedChars||plan.coverage.processedChars+plan.coverage.truncatedChars!==plan.coverage.inputChars)throw new GenerationFailure('failed','KNOWLEDGE_CHUNKS_INVALID');
 const parts:z.infer<typeof knowledgeDistillSchema>[]=[],generations:WorkerStructuredResult['generation'][]=[];
 for(const content of plan.chunks){
  deps.signal.throwIfAborted();
  const result=await runStructuredNode({model:deps.model,template:getEffectiveTemplate('knowledge.distill'),facets:{content},outputSchema:knowledgeDistillSchema,maxOutputTokens:deps.maxOutputTokens,signal:deps.signal});
  deps.signal.throwIfAborted();if(result.validation?.status==='partial')throw new GenerationFailure('failed','KNOWLEDGE_CHUNK_OUTPUT_INVALID');
  parts.push(knowledgeDistillSchema.parse(result.object));generations.push(result.generation);
 }
 const sum=(key:keyof WorkerStructuredResult['generation']['usage'])=>generations.every(g=>typeof g.usage[key]==='number')?generations.reduce((n,g)=>n+(g.usage[key] as number),0):null;
 return {object:{parts},generation:{finishReason:generations.at(-1)!.finishReason,usage:{inputTokens:sum('inputTokens'),outputTokens:sum('outputTokens'),cachedTokens:sum('cachedTokens'),totalTokens:sum('totalTokens')},attempts:generations.flatMap(g=>g.attempts)}};
}

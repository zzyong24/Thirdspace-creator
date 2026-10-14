import {z} from 'zod';
import type {RequestContext} from '@creatoros/contract';
import {knowledgeClassifySchema,knowledgeDistillSchema,knowledgeRelateSchema,commentQaSiftSchema} from '@creatoros/ai-worker';
import type {StructuredBusinessAdapters} from './structured-business-execution.service';
import {normalizeClassification,truncateForClassify} from './knowledge-classify-runner';
import {normalizeDistillation,mergeDistillations,MAX_DISTILL_CONTENT_CHARS,DISTILL_CHUNK_CHARS} from './knowledge-distill-runner';
import {normalizeRelateCandidates,buildAtomsFacet,MAX_RELATE_ATOMS,type RelateAtomInput} from './knowledge-relate-runner';
import {normalizeQaCandidates,buildCommentsFacet,MAX_SIFT_COMMENTS,type SiftCommentInput} from './comment-qa-sift-runner';
import {chunkTextDeterministically} from './chunk-and-merge';
const contentInput=z.object({content:z.string().trim().min(1)});
const atomInput=z.object({id:z.string().min(1),knowledgeType:z.string(),title:z.string(),sourceNote:z.string().nullable()});
const commentInput=z.object({signalId:z.string().min(1),rawText:z.string(),likeCount:z.number().nullable()});
export interface KnowledgeGenerationReaders {
 readAtoms(ctx:RequestContext,ids:readonly string[]):Promise<RelateAtomInput[]>;
 readComments(ctx:RequestContext,ids:readonly string[]):Promise<SiftCommentInput[]>;
}
/** 输入已由公共入口读取，但执行前仍经当前归属服务重读真实ID与正文。 */
export function createKnowledgeGenerationBusinessAdapters(readers:KnowledgeGenerationReaders):StructuredBusinessAdapters{
 return {
  'knowledge.classify':{skillId:'knowledge.classify',capability:'knowledge.classify',async prepare(_ctx,task){return {content:truncateForClassify(contentInput.parse(task.inputData).content)};},project(_input,raw){const output=normalizeClassification(knowledgeClassifySchema.parse(raw));if(!output)throw Error('knowledge-classify: 模型未产出可用归类(标题为空),请重试或手动补录');return {resultType:'knowledge_sync_candidate',resultData:{skillId:'knowledge.classify',output}};}},
  'knowledge.distill':{skillId:'knowledge.distill',capability:'knowledge.distill',additionalCalls(facets){return z.object({chunks:z.array(z.string())}).parse(JSON.parse(facets.__knowledgeDistill??'null')).chunks.length-1;},async prepare(_ctx,task){
   const content=contentInput.parse(task.inputData).content,modelContent=content.slice(0,MAX_DISTILL_CONTENT_CHARS),chunks=chunkTextDeterministically(modelContent,DISTILL_CHUNK_CHARS),processedChars=chunks.reduce((sum,chunk)=>sum+chunk.text.length,0);
   return {__knowledgeDistill:JSON.stringify({chunks:chunks.map(chunk=>chunk.text),coverage:{inputChars:content.length,processedChars,truncatedChars:content.length-processedChars,chunkCount:chunks.length}})};
  },project(_input,raw,execution){
   const batch=z.object({parts:z.array(knowledgeDistillSchema).min(1)}).parse(raw),frozen=z.object({facets:z.object({__knowledgeDistill:z.string()})}).parse(execution?.frozenInput),plan=z.object({chunks:z.array(z.string()),coverage:z.object({inputChars:z.number(),processedChars:z.number(),truncatedChars:z.number(),chunkCount:z.number()})}).parse(JSON.parse(frozen.facets.__knowledgeDistill));
   if(batch.parts.length!==plan.chunks.length||batch.parts.length!==plan.coverage.chunkCount)throw Error('knowledge-distill: 全文分块候选不完整，原任务仍保留');
   const parts=batch.parts.map(part=>{const value=normalizeDistillation(part);if(!value)throw Error('knowledge-distill: 模型未蒸馏出可用知识原子,请重试或手动补录');return value;});
   return {resultType:'knowledge_sync_candidate',resultData:{skillId:'knowledge.distill',output:{...mergeDistillations(parts),coverage:plan.coverage}}};
  }},
  'knowledge.relate':{skillId:'knowledge.relate',capability:'knowledge.relate',async prepare(ctx,task){
   const input=z.object({atoms:z.array(atomInput)}).parse(task.inputData),ids=input.atoms.slice(0,MAX_RELATE_ATOMS).map(atom=>atom.id),current=await readers.readAtoms(ctx,ids),byId=new Map(current.map(atom=>[atom.id,atom]));
   if(ids.some(id=>!byId.has(id)))throw Error('知识节点已删除或不属于当前工作区');
   const atoms=ids.map(id=>byId.get(id)!);return {atoms:buildAtomsFacet(atoms),__knowledgeAtoms:JSON.stringify(atoms)};
  },project(_input,raw,execution){const frozen=z.object({facets:z.object({__knowledgeAtoms:z.string()})}).parse(execution?.frozenInput),atoms=z.array(atomInput).parse(JSON.parse(frozen.facets.__knowledgeAtoms));return {resultType:'knowledge_sync_candidate',resultData:{skillId:'knowledge.relate',output:{candidates:normalizeRelateCandidates(knowledgeRelateSchema.parse(raw),new Set(atoms.map(atom=>atom.id)))}}};}},
  'comment.qa-sift':{skillId:'comment.qa-sift',capability:'comment.qa-sift',async prepare(ctx,task){
   const input=z.object({comments:z.array(commentInput)}).parse(task.inputData),ids=input.comments.slice(0,MAX_SIFT_COMMENTS).map(comment=>comment.signalId),current=await readers.readComments(ctx,ids),byId=new Map(current.map(comment=>[comment.signalId,comment]));
   if(ids.some(id=>!byId.has(id)))throw Error('评论已删除或不属于当前工作区');
   const comments=ids.map(id=>byId.get(id)!);return {comments:buildCommentsFacet(comments),__knowledgeComments:JSON.stringify(comments)};
  },project(_input,raw,execution){const frozen=z.object({facets:z.object({__knowledgeComments:z.string()})}).parse(execution?.frozenInput),comments=z.array(commentInput).parse(JSON.parse(frozen.facets.__knowledgeComments));return {resultType:'knowledge_sync_candidate',resultData:{skillId:'comment.qa-sift',output:{candidates:normalizeQaCandidates(commentQaSiftSchema.parse(raw),comments)}}};}},
 };
}

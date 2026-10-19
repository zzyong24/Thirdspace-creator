import {describe,it,expect,vi} from 'vitest';
import type {RequestContext} from '@creatoros/contract';
import {createKnowledgeGenerationBusinessAdapters} from './knowledge-generation-business-adapters';
import type {StructuredBusinessAdapter} from './structured-business-execution.service';
import {DISTILL_CHUNK_CHARS,MAX_DISTILL_CONTENT_CHARS,runKnowledgeDistill} from './knowledge-distill-runner';
import {MAX_CLASSIFY_CONTENT_CHARS} from './knowledge-classify-runner';
const ctx:RequestContext={userId:'knowledge-user',accountId:'knowledge-account',requestId:'adapter-test',source:'user'};
const atoms=[{id:'k1',knowledgeType:'claim',title:'当前真实标题',sourceNote:null},{id:'k2',knowledgeType:'evidence',title:'实际证据',sourceNote:'亲测'}];
const comments=[{signalId:'s1',rawText:'当前真实评论',likeCount:57},{signalId:'s2',rawText:'另一条评论',likeCount:null}];
const readers={readAtoms:vi.fn(async()=>atoms),readComments:vi.fn(async()=>comments)};
const adapters=createKnowledgeGenerationBusinessAdapters(readers);
function prepare(adapter:StructuredBusinessAdapter,inputData:Record<string,unknown>){return adapter.prepare(ctx,{id:'task',retryOfTaskId:null,projectId:null,inputData,skillSnapshot:{} as never});}
function project(adapter:StructuredBusinessAdapter,raw:unknown,facets:Record<string,string|undefined>={}){return adapter.project({},raw,{frozenInput:{facets}}).resultData.output as Record<string,any>;}
const part=(title:string,tags:string[]=[])=>({atoms:[{type:'claim',title,note:'',sourceNote:''}],suggestedTags:tags});
describe('T-1238 知识候选业务投影保留原合同',()=>{
 it('归类冻结原模型输入上限，空标题不进入确认门',{timeout:120_000,retry:0},async()=>{
  const adapter=adapters['knowledge.classify']!,facets=await prepare(adapter,{content:'字'.repeat(MAX_CLASSIFY_CONTENT_CHARS+100)});
  expect(facets.content).toContain('已截断');
  expect(project(adapter,{knowledgeType:'note',title:' 标题 ',tags:[' a ','a','b','c','d','e','f'],summary:' 摘要 '})).toEqual({knowledgeType:'note',title:'标题',tags:['a','b','c','d','e'],summary:'摘要'});
  expect(()=>project(adapter,{knowledgeType:'note',title:' ',tags:[],summary:''})).toThrow();
 });
 it('长文按原文顺序切块、去重、输出全篇coverage并只增加调用预算',{timeout:120_000,retry:0},async()=>{
  const adapter=adapters['knowledge.distill']!,content=['第一部分。'.repeat(900),'第二部分。'.repeat(900),'第三部分。'.repeat(900)].join('\n\n');
  const facets=await prepare(adapter,{content}),plan=JSON.parse(facets.__knowledgeDistill!);
  expect(plan.chunks.join('')).toBe(content);expect(plan.chunks.every((text:string)=>text.length<=DISTILL_CHUNK_CHARS)).toBe(true);
  expect(adapter.additionalCalls!(facets)).toBe(plan.chunks.length-1);
  const parts=plan.chunks.map((_text:string,index:number)=>part(index===0?'上下文工程，是新的护城河':index===1?'上下文工程是新的护城河。':`第${index+1}块的新观点`,[`标签${index+1}`,'共同标签']));
  const output=project(adapter,{parts},facets);expect(output.atoms.filter((atom:{title:string})=>atom.title.includes('护城河'))).toHaveLength(1);
  expect(output.coverage).toEqual({inputChars:content.length,processedChars:content.length,truncatedChars:0,chunkCount:plan.chunks.length});
  const progress=vi.fn();await runKnowledgeDistill(ctx,{content},{runKnowledgeGeneration:async()=>output,onChunkProgress:progress});
  expect(progress).toHaveBeenLastCalledWith({status:'completed',index:plan.chunks.length-1,total:plan.chunks.length,completed:plan.chunks.length});
 });
 it('硬上限如实报告截断，不把少块/空原子投影成完整候选',{timeout:120_000,retry:0},async()=>{
  const adapter=adapters['knowledge.distill']!,facets=await prepare(adapter,{content:'字'.repeat(MAX_DISTILL_CONTENT_CHARS+17)}),plan=JSON.parse(facets.__knowledgeDistill!);
  const parts=plan.chunks.map((_text:string,index:number)=>part(`原子${index}`));expect(project(adapter,{parts},facets).coverage).toMatchObject({inputChars:MAX_DISTILL_CONTENT_CHARS+17,processedChars:MAX_DISTILL_CONTENT_CHARS,truncatedChars:17});
  expect(()=>project(adapter,{parts:parts.slice(1)},facets)).toThrow(/全文分块候选不完整/);
  expect(()=>project(adapter,{parts:plan.chunks.map(()=>({atoms:[],suggestedTags:[]}))},facets)).toThrow();
 });
 it('硬上限恰落在空白区时coverage仅报告真正送入Worker的字符',{timeout:120_000,retry:0},async()=>{
  const adapter=adapters['knowledge.distill']!,content='首'+' '.repeat(MAX_DISTILL_CONTENT_CHARS)+'尾',facets=await prepare(adapter,{content}),plan=JSON.parse(facets.__knowledgeDistill!);
  expect(plan.chunks).toEqual(['首']);expect(plan.coverage).toEqual({inputChars:content.length,processedChars:1,truncatedChars:content.length-1,chunkCount:1});
 });
 it('关联重读实际节点，过滤未知ID、自连、无理由与重复对',{timeout:120_000,retry:0},async()=>{
  const adapter=adapters['knowledge.relate']!,facets=await prepare(adapter,{atoms:atoms.map(atom=>({...atom,title:'陈旧或伪造标题'}))});
  expect(readers.readAtoms).toHaveBeenCalledWith(ctx,['k1','k2']);expect(facets.atoms).toContain('当前真实标题');expect(facets.atoms).not.toContain('陈旧');
  const output=project(adapter,{candidates:[{sourceId:'k2',targetId:'k1',relationType:'supports',reason:' 真实理由 '},{sourceId:'k1',targetId:'k2',relationType:'references',reason:'重复对'},{sourceId:'k1',targetId:'k1',relationType:'extends',reason:'自连'},{sourceId:'unknown',targetId:'k1',relationType:'supports',reason:'伪造'}]},facets);
  expect(output.candidates).toEqual([{sourceId:'k2',targetId:'k1',relationType:'supports',reason:'真实理由'}]);expect(project(adapter,{candidates:[]},facets)).toEqual({candidates:[]});
 });
 it('评论重读实际信号，保留信号去重/真实支撑与来源回填',{timeout:120_000,retry:0},async()=>{
  const adapter=adapters['comment.qa-sift']!,facets=await prepare(adapter,{comments:comments.map(comment=>({...comment,rawText:'陈旧原文'}))});
  expect(readers.readComments).toHaveBeenCalledWith(ctx,['s1','s2']);expect(facets.comments).toContain('当前真实评论');
  expect(project(adapter,{candidates:[{title:' 真实问题 ',note:'',sourceNote:'',signalIds:['s1','s2','s2','unknown']},{title:'伪造问题',note:'',sourceNote:'',signalIds:['unknown']}]},facets)).toEqual({candidates:[{title:'真实问题',note:'',sourceNote:'抖音评论 ×2,最高赞 57',signalIds:['s1','s2']}]});expect(project(adapter,{candidates:[]},facets)).toEqual({candidates:[]});
 });
 it.each(['knowledge.relate','comment.qa-sift'] as const)('%s 当前ID被删除或越权在模型调用前拒绝',{timeout:120_000,retry:0},async skill=>{
  const adapter=createKnowledgeGenerationBusinessAdapters({readAtoms:async()=>[],readComments:async()=>[]})[skill]!;
  await expect(prepare(adapter,skill==='knowledge.relate'?{atoms}:{comments})).rejects.toThrow(/当前工作区/);
 });
});

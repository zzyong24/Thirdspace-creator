import {afterEach,describe,expect,it,vi} from 'vitest';
import {createDb} from '@creatoros/backend';
import {createSearchRepository,type SearchRepository,type SearchDocumentRow} from './search.repository';
import {createSearchService} from './search.service';
import {createKnowledgeSearchRuntime} from './knowledge-search-runtime.service';
const ctx={userId:'u',accountId:'a',requestId:'r',source:'user' as const},now=()=> '2026-10-14T00:00:00.000Z';
const digestA=`sha256:${'a'.repeat(64)}`,digestB=`sha256:${'b'.repeat(64)}`;
const closes:Array<()=>Promise<unknown>>=[];
afterEach(async()=>{await Promise.all(closes.splice(0).map(close=>close()));});
describe('T1278 向量真实模型身份与批次冻结',()=>{
 it('同维度异模型及未知历史向量不参加v2语义比较，关键词与v1保留',async()=>{
  const rows=['same','other','unknown'].map((id,i)=>({id,userId:'u',accountId:'a',entityType:'knowledge',entityId:id,title:id,body:'',searchText:id,embedding:[1,0],indexedAt:now(),...(i<2?{embeddingIdentity:{schemaVersion:1,configDigest:i===0?digestA:digestB,dimensions:2}}:{})})) as SearchDocumentRow[];
  const repo={search:async()=>[rows[2]!],listByEntityType:async()=>rows} as unknown as SearchRepository;
  const service=createSearchService(()=>repo,{now});
  const hits=await service.hybridSearch(ctx,'unknown',{entityType:'knowledge',queryEmbedding:[1,0],embeddingConfigDigest:digestA});
  expect(hits.map(hit=>[hit.document.id,hit.matchType])).toEqual([['unknown','exact'],['same','semantic']]);
  expect(hits[1]!.document).not.toHaveProperty('embeddingIdentity');
  expect((await service.hybridSearch(ctx,'unknown',{entityType:'knowledge',queryEmbedding:[1,0]}))).toHaveLength(3);
 },180_000);
 it('真实库按旧向量和身份CAS，晚到旧模型不能覆盖新结果，保正文与归属',async()=>{
  const store=await createDb();closes.push(()=>store.client.close());let n=0;
  const repo=createSearchRepository(store.db,{...ctx,now,nextId:p=>`${p}-${++n}`});
  await repo.upsertDocument({entityType:'knowledge',entityId:'k',title:'保留正文',body:'原文',searchText:'原文',embedding:[0,1]});
  const [old]=(await repo.listMissingEmbeddings('knowledge',8,digestA));expect(old).toBeDefined();
  const [other]=(await repo.listMissingEmbeddings('knowledge',8,digestB));expect(other).toBeDefined();
  expect(await repo.fillMissingEmbedding(other!,[1,0],undefined,digestB)).toBe(true);
  expect(await repo.fillMissingEmbedding(old!,[0,1],undefined,digestA)).toBe(false);
  const [current]=await repo.listByEntityType('knowledge');
  expect(current).toMatchObject({body:'原文',embedding:[1,0],embeddingIdentity:{schemaVersion:1,configDigest:digestB,dimensions:2}});
  expect(await repo.listMissingEmbeddings('knowledge',8,digestB)).toEqual([]);
  expect(await createSearchRepository(store.db,{...ctx,userId:'other',now,nextId:p=>p}).listMissingEmbeddings('knowledge',8,digestA)).toEqual([]);
 },180_000);
 it('补算在等待文档列表之前冻结来源，等候中切设置不能改已捕获Spec',async()=>{
  let selected={model:'old',digest:digestA};let release!:()=>void;let entered!:()=>void;
  const enteredPromise=new Promise<void>(resolve=>entered=resolve),wait=new Promise<void>(resolve=>release=resolve);
  const row={id:'doc',entityType:'knowledge',entityId:'k',indexedAt:now(),title:'t',body:'b',searchText:'t b',embedding:[]};
  const embed=vi.fn(async(_c:unknown,spec:typeof selected)=>{expect(spec.model).toBe('old');return [[1,0]];});
  const search={upsertDocument:vi.fn(),listMissingEmbeddings:vi.fn(async()=>{entered();await wait;return [row];}),fillMissingEmbedding:vi.fn(async()=>true),hybridSearch:vi.fn(async()=>[]),recordSearch:vi.fn()};
  const runtime=createKnowledgeSearchRuntime({knowledge:{getKnowledge:async()=>({id:'k',title:'t',currentRevisionId:'rev'}) as never,listRevisions:async()=>[{id:'rev',content:'b'}] as never},search,resolveEmbedSpec:async()=>structuredClone(selected),embeddingConfigDigest:spec=>spec.digest,embedTexts:embed});
  closes.push(()=>runtime.stop());
  await runtime.indexKnowledgeDocumentBestEffort(ctx,'k');await enteredPromise;
  selected={model:'new',digest:digestB};release();
  // 等同一生命周期受管flight完成；stop会取消，不能用stop冒充自然完成。
  await vi.waitFor(()=>expect(search.fillMissingEmbedding).toHaveBeenCalled(),{timeout:120_000,interval:10});
  expect(search.listMissingEmbeddings).toHaveBeenCalledWith(ctx,'knowledge',8,digestA);
  expect(search.fillMissingEmbedding).toHaveBeenCalledWith(ctx,row,[1,0],expect.any(AbortSignal),digestA);
 },180_000);
});

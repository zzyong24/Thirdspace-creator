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
 it('T1294 索引和查询均不解析向量来源，切设置也不启动历史补算',async()=>{
  let selected={model:'old',digest:digestA};
  const resolveEmbedSpec=vi.fn(async()=>structuredClone(selected)),embed=vi.fn(async()=>[[1,0]]),digest=vi.fn((spec:typeof selected)=>spec.digest);
  const search={upsertDocument:vi.fn(),listMissingEmbeddings:vi.fn(async()=>{throw new Error('停用后不可读补算库存');}),fillMissingEmbedding:vi.fn(async()=>true),hybridSearch:vi.fn(async()=>[]),recordSearch:vi.fn()};
  const runtime=createKnowledgeSearchRuntime({knowledge:{getKnowledge:async()=>({id:'k',title:'t',currentRevisionId:'rev'}) as never,listRevisions:async()=>[{id:'rev',content:'b'}] as never},search,resolveEmbedSpec,embeddingConfigDigest:digest,embedTexts:embed});
  closes.push(()=>runtime.stop());
  await runtime.indexKnowledgeDocumentBestEffort(ctx,'k');selected={model:'new',digest:digestB};
  await expect(runtime.hybridSearch(ctx,'q')).resolves.toEqual({semanticEnabled:false,semanticError:null,hits:[]});
  expect(search.upsertDocument).toHaveBeenCalledExactlyOnceWith(ctx,{entityType:'knowledge',entityId:'k',title:'t',body:JSON.stringify({excerpt:'b',tags:[]}),searchText:'t\nb'});
  expect(search.hybridSearch).toHaveBeenCalledExactlyOnceWith(ctx,'q',{entityType:'knowledge',limit:20,queryEmbedding:null});
  expect(search.recordSearch).toHaveBeenCalledExactlyOnceWith(ctx,{query:'q',filters:{entityType:'knowledge',semantic:false},resultCount:0});
  await runtime.stop();
  expect(resolveEmbedSpec).not.toHaveBeenCalled();expect(digest).not.toHaveBeenCalled();expect(embed).not.toHaveBeenCalled();expect(search.listMissingEmbeddings).not.toHaveBeenCalled();expect(search.fillMissingEmbedding).not.toHaveBeenCalled();
 },180_000);
});

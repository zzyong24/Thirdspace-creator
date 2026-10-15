import {afterEach,describe,expect,it,vi} from 'vitest';
import {createKnowledgeSearchRuntime} from './knowledge-search-runtime.service';

const ctx={userId:'u',accountId:null,groupId:'g',requestId:'r',source:'user' as const};
function deferred<T>(){let resolve!:(value:T)=>void;const promise=new Promise<T>(done=>resolve=done);return {promise,resolve};}
function fixture(){
 const knowledge={getKnowledge:vi.fn(async()=>({id:'k',title:'标题',currentRevisionId:'current'}) as never),listRevisions:vi.fn(async()=>[{id:'old',content:'旧正文'},{id:'current',content:'当前正文'}] as never)};
 const search={upsertDocument:vi.fn(async()=>({}) as never),listMissingEmbeddings:vi.fn(async()=>[]),fillMissingEmbedding:vi.fn(async()=>true),hybridSearch:vi.fn(async()=>[]),recordSearch:vi.fn(async()=>({ok:true as const}))};
 const resolveEmbedSpec=vi.fn(async()=>({model:'不得读取的旧配置'})),embeddingConfigDigest=vi.fn(()=>`sha256:${'a'.repeat(64)}`),embedTexts=vi.fn(async()=>[[1,0]]);
 const runtime=createKnowledgeSearchRuntime({knowledge,search,resolveEmbedSpec,embeddingConfigDigest,embedTexts});
 return {runtime,knowledge,search,resolveEmbedSpec,embeddingConfigDigest,embedTexts};
}
function noVector(f:ReturnType<typeof fixture>){
 expect(f.resolveEmbedSpec).not.toHaveBeenCalled();expect(f.embeddingConfigDigest).not.toHaveBeenCalled();expect(f.embedTexts).not.toHaveBeenCalled();
 expect(f.search.listMissingEmbeddings).not.toHaveBeenCalled();expect(f.search.fillMissingEmbedding).not.toHaveBeenCalled();
}
afterEach(()=>vi.restoreAllMocks());
describe('T1294 知识搜索只消费原关键词索引',()=>{
 it('查询保留原返回shape与搜索记录，不解析配置、不发向量或补算',async()=>{
  const f=fixture();
  await expect(f.runtime.hybridSearch(ctx,'原查询')).resolves.toEqual({semanticEnabled:false,semanticError:null,hits:[]});
  expect(f.search.hybridSearch).toHaveBeenCalledExactlyOnceWith(ctx,'原查询',{entityType:'knowledge',limit:20,queryEmbedding:null});
  expect(f.search.recordSearch).toHaveBeenCalledExactlyOnceWith(ctx,{query:'原查询',filters:{entityType:'knowledge',semantic:false},resultCount:0});
  await f.runtime.stop();noVector(f);
 });
 it('已停用的resolver即使抛错也完全不进入，关键词结果不受旧配置阻断',async()=>{
  const f=fixture();f.resolveEmbedSpec.mockRejectedValue(new Error('旧密钥失效'));
  await expect(f.runtime.hybridSearch(ctx,'q')).resolves.toEqual({semanticEnabled:false,semanticError:null,hits:[]});
  await f.runtime.stop();noVector(f);
 });
 it('索引取原currentRevision而非首个revision，保原正文投影/归属并零补算',async()=>{
  const f=fixture();await f.runtime.indexKnowledgeDocumentBestEffort(ctx,'k');
  expect(f.knowledge.getKnowledge).toHaveBeenCalledExactlyOnceWith(ctx,'k');expect(f.knowledge.listRevisions).toHaveBeenCalledExactlyOnceWith(ctx,'k');
  expect(f.search.upsertDocument).toHaveBeenCalledExactlyOnceWith(ctx,{entityType:'knowledge',entityId:'k',title:'标题',body:JSON.stringify({excerpt:'当前正文',tags:[]}),searchText:'标题\n当前正文'});
  await f.runtime.stop();noVector(f);
 });
 it('历史currentRevision缺失时仍保原首条revision回退',async()=>{
  const f=fixture();f.knowledge.listRevisions.mockResolvedValue([{id:'old',content:'旧正文'}] as never);
  await f.runtime.indexKnowledgeDocumentBestEffort(ctx,'k');
  expect(f.search.upsertDocument).toHaveBeenCalledWith(ctx,expect.objectContaining({searchText:'标题\n旧正文'}));await f.runtime.stop();noVector(f);
 });
 it('无revision仍保原空正文索引，不补造内容或模型调用',async()=>{
  const f=fixture();f.knowledge.listRevisions.mockResolvedValue([] as never);await f.runtime.indexKnowledgeDocumentBestEffort(ctx,'k');
  expect(f.search.upsertDocument).toHaveBeenCalledWith(ctx,expect.objectContaining({body:JSON.stringify({excerpt:'',tags:[]}),searchText:'标题'}));await f.runtime.stop();noVector(f);
 });
 it('索引失败仍best-effort，不回滚原业务成功，日志不泄底层异常',async()=>{
  const f=fixture(),warn=vi.spyOn(console,'warn').mockImplementation(()=>{});f.search.upsertDocument.mockRejectedValue(new Error('private-secret'));
  await expect(f.runtime.indexKnowledgeDocumentBestEffort(ctx,'k')).resolves.toBeUndefined();
  expect(warn).toHaveBeenCalledExactlyOnceWith('[knowledge-index] 索引失败(业务真值不受影响)');expect(JSON.stringify(warn.mock.calls)).not.toContain('private-secret');await f.runtime.stop();noVector(f);
 });
 it('查询启动时复制原上下文，不被调用方随后的切组重绑',async()=>{
  const f=fixture(),mutable={...ctx};const query=f.runtime.hybridSearch(mutable,'q');mutable.groupId='other';mutable.requestId='other-request';await query;
  expect(f.search.hybridSearch).toHaveBeenCalledWith(ctx,'q',expect.any(Object));expect(f.search.recordSearch).toHaveBeenCalledWith(ctx,expect.any(Object));await f.runtime.stop();noVector(f);
 });
 it('关键词读失败仍抛原错误，不写假搜索记录或假空结果',async()=>{
  const f=fixture(),failure=new Error('原读取失败');f.search.hybridSearch.mockRejectedValue(failure);
  await expect(f.runtime.hybridSearch(ctx,'q')).rejects.toBe(failure);expect(f.search.recordSearch).not.toHaveBeenCalled();await f.runtime.stop();noVector(f);
 });
 it('stop保原在途读取清理责任，晚回结果不再record并拒绝新操作',async()=>{
  const f=fixture(),entered=deferred<void>(),read=deferred<[]>();f.search.hybridSearch.mockImplementation(async()=>{entered.resolve();return read.promise;});
  const query=f.runtime.hybridSearch(ctx,'q'),rejected=expect(query).rejects.toThrow('已停止');await entered.promise;
  const stop=f.runtime.stop();expect(f.runtime.stop()).toBe(stop);let closed=false;void stop.then(()=>{closed=true;});await Promise.resolve();expect(closed).toBe(false);
  await expect(f.runtime.hybridSearch(ctx,'new')).rejects.toThrow('已停止');await expect(f.runtime.indexKnowledgeDocumentBestEffort(ctx,'k')).rejects.toThrow('已停止');
  read.resolve([]);await rejected;await stop;expect(closed).toBe(true);expect(f.search.recordSearch).not.toHaveBeenCalled();noVector(f);
 });
 it('stop早于索引原资料读完时不再upsert，也不吞取消为best-effort成功',async()=>{
  const f=fixture(),entered=deferred<void>(),read=deferred<never>();f.knowledge.getKnowledge.mockImplementation(async()=>{entered.resolve();return read.promise;});
  const indexing=f.runtime.indexKnowledgeDocumentBestEffort(ctx,'k'),rejected=expect(indexing).rejects.toThrow('已停止');await entered.promise;const stop=f.runtime.stop();
  read.resolve({id:'k',title:'标题',currentRevisionId:'current'} as never);await rejected;await stop;expect(f.search.upsertDocument).not.toHaveBeenCalled();noVector(f);
 });
});

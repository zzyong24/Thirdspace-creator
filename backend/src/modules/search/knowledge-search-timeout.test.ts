import {afterEach,expect,it,vi} from 'vitest';
import {createKnowledgeSearchRuntime} from './knowledge-search-runtime.service';
const ctx={userId:'u',accountId:'a',requestId:'r',source:'user' as const};
afterEach(()=>vi.useRealTimers());
function fixture(){
 let release!:()=>void;
 const search={upsertDocument:vi.fn(),listMissingEmbeddings:vi.fn(async()=>[]),fillMissingEmbedding:vi.fn(),hybridSearch:vi.fn(async()=>new Promise<[]>(resolve=>{release=()=>resolve([]);setTimeout(release,150_000);})),recordSearch:vi.fn()};
 const resolveEmbedSpec=vi.fn(async()=>({model:'test'})),embedTexts=vi.fn(async()=>[[1,2]]);
 const runtime=createKnowledgeSearchRuntime({knowledge:{getKnowledge:vi.fn(),listRevisions:vi.fn()},search,resolveEmbedSpec,embedTexts});
 return {runtime,search,resolveEmbedSpec,embedTexts,release:()=>release()};
}
it('T1294 关键词读取超过120秒仍继承原操作，不额外截短或调用向量',async()=>{
 vi.useFakeTimers();const f=fixture(),waiting=f.runtime.hybridSearch(ctx,'query');let completed=false;void waiting.then(()=>{completed=true;});
 await vi.advanceTimersByTimeAsync(125_000);expect(completed).toBe(false);expect(f.search.hybridSearch).toHaveBeenCalledExactlyOnceWith(ctx,'query',{entityType:'knowledge',limit:20,queryEmbedding:null});expect(f.search.recordSearch).not.toHaveBeenCalled();
 await vi.advanceTimersByTimeAsync(25_000);await expect(waiting).resolves.toEqual({semanticEnabled:false,semanticError:null,hits:[]});
 expect(f.search.recordSearch).toHaveBeenCalledExactlyOnceWith(ctx,{query:'query',filters:{entityType:'knowledge',semantic:false},resultCount:0});
 await f.runtime.stop();expect(f.resolveEmbedSpec).not.toHaveBeenCalled();expect(f.embedTexts).not.toHaveBeenCalled();expect(f.search.listMissingEmbeddings).not.toHaveBeenCalled();expect(f.search.fillMissingEmbedding).not.toHaveBeenCalled();
});
it('T1294 stop立即拒绝新工作，等待原关键词读清理且阻止晚到记录',async()=>{
 vi.useFakeTimers();const f=fixture(),waiting=f.runtime.hybridSearch(ctx,'query'),failure=expect(waiting).rejects.toThrow('已停止');
 await vi.advanceTimersByTimeAsync(0);const stop=f.runtime.stop();let stopped=false;void stop.then(()=>{stopped=true;});await Promise.resolve();expect(stopped).toBe(false);
 await expect(f.runtime.hybridSearch(ctx,'new')).rejects.toThrow('已停止');f.release();await failure;await stop;expect(stopped).toBe(true);expect(f.search.recordSearch).not.toHaveBeenCalled();
 expect(f.resolveEmbedSpec).not.toHaveBeenCalled();expect(f.embedTexts).not.toHaveBeenCalled();expect(f.search.listMissingEmbeddings).not.toHaveBeenCalled();expect(f.search.fillMissingEmbedding).not.toHaveBeenCalled();vi.clearAllTimers();
});

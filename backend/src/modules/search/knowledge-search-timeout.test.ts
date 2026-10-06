import {afterEach,expect,it,vi} from 'vitest';
import {createKnowledgeSearchRuntime} from './knowledge-search-runtime.service';
const ctx={userId:'u',accountId:'a',requestId:'r',source:'user' as const};
afterEach(()=>vi.useRealTimers());
function fixture(){
 let signal:AbortSignal|undefined;
 const search={upsertDocument:vi.fn(),listMissingEmbeddings:vi.fn(async()=>[]),fillMissingEmbedding:vi.fn(),hybridSearch:vi.fn(async()=>[]),recordSearch:vi.fn()};
 const runtime=createKnowledgeSearchRuntime({knowledge:{getKnowledge:vi.fn(),listRevisions:vi.fn()},search,resolveEmbedSpec:async()=>({model:'test'}),embedTexts:async(_ctx,_spec,_texts,abort)=>{
  signal=abort;return new Promise<number[][]>((resolve,reject)=>{
   const timer=setTimeout(()=>resolve([[1,2]]),150_000);
   abort?.addEventListener('abort',()=>{clearTimeout(timer);reject(abort.reason);},{once:true});
  });
 }});
 return {runtime,search,signal:()=>signal};
}
it('慢排队和向量执行超过120秒，领域外帽不误报超时或丢失语义结果',async()=>{
 vi.useFakeTimers();const f=fixture(),waiting=f.runtime.hybridSearch(ctx,'query');
 await vi.advanceTimersByTimeAsync(125_000);expect(f.signal()?.aborted).toBe(false);expect(f.search.hybridSearch).not.toHaveBeenCalled();
 await vi.advanceTimersByTimeAsync(25_000);await expect(waiting).resolves.toMatchObject({semanticEnabled:true,semanticError:null});await f.runtime.stop();
});
it('stop仍即时取消原IO信号，不在两分钟下限继续等待',async()=>{
 vi.useFakeTimers();const f=fixture(),waiting=f.runtime.hybridSearch(ctx,'query'),failure=expect(waiting).rejects.toThrow('已停止');
 await vi.advanceTimersByTimeAsync(0);await f.runtime.stop();await failure;expect(f.signal()?.aborted).toBe(true);expect(f.search.hybridSearch).not.toHaveBeenCalled();
});

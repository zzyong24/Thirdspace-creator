import {it,expect,vi} from 'vitest';
import {createMinimaxAdapter} from './multimodal-minimax';
const spec={provider:'minimax',baseUrl:null,model:'MiniMax-Hailuo-2.3',token:'fixture',kind:'video'} as const;
it.each([{resolution:'2K' as const,durationSec:6},{resolution:'768P' as const,durationSec:8},{resolution:'2K' as const,durationSec:8,model:'MiniMax-H3-Max',legacyPlain:true}])('原paid job %j 保留原query路径，仅查询下载不重POST',async({model,...options})=>{
 const requests:string[]=[],submitted=vi.fn();
 const fakeFetch=(async(url:unknown,init?:RequestInit)=>{requests.push(String(url));expect(init?.method).toBe('GET');if(String(url).includes('/query/'))return new Response(JSON.stringify({status:'Success',file_id:'file'}),{headers:{'content-type':'application/json'}});if(String(url).includes('/files/'))return new Response(JSON.stringify({file:{download_url:'https://fixture.invalid/video'}}),{headers:{'content-type':'application/json'}});return new Response(new Uint8Array([1,2,3]));}) as typeof fetch;
 const result=await createMinimaxAdapter({fetch:fakeFetch,sleep:async()=>{},pollIntervalMs:0,maxPollAttempts:1}).generateVideo!({...spec,...(model?{model}:{})},{prompt:'原冻结描述',resumeJobId:'original-accepted-job',onJobSubmitted:submitted,...options});
 expect(requests[0]).toContain('/v1/query/video_generation?task_id=original-accepted-job');expect(submitted).not.toHaveBeenCalled();expect(result.assetBytes).toEqual(new Uint8Array([1,2,3]));
});
it('原无mode文生协议不新增参数门或改原请求body',async()=>{
 const bodies:unknown[]=[];
 const fakeFetch=(async(url:unknown,init?:RequestInit)=>{if(init?.method==='POST'){bodies.push(JSON.parse(String(init.body)));return new Response(JSON.stringify({task_id:'original-text-job'}));}if(String(url).includes('/query/'))return new Response(JSON.stringify({status:'Success',file_id:'file'}));if(String(url).includes('/files/'))return new Response(JSON.stringify({file:{download_url:'https://fixture.invalid/video'}}));return new Response(new Uint8Array([1]));}) as typeof fetch;
 await createMinimaxAdapter({fetch:fakeFetch,sleep:async()=>{},pollIntervalMs:0,maxPollAttempts:1}).generateVideo!(spec,{prompt:'原文生',durationSec:8,resolution:'2K',legacyPlain:true});
 expect(bodies).toEqual([{model:spec.model,prompt:'原文生',prompt_optimizer:true}]);
});

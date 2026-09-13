import {describe,it,expect,vi} from 'vitest';
import {queryRedfox} from './redfox-client';
const signal=new AbortController().signal;
describe('RedFox transport',()=>{
 it('uses only fixed endpoint/header and masks secrets in returned data',async()=>{const fetcher=vi.fn(async(_url:string,_init?:RequestInit)=>new Response(JSON.stringify({code:2000,data:{list:[{id:'1',title:'real'}],apiKey:'test-key',message:'test-key'}})));
 const result=await queryRedfox({action:'search',keyword:'AI',page:1},'test-key',signal,fetcher as typeof fetch);
 expect(fetcher.mock.calls[0]?.[0]).toBe('https://redfox.hk/story/api/dy/data/searchWork');expect(JSON.stringify(result)).not.toContain('test-key');expect(result.status).toBe('ok');});
 it('does not retry unknown charged submissions',async()=>{const f=vi.fn(async()=>{throw Error('key leaked upstream');});expect(await queryRedfox({action:'transcriptSubmit',url:'https://www.douyin.com/video/12345'},'secret',signal,f as typeof fetch)).toEqual({status:'unknown',code:'REDFOX_SUBMIT_UNKNOWN'});expect(f).toHaveBeenCalledTimes(1);});
 it('authentication failure is terminal and does not expose upstream response',async()=>{const f=vi.fn(async()=>new Response('secret',{status:401}));expect(await queryRedfox({action:'detail',workId:'123456'},'secret',signal,f as typeof fetch)).toEqual({status:'error',code:'REDFOX_AUTH_INVALID'});expect(f).toHaveBeenCalledTimes(1);});
 it('额度不足返回可行动的稳定状态，不伪装成结果未知',async()=>{const f=vi.fn(async()=>new Response(JSON.stringify({code:3201,data:{message:'private'}})));expect(await queryRedfox({action:'hotspots',startDate:'2026-09-12',endDate:'2026-09-13'},'secret',signal,f as typeof fetch)).toEqual({status:'error',code:'REDFOX_QUOTA_EXHAUSTED'});});
 it('rejects arbitrary URLs before network',async()=>{const f=vi.fn();await expect(queryRedfox({action:'transcriptSubmit',url:'https://evil.example/video'},'secret',signal,f)).resolves.toEqual({status:'error',code:'REDFOX_VIDEO_URL_INVALID'});expect(f).not.toHaveBeenCalled();});
 it('validates Beijing range',async()=>{await expect(queryRedfox({action:'hotspots',startDate:'2026-01-01',endDate:'2026-04-01'},'secret',signal,vi.fn())).resolves.toEqual({status:'error',code:'REDFOX_DATE_RANGE_INVALID'});});
});
it('successful submit without task id remains unknown and is never retried',async()=>{const f=vi.fn(async()=>new Response(JSON.stringify({code:2000,data:{}})));expect(await queryRedfox({action:'transcriptSubmit',url:'https://www.douyin.com/video/12345'},'secret',signal,f as typeof fetch)).toEqual({status:'unknown',code:'REDFOX_SUBMIT_RECEIPT_INVALID'});expect(f).toHaveBeenCalledTimes(1);});

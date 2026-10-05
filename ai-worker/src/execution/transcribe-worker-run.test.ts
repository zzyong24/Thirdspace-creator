import {beforeEach,expect,it,vi} from 'vitest';
import {createHash} from 'node:crypto';
import {transcribeTaskInputSchema,workerPortInputSchemas,type WorkerPort} from '@creatoros/contract/execution-worker';
import {asrExecutionIdentity} from '../runtime/asr-execution-identity';
import {createQwenAsrAdapter} from '../runtime/multimodal-qwen-asr';
const io=vi.hoisted(()=>({extract:vi.fn(),source:vi.fn(),fetch:vi.fn()}));
// 只替换音频/来源/神经推理IO；原Worker编排、来源通道、ASR账本协议与后处理恢复均执行真实代码。
vi.mock('../runtime/transcribe-audio-extract',()=>({createTranscribeAudioExtractor:()=>io.extract}));
vi.mock('../runtime/douyin-transcribe-source',()=>({fetchDouyinVideoSource:async(input:{awemeId:string},deps:{channel:<T>(run:()=>Promise<T>,map:(error:unknown)=>{kind:string})=>Promise<T>})=>deps.channel(()=>io.source(input),()=>({kind:'net-timeout'}))}));
vi.mock('./transcribe-asr-registry',()=>({createTranscribeAsrRegistry:()=>({qwen:createQwenAsrAdapter({fetch:io.fetch})})}));
import {runTranscribeInWorker} from './transcribe-worker-run';
const bytes=new Uint8Array([1,2,3,4]),digest=`sha256:${createHash('sha256').update(bytes).digest('hex')}`;
const spec={kind:'audio' as const,provider:'qwen',model:'asr',baseUrl:null,token:'fixture-only'};
const plan={schemaVersion:1,identity:asrExecutionIdentity(spec,'zh'),audioDigest:digest,audioByteLength:bytes.length};
beforeEach(()=>{io.extract.mockReset().mockResolvedValue(bytes);io.source.mockReset().mockImplementation(async(input:{awemeId:string})=>({playUrl:`https://fixture.invalid/${input.awemeId}`}));io.fetch.mockReset().mockResolvedValue(new Response(JSON.stringify({choices:[{message:{content:'逐字稿原文'}}]})));});
function fixture(ids=['one'],terminal:'succeeded'|'failed'='succeeded'){
 const audio=new Set<string>(),sources=new Map<string,{kind:'video';playUrl:string}|{kind:'image-album'}>();
 const receipts=new Map<string,{awemeId:string;status:'existing'|'saved'|'image-album'|'failed'|'no-project';projectId:string|null;error:string|null}>();
 const call=vi.fn(async(port:WorkerPort,raw:unknown,_signal?:AbortSignal):Promise<unknown>=>{
  const parsed=workerPortInputSchemas[port].parse(raw),id='awemeId' in parsed?String(parsed.awemeId):'';
  switch(port){
   case 'prepareTranscribeItem':return {receipt:receipts.get(id)??null,source:sources.get(id)??null};
   case 'acquireTranscribeChannel':case 'reportTranscribeChannel':return{ok:true};
   case 'recordTranscribeSource':{const data=workerPortInputSchemas.recordTranscribeSource.parse(raw);sources.set(id,data.source);return{ok:true};}
   case 'readTranscribeAudio':return audio.has(id)?{status:'ready',bytes,audioDigest:digest,audioByteLength:bytes.length}:{status:'missing'};
   case 'saveTranscribeAudio':audio.add(id);return{audioDigest:digest,audioByteLength:bytes.length};
   case 'prepareTranscribeAsr':return{status:'prepared',plan,spec};
   case 'reserveAsrRequest':return{callId:`call-${id}`,status:'reserved'};
   case 'startAsrRequest':return{callId:`call-${id}`,status:'started'};
   case 'settleAsrRequest':return{callId:`call-${id}`,status:'settled'};
   case 'prepareTranscribePostprocess':return{status:'restored',result:{applied:false,transcript:'逐字稿原文',reason:'宿主已确认模型未配置，保留原文'}};
   case 'saveTranscribeArtifact':{const r={awemeId:id,status:sources.get(id)?.kind==='image-album'?'image-album' as const:'saved' as const,projectId:`project-${id}`,error:null};receipts.set(id,r);return r;}
   case 'failTranscribeItem':{const r={awemeId:id,status:'failed' as const,projectId:null,error:workerPortInputSchemas.failTranscribeItem.parse(raw).error};receipts.set(id,r);return r;}
   case 'completeTranscribeTask':return{status:terminal};
   default:throw Error(`夹具未授权端口 ${port}`);
  }
 });
 const input=transcribeTaskInputSchema.parse({kind:'transcribe.douyin',awemeIds:ids,language:'zh',configuration:{kind:'audio',provider:'qwen',model:'asr',baseUrl:null}});
 return{call,input,receipts,audio,sources,run:(signal=new AbortController().signal)=>runTranscribeInWorker(input,signal,call),ports:()=>call.mock.calls.map(c=>c[0])};
}
it('成功路径经真实来源→抽音→持久ASR reserve/start/settle→后处理恢复→保存→终态',async()=>{const f=fixture();expect(await f.run()).toEqual({status:'succeeded'});expect(f.ports()).toEqual(['prepareTranscribeItem','readTranscribeAudio','acquireTranscribeChannel','reportTranscribeChannel','recordTranscribeSource','saveTranscribeAudio','prepareTranscribeAsr','readTranscribeAudio','reserveAsrRequest','startAsrRequest','settleAsrRequest','prepareTranscribePostprocess','saveTranscribeArtifact','completeTranscribeTask']);expect(io.fetch).toHaveBeenCalledTimes(1);expect(f.receipts.get('one')?.status).toBe('saved');});
it.each(['existing','saved'] as const)('原%s事实恢复跳过全部来源/抽音/识别/后处理，不重复付费',async status=>{const f=fixture();f.receipts.set('one',{awemeId:'one',status,projectId:'original',error:null});expect(await f.run()).toEqual({status:'succeeded'});expect(f.ports()).toEqual(['prepareTranscribeItem','completeTranscribeTask']);expect(io.extract).not.toHaveBeenCalled();expect(io.source).not.toHaveBeenCalled();expect(io.fetch).not.toHaveBeenCalled();});
it('已有音频恢复不重新取流，原识别完整回执先恢复，不申请新付费',async()=>{const f=fixture();f.audio.add('one');const original=f.call.getMockImplementation()!;f.call.mockImplementation(async(p,d,s)=>p==='prepareTranscribeAsr'?{status:'restored',plan,result:{text:'原已保存文本'}}:original(p,d,s));await f.run();expect(io.source).not.toHaveBeenCalled();expect(io.extract).not.toHaveBeenCalled();expect(io.fetch).not.toHaveBeenCalled();expect(f.ports()).not.toContain('reserveAsrRequest');expect(f.ports()).toContain('saveTranscribeArtifact');});
it.each([['one'],['one','two']])('图集%s保存诚实占位，零抽音/ASR/后处理，全部图集仍成功',async(...ids)=>{const f=fixture(ids);io.source.mockResolvedValue({kind:'image-album'});expect(await f.run()).toEqual({status:'succeeded'});expect([...f.receipts.values()].map(r=>r.status)).toEqual(ids.map(()=> 'image-album'));expect(io.extract).not.toHaveBeenCalled();expect(io.fetch).not.toHaveBeenCalled();expect(f.ports()).not.toContain('prepareTranscribePostprocess');});
it('首抽失败重取真实直链一次，第二抽成功保留零失败',async()=>{const f=fixture();io.extract.mockRejectedValueOnce(Error('ffmpeg')).mockResolvedValue(bytes);await f.run();expect(io.source).toHaveBeenCalledTimes(2);expect(io.extract).toHaveBeenCalledTimes(2);expect(f.ports()).not.toContain('failTranscribeItem');});
it('两次抽音失败仅保留该作品失败，下一作品实际保存；总态由宿主failed回执决定',async()=>{const f=fixture(['one','two'],'failed');io.extract.mockRejectedValueOnce(Error('ffmpeg')).mockRejectedValueOnce(Error('ffmpeg')).mockResolvedValue(bytes);expect(await f.run()).toEqual({status:'failed'});expect(f.receipts.get('one')?.status).toBe('failed');expect(f.receipts.get('two')?.status).toBe('saved');expect(io.fetch).toHaveBeenCalledTimes(1);});
it.each(['prepareTranscribeAsr','prepareTranscribePostprocess','settleAsrRequest','saveTranscribeArtifact'] as const)('%s未知回执不得当普通失败/原文成功，也不启动下一作品',async port=>{const f=fixture(['one','two']),original=f.call.getMockImplementation()!;f.call.mockImplementation(async(p,d,s)=>p===port?{invalid:'unknown'}:original(p,d,s));await expect(f.run()).rejects.toMatchObject({outcome:'unknown_result'});expect(f.ports()).not.toContain('completeTranscribeTask');expect(f.ports()).not.toContain('failTranscribeItem');expect(f.call.mock.calls.filter(c=>c[0]==='prepareTranscribeItem')).toHaveLength(1);});
it('来源冷却有限等待使用原授权通道，不重新跑已完成作品',async()=>{const f=fixture(),original=f.call.getMockImplementation()!;let acquire=0;f.call.mockImplementation(async(p,d,s)=>p==='acquireTranscribeChannel'&&acquire++===0?{sourceFailure:{outcome:'retry_wait',errorCode:'TRANSCRIBE_SOURCE_COOLDOWN',retryAfterMs:0}}:original(p,d,s));await f.run();expect(acquire).toBe(2);expect(io.source).toHaveBeenCalledTimes(1);expect(io.fetch).toHaveBeenCalledTimes(1);});
it.each(['retry_wait','waiting_user'] as const)('来源%s仍不可用诚实停止，不伪普通作品失败或发送识别',async outcome=>{const f=fixture(),original=f.call.getMockImplementation()!;f.call.mockImplementation(async(p,d,s)=>p==='acquireTranscribeChannel'?{sourceFailure:{outcome,errorCode:'TRANSCRIBE_SOURCE_COOLDOWN',retryAfterMs:0}}:original(p,d,s));await expect(f.run()).rejects.toMatchObject({outcome:'waiting_user'});expect(io.source).not.toHaveBeenCalled();expect(io.fetch).not.toHaveBeenCalled();expect(f.ports()).not.toContain('failTranscribeItem');});
it('来源冷却等待立即取消，不等待到期也不重新抓取',async()=>{const f=fixture(),original=f.call.getMockImplementation()!,controller=new AbortController();f.call.mockImplementation(async(p,d,s)=>{if(p==='acquireTranscribeChannel'){queueMicrotask(()=>controller.abort());return{sourceFailure:{outcome:'retry_wait',errorCode:'TRANSCRIBE_SOURCE_COOLDOWN',retryAfterMs:960000}};}return original(p,d,s);});await expect(f.run(controller.signal)).rejects.toMatchObject({name:'AbortError'});expect(io.source).not.toHaveBeenCalled();expect(io.fetch).not.toHaveBeenCalled();});
it.each(['prepareTranscribeItem','prepareTranscribeAsr','prepareTranscribePostprocess'] as const)('%s迟到返回已取消不保存/恢复下一步',async port=>{const f=fixture(['one','two']),original=f.call.getMockImplementation()!,controller=new AbortController();f.call.mockImplementation(async(p,d,s)=>{const result=await original(p,d,s);if(p===port)controller.abort();return result;});await expect(f.run(controller.signal)).rejects.toMatchObject({name:'AbortError'});expect(f.receipts.size).toBe(0);expect(f.ports()).not.toContain('failTranscribeItem');expect(f.ports()).not.toContain('completeTranscribeTask');});
it('抽音取消不重取直链、不启动ASR，首次取流/抽音保留同一个signal',async()=>{const f=fixture(),controller=new AbortController();io.extract.mockImplementation(async(_url:string,signal:AbortSignal)=>{expect(signal).toBe(controller.signal);controller.abort();throw new DOMException('cancel','AbortError');});await expect(f.run(controller.signal)).rejects.toMatchObject({name:'AbortError'});expect(io.source).toHaveBeenCalledTimes(1);expect(io.extract).toHaveBeenCalledTimes(1);expect(io.fetch).not.toHaveBeenCalled();expect(f.call.mock.calls.every(c=>c[2]===controller.signal)).toBe(true);});
it('先取消不进行已有事实探测/恢复/来源读取',async()=>{const f=fixture(),c=new AbortController();c.abort();await expect(f.run(c.signal)).rejects.toMatchObject({name:'AbortError'});expect(f.call).not.toHaveBeenCalled();});

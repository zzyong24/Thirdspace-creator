import {createHash} from 'node:crypto';
import {expect,it,vi} from 'vitest';
import {runTranscribeAsrInWorker} from './transcribe-asr-run';
import {asrExecutionIdentity} from '../runtime/asr-execution-identity';
import {AsrExecutionInterruption} from '../runtime/asr-request';
import {createQwenAsrAdapter} from '../runtime/multimodal-qwen-asr';
const bytes=new Uint8Array([1]),digest=`sha256:${createHash('sha256').update(bytes).digest('hex')}`;
const spec={kind:'audio' as const,provider:'qwen',model:'asr',baseUrl:null,token:'fixture'};
const plan={schemaVersion:1,identity:asrExecutionIdentity(spec,'zh'),audioDigest:digest,audioByteLength:1};
function fixture(){
 const fetcher=vi.fn(async()=>new Response(JSON.stringify({choices:[{message:{content:'正文'}}]})));
 const reply:Record<string,unknown>={prepareTranscribeAsr:{status:'prepared',plan,spec},readTranscribeAudio:{status:'ready',bytes,audioDigest:digest,audioByteLength:1},reserveAsrRequest:{callId:'one',status:'reserved'},startAsrRequest:{callId:'one',status:'started'},settleAsrRequest:{callId:'one',status:'settled',result:{text:'正文'}}};
 const call=vi.fn(async(port:string)=>reply[port]);
 return {fetcher,reply,call,run:(signal=new AbortController().signal)=>runTranscribeAsrInWorker('aweme',signal,call,{qwen:createQwenAsrAdapter({fetch:fetcher})})};
}
it.each(['bytes','identity'])('实际 %s 不符时不预留也不执行新识别',async variant=>{
 const f=fixture();if(variant==='bytes')f.reply.readTranscribeAudio={status:'ready',bytes:new Uint8Array([2]),audioDigest:digest,audioByteLength:1};
 else f.reply.prepareTranscribeAsr={status:'prepared',plan,spec:{...spec,model:'changed'}};
 await expect(f.run()).rejects.toBeInstanceOf(AsrExecutionInterruption);expect(f.fetcher).not.toHaveBeenCalled();expect(f.call.mock.calls.map(a=>a[0])).toEqual(['prepareTranscribeAsr','readTranscribeAudio']);
});
it('开始回执绑定其他调用时不发出识别请求',async()=>{
 const f=fixture();f.reply.startAsrRequest={callId:'foreign',status:'started'};
 await expect(f.run()).rejects.toBeInstanceOf(AsrExecutionInterruption);expect(f.fetcher).not.toHaveBeenCalled();
});
it('结算回执未确认成功时不能返回正文',async()=>{
 const f=fixture();f.reply.settleAsrRequest={callId:'one',status:'unknown'};
 await expect(f.run()).rejects.toBeInstanceOf(AsrExecutionInterruption);expect(f.fetcher).toHaveBeenCalledTimes(1);
});
it('恢复返回后已取消，不返回迟到正文也不申请下一步',async()=>{
 const f=fixture(),controller=new AbortController();f.call.mockImplementation(async()=>{controller.abort();return {status:'restored',plan,result:{text:'已保存'}};});
 await expect(f.run(controller.signal)).rejects.toMatchObject({name:'AbortError'});expect(f.call).toHaveBeenCalledTimes(1);expect(f.fetcher).not.toHaveBeenCalled();
});

it.each(['prepare','audio'])('%s 私有响应未知不得当普通识别失败进入回退',async stage=>{
 const f=fixture();if(stage==='prepare')f.call.mockRejectedValue(Error('ACK lost'));
 else f.reply.readTranscribeAudio={status:'ready',bytes:'bad'};
 await expect(f.run()).rejects.toBeInstanceOf(AsrExecutionInterruption);expect(f.fetcher).not.toHaveBeenCalled();
});

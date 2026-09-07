import {expect,it,vi} from 'vitest';
import {runTranscribePostprocessInWorker} from './transcribe-postprocess-run';
import {GenerationFailure} from './generation-error';
const fixture=vi.hoisted(()=>({generate:vi.fn(),modelFor:vi.fn()}));
vi.mock('../runtime/provider-factory',async importOriginal=>({...await importOriginal<object>(),modelFor:fixture.modelFor}));
const spec={apiFormat:'openai_chat',model:'fixture',baseUrl:null,token:'fixture'};
const result={applied:true,transcript:'你好，世界。'};
const providerResult={content:[{type:'text',text:JSON.stringify({correctedText:result.transcript})}],finishReason:{unified:'stop',raw:'stop'},usage:{inputTokens:{total:3,noCache:3,cacheRead:0,cacheWrite:0},outputTokens:{total:4,text:4,reasoning:0}},warnings:[]};
function setup(){
 const plan={schemaVersion:1,transcript:'你好世界',sourceDigest:`sha256:${'a'.repeat(64)}`,templateVersion:'transcript.postprocess.inline/v1',templateDigest:`sha256:${'b'.repeat(64)}`,maxOutputTokens:512,identity:{schemaVersion:1,capability:'video.subtitles',apiFormat:'openai_chat',model:'fixture',baseUrlDigest:`sha256:${'c'.repeat(64)}`,customEndpoint:false},operationKey:'transcribe:one/postprocess:fixture'};
 fixture.generate.mockReset().mockResolvedValue(providerResult);fixture.modelFor.mockReset().mockReturnValue({specificationVersion:'v4',provider:'fixture',modelId:'fixture',supportedUrls:{},doGenerate:fixture.generate,doStream:vi.fn()});
 const replies:Record<string,unknown>={prepareTranscribePostprocess:{status:'prepared',plan,spec},reserveTranscribePostprocess:{callId:'one',status:'reserved'},startTranscribePostprocess:{callId:'one',status:'started'},settleTranscribePostprocess:{callId:'one',status:'settled'},saveTranscribePostprocess:result};
 const call=vi.fn(async(port:string,_raw:unknown,_signal?:AbortSignal):Promise<unknown>=>replies[port]);
 return {plan,replies,call,run:(signal=new AbortController().signal)=>runTranscribePostprocessInWorker('one',signal,call)};
}
it('经预留、开始、结算后只保存作品引用，返回后端权威结果',async()=>{
 const f=setup();expect(await f.run()).toEqual(result);
 expect(f.call.mock.calls.map(c=>c[0])).toEqual(['prepareTranscribePostprocess','reserveTranscribePostprocess','startTranscribePostprocess','settleTranscribePostprocess','saveTranscribePostprocess']);
 expect(f.call.mock.calls.at(-1)?.[1]).toEqual({awemeId:'one'});expect(f.call.mock.calls[3]?.[2]).toBeUndefined();expect(fixture.generate).toHaveBeenCalledTimes(1);
});
it('已保存后处理直接恢复，不创建模型',async()=>{const f=setup();f.replies.prepareTranscribePostprocess={status:'restored',result};expect(await f.run()).toEqual(result);expect(fixture.modelFor).not.toHaveBeenCalled();});
it('明确预算skip不调用供应商，保存端回读原文',async()=>{const f=setup(),skip={applied:false,transcript:'你好世界',reason:'预算不足'};f.replies.reserveTranscribePostprocess={status:'skipped',result:skip};f.replies.saveTranscribePostprocess=skip;expect(await f.run()).toEqual(skip);expect(fixture.generate).not.toHaveBeenCalled();expect(f.call.mock.calls.map(c=>c[0])).not.toContain('startTranscribePostprocess');});
it.each(['prepareTranscribePostprocess','reserveTranscribePostprocess','startTranscribePostprocess','settleTranscribePostprocess','saveTranscribePostprocess'])('%s 回执丢失不降级成成功',async port=>{const f=setup();f.call.mockImplementation(async p=>{if(p===port)throw Error('ACK lost');return f.replies[p];});await expect(f.run()).rejects.toMatchObject({outcome:'unknown_result'});if(port!=='saveTranscribePostprocess')expect(f.call.mock.calls.map(c=>c[0])).not.toContain('saveTranscribePostprocess');});
it.each(['startTranscribePostprocess','settleTranscribePostprocess'])('%s 错误调用号不能确认',async port=>{const f=setup();f.replies[port]={callId:'foreign',status:port.startsWith('start')?'started':'settled'};await expect(f.run()).rejects.toBeInstanceOf(GenerationFailure);expect(f.call.mock.calls.map(c=>c[0])).not.toContain('saveTranscribePostprocess');});
it('供应商已结算则回放正文，不再次调用供应商',async()=>{const f=setup();f.replies.reserveTranscribePostprocess={callId:'one',status:'settled',providerResult};expect(await f.run()).toEqual(result);expect(fixture.generate).not.toHaveBeenCalled();expect(f.call.mock.calls.map(c=>c[0])).toEqual(['prepareTranscribePostprocess','reserveTranscribePostprocess','saveTranscribePostprocess']);});
it('调用中取消仍结算已发生调用，但不保存最终结果',async()=>{const f=setup(),controller=new AbortController();fixture.generate.mockImplementation(async()=>{controller.abort();return providerResult;});await expect(f.run(controller.signal)).rejects.toMatchObject({name:'AbortError'});expect(f.call.mock.calls.map(c=>c[0])).toContain('settleTranscribePostprocess');expect(f.call.mock.calls.map(c=>c[0])).not.toContain('saveTranscribePostprocess');});
it('恢复到未知供应商调用不会再次开始或保存',async()=>{const f=setup();f.replies.reserveTranscribePostprocess={callId:'one',status:'unknown'};await expect(f.run()).rejects.toMatchObject({outcome:'unknown_result'});expect(fixture.generate).not.toHaveBeenCalled();expect(f.call.mock.calls.map(c=>c[0])).toEqual(['prepareTranscribePostprocess','reserveTranscribePostprocess']);});
it('准备响应返回时已取消，不创建模型',async()=>{const f=setup(),controller=new AbortController();f.call.mockImplementation(async port=>{controller.abort();return f.replies[port];});await expect(f.run(controller.signal)).rejects.toMatchObject({name:'AbortError'});expect(fixture.modelFor).not.toHaveBeenCalled();});
it('保存返回非法结果不能视为完成',async()=>{const f=setup();f.replies.saveTranscribePostprocess={applied:true,transcript:''};await expect(f.run()).rejects.toMatchObject({outcome:'unknown_result'});});
it('保真失败仍由后端保存回放原文，不采用Worker自报校正',async()=>{const f=setup();fixture.generate.mockResolvedValue({...providerResult,content:[{type:'text',text:JSON.stringify({correctedText:'这是完全改写后的新内容'})}]});const original={applied:false,transcript:'你好世界',reason:'保真失败'};f.replies.saveTranscribePostprocess=original;expect(await f.run()).toEqual(original);expect(f.call.mock.calls.at(-1)?.[1]).toEqual({awemeId:'one'});});

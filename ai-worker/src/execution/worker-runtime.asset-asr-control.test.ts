import {expect,it,vi} from 'vitest';
import {createExecutionWorker} from './worker-runtime';
import {AsrExecutionInterruption} from '../runtime/asr-request';
import type {WorkerMessage} from '@creatoros/contract/execution-worker';
const input={kind:'asset.asr',projectId:'p',contentOutputId:'o',source:{sourceId:'s',assetId:'a',assetFileId:'f',fileDigest:'a'.repeat(64),probeDigest:'b'.repeat(64),timebase:{num:1,den:1000},durationTicks:1000,hasAudio:true},language:'zh',timestampMode:'text',extractionProtocolVersion:'asset-original-audio.v1',configuration:{kind:'audio',provider:'fixture',model:'fixture',baseUrl:null}};
it('原ASR不确定控制错误须提交unknown_result，不能冒充可重试失败',async()=>{
 const messages:WorkerMessage[]=[],generate=vi.fn(),runAssetAsr=vi.fn(async()=>{throw new AsrExecutionInterruption();});
 const worker=createExecutionWorker({generate,runAssetAsr,send(message){messages.push(message);if(message.type==='call')queueMicrotask(()=>worker.receive({version:1,type:'reply',requestId:message.requestId,ok:true,data:message.port==='readTaskContext'?input:{}}));}});
 try{worker.receive({version:1,type:'run',requestId:'run-asr-control',execution:{executionTaskId:'exec-asr-control',attempt:1,fenceToken:'lease'},deadlineAt:Date.now()+60000});
 await vi.waitFor(()=>expect(messages.some(m=>m.type==='stopped')).toBe(true));
 expect(runAssetAsr).toHaveBeenCalledTimes(1);expect(generate).not.toHaveBeenCalled();
 expect(messages.find(m=>m.type==='call'&&m.port==='commitResult')).toMatchObject({data:{outcome:'unknown_result',errorCode:'ASR_RESULT_UNKNOWN'}});
 expect(messages.find(m=>m.type==='stopped')).toMatchObject({reason:'unknown_result'});
 expect(messages.filter(m=>m.type==='call').map(m=>m.port)).toEqual(['readTaskContext','commitResult']);
 }finally{worker.close();}
});

it.each([{label:'明确普通失败',error:new Error('机械测试失败'),outcome:'failed',code:'WORKER_EXECUTION_INTERRUPTED'},{label:'原GenerationFailure',error:Object.assign(new Error('占位'),{}),outcome:'waiting_user',code:'FIXTURE_BOUNDARY'}])('asset分支不改变其他错误分类：$label',async ({label,error,outcome,code})=>{
 const {GenerationFailure}=await import('./generation-error');if(label==='原GenerationFailure')error=new GenerationFailure('waiting_user',code);
 const messages:WorkerMessage[]=[],worker=createExecutionWorker({generate:vi.fn(),runAssetAsr:async()=>{throw error;},send(message){messages.push(message);if(message.type==='call')queueMicrotask(()=>worker.receive({version:1,type:'reply',requestId:message.requestId,ok:true,data:message.port==='readTaskContext'?input:{}}));}});
 try{worker.receive({version:1,type:'run',requestId:'run-other',execution:{executionTaskId:'exec-other',attempt:1,fenceToken:'lease'},deadlineAt:Date.now()+60000});await vi.waitFor(()=>expect(messages.some(m=>m.type==='stopped')).toBe(true));expect(messages.find(m=>m.type==='call'&&m.port==='commitResult')).toMatchObject({data:{outcome,errorCode:code}});}finally{worker.close();}
});
it('ASR原owner已完成时不再generic成功提交',async()=>{
 const messages:WorkerMessage[]=[],worker=createExecutionWorker({generate:vi.fn(),runAssetAsr:async()=>({status:'succeeded'} as never),send(message){messages.push(message);if(message.type==='call')queueMicrotask(()=>worker.receive({version:1,type:'reply',requestId:message.requestId,ok:true,data:message.port==='readTaskContext'?input:{}}));}});
 try{worker.receive({version:1,type:'run',requestId:'run-success',execution:{executionTaskId:'exec-success',attempt:1,fenceToken:'lease'},deadlineAt:Date.now()+60000});await vi.waitFor(()=>expect(messages.some(m=>m.type==='stopped')).toBe(true));expect(messages.filter(m=>m.type==='call').map(m=>m.port)).toEqual(['readTaskContext']);expect(messages.find(m=>m.type==='stopped')).toMatchObject({reason:'completed'});}finally{worker.close();}
});

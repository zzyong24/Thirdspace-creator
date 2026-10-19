import {afterEach,describe,expect,it,vi} from 'vitest';
import type {WorkerMessage} from '@creatoros/contract/execution-worker';
import {createExecutionWorker} from './worker-runtime';
import {runBoundAsrStageInWorker} from './bound-asr-stage-worker';
const execution={executionTaskId:'slow-asr',attempt:1,fenceToken:'fence'};
const input={kind:'transcribe.douyin',awemeIds:['video-1'],language:'zh',configuration:{kind:'audio',provider:'test',model:'test',baseUrl:null}};
afterEach(()=>vi.useRealTimers());
function slowPreparation(delayMs:number,deadlineAt:number|null){
 const messages:WorkerMessage[]=[];
 const worker=createExecutionWorker({generate:vi.fn(),runTranscribe:runBoundAsrStageInWorker,send(message){
  messages.push(message);if(message.type!=='call')return;
  const reply=()=>worker.receive({version:1,type:'reply',requestId:message.requestId,ok:true,data:message.port==='readTaskContext'?input:message.port==='prepareTranscribeItem'?{skippedReason:'IMAGE_ALBUM'}:message.port==='completeTranscribeTask'?{status:'succeeded'}:{ok:true}});
  if(message.port==='prepareTranscribeItem')setTimeout(reply,delayMs);else queueMicrotask(reply);
 }});
 worker.receive({version:1,type:'run',requestId:'run',execution,deadlineAt});return {worker,messages};
}
describe('原领取任务的慢素材准备公共调用链',()=>{
 it.each([31_000,125_000])('准备%s毫秒仍完成，不被普通宿主端口短限误杀',async delayMs=>{
  vi.useFakeTimers();const {worker,messages}=slowPreparation(delayMs,Date.now()+600_000);
  try{await vi.advanceTimersByTimeAsync(delayMs+1);expect(messages.find(m=>m.type==='stopped')).toMatchObject({reason:'completed'});expect(messages.filter(m=>m.type==='call'&&m.port==='prepareTranscribeItem')).toHaveLength(1);}finally{worker.close();}
 });
 it('continuous超过旧十分钟端口限仍受心跳监督并完成',async()=>{
  vi.useFakeTimers();const {worker,messages}=slowPreparation(601_000,null);
  try{await vi.advanceTimersByTimeAsync(601_001);expect(messages.find(m=>m.type==='stopped')).toMatchObject({reason:'completed'});expect(messages.some(m=>m.type==='call'&&m.port==='heartbeat')).toBe(true);}finally{worker.close();}
 });
 it('取消立即停止，不因两分钟下限拖延',async()=>{
  vi.useFakeTimers();const {worker,messages}=slowPreparation(125_000,null);
  try{await vi.advanceTimersByTimeAsync(1);worker.receive({version:1,type:'cancel',requestId:'cancel',execution});await vi.advanceTimersByTimeAsync(0);expect(messages.find(m=>m.type==='stopped')).toMatchObject({reason:'cancelled'});}finally{worker.close();}
 });
 it('原截止期限到期立即停止，不重新给两分钟',async()=>{
  vi.useFakeTimers();const {worker,messages}=slowPreparation(125_000,Date.now()+1000);
  try{await vi.advanceTimersByTimeAsync(1001);expect(messages.find(m=>m.type==='stopped')).toMatchObject({reason:'cancelled'});expect(messages.some(m=>m.type==='call'&&m.port==='completeTranscribeTask')).toBe(false);}finally{worker.close();}
 });
});

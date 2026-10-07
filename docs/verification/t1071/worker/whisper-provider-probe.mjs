import {createRequire} from 'node:module';
import {Worker} from 'node:worker_threads';
import {createWorkerPipelineProvider} from '../../../../ai-worker/src/runtime/multimodal-whisper-local.ts';
globalThis.require=createRequire(import.meta.url);
const workers=[];let terminateCalls=0;
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function completeTask(){
 const signal=new AbortController();
 const provider=createWorkerPipelineProvider(()=>{
  const worker=new Worker(`const {parentPort}=require('node:worker_threads');parentPort.on('message',message=>parentPort.postMessage({id:message.id,ok:true,text:'synthetic transcript'}));`,{eval:true});
  const terminate=worker.terminate.bind(worker);worker.terminate=()=>{terminateCalls++;return terminate();};workers.push(new WeakRef(worker));return worker;
 });
 const pipeline=await provider('synthetic-only');
 const result=await pipeline(new Float32Array(1),{},signal.signal);
 signal.abort();
 return {result:result.text,signalAborted:signal.signal.aborted};
}
try{
 for(let task=1;task<=3;task++){
  const result=await completeTask();
  await delay(40);global.gc();await delay(40);global.gc();await delay(40);
  console.log(JSON.stringify({completedTask:task,...result,harnessReferences:'WeakRef only; provider/pipeline/signal left function scope',spawnedThreads:workers.length,liveThreads:workers.filter(reference=>{const worker=reference.deref();return worker&&worker.threadId!==-1;}).length,terminateCallsBeforeHarnessCleanup:terminateCalls}));
 }
}finally{await Promise.all(workers.map(reference=>reference.deref()?.terminate()));}
console.log(JSON.stringify({afterHarnessCleanup:workers.filter(reference=>{const worker=reference.deref();return worker&&worker.threadId!==-1;}).length}));

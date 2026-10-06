import { fork } from 'node:child_process';
import { executionTimeoutMs } from '../../frontend/scripts/desktop/timeout-policy.mjs';

async function within(promise, milliseconds, timers) {
  let timer;
  try { return await Promise.race([promise,new Promise(resolve=>{timer=timers.setTimeout(()=>resolve(null),milliseconds);})]); }
  finally { timers.clearTimeout(timer); }
}

// 使用宿主相同的空 execArgv；要求真实握手与正常退出，两端等待均有上限。
export async function smokeWorker({entry,execPath=process.execPath,cwd,env,readyTimeoutMs=120_000,stopTimeoutMs=120_000,timers=globalThis}) {
  readyTimeoutMs=executionTimeoutMs(readyTimeoutMs);
  stopTimeoutMs=executionTimeoutMs(stopTimeoutMs);
  const child=fork(entry,[],{execPath,execArgv:[],cwd,env,stdio:['ignore','ignore','pipe','ipc']});
  let stderr='';
  child.stderr.on('data',chunk=>{stderr=(stderr+chunk).slice(-4000);});
  const closed=new Promise(resolve=>{
    child.once('exit',(code,signal)=>resolve({code,signal}));
    child.once('close',(code,signal)=>resolve({code,signal}));
    child.once('error',error=>resolve({error}));
  });
  let failure;
  try {
    const ready=await within(new Promise((resolve,reject)=>{
      child.once('message',message=>message?.type==='ready' ? resolve(true) : reject(new Error('Worker非法握手')));
      child.once('error',reject);
      child.once('exit',(code,signal)=>reject(new Error(`Worker提前退出 ${code}/${signal}: ${stderr}`)));
    }),readyTimeoutMs,timers);
    if(!ready) throw new Error('Worker未就绪');
  } catch(error) { failure=error; }
  if(child.connected) child.disconnect();
  const stopped=await within(closed,stopTimeoutMs,timers);
  if(!stopped) {
    child.kill('SIGKILL');
    await within(closed,stopTimeoutMs,timers);
    failure ??= new Error('Worker IPC断开后未正常退出');
  } else if(stopped.error || stopped.code!==0 || stopped.signal) {
    failure ??= stopped.error ?? new Error(`Worker异常退出 ${stopped.code}/${stopped.signal}: ${stderr}`);
  }
  if(failure) throw failure;
}

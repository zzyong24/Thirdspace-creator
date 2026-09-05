import { EventEmitter } from "node:events";
import { expect,it,vi } from "vitest";
const fixture=vi.hoisted(()=>({child:null as unknown,killTree:vi.fn()}));
vi.mock("node:child_process",async importOriginal=>({...await importOriginal<typeof import("node:child_process")>(),fork:()=>fixture.child}));
vi.mock("./worker-process-tree",()=>({killWorkerProcessTree:fixture.killTree}));
import { createWorkerSupervisor } from "./worker-supervisor";
it("SIGTERM已发出但子进程尚未退出时，迟到校验不能投递新run",async()=>{
  const sent:unknown[]=[];const signals:unknown[]=[];
  const child=Object.assign(new EventEmitter(),{connected:true,send(message:unknown,callback?:(error?:Error)=>void){sent.push(message);callback?.();},kill(signal:unknown){signals.push(signal);return true;}});
  fixture.child=child;
  let entered!:()=>void;let release!:()=>void;
  const validating=new Promise<void>(r=>{entered=r;});const validation=new Promise<void>(r=>{release=r;});
  const supervisor=createWorkerSupervisor({entryPath:"fixture.cjs",ports:{async validate(){entered();await validation;},async invoke(){return {};}}});
  const execution={executionTaskId:"task",attempt:1,fenceToken:"fence"};
  const running=supervisor.run(execution,Date.now()+10000).catch(error=>error as Error);
  child.emit("message",{version:1,type:"ready",requestId:"ready",capabilities:["model.generate"]});
  await validating;
  const stopped=supervisor.stop();expect(signals).toContain("SIGTERM");release();
  try{
    expect(await running).toMatchObject({message:"WORKER_STOPPED"});
    expect(sent).toEqual([]);
  }finally{child.connected=false;child.emit("exit",0);await stopped;}
});
it.each(["cancel","startup","stop"])("%s强杀捕获实际Worker并等待清理，迟到计时器不杀下一Worker",async mode=>{
  vi.useFakeTimers();fixture.killTree.mockReset();
  const makeChild=()=>Object.assign(new EventEmitter(),{connected:true,send(_message:unknown,callback?:(error?:Error)=>void){callback?.();},kill:vi.fn(()=>true)});
  const first=makeChild();fixture.child=first;
  let finish!:()=>void;const cleanup=new Promise<void>(resolve=>{finish=resolve;});fixture.killTree.mockReturnValue(cleanup);
  const supervisor=createWorkerSupervisor({entryPath:"fixture",shutdownGraceMs:10,startupTimeoutMs:10,ports:{async validate(){},async invoke(){return {};}}});
  const execution={executionTaskId:"task",attempt:1,fenceToken:"fence"};
  try{
    const started=supervisor.start().catch(error=>error);
    if(mode!=="startup")first.emit("message",{version:1,type:"ready",requestId:"ready",capabilities:[]});
    if(mode!=="startup")await started;
    let stop:Promise<void>|undefined;let run:Promise<unknown>|undefined;let stopped=false;
    if(mode==="cancel"){
      run=supervisor.run(execution,Date.now()+1000).catch(error=>error);
      await vi.advanceTimersByTimeAsync(0);supervisor.cancel(execution);
    }
    if(mode==="stop")stop=supervisor.stop().then(()=>{stopped=true;});
    await vi.advanceTimersByTimeAsync(10);
    expect(fixture.killTree).toHaveBeenCalledExactlyOnceWith(first);
    first.connected=false;first.emit("exit",null,"SIGKILL");
    if(mode!=="stop")stop=supervisor.stop().then(()=>{stopped=true;});
    await vi.advanceTimersByTimeAsync(0);expect(stopped).toBe(false);
    finish();await stop;await started;await run;
    const second=makeChild();fixture.child=second;
    const next=supervisor.start();second.emit("message",{version:1,type:"ready",requestId:"second",capabilities:[]});await next;
    await vi.advanceTimersByTimeAsync(1000);expect(fixture.killTree).toHaveBeenCalledTimes(1);
    const finalStop=supervisor.stop();second.emit("exit",0);await finalStop;
  }finally{finish();vi.useRealTimers();}
});
it("进程树清理失败必须拒绝stop及下一Worker启动",async()=>{
  vi.useFakeTimers();fixture.killTree.mockReset();fixture.killTree.mockRejectedValue(new Error("WORKER_TREE_NOT_STABLE"));
  const child=Object.assign(new EventEmitter(),{connected:true,kill:vi.fn(()=>true)});fixture.child=child;
  const supervisor=createWorkerSupervisor({entryPath:"fixture",shutdownGraceMs:10,ports:{async validate(){},async invoke(){}}});
  const started=supervisor.start();child.emit("message",{version:1,type:"ready",requestId:"ready",capabilities:[]});await started;
  try{
    const stopped=supervisor.stop();const rejected=expect(stopped).rejects.toThrow("NOT_STABLE");
    await vi.advanceTimersByTimeAsync(10);await rejected;
    await expect(supervisor.start()).rejects.toThrow("NOT_STABLE");
  }finally{child.emit("exit",0);vi.useRealTimers();}
});

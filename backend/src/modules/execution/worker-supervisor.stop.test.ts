import { EventEmitter } from "node:events";
import { expect,it,vi } from "vitest";
const fixture=vi.hoisted(()=>({child:null as unknown}));
vi.mock("node:child_process",()=>({fork:()=>fixture.child}));
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

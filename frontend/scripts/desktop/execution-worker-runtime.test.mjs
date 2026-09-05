import { mkdtempSync,rmSync } from "node:fs";
import { join,resolve } from "node:path";
import { tmpdir } from "node:os";
import { fork } from "node:child_process";
import { describe,it,expect } from "vitest";
import { stageExecutionWorkerRuntime,assertExecutionWorkerRuntime } from "./execution-worker-runtime.mjs";
describe("随包Worker独立闭包",()=>{
  it("复制到隔离运行目录后可启动并报告结构化能力",async()=>{
    const root=mkdtempSync(join(tmpdir(),"worker-runtime-"));let child;
    try{
      expect(()=>assertExecutionWorkerRuntime(root)).toThrow();
      const entry=stageExecutionWorkerRuntime({repoRoot:resolve(".."),runtimeRoot:root});
      child=fork(entry,[],{cwd:root,execArgv:[],stdio:["ignore","ignore","ignore","ipc"],env:{PATH:process.env.PATH}});
      const message=await new Promise((ok,bad)=>{const timer=setTimeout(()=>bad(new Error("WORKER_START_TIMEOUT")),10000);child.once("message",value=>{clearTimeout(timer);ok(value);});child.once("error",bad);child.once("exit",()=>{clearTimeout(timer);bad(new Error("WORKER_EARLY_EXIT"));});});
      expect(message).toMatchObject({type:"ready",capabilities:["model.generate","model.structured"]});
    }finally{if(child && child.exitCode===null){const exit=new Promise(r=>child.once("exit",r));child.kill("SIGTERM");await exit;}rmSync(root,{recursive:true,force:true});}
  },15000);
});

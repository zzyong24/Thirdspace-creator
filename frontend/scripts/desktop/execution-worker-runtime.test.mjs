import { mkdtempSync,rmSync,mkdirSync,writeFileSync,readFileSync,copyFileSync } from "node:fs";
import { join,resolve } from "node:path";
import { tmpdir } from "node:os";
import { fork } from "node:child_process";
import { describe,it,expect } from "vitest";
import { stageMissingDependencies } from "../../../tools/windows-closure-rat/stage-layered-workers.mjs";
import { stageExecutionWorkerRuntime,assertExecutionWorkerRuntime,assertWorkerExternalPackages,workerExternalPackages } from "./execution-worker-runtime.mjs";
describe("随包Worker入口资源",()=>{
  it("复制固定 Worker 与 ACP 入口并保留旧返回路径，普通Worker仍可独立启动",async()=>{
    const root=mkdtempSync(join(tmpdir(),"worker-runtime-"));let child;let errors="";
    try{
      expect(()=>assertExecutionWorkerRuntime(root)).toThrow();
      const entry=stageExecutionWorkerRuntime({repoRoot:resolve(".."),runtimeRoot:root});
      expect(entry).toBe(join(root,"frontend/runtime/execution-worker.cjs"));
      for(const filename of ["execution-worker.cjs","agentic-worker.cjs","codex-acp.cjs","codex-status-worker.cjs"])expect(readFileSync(join(root,"frontend/runtime",filename))).toEqual(readFileSync(resolve("../ai-worker/dist",filename)));
      // Worker研究工具有顶层Playwright导入，隔离启动fixture需装配真实声明依赖。
      stageMissingDependencies({from:resolve("../ai-worker"),vendorRoot:join(root,"frontend/node_modules"),packages:["@playwright/test","@openclaw/fs-safe"]});
      child=fork(entry,[],{cwd:root,execArgv:[],stdio:["ignore","ignore","pipe","ipc"],env:{PATH:process.env.PATH}});
      child.stderr.on("data",chunk=>{errors+=String(chunk);});
      const message=await new Promise((ok,bad)=>{const timer=setTimeout(()=>bad(new Error("WORKER_START_TIMEOUT")),10000);child.once("message",value=>{clearTimeout(timer);ok(value);});child.once("error",bad);child.once("exit",()=>{clearTimeout(timer);bad(new Error("WORKER_EARLY_EXIT: "+errors.slice(-4096)));});});
      expect(message).toMatchObject({type:"ready",capabilities:expect.arrayContaining(["model.generate","model.structured"])});
    }finally{if(child && child.exitCode===null){const exit=new Promise(r=>child.once("exit",r));child.kill("SIGTERM");await exit;}rmSync(root,{recursive:true,force:true});}
  },30000);
  it("分层包使用真实解析器验证依赖，删除依赖后必须失败",()=>{
    const root=mkdtempSync(join(tmpdir(),"layered-worker-"));
    try {
      mkdirSync(join(root,"frontend/runtime"),{recursive:true});
      if(process.platform==="win32"){mkdirSync(join(root,"cli"),{recursive:true});copyFileSync(process.execPath,join(root,"cli/node.exe"));}
      copyFileSync(resolve("../tools/windows-closure-rat/creatoros-module-resolver.cjs"),join(root,"frontend/creatoros-module-resolver.cjs"));
      for(const request of workerExternalPackages){const name=request.replace(/\/package\.json$/,"");const dir=join(root,"frontend/.next/vendor",name);mkdirSync(dir,{recursive:true});writeFileSync(join(dir,"package.json"),JSON.stringify({name,main:"index.js"}));writeFileSync(join(dir,"index.js"),"module.exports={}");}
      expect(()=>assertWorkerExternalPackages(root)).not.toThrow();
      rmSync(join(root,"frontend/.next/vendor/mammoth"),{recursive:true});
      expect(()=>assertWorkerExternalPackages(root)).toThrow("分层依赖验证失败");
    } finally {rmSync(root,{recursive:true,force:true});}
  });
  it.each(["execution-worker.cjs","agentic-worker.cjs","codex-acp.cjs","codex-status-worker.cjs"])("缺少 %s 时不能通过资源完整性检查",filename=>{
    const root=mkdtempSync(join(tmpdir(),"worker-incomplete-"));
    try{mkdirSync(join(root,"frontend/runtime"),{recursive:true});for(const other of ["codex-acp.cjs","codex-status-worker.cjs","execution-worker.cjs","agentic-worker.cjs","intelligence-generation-worker.cjs","intelligence-transcript-worker.cjs","embedding-worker.cjs","flywheel-generation-worker.cjs","model-probe-worker.cjs"])if(other!==filename)writeFileSync(join(root,"frontend/runtime",other),"fixture");expect(()=>assertExecutionWorkerRuntime(root)).toThrow(filename);}finally{rmSync(root,{recursive:true,force:true});}
  });
});

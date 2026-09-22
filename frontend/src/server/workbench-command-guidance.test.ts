// @vitest-environment node
import {execFile} from "node:child_process";
import {mkdtemp,rm,writeFile} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {promisify} from "node:util";
import {expect,it,vi} from "vitest";
import type {Db} from "@creatoros/backend";
import type {WorkbenchHostCall,WorkbenchResult} from "@creatoros/contract/agent-workbench";
import {workbenchToolOutcome} from "@creatoros/contract/execution-worker";
import {runDurableAgenticTool} from "../../../ai-worker/src/execution/durable-agentic-tool";
import {createNativeFilesWorkbenchHost,nativeCommandCapabilities} from "./workbench-native-host";
import {NativeFileError,type NativeCommandAction} from "./workbench-native-client";

const options={platform:"darwin" as const,desktop:true,socketPath:"/tmp/isolated-command-guidance.sock"};
const control={signal:new AbortController().signal,onProgress:()=>{}};
const descriptor=nativeCommandCapabilities.find(item=>item.name==="execution.run")!;
const input={cwd:".",argv:["verify-report.js"],runtimeId:"bundled-node",timeoutMs:30000};
const call=(name:string,value:Record<string,unknown>):WorkbenchHostCall=>({
 context:{userId:"fixture",accountId:"fixture",taskId:"fixture",attempt:1,fenceToken:"fence",leaseId:"lease",operationId:"op"},
 invocation:{name,schemaVersion:1,input:value},
});
function metadata(result:WorkbenchResult):Record<string,unknown>{
 if(result.status!=="succeeded")throw Error(JSON.stringify(result));
 const text=result.content.find(part=>part.type==="text");
 if(!text||text.type!=="text")throw Error("missing metadata");
 return JSON.parse(text.text);
}
function expectGuide(text:unknown){
 expect(text).toEqual(expect.stringContaining("cwd"));
 expect(text).toEqual(expect.stringContaining("相对路径"));
 expect(text).toEqual(expect.stringContaining('"."'));
 expect(text).toEqual(expect.stringContaining("bundled-node"));
 expect(text).toEqual(expect.stringContaining('["verify-report.js"]'));
 expect(text).toEqual(expect.stringContaining('["-e",'));
 expect(text).toEqual(expect.stringContaining("不需要"));
 expect(text).toEqual(expect.stringContaining("node"));
}

it.each(["/","/Users/fixture/private-task","../other"])("真实同形 cwd=%s 的未派发拒绝，经工具投影给模型具体纠错",async cwd=>{
 const commandPort=vi.fn(async()=>{throw Error("无效输入不得派发");});
 const host=createNativeFilesWorkbenchHost({} as Db,{...options,commandPort})!;
 const result=await host.dispatch(call("execution.run",{...input,cwd,argv:["node"],stdinRef:"verify-report.js"}),control);
 expect(result).toMatchObject({status:"failed",error:{code:"invalid_input",dispatched:false,nextAction:"fix_input"}});
 const outcome=workbenchToolOutcome(result,descriptor);
 expect(outcome).toMatchObject({status:"error",sideEffect:"none",error:{code:"invalid_input"}});
 expectGuide(outcome.error?.recovery);
 expect(outcome.error?.recovery).not.toContain("private-task");
 expect(commandPort).not.toHaveBeenCalled();
});

it("新 run 保留原生状态与输出并指导 argv；真实同名 node 文件合法执行，不改 argv",async()=>{
 const root=await mkdtemp(join(tmpdir(),"t1026-command-guidance-"));
 await writeFile(join(root,"verify-report.js"),'console.log("verified");');
 await writeFile(join(root,"node"),'console.log("legal-node-file:"+process.argv.slice(2).join(","));');
 const rawResults:Record<string,unknown>[]=[];
 const commandPort=vi.fn(async(_ref:unknown,operationId:string,action:NativeCommandAction)=>{
  if(action.kind!=="command_run")throw Error("unexpected action");
  const {stdout,stderr}=await promisify(execFile)(process.execPath,action.argv,{cwd:root,timeout:5000});
  const value={operationId,state:"succeeded",exitCode:0,stdoutPreview:stdout,stderrPreview:stderr,truncated:false};
  rawResults.push(value);return value;
 });
 const host=createNativeFilesWorkbenchHost({} as Db,{...options,commandPort})!;
 try{
  for(const argv of [["verify-report.js"],["-e","console.log(42)"],["node"],["node","verify-report.js"]]){
   const result=await host.dispatch(call("execution.run",{...input,argv}),control);
   const value=metadata(result),{guidance,...original}=value;
   expect(original).toEqual(rawResults.at(-1));expectGuide(guidance);
   expect(commandPort.mock.calls.at(-1)?.[2]).toMatchObject({argv,cwd:".",runtimeId:"bundled-node"});
   expect(workbenchToolOutcome(result,descriptor).summary).toContain("guidance");
  }
  expect(rawResults[2]?.stdoutPreview).toBe("legal-node-file:\n");
  expect(rawResults[3]?.stdoutPreview).toBe("legal-node-file:verify-report.js\n");
 }finally{await rm(root,{recursive:true,force:true});}
});

it("已派发未知结果仍须对账；普通状态与非输入错误不误报 invalid_input",async()=>{
 for(const error of [new NativeFileError("NATIVE_RESULT_UNKNOWN",true),new NativeFileError("COMMAND_UNAVAILABLE",false)]){
  const host=createNativeFilesWorkbenchHost({} as Db,{...options,commandPort:async()=>{throw error;}})!;
  const result=await host.dispatch(call("execution.run",input),control);
  if(error.dispatched)expect(result).toMatchObject({status:"unknown",error:{dispatched:true,nextAction:"reconcile"}});
  else expect(result).toMatchObject({status:"failed",error:{code:"command_unavailable"}});
  expect(JSON.stringify(result)).not.toContain("guidance");expect(JSON.stringify(result)).not.toContain("invalid_input");
 }
 const raw={state:"failed",exitCode:1,stderrPreview:"Node supplied real error"};
 const host=createNativeFilesWorkbenchHost({} as Db,{...options,commandPort:async()=>raw})!;
 expect(metadata(await host.dispatch(call("execution.status",{targetOperationId:"old-op"}),control))).toEqual(raw);
 const value=metadata(await host.dispatch(call("execution.run",input),control));
 expect(value).toMatchObject(raw);expectGuide(value.guidance);
});

it("历史 settled 回执原样重放；不新增提示、不重执行，catalog/schemaVersion保持",async()=>{
 const output={status:"ok" as const,summary:'{"state":"running","exitCode":null}',evidence:[],data:{state:"running",exitCode:null},error:null,continuation:null,sideEffect:"committed" as const};
 const original=JSON.stringify(output),execute=vi.fn(async()=>{throw Error("不得重新执行历史命令");});
 const result=await runDurableAgenticTool({modelCallId:"old-model",toolCallId:"old-provider"},{signal:control.signal,execute,
  call:async()=>({callId:"old-call",status:"settled",toolName:"execution_run",input,receipt:{schemaVersion:1,kind:"tool",toolCallId:"old-provider",toolName:"execution_run",output}})});
 expect(JSON.stringify(result)).toBe(original);expect(execute).not.toHaveBeenCalled();
 expect(descriptor).toMatchObject({schemaVersion:1,description:"在当前任务目录以已打包运行时和受限环境启动命令，返回原操作 ID 与输出引用。",resultSchema:{type:"object"}});
});

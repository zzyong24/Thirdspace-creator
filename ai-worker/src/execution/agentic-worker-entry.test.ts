import {fork,type ChildProcess} from "node:child_process";
import {createServer} from "node:http";
import {mkdtemp,rm} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join,resolve} from "node:path";
import {fileURLToPath} from "node:url";
import {build} from "esbuild";
import {beforeAll,afterAll,describe,it,expect,vi} from "vitest";
import type {WorkerMessage,WorkerProviderReceipt} from "@creatoros/contract/execution-worker";
let directory:string;let entry:string;
beforeAll(async()=>{
  directory=await mkdtemp(resolve("node_modules/.agentic-worker-fork-"));entry=join(directory,"worker.cjs");
  await build({entryPoints:[fileURLToPath(new URL("./agentic-worker-entry.ts",import.meta.url))],outfile:entry,bundle:true,platform:"node",target:"node24",format:"cjs",external:["@playwright/test","jsdom","@mozilla/readability"],logLevel:"silent"});
});
afterAll(async()=>{await rm(directory,{recursive:true,force:true});});
const execution={executionTaskId:"agent-task",attempt:1,fenceToken:"fence"};
const task={kind:"agentic.run",operationKey:"agent",taskType:"agentic.material",goal:"查素材并总结",systemPrompt:"使用material.search后总结",capability:"research",maxOutputTokens:200,dryRun:false,tools:[{name:"material.search",version:"1",label:"搜索素材",description:"查询素材",effect:"none",parameters:{type:"object",properties:{query:{type:"string"}},required:["query"],additionalProperties:false}}]};
function host(baseUrl:string,cwd=resolve('.')){
  const child=fork(entry,[],{cwd,stdio:["ignore","pipe","pipe","ipc"],execArgv:[]});
  const messages:WorkerMessage[]=[];let stderr="";child.stderr!.on("data",chunk=>{stderr+=chunk;});
  type Row={callId:string;kind:"model"|"tool";status:string;providerResult?:WorkerProviderReceipt;receipt?:unknown};
  const rows:Row[]=[];let revision=0;let checkpoint:Array<{role:string;callId:string}>=[];let tools=0;
  const exited=new Promise<{code:number|null;signal:NodeJS.Signals|null}>(resolve=>child.once("exit",(code,signal)=>resolve({code,signal})));
  child.on("message",(raw)=>{
    const message=raw as WorkerMessage;messages.push(message);if(message.type!=="call")return;
    const data=message.data as Record<string,any>;let reply:unknown={};
    if(message.port==="readTaskContext")reply=task;
    else if(message.port==="resolveModelCredential")reply={apiFormat:"openai_chat",baseUrl,model:"test",token:"fixture",authStyle:"bearer"};
    else if(message.port==="readCheckpoint")reply={revision,ledgerSequence:rows.length,messages:checkpoint,uncheckpointedReceipts:rows.filter(r=>r.status==="settled" && !checkpoint.some(m=>m.callId===r.callId)).map(r=>({callId:r.callId,kind:r.kind,sequence:rows.indexOf(r)+1})),recovery:"ready",budget:{maxCalls:10,maxTokens:5000}};
    else if(message.port==="saveCheckpoint"){expect(data.expectedRevision).toBe(revision);checkpoint=data.messages;reply={revision:++revision};}
    else if(message.port==="reserveAgenticModel"){const row={callId:`c${rows.length+1}`,kind:"model" as const,status:"reserved"};rows.push(row);reply={callId:row.callId,status:row.status};}
    else if(message.port==="reserveAgenticTool"){const row={callId:`c${rows.length+1}`,kind:"tool" as const,status:"reserved"};rows.push(row);reply={callId:row.callId,status:row.status,toolName:"material.search",input:{query:"素材"}};}
    else if(message.port==="commitAgenticResult")reply={resultId:"agent-result",aiTaskId:"agent-task"};
    else if(message.port==="executeAgenticTool"){tools++;reply={status:"ok",summary:"素材查询完成",evidence:[{entityId:"fixture-asset",text:"素材说明"}],data:{text:"素材说明"},error:null,continuation:null,sideEffect:"none"};}
    else if(["startCall","startAgenticTool","settleGenerationCall","settleAgenticTool"].includes(message.port)){
      const row=rows.find(r=>r.callId===data.callId)!;row.status=message.port.startsWith("start")?"started":data.status;row.providerResult=data.providerResult;row.receipt=data.output;reply={callId:row.callId,status:row.status};
    }
    if(child.connected)child.send({version:1,type:"reply",requestId:message.requestId,ok:true,data:reply});
  });
  return {child,messages,rows,exited,get stderr(){return stderr;},get tools(){return tools;},get checkpoint(){return checkpoint;},
    run(){child.send({version:1,type:"run",requestId:"run",execution,deadlineAt:Date.now()+30000});}};
}
async function stop(child:ChildProcess){if(child.exitCode===null && child.signalCode===null){const exited=new Promise<void>(r=>child.once("exit",()=>r()));child.kill("SIGTERM");await exited;}}
describe("独立Agent Worker实际能力与子进程循环",()=>{
  it("真实fork仅声明Agent能力，子进程完成两轮模型与一个工具",async()=>{
    let requests=0;
    const server=createServer((req,res)=>{req.resume();requests++;res.writeHead(200,{"content-type":"text/event-stream"});
      const delta=requests===1?{role:"assistant",tool_calls:[{index:0,id:"t1",type:"function",function:{name:"material.search",arguments:'{"query":"素材"}'}}]}:{role:"assistant",content:"研究完成"};
      const base={id:`m${requests}`,object:"chat.completion.chunk",created:1,model:"test"};
      res.end(`data: ${JSON.stringify({...base,choices:[{index:0,delta,finish_reason:null}]})}\n\ndata: ${JSON.stringify({...base,choices:[{index:0,delta:{},finish_reason:requests===1?"tool_calls":"stop"}],usage:{prompt_tokens:3,completion_tokens:4,total_tokens:7}})}\n\ndata: [DONE]\n\n`);
    });
    await new Promise<void>(r=>server.listen(0,"127.0.0.1",r));const f=host(`http://127.0.0.1:${(server.address() as {port:number}).port}/v1`);
    try{
      await vi.waitFor(()=>expect(f.messages.find(m=>m.type==="ready")).toMatchObject({capabilities:["agentic.run"]}),{timeout:10000});expect(f.child.pid).not.toBe(process.pid);f.run();
      await vi.waitFor(()=>expect(f.messages.some(m=>m.type==="stopped")).toBe(true),{timeout:10000});expect(f.messages.find(m=>m.type==="stopped")).toMatchObject({reason:"completed"});
      expect(requests).toBe(2);expect(f.tools).toBe(1);expect(f.rows.map(r=>r.kind)).toEqual(["model","tool","model"]);expect(f.checkpoint.map(m=>m.role)).toEqual(["assistant","tool","assistant"]);
      expect(f.messages.find(m=>m.type==="call" && m.port==="commitAgenticResult")).toMatchObject({data:{actualEngine:"pi",lastModelCallId:"c3",toolCallIds:["c2"]}});
    }finally{await stop(f.child);await new Promise<void>(r=>server.close(()=>r()));}
  },20000);
  it.each(["cancel","stop"] as const)("%s断开正在等待的真实HTTP流",async(mode)=>{
    let connected=false;let disconnected=false;
    const server=createServer((req,res)=>{req.resume();connected=true;res.writeHead(200,{"content-type":"text/event-stream"});res.flushHeaders();res.on("close",()=>{disconnected=true;});});
    await new Promise<void>(r=>server.listen(0,"127.0.0.1",r));const f=host(`http://127.0.0.1:${(server.address() as {port:number}).port}/v1`);
    try{
      await vi.waitFor(()=>expect(f.messages.some(m=>m.type==="ready")).toBe(true),{timeout:10000});f.run();await vi.waitFor(()=>expect(connected).toBe(true),{timeout:10000});
      if(mode==="stop")await stop(f.child);else {f.child.send({version:1,type:"cancel",requestId:"cancel",execution,reason:"cancel"});await vi.waitFor(()=>expect(f.messages.find(m=>m.type==="stopped")).toMatchObject({reason:"cancelled"}));}
      await vi.waitFor(()=>expect(disconnected).toBe(true));if(mode==="cancel")expect(f.rows[0]?.status).toBe("unknown");expect(f.messages.some(m=>m.type==="call" && m.port==="commitAgenticResult")).toBe(false);
    }finally{await stop(f.child);server.closeAllConnections();await new Promise<void>(r=>server.close(()=>r()));}
  },20000);
  it("没有Pi依赖的cwd不发假ready，退出带稳定诊断",async()=>{
    const empty=await mkdtemp(join(tmpdir(),"without-pi-"));const f=host("http://127.0.0.1",empty);
    try{expect(await f.exited).toEqual({code:78,signal:null});expect(f.messages.some(m=>m.type==="ready")).toBe(false);expect(f.stderr).toContain("PI_RUNTIME_UNAVAILABLE");}finally{await stop(f.child);await rm(empty,{recursive:true,force:true});}
  },10000);
});

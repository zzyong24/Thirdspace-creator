import {describe,expect,it,vi} from "vitest";
import {spawn} from "node:child_process";
import {createHash,randomUUID} from "node:crypto";
import {mkdtemp,readFile,rm,writeFile} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join,resolve} from "node:path";
import {createDb,type Db} from "@creatoros/backend";
import {createPersistentTaskService} from "@creatoros/backend/modules/execution";
import type {WorkbenchHostCall} from "@creatoros/contract/agent-workbench";
import {NativeFileError,type NativeCommandAction} from "./workbench-native-client";
import {createNativeFilesWorkbenchHost,nativeFileCapabilities} from "./workbench-native-host";

vi.mock("server-only",()=>({}));

const db={} as Db;
const options={platform:"darwin" as const,desktop:true,socketPath:"/tmp/test-workbench.sock"};
const call=(name:string,input:Record<string,unknown>):WorkbenchHostCall=>({
  context:{userId:"u",accountId:"a",taskId:"task",attempt:2,fenceToken:"fence",leaseId:"lease",operationId:"op"},
  invocation:{name,schemaVersion:1,input},
});
const control={signal:new AbortController().signal,onProgress:()=>{}};

describe("桌面任务文件宿主",()=>{
  it("没有私有 Mac 桌面通道时目录不向模型开放，读写副作用分别冻结",()=>{
    expect(createNativeFilesWorkbenchHost(db,{...options,socketPath:""})).toBeUndefined();
    expect(createNativeFilesWorkbenchHost(db,{...options,platform:"win32"})).toBeUndefined();
    expect(nativeFileCapabilities.find(item=>item.name==="files.read")?.effects).toEqual(["read"]);
    expect(nativeFileCapabilities.find(item=>item.name==="files.write")?.effects).toEqual(["task_write"]);
  });

  it("只把宿主上下文中的 task/fence 与经过验证的相对路径交给原生端口",async()=>{
    const filePort=vi.fn(async()=>({version:3}));
    const host=createNativeFilesWorkbenchHost(db,{...options,filePort})!;
    const output=await host.dispatch(call("files.edit",{path:"草稿/报告.html",content:"你好",expectedVersion:2}),control);
    expect(filePort).toHaveBeenCalledWith({executionTaskId:"task",attempt:2,fenceToken:"fence"},"op",
      {kind:"write",path:"草稿/报告.html",contentBase64:Buffer.from("你好").toString("base64"),expectedVersion:2});
    expect(output).toMatchObject({status:"succeeded",operationId:"op",content:[{type:"text",text:'{"version":3}'}]});
    const invalid=await host.dispatch(call("files.write",{path:"../other",content:"x"}),control);
    expect(invalid).toMatchObject({status:"failed",error:{code:"invalid_input",dispatched:false,nextAction:"fix_input"}});
    expect(filePort).toHaveBeenCalledTimes(1);
  });

  it("回读文本与冲突版本有确定结果，未知写入保留原 operationId 等待对账",async()=>{
    const filePort=vi.fn(async (_ref,_id,action)=>{
      if(action.kind==="read")return {contentBase64:Buffer.from("事实=0").toString("base64"),total:8,version:1};
      throw new NativeFileError("VERSION_CONFLICT",true,4);
    });
    const host=createNativeFilesWorkbenchHost(db,{...options,filePort})!;
    const read=await host.dispatch(call("files.read",{path:"事实.csv",offset:0,limit:100}),control);
    expect(read).toMatchObject({status:"succeeded",content:[{type:"text"}]});
    expect((read as {content:Array<{text:string}>}).content[0]!.text).toContain("事实=0");
    const conflict=await host.dispatch(call("files.edit",{path:"事实.csv",content:"新值",expectedVersion:1}),control);
    expect(conflict).toMatchObject({status:"failed",operationId:"op",error:{code:"version_conflict:4",dispatched:false,nextAction:"fix_input"}});
    const uncertain=createNativeFilesWorkbenchHost(db,{...options,filePort:async()=>{throw new NativeFileError("NATIVE_RESULT_UNKNOWN",true);}})!;
    const unknown=await uncertain.dispatch(call("files.write",{path:"事实.csv",content:"新值",expectedVersion:1}),control);
    expect(unknown).toMatchObject({status:"unknown",operationId:"op",error:{dispatched:true,retryable:false,nextAction:"reconcile"}});
  });
});

describe("Mac 受控命令能力",()=>{
  it("目录分别声明启动、查询、取消；只把原任务中的目标 operation ID 交给原生端口",async()=>{
    const commandPort=vi.fn(async()=>({operationId:"target-run",state:"running",stdoutRef:"command:x:stdout",stderrRef:"command:x:stderr"}));
    const host=createNativeFilesWorkbenchHost(db,{...options,commandPort})!;
    expect(host.catalog.find(item=>item.name==="execution.run")?.effects).toEqual(["process"]);
    expect(host.catalog.find(item=>item.name==="execution.status")?.effects).toEqual(["read"]);
    expect(host.catalog.find(item=>item.name==="execution.cancel")?.effects).toEqual(["process"]);
    const status=await host.dispatch(call("execution.status",{targetOperationId:"target-run"}),control);
    expect(commandPort).toHaveBeenCalledWith({executionTaskId:"task",attempt:2,fenceToken:"fence"},"op",
      {kind:"command_status",targetOperationId:"target-run"});
    expect(status).toMatchObject({status:"succeeded",operationId:"op"});
    expect(await host.dispatch(call("execution.status",{targetOperationId:"../other"}),control))
      .toMatchObject({status:"failed",error:{code:"invalid_input",dispatched:false}});
    expect(commandPort).toHaveBeenCalledTimes(1);
  });
  it("启动使用 argv 与已批准 runtime，输出分页保留游标，取消只引用本任务原操作",async()=>{
    const commandPort=vi.fn(async (_ref:unknown,_id:string,action:NativeCommandAction)=>{
      if(action.kind==="command_read")return {contentBase64:Buffer.from("长输出").toString("base64"),more:true,nextOffset:9};
      return {operationId:"targetOperationId" in action?action.targetOperationId:"op",state:action.kind==="command_cancel"?"cancelled":"running",stdoutRef:"command:x:stdout"};
    });
    const host=createNativeFilesWorkbenchHost(db,{...options,commandPort})!;
    const run=await host.dispatch(call("execution.run",{argv:["-e","console.log(1)"],cwd:".",runtimeId:"bundled-node",timeoutMs:1000}),control);
    expect(run).toMatchObject({status:"succeeded",operationId:"op"});
    expect(commandPort).toHaveBeenCalledWith({executionTaskId:"task",attempt:2,fenceToken:"fence"},"op",
      {kind:"command_run",argv:["-e","console.log(1)"],cwd:".",runtimeId:"bundled-node",timeoutMs:1000});
    const read=await host.dispatch(call("execution.read",{targetOperationId:"run-1",stream:"stdout",offset:0,limit:64}),control);
    expect(read).toMatchObject({status:"succeeded",content:[{type:"text",text:expect.stringContaining('"nextOffset":9')}]});
    await host.dispatch(call("execution.cancel",{targetOperationId:"run-1"}),control);
    expect(commandPort).toHaveBeenLastCalledWith({executionTaskId:"task",attempt:2,fenceToken:"fence"},"op",
      {kind:"command_cancel",targetOperationId:"run-1"});
    expect(await host.dispatch(call("execution.run",{argv:["/bin/sh"],cwd:".",runtimeId:"unknown",timeoutMs:1000}),control))
      .toMatchObject({status:"failed",error:{code:"invalid_input",dispatched:false}});
  });
  it("缺失的随包运行时明确失败；已分发但断联的启动保持待对账",async()=>{
    const invocation=call("execution.run",{argv:["-e","1"],cwd:".",runtimeId:"bundled-python",timeoutMs:1000});
    const unavailable=createNativeFilesWorkbenchHost(db,{...options,commandPort:async()=>{throw new NativeFileError("COMMAND_UNAVAILABLE",true);}})!;
    expect(await unavailable.dispatch(invocation,control)).toMatchObject({status:"failed",error:{code:"command_unavailable",dispatched:false}});
    const uncertain=createNativeFilesWorkbenchHost(db,{...options,commandPort:async()=>{throw new NativeFileError("NATIVE_RESULT_UNKNOWN",true);}})!;
    expect(await uncertain.dispatch(invocation,control)).toMatchObject({status:"unknown",error:{dispatched:true,retryable:false,nextAction:"reconcile"}});
  });
});

const realMacFiles=process.platform==="darwin" && process.env.CREATOROS_TEST_PACKAGED_RUNTIME_ROOT
  && process.env.CREATOROS_T1007_REAL_FILES==="1" ? it : it.skip;

realMacFiles("真实租约经 Node 宿主和 Mac 私有 socket 写读查 HTML，跨任务与失效 fence 拒绝",async()=>{
  const directory=await mkdtemp(join(tmpdir(),"t1007-html-host-"));
  const ready=join(directory,"ready"),done=join(directory,"done"),taskRoot=join(directory,"tasks");
  const projectRoot=resolve(import.meta.dirname,"../../..");
  const rust=spawn("cargo",["test","--manifest-path","frontend/src-tauri/src/workbench/Cargo.toml",
    "--locked","--offline","external_node_files_host_fixture","--","--ignored","--nocapture"],{
    cwd:projectRoot,
    env:{...process.env,CREATOROS_FILES_E2E_NODE_PID:String(process.pid),CREATOROS_FILES_E2E_READY_FILE:ready,
      CREATOROS_FILES_E2E_DONE_FILE:done,CREATOROS_FILES_E2E_TASK_ROOT:taskRoot},
    stdio:["ignore","pipe","pipe"],
  });
  let output="",exited:number|null|undefined;
  rust.stdout.on("data",chunk=>{output+=String(chunk);});
  rust.stderr.on("data",chunk=>{output+=String(chunk);});
  const exit=new Promise<number|null>((resolveExit,rejectExit)=>{
    rust.once("exit",code=>{exited=code;resolveExit(code);});
    rust.once("error",rejectExit);
  });
  let closeDb:(()=>Promise<void>)|undefined;
  try {
    let socketPath:string|undefined;
    const deadline=Date.now()+90_000;
    while(Date.now()<deadline&&exited===undefined){
      try {socketPath=(await readFile(ready,"utf8")).trim();break;}catch{/* Rust fixture is compiling. */}
      await new Promise(resolveWait=>setTimeout(resolveWait,100));
    }
    if(!socketPath)throw new Error(`Rust file fixture did not become ready: ${output}`);
    const opened=await createDb();const realDb=opened.db;closeDb=()=>opened.client.close();
    const tasks=createPersistentTaskService(realDb);
    const nonce=randomUUID(),userId=`html-user-${nonce}`,accountId=`html-account-${nonce}`;
    const makeTask=async(suffix:string)=>{
      const task=await tasks.enqueue({userId,accountId,requestId:`${nonce}-${suffix}`,source:"user"},
        {kind:"ai_task",ownerType:"ai_task",ownerId:`${nonce}-${suffix}`,idempotencyKey:`${nonce}-${suffix}`,payload:{}});
      const workerId=`html-worker-${suffix}`;
      const claim=await tasks.claimTask({taskId:task.id,workerId,leaseSeconds:120});
      if(!claim)throw new Error(`claim missing for ${suffix}`);
      return {task,context:{userId,accountId,taskId:task.id,attempt:claim.lease.attempt,
        fenceToken:claim.lease.fenceToken,leaseId:workerId}};
    };
    const owner=await makeTask("owner"),other=await makeTask("other");
    const host=createNativeFilesWorkbenchHost(realDb,{platform:"darwin",desktop:true,socketPath})!;
    const invoke=(context:typeof owner.context,name:string,input:Record<string,unknown>,operationId=randomUUID())=>
      host.dispatch({context:{...context,operationId},invocation:{name,schemaVersion:1,input}},
        {signal:AbortSignal.timeout(20_000),onProgress:()=>{}});
    const value=(reply:Awaited<ReturnType<typeof invoke>>)=>{
      expect(reply.status,JSON.stringify(reply)).toBe("succeeded");
      if(reply.status!=="succeeded")throw new Error(JSON.stringify(reply));
      const content=reply.content[0];
      expect(content?.type).toBe("text");
      return JSON.parse((content as {type:"text";text:string}).text) as Record<string,unknown>|null;
    };
    const html="<!doctype html><html lang=\"zh-CN\"><meta charset=\"utf-8\"><title>真实任务报告</title><body><h1>事实 0</h1></body></html>";
    const file="交付/报告.html";
    expect(value(await invoke(owner.context,"files.write",{path:file,content:html,expectedVersion:0}))).toEqual({version:1});
    const read=value(await invoke(owner.context,"files.read",{path:file,offset:0,limit:4096}));
    expect(read).toMatchObject({text:html,version:1,encoding:"utf8",total:Buffer.byteLength(html)});
    expect(value(await invoke(owner.context,"files.stat",{path:file}))).toMatchObject({isDirectory:false,size:Buffer.byteLength(html),version:1});
    expect(value(await invoke(other.context,"files.read",{path:file}))).toBeNull();
    expect(value(await invoke(other.context,"files.stat",{path:file}))).toBeNull();
    await expect(invoke({...other.context,taskId:owner.task.id},"files.read",{path:file}))
      .rejects.toMatchObject({name:"ConflictError"});
    await expect(invoke({...owner.context,fenceToken:"stale-fence"},"files.stat",{path:file}))
      .rejects.toMatchObject({name:"ConflictError"});
    const expectedHash=createHash("sha256").update(html).digest("hex");
    const script="const fs=require('node:fs');const crypto=require('node:crypto');"+
      "process.stdout.write(crypto.createHash('sha256').update(fs.readFileSync('交付/报告.html')).digest('hex'))";
    expect(value(await invoke(owner.context,"files.write",{path:"check.js",content:script,expectedVersion:0}))).toEqual({version:1});
    const commandId=randomUUID();
    expect(value(await invoke(owner.context,"execution.run",{argv:["check.js"],cwd:".",runtimeId:"bundled-node",timeoutMs:10000},commandId)))
      .toMatchObject({operationId:commandId});
    let state="running";
    for(let index=0;index<100 && state==="running";index++){
      const receipt=value(await invoke(owner.context,"execution.status",{targetOperationId:commandId}));
      state=String(receipt?.state);
      if(state==="running")await new Promise(resolveWait=>setTimeout(resolveWait,50));
    }
    expect(state).toBe("succeeded");
    expect(value(await invoke(owner.context,"execution.read",{targetOperationId:commandId,stream:"stdout",offset:0,limit:256})))
      .toMatchObject({text:expectedHash,encoding:"utf8"});
    expect(await invoke(other.context,"execution.status",{targetOperationId:commandId}))
      .toMatchObject({status:"failed",error:{code:"invalid_command"}});
    await writeFile(done,JSON.stringify({userId,accountId,taskId:owner.task.id,html}));
    expect(await exit,output).toBe(0);
  } finally {
    await closeDb?.();
    if(exited===undefined){
      await writeFile(done,JSON.stringify({abort:true})).catch(()=>{});
      await Promise.race([exit.catch(()=>null),new Promise(resolveWait=>setTimeout(resolveWait,5000))]);
      if(exited===undefined){rust.kill();await exit.catch(()=>{});}
    }
    await rm(directory,{recursive:true,force:true});
  }
},180_000);

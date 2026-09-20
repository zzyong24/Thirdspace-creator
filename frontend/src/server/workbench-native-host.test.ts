import {describe,expect,it,vi} from "vitest";
import type {Db} from "@creatoros/backend";
import type {WorkbenchHostCall} from "@creatoros/contract/agent-workbench";
import {NativeFileError,type NativeCommandAction} from "./workbench-native-client";
import {createNativeFilesWorkbenchHost,nativeFileCapabilities} from "./workbench-native-host";

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

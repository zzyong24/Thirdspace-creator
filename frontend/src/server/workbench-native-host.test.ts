import {describe,expect,it,vi} from "vitest";
import type {Db} from "@creatoros/backend";
import type {WorkbenchHostCall} from "@creatoros/contract/agent-workbench";
import {NativeFileError} from "./workbench-native-client";
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

// @vitest-environment node
import {createHash} from "node:crypto";
import {mkdtemp,readFile,rm,writeFile} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {expect,it,vi} from "vitest";
import type {Db} from "@creatoros/backend";
import type {WorkbenchHostCall,WorkbenchResult} from "@creatoros/contract/agent-workbench";
import {runDurableAgenticTool} from "../../../ai-worker/src/execution/durable-agentic-tool";
import {createNativeFilesWorkbenchHost,nativeFileCapabilities} from "./workbench-native-host";
import {NativeFileError,type NativeFileAction} from "./workbench-native-client";

const options={platform:"darwin" as const,desktop:true,socketPath:"/tmp/isolated-file-success.sock"};
const control={signal:new AbortController().signal,onProgress:()=>{}};
const call=(name:string,input:Record<string,unknown>):WorkbenchHostCall=>({
 context:{userId:"fixture",accountId:"fixture",taskId:"fixture",attempt:1,fenceToken:"fence",leaseId:"lease",operationId:"op"},
 invocation:{name,schemaVersion:1,input},
});
function metadata(reply:WorkbenchResult):Record<string,unknown>|null{
 expect(reply.status).toBe("succeeded");
 if(reply.status!=="succeeded")throw Error("expected success");
 const text=reply.content.find(part=>part.type==="text");
 if(!text||text.type!=="text")throw Error("missing metadata");
 return JSON.parse(text.text);
}

it("新 write/edit 确认完整替换，size/hash 对应本版本真实 UTF-8 字节且保留 native metadata",async()=>{
 const root=await mkdtemp(join(tmpdir(),"t1026-file-success-")),file=join(root,"报告.html");
 let version=0;
 const filePort=vi.fn(async(_ref:unknown,_id:string,action:NativeFileAction)=>{
  if(action.kind!=="write")throw Error("不应额外读取或 stat");
  expect(action.expectedVersion).toBe(version);
  await writeFile(file,Buffer.from(action.contentBase64,"base64"));
  return {version:++version,nativeMetadata:{confirmed:true}};
 });
 const host=createNativeFilesWorkbenchHost({} as Db,{...options,filePort})!;
 try{
  const original="<!doctype html><html>旧正文很长很长</html>",replacement="<svg>新图🙂</svg>";
  for(const [name,content,expectedVersion] of [["files.write",original,0],["files.edit",replacement,1],["files.edit","",2]] as const){
   const value=metadata(await host.dispatch(call(name,{path:"报告.html",content,expectedVersion}),control));
   const bytes=await readFile(file);
   expect(bytes).toEqual(Buffer.from(content,"utf8"));
   expect(value).toMatchObject({version:expectedVersion+1,nativeMetadata:{confirmed:true},writeMode:"replace_all",size:bytes.length,hash:createHash("sha256").update(bytes).digest("hex")});
   expect(value?.guidance).toEqual(expect.stringContaining("完整内容等于本次 content"));
   expect(value?.guidance).toEqual(expect.stringContaining("不支持分段追加或局部补丁"));
   expect(value?.guidance).toEqual(expect.stringContaining("expectedVersion"));
  }
  expect(filePort).toHaveBeenCalledTimes(3);
 }finally{await rm(root,{recursive:true,force:true});}
});

it.each(["read","stat"] as const)("新 %s 成功保留分页/文件元数据并说明完整替换，不推算整文件 hash",async operation=>{
 const raw=operation==="read"?{version:2,total:500,nextOffset:8,more:true,contentBase64:Buffer.from("正文").toString("base64")}
  :{version:2,size:500,isDirectory:false,hash:"native-file-hash"};
 const filePort=vi.fn(async()=>raw);
 const host=createNativeFilesWorkbenchHost({} as Db,{...options,filePort})!;
 const result=metadata(await host.dispatch(call(`files.${operation}`,{path:"报告.html"}),control));
 if(operation==="read"){
  expect(result).toMatchObject({version:2,total:500,nextOffset:8,more:true,text:"正文",encoding:"utf8"});
  expect(result).not.toHaveProperty("hash");expect(result).not.toHaveProperty("size");
 }else expect(result).toMatchObject(raw);
 expect(result?.guidance).toEqual(expect.stringContaining("完整文件"));
 expect(result?.guidance).toEqual(expect.stringContaining("files.edit"));
 expect(result).not.toHaveProperty("writeMode");expect(filePort).toHaveBeenCalledOnce();
});

it("未找到文件和 list 保持原结果，冲突/未知不伪造成功元数据",async()=>{
 for(const name of ["files.read","files.stat","files.list"]){
  const value=name==="files.list"?["报告.html"]:null;
  const host=createNativeFilesWorkbenchHost({} as Db,{...options,filePort:async()=>value})!;
  expect(metadata(await host.dispatch(call(name,name==="files.list"?{}:{path:"报告.html"}),control))).toEqual(value);
 }
 for(const error of [new NativeFileError("VERSION_CONFLICT",true,4),new NativeFileError("NATIVE_RESULT_UNKNOWN",true)]){
  const host=createNativeFilesWorkbenchHost({} as Db,{...options,filePort:async()=>{throw error;}})!;
  const result=await host.dispatch(call("files.edit",{path:"报告.html",content:"片段",expectedVersion:1}),control);
  expect(result.status).toBe(error.code==="VERSION_CONFLICT"?"failed":"unknown");
  expect(result).not.toHaveProperty("content");
 }
});

it("历史 settled 原回执不新增指导，不进入 native host；冻结 catalog 保持原说明和 schemaVersion",async()=>{
 const output={status:"ok" as const,summary:'{"version":2}',evidence:[],data:{version:2},error:null,continuation:null,sideEffect:"committed" as const};
 const original=JSON.stringify(output),execute=vi.fn(async()=>{throw Error("不得重新执行历史写入");});
 const port=vi.fn(async()=>({callId:"old-call",status:"settled",toolName:"files_edit",input:{path:"报告.html",content:"旧正文",expectedVersion:1},receipt:{schemaVersion:1,kind:"tool",toolCallId:"old-provider-id",toolName:"files_edit",output}}));
 const result=await runDurableAgenticTool({modelCallId:"old-model",toolCallId:"old-provider-id"},{signal:control.signal,call:port,execute});
 expect(JSON.stringify(result)).toBe(original);expect(execute).not.toHaveBeenCalled();expect(port).toHaveBeenCalledOnce();
 expect(nativeFileCapabilities.find(item=>item.name==="files.edit")).toMatchObject({schemaVersion:1,description:"按 expectedVersion 修改当前任务文件，冲突时返回当前版本。",resultSchema:{type:"object"},inputSchema:{properties:{content:{type:"string",maxLength:1_000_000}}}});
});

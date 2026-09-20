import {afterEach,expect,it,vi} from "vitest";
import {createServer,type Server} from "node:net";
import {mkdtemp,rm} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";

vi.mock("server-only",()=>({}));
import {exchangeBrowserSocket,resolveManagedBrowserProfile,BrowserSocketError} from "./workbench-browser-client";

let server:Server|undefined,directory:string|undefined;
async function listen(handle:(request:Record<string,unknown>,reply:(value:object)=>void,disconnect:()=>void)=>void){
 directory=await mkdtemp(join(tmpdir(),"wb-browser-client-"));
 const socketPath=join(directory,"browser.sock");
 server=createServer(connection=>{
  let buffer="";
  connection.on("data",chunk=>{
   buffer+=chunk.toString("utf8");const end=buffer.indexOf("\n");if(end<0)return;
   handle(JSON.parse(buffer.slice(0,end)) as Record<string,unknown>,value=>connection.end(`${JSON.stringify(value)}\n`),()=>connection.destroy());
  });
 });
 await new Promise<void>((resolve,reject)=>server!.listen(socketPath,resolve).once("error",reject));
 return socketPath;
}
afterEach(async()=>{
 if(server)await new Promise<void>(resolve=>server!.close(()=>resolve()));
 if(directory)await rm(directory,{recursive:true,force:true});
 server=undefined;directory=undefined;
});

it("private browser socket returns only the matching operation receipt",async()=>{
 const path=await listen((request,reply)=>{
  expect(request).toEqual({operationId:"browser-open",action:{kind:"open"}});
  reply({ok:true,operationId:"browser-open",value:{laneId:"lane-1",browserEpoch:1}});
 });
 await expect(exchangeBrowserSocket(path,{operationId:"browser-open",action:{kind:"open"}},"browser-open"))
  .resolves.toEqual({laneId:"lane-1",browserEpoch:1});
});

it("disconnect after dispatch and mismatched receipt are uncertain outcomes",async()=>{
 const path=await listen((_request,_reply,disconnect)=>disconnect());
 await expect(exchangeBrowserSocket(path,{operationId:"open-1"},"open-1"))
  .rejects.toMatchObject({code:"BROWSER_RESULT_UNKNOWN",dispatched:true});
 await new Promise<void>(resolve=>server!.close(()=>resolve()));server=undefined;
 await rm(directory!,{recursive:true,force:true});directory=undefined;
 const next=await listen((_request,reply)=>reply({ok:true,operationId:"other",value:{}}));
 await expect(exchangeBrowserSocket(next,{operationId:"open-2"},"open-2"))
  .rejects.toMatchObject({code:"BROWSER_RESULT_UNKNOWN",dispatched:true});
});

it("aborted request is rejected before connecting",async()=>{
 let connections=0;const path=await listen(()=>{connections++;});
 const controller=new AbortController();controller.abort();
 await expect(exchangeBrowserSocket(path,{operationId:"open-3"},"open-3",controller.signal))
  .rejects.toEqual(new BrowserSocketError("BROWSER_ABORTED",false));
 expect(connections).toBe(0);
});

it("profile location is queried with the locked task identity and validates the native reply",async()=>{
 const path=await listen((request,reply)=>{
  expect(request.action).toEqual({kind:"profile_location",userId:"u",accountId:"a",taskId:"t",identityMode:"primary"});
  reply({ok:true,operationId:request.operationId,value:{profileKey:"a".repeat(64),
   managedProfileRoot:"/app-data/workbench/profile",identityMode:"primary",legacyIdentityImported:false,primaryLoginState:"unverified"}});
 });
 await expect(resolveManagedBrowserProfile(path,{userId:"u",accountId:"a",taskId:"t"},"primary"))
  .resolves.toMatchObject({profileKey:"a".repeat(64),identityMode:"primary",legacyIdentityImported:false});
});

it("rejects a native location for a different identity mode before leasing a profile",async()=>{
 const path=await listen((request,reply)=>reply({ok:true,operationId:request.operationId,value:{
  profileKey:"a".repeat(64),managedProfileRoot:"/app-data/workbench/profile",identityMode:"anonymous",
  legacyIdentityImported:false,primaryLoginState:"unverified"}}));
 await expect(resolveManagedBrowserProfile(path,{userId:"u",accountId:"a",taskId:"t"},"primary"))
  .rejects.toMatchObject({code:"INVALID_BROWSER_PROFILE_LOCATION",dispatched:true});
});

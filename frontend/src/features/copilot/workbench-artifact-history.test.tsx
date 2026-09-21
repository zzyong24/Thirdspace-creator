import {afterEach,expect,it,vi} from "vitest";
import {fireEvent,render,screen,waitFor} from "@testing-library/react";
import {WorkbenchArtifactHistory} from "./workbench-artifact-history";

vi.mock("./workbench-artifact-card",()=>({WorkbenchArtifactCard:({artifact}:{artifact:{artifactId:string;version:number}})=><div>{artifact.artifactId}@{artifact.version}</div>}));
vi.mock("@/lib/handshake-client",()=>({handshakeHeaders:()=>({"x-handshake":"ok"})}));
afterEach(()=>vi.unstubAllGlobals());
const item=(version:number)=>({artifactId:"wa-history",version,mime:"text/markdown",size:3,hash:"a".repeat(64),relativePath:"报告.md",taskId:`task-${version}`,provenance:[],status:"committed"});

it("恢复服务端正式版本并与当前消息卡去重",async()=>{
 const fetch=vi.fn(async()=>new Response(JSON.stringify({items:[item(1),item(2)],nextCursor:null}),{status:200,headers:{"content-type":"application/json"}}));vi.stubGlobal("fetch",fetch);
 render(<WorkbenchArtifactHistory conversationId="conv-1" accountId="account-1" excludeRefs={new Set(["wa-history@2"])}/>);
 expect(await screen.findByText("wa-history@1")).toBeTruthy();expect(screen.queryByText("wa-history@2")).toBeNull();
 expect(fetch).toHaveBeenCalledWith(expect.stringContaining("conversationId=conv-1"),expect.objectContaining({headers:expect.objectContaining({"x-account-id":"account-1"})}));
});

it("列表故障保留明确提示，切换会话会取消旧请求",async()=>{
 let reject!:(error:Error)=>void;const fetch=vi.fn((input:RequestInfo|URL,init?:RequestInit)=>{void input;void init;return new Promise<Response>((_resolve,r)=>{reject=r;});});vi.stubGlobal("fetch",fetch);
 const view=render(<WorkbenchArtifactHistory conversationId="conv-old" accountId="account-1" excludeRefs={new Set()}/>);
 const oldSignal=(fetch.mock.calls[0]?.[1] as RequestInit).signal!;view.rerender(<WorkbenchArtifactHistory conversationId="conv-new" accountId="account-1" excludeRefs={new Set()}/>);
 expect(oldSignal.aborted).toBe(true);reject(new Error("offline"));
 await waitFor(()=>expect(screen.getByRole("status").textContent).toContain("版本列表暂时不可用"));
});

it("未知产物用原 operationId 重新核对并刷新状态",async()=>{
 const fetch=vi.fn(async(input:RequestInfo|URL,init?:RequestInit)=>{
  if(init?.method==="POST")return new Response(JSON.stringify({status:"committed"}),{status:200});
  return new Response(JSON.stringify({items:[],lineages:[{artifactId:"wa-pending",currentVersion:0,status:"unknown",pendingOperationId:"op-original",lastErrorCode:"artifact_result_unknown",migrationReason:null}]}),{status:200});
 });vi.stubGlobal("fetch",fetch);
 render(<WorkbenchArtifactHistory conversationId="conv-1" accountId="account-1" excludeRefs={new Set()}/>);
 fireEvent.click(await screen.findByRole("button",{name:"重新核对"}));
 await waitFor(()=>expect(fetch).toHaveBeenCalledWith("/api/v1/workbench-artifacts",expect.objectContaining({method:"POST",body:JSON.stringify({conversationId:"conv-1",operationId:"op-original"})})));
});

it("沿服务端游标恢复多页版本并按真实版本去重",async()=>{
 const fetch=vi.fn(async(input:RequestInfo|URL)=>new Response(JSON.stringify(String(input).includes("cursor=v1%3Apage")?
  {items:[item(2),item(2)],lineages:[],nextCursor:null}:{items:[item(1)],lineages:[],nextCursor:"v1:page"}),{status:200}));vi.stubGlobal("fetch",fetch);
 render(<WorkbenchArtifactHistory conversationId="conv-1" accountId="account-1" excludeRefs={new Set()}/>);
 expect(await screen.findByText("wa-history@1")).toBeTruthy();expect(await screen.findByText("wa-history@2")).toBeTruthy();
 expect(screen.getAllByText("wa-history@2")).toHaveLength(1);expect(fetch).toHaveBeenCalledTimes(2);
});

/** T1188：真实 contract client → HttpTransport → 受控 dispatch envelope；不替换新 hook。 */
import * as React from "react";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ENDPOINTS } from "@creatoros/contract";
import { TranscribeNowButton } from "./transcribe-now-button";
import { readTranscribeScope, stableOwnerKey } from "@/features/copilot/transcribe-task-progress";

const aiTaskResource=ENDPOINTS.getTask.response, artifactResource=ENDPOINTS.listArtifacts.response, artifactVersionResource=ENDPOINTS.listArtifactVersions.response, projectResource=ENDPOINTS.getProject.response;
const TIME = "2026-10-09T00:00:00.000Z";
type Dispatch = {id:string;input:{params?:{projectId?:string;taskId?:string};query?:{page?:number};body?:{attemptId?:string}}};
function task(id="task-1", status="queued") { return aiTaskResource.parse({id,userId:"user-1",groupId:"group-1",projectId:"p-42",contentOutputId:null,taskType:"transcribe.douyin",status,inputData:{awemeIds:["aweme-1"]},modelKey:"local",idempotencyKey:"paid-original",attemptId:"11111111-1111-4111-8111-111111111111",requestFingerprint:`sha256:${"a".repeat(64)}`,retryOfTaskId:null,requestedAt:TIME,startedAt:null,completedAt:null,errorMessage:null}); }
function fixture() {
  const project = projectResource.parse({id:"p-42",userId:"user-1",title:"本人导入作品",brief:"",contentCategory:"",source:"imported",platformRef:{platform:"douyin",externalId:"aweme-1"},creationMode:"guided",status:"active",currentStage:"script",progressPct:0,starred:false,startedAt:TIME,targetCompletedAt:null,completedAt:null,archivedAt:null,createdAt:TIME,updatedAt:TIME});
  const state = {userId:"user-1",version:1,tasks:[] as ReturnType<typeof task>[],hasTranscript:false,failArtifacts:false,postFailure:false,postDelay:null as Promise<void>|null,source:"aweme-1",pendingReads:0};
  const requests: Dispatch[]=[];
  const hooks=new Map<string,(request:Dispatch)=>Response|Promise<Response>|undefined>();
  vi.stubGlobal("fetch",vi.fn(async (url:RequestInfo|URL,init?:RequestInit)=>{
    expect(String(url)).toBe("/api/v1/dispatch");
    expect(new Headers(init?.headers).get("x-group-id")).toBe("group-1");
    expect(init?.credentials).toBe("same-origin");
    const request=JSON.parse(String(init?.body)) as Dispatch;requests.push(request);
    const hooked=await hooks.get(request.id)?.(request);if(hooked)return hooked;
    const envelope=(data:unknown, total?:number)=>Response.json({data,meta:{requestId:"test-t1188",...(total===undefined?{}:{page:request.input.query?.page||1,pageSize:100,total})}});
    switch(request.id){
      case "settings.get":return envelope({id:state.userId,email:"synthetic@example.invalid",displayName:"测试创作者",timezone:"Asia/Shanghai",locale:"zh-CN",createdAt:TIME,updatedAt:TIME});
      case "accountGroups.get":return envelope({id:"group-1",userId:state.userId,name:"本人测试组",status:"active",version:state.version,createdAt:TIME,updatedAt:TIME,members:["account-old","account-new"].map((accountId,index)=>({id:`member-${index}`,accountId,groupId:"group-1",platform:"douyin",accountHandle:accountId,status:"active",version:1,joinedAt:TIME,leftAt:null}))});
      case "projects.get":return envelope({...project,platformRef:{platform:"douyin",externalId:state.source}});
      case "artifacts.list":if(state.failArtifacts)return Response.json({error:{code:"UnexpectedError",message:"read failed"}},{status:503});return envelope(state.hasTranscript?[artifactResource.parse({id:"artifact-1",projectId:"p-42",contentOutputId:null,currentVersionId:"version-1",stage:"script",artifactType:"output_script",title:"原真实稿件",status:"approved",archivedAt:null,origin:"user",createdAt:TIME,updatedAt:TIME})]:[],state.hasTranscript?1:0);
      case "artifacts.versions.list":return envelope([artifactVersionResource.parse({id:"version-1",artifactId:"artifact-1",versionNumber:1,contentText:"已有正文",contentData:{awemeId:"aweme-1"},changeSummary:"",createdByType:"import",aiTaskId:null,createdAt:TIME})],1);
      case "ai.tasks.list":return envelope(state.tasks,state.tasks.length);
      case "ai.tasks.get":return envelope(state.tasks.find(row=>row.id===request.input.params?.taskId)||task());
      case "ai.tasks.steps.list":return envelope([],0);
      case "projects.transcribe":await state.postDelay;if(state.postFailure)throw new TypeError("ACK lost");state.tasks=[task()];return envelope({taskId:"task-1"});
      default:throw new Error(`unexpected endpoint ${request.id}`);
    }
  }));
  const posts=()=>requests.filter(row=>row.id==="projects.transcribe");
  return {state,requests,posts,hooks};
}
async function ready(){await waitFor(()=>expect(screen.getByRole("button",{name:"立即抓取逐字稿"})).toBeEnabled());}
beforeEach(()=>{window.localStorage.setItem("creatoros:current-group","group-1");window.history.replaceState(null,"","/projects/p-42");});
afterEach(()=>{cleanup();vi.restoreAllMocks();vi.unstubAllGlobals();});

describe("TranscribeNowButton 原四业务场景，当前持久协议",()=>{
  it("刷新恢复 queued 的准确任务，零自动/二次提交",async()=>{
    const f=fixture();f.state.tasks=[task()];const first=render(<TranscribeNowButton projectId="p-42" awemeId="aweme-1" initialState="queued"/>);
    await waitFor(()=>expect(screen.getByRole("button",{name:"重新读取正文和关联任务"})).toBeEnabled());
    expect(screen.getByRole("button",{name:"立即抓取逐字稿"})).toBeDisabled();fireEvent.click(screen.getByRole("button",{name:"查看转写进度"}));
    fireEvent.click(await screen.findByRole("button",{name:/选择任务 task-1/}));await screen.findByText("任务编号：task-1");expect(f.posts()).toHaveLength(0);first.unmount();
    render(<TranscribeNowButton projectId="p-42" awemeId="aweme-1" initialState="queued"/>);await waitFor(()=>expect(screen.getByRole("button",{name:"重新读取正文和关联任务"})).toBeEnabled());expect(f.posts()).toHaveLength(0);
  });
  it("正常点击用当前 projectId 与唯一 nonce 提交，真实回读准确 task 后禁二次",async()=>{
    const f=fixture();render(<TranscribeNowButton projectId="p-42" awemeId="aweme-1"/>);await ready();fireEvent.click(screen.getByRole("button",{name:"立即抓取逐字稿"}));
    await screen.findByText("已确认原任务，可查看步骤与当前稿件");expect(f.posts()).toHaveLength(1);expect(f.posts()[0]?.input).toEqual({params:{projectId:"p-42"},body:{attemptId:expect.stringMatching(/^[0-9a-f-]{36}$/i)}});expect(screen.getByRole("button",{name:"立即抓取逐字稿"})).toBeDisabled();
  });
  it("实际 POST 在途 busy 防重复，响应回读之前也不另发",async()=>{
    const f=fixture();let release=()=>{};f.state.postDelay=new Promise<void>(resolve=>{release=resolve;});render(<TranscribeNowButton projectId="p-42" awemeId="aweme-1"/>);await ready();const button=screen.getByRole("button",{name:"立即抓取逐字稿"});fireEvent.click(button);await waitFor(()=>expect(f.posts()).toHaveLength(1));expect(button).toBeDisabled();fireEvent.click(button);expect(f.posts()).toHaveLength(1);await act(async()=>{release();});await screen.findByText("已确认原任务，可查看步骤与当前稿件");
  });
  it("丢 ACK 保未知原 nonce，明确核对原请求同 nonce，不新意图",async()=>{
    const f=fixture();f.state.postFailure=true;const first=render(<TranscribeNowButton projectId="p-42" awemeId="aweme-1"/>);await ready();fireEvent.click(screen.getByRole("button",{name:"立即抓取逐字稿"}));await screen.findByText(/原请求结果未确认；保原请求记录/);const nonce=f.posts()[0]?.input.body?.attemptId;expect(nonce).toBeTruthy();first.unmount();f.state.postFailure=false;f.state.version++;
    render(<TranscribeNowButton projectId="p-42" awemeId="aweme-1"/>);const check=await screen.findByRole("button",{name:"核对原请求"});fireEvent.click(check);await screen.findByText("已确认原任务，可查看步骤与当前稿件");expect(f.posts()).toHaveLength(2);expect(f.posts()[1]?.input.body?.attemptId).toBe(nonce);
  });
});
it("首读失败显式只读重读成功，SSR done 不能压已确认 false",async()=>{
 const f=fixture();f.state.failArtifacts=true;render(<TranscribeNowButton projectId="p-42" awemeId="aweme-1" initialState="done"/>);await screen.findByRole("alert");expect(f.posts()).toHaveLength(0);f.state.failArtifacts=false;fireEvent.click(screen.getByRole("button",{name:"重新读取正文和关联任务"}));await ready();expect(screen.queryByText("当前项目已有稿件；仍可查看原转写任务。")).toBeNull();expect(f.posts()).toHaveLength(0);
});
it("已有正文仍有准确任务入口，零新 POST",async()=>{const f=fixture();f.state.hasTranscript=true;f.state.tasks=[task()];render(<TranscribeNowButton projectId="p-42" awemeId="aweme-1"/>);await screen.findByText("当前项目已有稿件；仍可查看原转写任务。");expect(screen.queryByRole("button",{name:"立即抓取逐字稿"})).toBeNull();expect(screen.getByRole("button",{name:"查看转写进度"})).toBeEnabled();expect(f.posts()).toHaveLength(0);});
it.each(["not json","null","[]","false",'{"pending":null}',"owner-mismatch"])("损坏恢复记录 %s 未清除且零 POST",async bad=>{const f=fixture();const scope=await readTranscribeScope();const key="creatoros:transcribe:v2:request:"+encodeURIComponent(stableOwnerKey(scope))+":p-42";window.sessionStorage.setItem(key,bad);render(<TranscribeNowButton projectId="p-42" awemeId="aweme-1"/>);await screen.findByRole("alert");await waitFor(()=>expect(screen.getByRole("button",{name:"重新读取正文和关联任务"})).toBeEnabled());expect(screen.getByRole("button",{name:"立即抓取逐字稿"})).toBeDisabled();expect(f.posts()).toHaveLength(0);expect(window.sessionStorage.getItem(key)).toBe(bad);});
it("存储写失败拒发送",async()=>{const f=fixture();render(<TranscribeNowButton projectId="p-42" awemeId="aweme-1"/>);await ready();const originalStorage=window.sessionStorage;vi.spyOn(window,"sessionStorage","get").mockReturnValue({get length(){return originalStorage.length;},getItem:originalStorage.getItem.bind(originalStorage),key:originalStorage.key.bind(originalStorage),removeItem:originalStorage.removeItem.bind(originalStorage),clear:originalStorage.clear.bind(originalStorage),setItem(){throw new Error("storage unavailable");}});fireEvent.click(screen.getByRole("button",{name:"立即抓取逐字稿"}));await screen.findByText("无法保留原请求恢复记录，本次未发送转写；仍可查看本人任务");expect(f.posts()).toHaveLength(0);});

it.each(["short-page","duplicate-page","total-drift","empty-middle","dangling-version"])("真实入口读取 %s 未确认时零新POST",async mode=>{
 const f=fixture();
 if(mode==="dangling-version"){
   f.state.hasTranscript=true;
   f.hooks.set("artifacts.versions.list",()=>Response.json({data:[],meta:{requestId:"t1188",page:1,pageSize:100,total:0}}));
 }else{
   const rows=Array.from({length:101},(_,i)=>task(`task-${i}`));
   f.hooks.set("ai.tasks.list",r=>{const page=r.input.query?.page||1;let data=rows.slice((page-1)*100,page*100);if(mode==="short-page"&&page===1)data=data.slice(0,99);if(mode==="duplicate-page"&&page===1)data[1]=data[0]!;if(mode==="empty-middle"&&page===2)data=[];return Response.json({data,meta:{requestId:"t1188",page,pageSize:100,total:mode==="total-drift"&&page===2?102:101}});});
 }
 render(<TranscribeNowButton projectId="p-42" awemeId="aweme-1"/>);await screen.findByRole("alert");expect(screen.getByRole("button",{name:"立即抓取逐字稿"})).toBeDisabled();expect(f.posts()).toHaveLength(0);
});
it("未知原来源改变保原nonce且不重发",async()=>{
 const f=fixture();f.state.postFailure=true;const first=render(<TranscribeNowButton projectId="p-42" awemeId="aweme-1"/>);await ready();fireEvent.click(screen.getByRole("button",{name:"立即抓取逐字稿"}));await screen.findByText(/原请求结果未确认；保原请求记录/);first.unmount();f.state.source="changed-source";
 render(<TranscribeNowButton projectId="p-42" awemeId="aweme-1"/>);fireEvent.click(await screen.findByRole("button",{name:"核对原请求"}));await screen.findByText("原作品来源已变化，不能再次提交原请求；保留原请求以便核对");expect(f.posts()).toHaveLength(1);
});
it("切身份事件期间旧snapshot/在途响应不得准入另发",async()=>{
 const f=fixture();let release:(r:Response)=>void=()=>{};const deferred=new Promise<Response>(resolve=>{release=resolve;});f.hooks.set("artifacts.list",()=>deferred);const view=render(<TranscribeNowButton projectId="p-42" awemeId="aweme-1"/>);await waitFor(()=>expect(f.requests.some(row=>row.id==="artifacts.list")).toBe(true));act(()=>{localStorage.removeItem("creatoros:current-group");window.dispatchEvent(new Event("creatoros:accounts-changed"));});await screen.findByText(/身份或工作区未确认/);await act(async()=>release(Response.json({data:[],meta:{requestId:"t1188",page:1,pageSize:100,total:0}})));expect(screen.queryByRole("button",{name:"立即抓取逐字稿"})).toBeNull();expect(f.posts()).toHaveLength(0);view.unmount();
});

it("未知原请求同组换成员账号不能核对，返回原账号才沿原nonce",async()=>{
 const f=fixture();localStorage.setItem("creatoros:current-account","account-old");f.state.postFailure=true;const first=render(<TranscribeNowButton projectId="p-42" awemeId="aweme-1"/>);await ready();fireEvent.click(screen.getByRole("button",{name:"立即抓取逐字稿"}));await screen.findByText(/原请求结果未确认；保原请求记录/);const nonce=f.posts()[0]?.input.body?.attemptId;first.unmount();localStorage.setItem("creatoros:current-account","account-new");const second=render(<TranscribeNowButton projectId="p-42" awemeId="aweme-1"/>);expect(await screen.findByRole("button",{name:"核对原请求"})).toBeDisabled();expect(f.posts()).toHaveLength(1);second.unmount();localStorage.setItem("creatoros:current-account","account-old");f.state.postFailure=false;render(<TranscribeNowButton projectId="p-42" awemeId="aweme-1"/>);fireEvent.click(await screen.findByRole("button",{name:"核对原请求"}));await screen.findByText("已确认原任务，可查看步骤与当前稿件");expect(f.posts()).toHaveLength(2);expect(f.posts()[1]?.input.body?.attemptId).toBe(nonce);
});

import * as React from "react";
import {cleanup,fireEvent,render,screen,waitFor} from "@testing-library/react";
import {afterEach,beforeEach,expect,it,vi} from "vitest";
import type {MomentsResource} from "@creatoros/contract";
const api=vi.hoisted(()=>({listExecutionTasks:vi.fn(),commandExecutionTasks:vi.fn(),getMomentsRequest:vi.fn(),selectWorkSource:vi.fn(),listWorkCompositions:vi.fn(),generateMomentsCandidate:vi.fn(),getMomentsCandidate:vi.fn(),retryMomentsCandidate:vi.fn(),adoptMomentsCandidate:vi.fn(),getMoments:vi.fn()}));
vi.mock("@/lib/contract-client",()=>({client:api}));vi.mock("./moments-image",()=>({MomentsImage:()=>null}));vi.mock("./work-source-picker",()=>({WorkSourcePicker:()=>null,WorkSourceList:()=> <p>已选择真实保存来源</p>}));
import {MomentsModelPanel} from "./moments-model-panel";
const source={kind:"moments_version",momentsId:"moments-a",artifactId:"artifact-a",versionId:"version-a",selectionDigest:"a".repeat(64),selection:{mode:"whole"}};
const doc=(version="version-a")=>({momentsId:"moments-a",artifactId:"artifact-a",projectId:"project-a",createdAt:"2026-10-02T00:00:00Z",updatedAt:"2026-10-02T00:00:00Z",currentVersionId:version,current:{schemaVersion:1,text:"原文",imageUses:[],sourceRefs:[]}} as MomentsResource);
const candidate={candidateId:"candidate-a",momentsId:"moments-a",artifactId:"artifact-a",field:"text",status:"succeeded",value:"相同事实的新表达"};
function show(document=doc(),onSaved=vi.fn()){return {...render(<MomentsModelPanel document={document} accountId="account-a" disabled={false} onSaved={onSaved}/>),onSaved};}
async function generate(){fireEvent.click(screen.getByRole("button",{name:"使用当前保存稿作为来源"}));await screen.findByText("已选择真实保存来源");fireEvent.click(screen.getByRole("button",{name:"生成朋友圈候选"}));}
beforeEach(()=>{localStorage.clear();Object.values(api).forEach(fn=>fn.mockReset());api.selectWorkSource.mockResolvedValue({source});api.getMomentsCandidate.mockResolvedValue(candidate);});afterEach(cleanup);
it("生成丢回复刷新后复用原来源与版本，不采纳正式稿",async()=>{api.generateMomentsCandidate.mockRejectedValueOnce(Error("生成回复丢失"));const first=show();await generate();await screen.findByRole("alert");const original=api.generateMomentsCandidate.mock.calls[0][0];expect(original.body).toMatchObject({expectedCurrentVersionId:"version-a",source,allowedImageFiles:[]});first.unmount();api.generateMomentsCandidate.mockResolvedValue(candidate);show(doc("version-b"));fireEvent.click(await screen.findByRole("button",{name:"恢复原候选请求"}));await screen.findByRole("textbox",{name:"朋友圈短文候选"});expect(api.generateMomentsCandidate.mock.calls[1][0]).toEqual(original);expect(api.adoptMomentsCandidate).not.toHaveBeenCalled();});
it("采纳丢回复刷新后保留编辑候选与原CAS版本",async()=>{api.generateMomentsCandidate.mockResolvedValue(candidate);api.adoptMomentsCandidate.mockRejectedValueOnce(Error("采纳回复丢失"));const first=show();await generate();const text=await screen.findByRole("textbox",{name:"朋友圈短文候选"});fireEvent.change(text,{target:{value:"人工核对后的候选"}});fireEvent.click(screen.getByRole("button",{name:"采纳候选并保存新版本"}));await screen.findByRole("alert");const original=api.adoptMomentsCandidate.mock.calls[0][0];expect(original.body).toMatchObject({editedValue:"人工核对后的候选",expectedCurrentVersionId:"version-a"});first.unmount();api.adoptMomentsCandidate.mockResolvedValue({});api.getMoments.mockResolvedValue(doc("version-b"));const fresh=show(doc("version-c"));fireEvent.click(await screen.findByRole("button",{name:"恢复原候选请求"}));await waitFor(()=>expect(fresh.onSaved).toHaveBeenCalledOnce());expect(api.adoptMomentsCandidate.mock.calls[1][0]).toEqual(original);expect(api.generateMomentsCandidate).toHaveBeenCalledOnce();});
it("已收到采纳ACK但刷新失败只读最新稿，不重复采纳",async()=>{api.generateMomentsCandidate.mockResolvedValue(candidate);api.adoptMomentsCandidate.mockResolvedValue({});api.getMoments.mockRejectedValueOnce(Error("刷新失败"));const first=show();await generate();fireEvent.click(await screen.findByRole("button",{name:"采纳候选并保存新版本"}));await screen.findByRole("alert");expect(screen.getByRole("button",{name:"读取已采纳的最新稿件"})).toBeInTheDocument();first.unmount();api.getMoments.mockResolvedValue(doc("version-b"));const fresh=show();fireEvent.click(await screen.findByRole("button",{name:"读取已采纳的最新稿件"}));await waitFor(()=>expect(fresh.onSaved).toHaveBeenCalledOnce());expect(api.adoptMomentsCandidate).toHaveBeenCalledOnce();});
it("切换朋友圈稿件后原在途候选不回写新稿",async()=>{let resolve!:(value:typeof candidate)=>void;api.generateMomentsCandidate.mockImplementation(()=>new Promise(r=>{resolve=r;}));const view=show();await generate();await waitFor(()=>expect(api.generateMomentsCandidate).toHaveBeenCalledOnce());view.rerender(<MomentsModelPanel document={{...doc(),momentsId:"moments-b"}} accountId="account-a" disabled={false} onSaved={vi.fn()}/>);resolve(candidate);await waitFor(()=>expect(screen.queryByRole("textbox",{name:"朋友圈短文候选"})).not.toBeInTheDocument());expect(screen.queryByRole("button",{name:"恢复原候选请求"})).not.toBeInTheDocument();});
it("浏览器缓存写失败保留会话完整原输入",async()=>{const original=vi.spyOn(Storage.prototype,"setItem").mockImplementation(()=>{throw Error("QuotaExceededError");});try{api.generateMomentsCandidate.mockRejectedValueOnce(Error("丢回复"));show();await generate();await screen.findByRole("alert");const first=api.generateMomentsCandidate.mock.calls[0][0];api.generateMomentsCandidate.mockResolvedValue(candidate);fireEvent.click(screen.getByRole("button",{name:"恢复原候选请求"}));await screen.findByRole("textbox",{name:"朋友圈短文候选"});expect(api.generateMomentsCandidate.mock.calls[1][0]).toEqual(first);}finally{original.mockRestore();}});

it("刷新后按原采纳回执确认，已采纳候选不能再提交",async()=>{api.generateMomentsCandidate.mockResolvedValue(candidate);api.adoptMomentsCandidate.mockResolvedValue({});api.getMoments.mockResolvedValue(doc("version-b"));const first=show();await generate();fireEvent.click(await screen.findByRole("button",{name:"采纳候选并保存新版本"}));await waitFor(()=>expect(first.onSaved).toHaveBeenCalledOnce());const original=api.adoptMomentsCandidate.mock.calls[0][0];first.unmount();api.getMomentsCandidate.mockResolvedValue(candidate);api.getMomentsRequest.mockResolvedValue({operation:"adopt",params:{candidateId:"candidate-a"},status:"committed",target:{kind:"candidate",candidateId:"candidate-a"}});show(doc("version-b"));fireEvent.click(await screen.findByRole("button",{name:"读取原候选状态"}));await screen.findByRole("button",{name:"本轮候选已采纳"});expect(screen.getByRole("button",{name:"本轮候选已采纳"})).toBeDisabled();expect(api.getMomentsRequest.mock.calls[0][0].params.clientRequestId).toBe(original.body.clientRequestId);expect(api.adoptMomentsCandidate).toHaveBeenCalledOnce();});
it("取消后的明确新候选不假装恢复原任务，旧候选不删除",async()=>{api.generateMomentsCandidate.mockResolvedValue({...candidate,status:"cancelled",value:null});show();await generate();await screen.findByText("原生成已取消");expect(screen.queryByRole("button",{name:"恢复原生成任务"})).not.toBeInTheDocument();fireEvent.click(screen.getByRole("button",{name:"明确新建另一份候选"}));expect(screen.queryByRole("button",{name:"读取原候选状态"})).not.toBeInTheDocument();expect(api.retryMomentsCandidate).not.toHaveBeenCalled();expect(api.generateMomentsCandidate).toHaveBeenCalledOnce();expect(screen.getByRole("button",{name:"生成朋友圈候选"})).toBeDisabled();});

it("原采纳回执读取失败保留已提交身份并阻止新采纳",async()=>{api.generateMomentsCandidate.mockResolvedValue(candidate);api.adoptMomentsCandidate.mockResolvedValue({});api.getMoments.mockResolvedValue(doc("version-b"));const first=show();await generate();fireEvent.click(await screen.findByRole("button",{name:"采纳候选并保存新版本"}));await waitFor(()=>expect(first.onSaved).toHaveBeenCalledOnce());first.unmount();api.getMomentsCandidate.mockResolvedValue(candidate);api.getMomentsRequest.mockRejectedValue(Error("原回执读取网络失败"));show(doc("version-b"));fireEvent.click(await screen.findByRole("button",{name:"读取原候选状态"}));await screen.findByRole("alert");expect(screen.getByRole("button",{name:"采纳候选并保存新版本"})).toBeDisabled();expect(api.adoptMomentsCandidate).toHaveBeenCalledOnce();});

const waitingCandidate={...candidate,status:"waiting_user",taskId:"ai-original",executionTaskId:"exec-original",runtimeStatus:"waiting_user",errorCode:"MODEL_CREDENTIAL_UNAVAILABLE",value:null};
const waitingExecution={userId:"user-a",priority:0,idempotencyKey:"original-enqueue",checkpoint:null,leaseOwner:null,leaseExpiresAt:null,heartbeatAt:null,maxAttempts:5,errorCode:"MODEL_CREDENTIAL_UNAVAILABLE",errorMessage:"当前模型凭据无法解密",costEstimate:null,createdAt:"2026-10-02T06:00:00.000Z",id:"exec-original",accountId:"account-a",ownerType:"ai_task",ownerId:"ai-original",kind:"ai_task",status:"blocked",runtimeStatus:"waiting_user",attempt:1,updatedAt:"2026-10-02T07:00:00.000Z"};
it("等待继续丢回复后刷新恢复原command，不创建候选子任务",async()=>{api.generateMomentsCandidate.mockResolvedValue(waitingCandidate);api.getMomentsCandidate.mockResolvedValue(waitingCandidate);api.listExecutionTasks.mockResolvedValue([waitingExecution]);api.commandExecutionTasks.mockRejectedValueOnce(Error("继续ACK丢失"));const first=show();await generate();fireEvent.click(await screen.findByRole("button",{name:"继续原生成任务"}));await screen.findByRole("alert");const original=api.commandExecutionTasks.mock.calls[0][0];first.unmount();api.commandExecutionTasks.mockResolvedValue({tasks:[waitingExecution]});show();fireEvent.click(await screen.findByRole("button",{name:"恢复原生成继续请求"}));await waitFor(()=>expect(api.commandExecutionTasks).toHaveBeenCalledTimes(2));expect(api.commandExecutionTasks.mock.calls[1][0]).toEqual(original);expect(api.generateMomentsCandidate).toHaveBeenCalledOnce();expect(api.retryMomentsCandidate).not.toHaveBeenCalled();});
it("未知供应商结果只读对账，无新resume和候选重试按钮",async()=>{api.generateMomentsCandidate.mockResolvedValue({...waitingCandidate,status:"unknown_result",runtimeStatus:"unknown_result",errorCode:"MODEL_RESULT_UNKNOWN"});show();await generate();await screen.findByText("原供应商调用结果未知，请核对原回执；不会重新提交");expect(screen.queryByRole("button",{name:"继续原生成任务"})).not.toBeInTheDocument();expect(screen.queryByRole("button",{name:"恢复原生成任务"})).not.toBeInTheDocument();expect(api.commandExecutionTasks).not.toHaveBeenCalled();expect(api.retryMomentsCandidate).not.toHaveBeenCalled();});
it("原继续执行账号或owner不匹配时零command提交",async()=>{api.generateMomentsCandidate.mockResolvedValue(waitingCandidate);api.listExecutionTasks.mockResolvedValue([{...waitingExecution,ownerId:"foreign-task"}]);show();await generate();fireEvent.click(await screen.findByRole("button",{name:"继续原生成任务"}));await screen.findByRole("alert");expect(api.commandExecutionTasks).not.toHaveBeenCalled();});

it("原继续ACK已到但刷新失败只读，不重复command",async()=>{api.generateMomentsCandidate.mockResolvedValue(waitingCandidate);api.listExecutionTasks.mockResolvedValue([waitingExecution]);api.commandExecutionTasks.mockResolvedValue({tasks:[waitingExecution]});api.getMomentsCandidate.mockResolvedValueOnce(waitingCandidate).mockRejectedValueOnce(Error("继续后读取失败"));const first=show();await generate();fireEvent.click(await screen.findByRole("button",{name:"继续原生成任务"}));await screen.findByRole("alert");first.unmount();api.getMomentsCandidate.mockResolvedValue(waitingCandidate);show();fireEvent.click(await screen.findByRole("button",{name:"恢复原生成继续请求"}));await screen.findByRole("button",{name:"继续原生成任务"});expect(api.commandExecutionTasks).toHaveBeenCalledOnce();});
it("继续资格读取期间卸载不发送迟到command",async()=>{let resolve!:(v:typeof waitingExecution[])=>void;api.generateMomentsCandidate.mockResolvedValue(waitingCandidate);api.listExecutionTasks.mockImplementation(()=>new Promise(r=>{resolve=r;}));const view=show();await generate();fireEvent.click(await screen.findByRole("button",{name:"继续原生成任务"}));await waitFor(()=>expect(api.listExecutionTasks).toHaveBeenCalledOnce());view.unmount();resolve([waitingExecution]);await waitFor(()=>expect(api.commandExecutionTasks).not.toHaveBeenCalled());expect(api.getMomentsCandidate).not.toHaveBeenCalled();});

it("当前稿面缓存另稿件的合法继续请求时拒绝零command",async()=>{localStorage.setItem("moments-model:account-a:moments-a",JSON.stringify({candidateId:"candidate-b",pending:{kind:"resume",candidateId:"candidate-b",taskId:"ai-original",executionTaskId:"exec-original",body:{taskIds:["exec-original"],command:"resume",idempotencyKey:"wrong-doc-original-resume"},ack:false}}));api.getMomentsCandidate.mockResolvedValue({...waitingCandidate,candidateId:"candidate-b",momentsId:"moments-b",artifactId:"artifact-b"});api.listExecutionTasks.mockResolvedValue([waitingExecution]);api.commandExecutionTasks.mockResolvedValue({tasks:[waitingExecution]});show();fireEvent.click(await screen.findByRole("button",{name:"恢复原生成继续请求"}));await waitFor(()=>expect(api.getMomentsCandidate).toHaveBeenCalled());await waitFor(()=>expect(screen.queryByRole("alert")||screen.queryByRole("button",{name:"继续原生成任务"})).toBeTruthy());expect(api.commandExecutionTasks).not.toHaveBeenCalled();});

it.each([false,true])("另稿件采纳缓存ACK=%s不得保存或冒认当前稿件",async ack=>{localStorage.setItem("moments-model:account-a:moments-a",JSON.stringify({candidateId:"candidate-b",pending:{kind:"adopt",candidateId:"candidate-b",body:{field:"text",clientRequestId:"wrong-doc-adopt",expectedCurrentVersionId:"version-b",editedValue:"另稿件人工候选"},ack}}));api.getMomentsCandidate.mockResolvedValue({...candidate,candidateId:"candidate-b",momentsId:"moments-b",artifactId:"artifact-b"});const view=show();fireEvent.click(await screen.findByRole("button",{name:ack?"读取已采纳的最新稿件":"恢复原候选请求"}));await screen.findByRole("alert");expect(api.adoptMomentsCandidate).not.toHaveBeenCalled();expect(api.getMoments).not.toHaveBeenCalled();expect(view.onSaved).not.toHaveBeenCalled();});

it("已读证错稿件仅清本地恢复记录，原任务不提交或删除",async()=>{localStorage.setItem("moments-model:account-a:moments-a",JSON.stringify({candidateId:"candidate-b",pending:null}));api.getMomentsCandidate.mockResolvedValue({...candidate,candidateId:"candidate-b",momentsId:"moments-b",artifactId:"artifact-b"});show();fireEvent.click(await screen.findByRole("button",{name:"读取原候选状态"}));fireEvent.click(await screen.findByRole("button",{name:"移除本页错误恢复记录"}));expect(screen.queryByRole("button",{name:"读取原候选状态"})).not.toBeInTheDocument();expect(api.adoptMomentsCandidate).not.toHaveBeenCalled();expect(api.commandExecutionTasks).not.toHaveBeenCalled();expect(api.generateMomentsCandidate).not.toHaveBeenCalled();expect(screen.getByRole("button",{name:"使用当前保存稿作为来源"})).toBeEnabled();});

it("另稿件合法失败候选恢复缓存不得重试或创建任务",async()=>{localStorage.setItem("moments-model:account-a:moments-a",JSON.stringify({candidateId:"candidate-b",pending:{kind:"retry",candidateId:"candidate-b",body:{clientRequestId:"wrong-doc-retry"}}}));api.getMomentsCandidate.mockResolvedValue({...candidate,candidateId:"candidate-b",momentsId:"moments-b",artifactId:"artifact-b",status:"failed",value:null});api.retryMomentsCandidate.mockResolvedValue(candidate);show();fireEvent.click(await screen.findByRole("button",{name:"恢复原候选请求"}));await waitFor(()=>expect(api.getMomentsCandidate.mock.calls.length||api.retryMomentsCandidate.mock.calls.length).toBeGreaterThan(0));expect(api.retryMomentsCandidate).not.toHaveBeenCalled();expect(api.generateMomentsCandidate).not.toHaveBeenCalled();});

it('独立回归：原候选资格读取期间卸载，零迟到 retry',async()=>{localStorage.setItem('moments-model:account-a:moments-a',JSON.stringify({candidateId:'candidate-a',pending:{kind:'retry',candidateId:'candidate-a',body:{clientRequestId:'original-retry'}}}));let resolve!:(value:unknown)=>void;api.getMomentsCandidate.mockImplementation(()=>new Promise(r=>resolve=r));const view=show();fireEvent.click(await screen.findByRole('button',{name:'恢复原候选请求'}));await waitFor(()=>expect(api.getMomentsCandidate).toHaveBeenCalledOnce());view.unmount();resolve({...candidate,status:'failed',value:null});await Promise.resolve();await Promise.resolve();expect(api.retryMomentsCandidate).not.toHaveBeenCalled();});
it('独立回归：合法失败候选重试资格读完后使用原完整 requestId',async()=>{const pending={kind:'retry',candidateId:'candidate-a',body:{clientRequestId:'original-retry'}};localStorage.setItem('moments-model:account-a:moments-a',JSON.stringify({candidateId:'candidate-a',pending}));api.getMomentsCandidate.mockResolvedValue({...candidate,status:'failed',value:null});api.retryMomentsCandidate.mockResolvedValue(candidate);show();fireEvent.click(await screen.findByRole('button',{name:'恢复原候选请求'}));await screen.findByRole('textbox',{name:'朋友圈短文候选'});expect(api.getMomentsCandidate.mock.invocationCallOrder[0]).toBeLessThan(api.retryMomentsCandidate.mock.invocationCallOrder[0]!);expect(api.retryMomentsCandidate.mock.calls[0][0]).toEqual({params:{candidateId:'candidate-a'},query:undefined,body:{clientRequestId:'original-retry'}});});

// T1062_COMPONENT_PORT_SEAM: 仅本文件既有业务spies；真实scope/epoch/signal/lifecycle不替换。
vi.mock("@/lib/creation-workspace-scope", async importOriginal => {
  const actual = await importOriginal<typeof import("@/lib/creation-workspace-scope")>();
  const {client: componentPorts} = await import("@/lib/contract-client");
  type Workspace = ReturnType<typeof actual.createCreationWorkspace>;
  type Operation = ReturnType<Workspace["capture"]>;
  const views = new WeakMap<Workspace, Workspace>();
  function portClient(base: Operation["client"], capture: () => Operation): Operation["client"] {
    const methods = new Map<PropertyKey, unknown>();
    return new Proxy(base, {
      get(target, key, receiver) {
        const port = Reflect.get(componentPorts, key);
        const original = Reflect.get(target, key, receiver);
        if (typeof port !== "function") return original;
        if (!methods.has(key)) methods.set(key, async (...args: unknown[]) => {
          const operation = capture();
          operation.assertCurrent();
          try { return await Reflect.apply(Reflect.get(componentPorts, key), componentPorts, args); }
          finally { operation.assertCurrent(); }
        });
        return methods.get(key);
      },
    });
  }
  function view(workspace: Workspace): Workspace {
    const cached = views.get(workspace);
    if (cached) return cached;
    const client = portClient(workspace.client, () => workspace.capture());
    const capture = (): Operation => {
      const operation = workspace.capture();
      return Object.freeze({...operation, client: portClient(operation.client, () => operation)});
    };
    const proxy = new Proxy(workspace, {
      get(target, key) {
        if (key === "client") return client;
        if (key === "capture") return capture;
        // Reflect读取原对象getter，signal/epoch始终是原factory当前值；不spread workspace。
        return Reflect.get(target, key, target);
      },
    });
    views.set(workspace, proxy);
    return proxy;
  }
  return {
    ...actual,
    createCreationWorkspace: (...args: Parameters<typeof actual.createCreationWorkspace>) => view(actual.createCreationWorkspace(...args)),
    useCreationWorkspace: (scope: Parameters<typeof actual.useCreationWorkspace>[0]) => view(actual.useCreationWorkspace(scope)),
    useCreationClient: () => view(actual.useCreationWorkspace(actual.useCreationScope())).client,
  };
});
// T1062_COMPONENT_PORT_SEAM_END

// T1062_UNIT_SCOPE_FIXTURE: 显式合成单测选择；不是当前用户/生产default。
import {beforeEach as t1062ScopeBeforeEach, afterEach as t1062ScopeAfterEach} from "vitest";
t1062ScopeBeforeEach(() => {
  window.localStorage.removeItem("creatoros:current-group");
  window.localStorage.setItem("creatoros:current-account", "account-a");
});
t1062ScopeAfterEach(() => {
  window.localStorage.removeItem("creatoros:current-group");
  window.localStorage.removeItem("creatoros:current-account");
});
// T1062_UNIT_SCOPE_FIXTURE_END

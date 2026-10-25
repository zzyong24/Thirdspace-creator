import * as React from "react";
import {describe,it,expect,vi,beforeEach,afterEach} from "vitest";
import {render,fireEvent,cleanup,screen,waitFor,act} from "@testing-library/react";
import type {ProjectPreparationResource,ProjectPreparationStep,ProjectPreparationCandidate} from "@creatoros/contract";
const controls=vi.hoisted(()=>({scope:{groupId:"group-a",accountId:null as string|null},get:vi.fn(),task:vi.fn(),command:vi.fn(),start:vi.fn(),provide:vi.fn(),accept:vi.fn(),openChat:vi.fn(),refresh:vi.fn(),capture:vi.fn()}));
vi.mock("next/navigation",()=>({useRouter:()=>({refresh:controls.refresh})}));
vi.mock("@/lib/creation-workspace-scope",async()=>{
  const actual=await vi.importActual<typeof import("@/lib/creation-workspace-scope")>("@/lib/creation-workspace-scope");
  const workspace={capture(){const key=actual.creationScopeKey(controls.scope);return {assertCurrent(){if(actual.creationScopeKey(controls.scope)!==key)throw Error("工作区已切换");},client:{getProjectPreparation:controls.get,getExecutionTask:controls.task,commandExecutionTasks:controls.command,startProjectPreparation:controls.start,provideProjectPreparationTranscript:controls.provide,acceptProjectPreparationCandidate:controls.accept}};}};
  return {...actual,useCreationScope:()=>controls.scope,useCreationWorkspace:()=>workspace,readCreationScope:()=>controls.scope};
});
vi.mock("./draft-chat-request",()=>({useDraftChatRequest:()=>({openChat:controls.openChat,captureScriptAdoption:controls.capture})}));
import {ProjectPipelinePanel} from "./project-pipeline-panel";
import {ProjectPreparationProvider} from "./project-preparation-context";
import {ProjectPreparationCandidateCard} from "@/features/copilot/project-preparation-candidate-card";
function step(name:ProjectPreparationStep['name'],status:ProjectPreparationStep['status'],actions:ProjectPreparationStep['availableActions']=[]):ProjectPreparationStep{return {name,status,required:true,reasonCode:"REAL_CHECKPOINT",revision:3,childTaskId:status==="queued"||status==="running"?"child-real":null,businessTaskId:null,inputDigest:null,outputReferences:[],startedAt:null,completedAt:null,lastError:null,availableActions:actions};}
function preparation(steps:ProjectPreparationStep[]=[step("transcript","failed",["retry","provide_transcript"])]):ProjectPreparationResource{return {projectId:"p-1",origin:"radar",registration:"registered",preparationTaskId:"parent-real",revision:4,steps,candidates:[],sourceReferences:[{id:"ref-real",projectId:"p-1",sourceKey:"item:real",sourceKind:"intelligence_item",itemId:"item-real",snapshotId:"snapshot-real",url:"https://example.com/source",bodyAvailable:false,sourceDigest:"source-real",transcriptHash:null,createdAt:"2026-10-21T00:00:00.000Z",updatedAt:"2026-10-21T00:00:00.000Z"}],lastError:null,availableActions:["retry"]};}
const brief:ProjectPreparationCandidate={id:"candidate-real",kind:"brief",sourceTaskId:"child-real",transformId:null,checkpointPath:"calls.real",sourceDigest:"candidate-source",artifactDigest:"artifact-real",status:"pending",acceptanceReceipt:null,baseline:{kind:"digest",digest:"baseline-real"},content:{kind:"brief",brief:"",briefDetail:{targetAudience:"建议观众"}}};
function mount(value=preparation(),children?:React.ReactNode,pollIntervalMs=100000){controls.get.mockResolvedValue(value);controls.start.mockResolvedValue(value);controls.provide.mockResolvedValue(value);return render(<ProjectPreparationProvider projectId="p-1" initialPreparation={value} pollIntervalMs={pollIntervalMs}><ProjectPipelinePanel projectId="p-1" origin="radar"/>{children}</ProjectPreparationProvider>);}
beforeEach(()=>{for(const value of Object.values(controls))if(vi.isMockFunction(value))value.mockReset();controls.scope={groupId:"group-a",accountId:null};controls.capture.mockReturnValue(()=>true);controls.task.mockResolvedValue({id:"parent-real",status:"cancelled"});});
afterEach(cleanup);
async function ready(){await waitFor(()=>expect(screen.getByRole("button",{name:"重新读取状态"})).not.toBeDisabled());}
describe("ProjectPipelinePanel — 服务端准备状态",()=>{
 it("C2 恢复回执queued但步骤仍failed时观察父runtimeStatus直到真实waiting_user",async()=>{
  const failed={...preparation([step("brief","failed")]),availableActions:["resume","cancel"] as ProjectPreparationResource["availableActions"]};
  const stale={...preparation([step("brief","failed")]),availableActions:["pause","cancel"] as ProjectPreparationResource["availableActions"]};
  const blocked={...preparation([{...step("brief","waiting_user"),lastError:{code:"EXECUTION_FAILED",message:"请在设置中登录 Codex 后恢复"}}]),availableActions:["resume","cancel"] as ProjectPreparationResource["availableActions"]};
  mount(failed,undefined,2);await ready();
  controls.command.mockResolvedValue({tasks:[{id:"parent-real",status:"queued"}]});
  controls.get.mockResolvedValue(stale);
  controls.task.mockResolvedValueOnce({id:"parent-real",status:"blocked",runtimeStatus:"retry_wait"}).mockImplementation(async()=>{controls.get.mockResolvedValue(blocked);return {id:"parent-real",status:"blocked",runtimeStatus:"waiting_user"};});
  fireEvent.click(screen.getByRole("button",{name:"恢复项目准备"}));
  expect(await screen.findByText("请在设置中登录 Codex 后恢复")).toBeVisible();
  expect(screen.getByRole("button",{name:"恢复项目准备"})).toBeEnabled();
  expect(controls.task).toHaveBeenCalledTimes(2);
  const count=controls.get.mock.calls.length;
  await act(async()=>{await new Promise(resolve=>setTimeout(resolve,15));});
  expect(controls.get).toHaveBeenCalledTimes(count);expect(controls.command).toHaveBeenCalledTimes(1);expect(controls.start).not.toHaveBeenCalled();
 },120000);
 it("C2 pending控制沿原父单飞观察，确认后才显示恢复按钮",async()=>{
  const active={...preparation([step("brief","running")]),availableActions:["pause","cancel"] as ProjectPreparationResource["availableActions"]};
  const pending={...preparation([step("brief","paused")]),availableActions:["start"] as ProjectPreparationResource["availableActions"]};
  const paused={...preparation([step("brief","paused")]),availableActions:["resume","cancel"] as ProjectPreparationResource["availableActions"]};
  mount(active,undefined,2);await ready();
  controls.command.mockResolvedValue({tasks:[{id:"parent-real",status:"pause_requested"}]});
  controls.get.mockResolvedValue(pending);
  controls.task.mockResolvedValueOnce({id:"parent-real",status:"pause_requested"}).mockImplementation(async()=>{controls.get.mockResolvedValue(paused);return {id:"parent-real",status:"paused"};});
  fireEvent.click(screen.getByRole("button",{name:"暂停项目准备"}));
  expect(await screen.findByRole("button",{name:"恢复项目准备"})).toBeEnabled();
  expect(controls.task).toHaveBeenCalledWith({params:{taskId:"parent-real"},query:undefined,body:undefined});
  expect(controls.task).toHaveBeenCalledTimes(2);
  const count=controls.get.mock.calls.length;
  await act(async()=>{await new Promise(resolve=>setTimeout(resolve,15));});
  expect(controls.get).toHaveBeenCalledTimes(count);
  expect(controls.command).toHaveBeenCalledTimes(1);expect(controls.start).not.toHaveBeenCalled();
 },120000);
 it("C2 刷新pending投影核对原父并有限观察，confirmed cancelled只核对一次",async()=>{
  const pending={...preparation([step("brief","paused")]),availableActions:["start"] as ProjectPreparationResource["availableActions"]};
  const paused={...preparation([step("brief","paused")]),availableActions:["resume","cancel"] as ProjectPreparationResource["availableActions"]};
  controls.task.mockResolvedValueOnce({id:"parent-real",status:"pause_requested"}).mockImplementation(async()=>{controls.get.mockResolvedValue(paused);return {id:"parent-real",status:"paused"};});
  const mounted=mount(pending,undefined,2);
  expect(await screen.findByRole("button",{name:"恢复项目准备"})).toBeEnabled();
  expect(controls.task).toHaveBeenCalledTimes(2);mounted.unmount();
  controls.task.mockReset().mockResolvedValue({id:"parent-real",status:"cancelled"});controls.get.mockClear();
  mount({...preparation([step("brief","cancelled")]),availableActions:["start"]},undefined,2);await ready();
  await act(async()=>{await new Promise(resolve=>setTimeout(resolve,15));});
  expect(controls.task).toHaveBeenCalledTimes(1);expect(controls.get).toHaveBeenCalledTimes(1);
  expect(controls.command).not.toHaveBeenCalled();expect(controls.start).not.toHaveBeenCalled();
 },120000);
 it("C2 pending观察满120秒保留原父状态，停止观察且不重发控制",async()=>{
  const clock=vi.spyOn(Date,"now").mockReturnValue(1000);
  try{
   const pending={...preparation([step("brief","paused")]),availableActions:["start"] as ProjectPreparationResource["availableActions"]};
   controls.task.mockResolvedValue({id:"parent-real",status:"pause_requested"});
   mount(pending);await ready();
   expect(controls.task).toHaveBeenCalledWith({params:{taskId:"parent-real"},query:undefined,body:undefined});
   clock.mockReturnValue(121001);fireEvent(window,new Event("focus"));
   expect(await screen.findByRole("alert")).toHaveTextContent("控制已提交，请重新读取原任务状态");
   expect(document.querySelector('[data-step="brief"]')).toHaveAttribute("data-state","paused");
   expect(controls.task).toHaveBeenCalledTimes(1);expect(controls.command).not.toHaveBeenCalled();expect(controls.start).not.toHaveBeenCalled();
  }finally{clock.mockRestore();}
 },120000);
 it("C2 切组后原父控制观察晚到不能回写新组或继续旧scope读取",async()=>{
  const pending={...preparation([step("brief","paused")]),availableActions:["start"] as ProjectPreparationResource["availableActions"]};
  let finish!:(value:unknown)=>void;
  controls.task.mockImplementation(()=>new Promise(resolve=>{finish=resolve;}));
  const mounted=mount(pending);await waitFor(()=>expect(controls.task).toHaveBeenCalledTimes(1));
  controls.scope={groupId:"group-b",accountId:null};
  const fresh={...preparation([step("brief","waiting_user")]),availableActions:["resume","cancel"] as ProjectPreparationResource["availableActions"]};
  controls.get.mockResolvedValue(fresh);
  mounted.rerender(<ProjectPreparationProvider projectId="p-1"><ProjectPipelinePanel projectId="p-1"/></ProjectPreparationProvider>);
  await ready();expect(document.querySelector('[data-step="brief"]')).toHaveAttribute("data-state","waiting_user");
  await act(async()=>finish({id:"parent-real",status:"paused"}));
  expect(document.querySelector('[data-step="brief"]')).toHaveAttribute("data-state","waiting_user");
  expect(controls.get).toHaveBeenCalledTimes(2);expect(controls.command).not.toHaveBeenCalled();expect(controls.start).not.toHaveBeenCalled();
 },120000);
 it.each([
  ["pause","暂停项目准备","running","paused",["pause","cancel"],["resume","cancel"]],
  ["resume","恢复项目准备","paused","queued",["resume","cancel"],["pause","cancel"]],
  ["cancel","取消项目准备","running","cancelled",["pause","cancel"],["start"]],
 ] as const)("C2 父任务 %s 使用原taskId与真实控制命令，并读取服务端回执",async(command,label,before,after,actions,nextActions)=>{
  const value={...preparation([step("brief",before)]),availableActions:[...actions]};
  mount(value);await ready();
  const next={...preparation([step("brief",after)]),availableActions:[...nextActions]};
  controls.command.mockResolvedValue({tasks:[{id:"parent-real",status:after}]});
  controls.get.mockResolvedValue(next);
  fireEvent.click(screen.getByRole("button",{name:label}));
  await waitFor(()=>expect(controls.command).toHaveBeenCalledWith({params:undefined,query:undefined,body:{taskIds:["parent-real"],command,idempotencyKey:expect.any(String)}}));
  await waitFor(()=>expect(controls.get).toHaveBeenCalledTimes(2));
  await waitFor(()=>expect(document.querySelector('[data-step="brief"]')).toHaveAttribute("data-state",after));
  expect(controls.start).not.toHaveBeenCalled();
 },120000);
 it("C2 只按父任务可用动作显示控制，终态和无父任务隐藏三个控制",async()=>{
  const value={...preparation([step("brief","paused")]),availableActions:["resume","cancel"] as ProjectPreparationResource["availableActions"]};
  const mounted=mount(value);await ready();
  expect(screen.queryByRole("button",{name:"暂停项目准备"})).toBeNull();
  expect(screen.getByRole("button",{name:"恢复项目准备"})).toBeEnabled();
  expect(screen.getByRole("button",{name:"取消项目准备"})).toBeEnabled();
  mounted.unmount();
  const terminal=mount({...preparation([step("brief","cancelled")]),availableActions:["start"]});await ready();
  for(const name of ["暂停项目准备","恢复项目准备","取消项目准备"])expect(screen.queryByRole("button",{name})).toBeNull();
  terminal.unmount();
  mount({...preparation(),registration:"not_registered",preparationTaskId:null,revision:null,steps:[],availableActions:["start"]});await ready();
  for(const name of ["暂停项目准备","恢复项目准备","取消项目准备"])expect(screen.queryByRole("button",{name})).toBeNull();
 },120000);
 it("C2 父控制请求在途禁用所有控制，重复点击不重发，失败显示真实错误保留原状态",async()=>{
  mount({...preparation([step("brief","running")]),availableActions:["pause","cancel"]});await ready();
  let reject!:(reason:Error)=>void;
  controls.command.mockImplementation(()=>new Promise((_resolve,fail)=>{reject=fail;}));
  fireEvent.click(screen.getByRole("button",{name:"暂停项目准备"}));
  await waitFor(()=>expect(screen.getByRole("button",{name:"暂停项目准备"})).toBeDisabled());
  expect(screen.getByRole("button",{name:"取消项目准备"})).toBeDisabled();
  fireEvent.click(screen.getByRole("button",{name:"暂停项目准备"}));
  expect(controls.command).toHaveBeenCalledTimes(1);
  await act(async()=>reject(Error("父任务控制失败，请核对原任务")));
  expect(await screen.findByRole("alert")).toHaveTextContent("父任务控制失败，请核对原任务");
  expect(document.querySelector('[data-step="brief"]')).toHaveAttribute("data-state","running");
  expect(screen.getByRole("button",{name:"暂停项目准备"})).toBeEnabled();
  expect(controls.get).toHaveBeenCalledTimes(1);
  expect(controls.start).not.toHaveBeenCalled();
 },120000);
 it("fb 已有可信逐字稿显示完成和就绪，真正无需转写仍不需要",async()=>{const value=preparation([{...step("transcript","done"),reasonCode:"TRANSCRIPT_ALREADY_AVAILABLE"}]);const mounted=mount(value);await ready();expect(screen.getByText("已完成")).toBeVisible();expect(screen.getByText("逐字稿就绪，本次无需再转写。")).toBeVisible();expect(screen.queryByText("不需要")).toBeNull();mounted.unmount();mount(preparation([{...step("transcript","not_required"),reasonCode:"NO_SUPPORTED_TRANSCRIPTION_SOURCE"}]));await ready();expect(screen.getByText("不需要")).toBeVisible();expect(screen.getByText(/当前来源不适用自动转写/)).toBeVisible();},120000);
 it("fb 全等资料完成后明确无需采纳，不显示待采纳候选",async()=>{mount(preparation([{...step("brief","done"),reasonCode:"BRIEF_UNCHANGED"}]));await ready();expect(screen.getByText("已完成")).toBeVisible();expect(screen.getByText("本次建议与已有资料一致，无需采纳。")).toBeVisible();expect(screen.queryByText("候选已生成，待采纳")).toBeNull();},120000);

 it.each(["queued","running","done","candidate_ready"] as const)("fa %s历史状态不显示上一次错误",async status=>{const value=preparation([{...step("source_draft",status),lastError:{code:"EXECUTION_FAILED",message:"上一次生成错误"}}]);value.lastError={code:"EXECUTION_FAILED",message:"上一次生成错误"};mount(value);await ready();expect(screen.queryByText("上一次生成错误")).toBeNull();},120000);
 it.each(["failed","blocked","waiting_user","unknown_result"] as const)("fa %s保留当前真实错误",async status=>{mount(preparation([{...step("source_draft",status),lastError:{code:"EXECUTION_FAILED",message:"请先在设置中登录 Codex"}}]));await ready();expect(screen.getByText("请先在设置中登录 Codex")).toBeVisible();},120000);
 it("fa 抖音未登录错误不露出类名，显示重连指引",async()=>{mount(preparation([{...step("transcript","failed"),lastError:{code:"EXECUTION_FAILED",message:"DouyinNotLoggedInError: 未检测到抖音创作者中心登录态,请先扫码登录"}}]));await ready();expect(screen.queryByText(/DouyinNotLoggedInError/)).toBeNull();expect(screen.getByText(/设置 → 账户/)).toBeVisible();},120000);
 it("状态全部取checkpoint；雷达来源不能推导转写已完成",async()=>{const value=preparation([step("transcript","failed"),step("source_draft","candidate_ready"),step("brief","paused")]);const {container}=mount(value);await ready();expect(container.querySelector('[data-step="transcript"]')).toHaveAttribute("data-state","failed");expect(container.querySelector('[data-step="source_draft"]')).toHaveAttribute("data-state","candidate_ready");expect(container.querySelector('[data-step="brief"]')).toHaveAttribute("data-state","paused");expect(container.textContent).not.toContain("升级时已完成转写");},120000);
 it("渲染三个真实步骤，不按本地资料补造完成数",async()=>{const {container}=mount(preparation([step("transcript","not_required"),step("source_draft","done"),step("brief","waiting_user")]));await ready();expect(container.querySelectorAll("[data-step]")).toHaveLength(3);expect(screen.getByText(/已完成 2\/3 步/)).toBeVisible();},120000);
 it("进入项目或刷新不自动发送补全，sessionStorage没有执行标记",async()=>{mount();await ready();expect(controls.start).not.toHaveBeenCalled();expect(controls.openChat).not.toHaveBeenCalled();expect(sessionStorage.getItem("creatoros:project-pipeline:brief-fill:p-1")).toBeNull();},120000);
 it("点击补全才用POST登记真实brief步骤",async()=>{mount();await ready();fireEvent.click(screen.getByRole("button",{name:"让编导补全资料"}));await waitFor(()=>expect(controls.start).toHaveBeenCalledWith(expect.objectContaining({params:{projectId:"p-1"},body:{idempotencyKey:expect.any(String),requestedSteps:["brief"]}})));expect(controls.openChat).not.toHaveBeenCalled();},120000);
 it("失败步骤重试保留原父与checkpoint，由POST恢复，已完成步骤无重试",async()=>{mount(preparation([step("transcript","failed",["retry"]),step("source_draft","done")]));await ready();expect(screen.getAllByRole("button",{name:"重试本步骤"})).toHaveLength(1);fireEvent.click(screen.getByRole("button",{name:"重试本步骤"}));await waitFor(()=>expect(controls.start).toHaveBeenCalledWith(expect.objectContaining({body:expect.objectContaining({requestedSteps:["transcript"]})})));},120000);
 it("手工稿只在转写步骤，提交原父/来源/修订并读回服务端",async()=>{mount();await ready();fireEvent.click(screen.getByRole("button",{name:"手工补逐字稿"}));fireEvent.change(screen.getByRole("textbox",{name:"逐字稿"}),{target:{value:"用户提供的真实正文"}});fireEvent.click(screen.getByRole("button",{name:"提交逐字稿"}));await waitFor(()=>expect(controls.provide).toHaveBeenCalledWith({params:{projectId:"p-1"},query:undefined,body:{parentTaskId:"parent-real",referenceId:"ref-real",expectedSourceDigest:"source-real",expectedStepRevision:3,submissionKey:expect.any(String),inputMode:"paste",text:"用户提供的真实正文"}}));},120000);
 it("结果未知只核对原状态，不提供普通重试或重复资料补全",async()=>{mount(preparation([step("transcript","unknown_result",["check_result"]),step("brief","unknown_result",["check_result"])]));await ready();expect(screen.queryByRole("button",{name:"重试本步骤"})).toBeNull();expect(screen.queryByRole("button",{name:"让编导补全资料"})).toBeNull();fireEvent.click(screen.getAllByRole("button",{name:"核对原任务状态"})[0]!);await waitFor(()=>expect(controls.start).toHaveBeenCalledWith(expect.objectContaining({body:expect.objectContaining({requestedSteps:["transcript"]})})));expect(controls.get).toHaveBeenCalledTimes(1);},120000);
 it("读取失败保留已知原任务状态，不冒充未登记",async()=>{mount();await ready();controls.get.mockRejectedValueOnce(Error("临时读取失败"));fireEvent.click(screen.getByRole("button",{name:"重新读取状态"}));await screen.findByRole("alert");expect(screen.getByRole("alert")).toHaveTextContent("状态暂时无法读取");expect(screen.queryByText("未登记准备流程")).toBeNull();expect(document.querySelector('[data-step="transcript"]')).toHaveAttribute("data-state","failed");},120000);
 it("无记录显示真实空态，仅用户点启动才创建准备计划",async()=>{const value:ProjectPreparationResource={...preparation(),registration:"not_registered",preparationTaskId:null,revision:null,steps:[],candidates:[],availableActions:["start"]};mount(value);await ready();expect(screen.getByText("未登记准备流程")).toBeVisible();expect(controls.start).not.toHaveBeenCalled();fireEvent.click(screen.getByRole("button",{name:"启动项目准备"}));await waitFor(()=>expect(controls.start).toHaveBeenCalledTimes(1));},120000);
 it("候选先展开现值与建议值，用户采纳后才提交真实digest和baseline",async()=>{const value=preparation();value.candidates=[brief];mount(value,<ProjectPreparationCandidateCard projectId="p-1" candidate={brief} current={{targetAudience:"当前观众"}}/>);await ready();expect(controls.accept).not.toHaveBeenCalled();expect(screen.queryByText("建议观众")).toBeNull();fireEvent.click(screen.getByRole("button",{name:"展开候选"}));expect(screen.getByText("当前观众")).toBeVisible();expect(screen.getByText("建议观众")).toBeVisible();controls.accept.mockResolvedValue({id:"receipt-real",projectId:"p-1",candidateId:brief.id,sourceTaskId:brief.sourceTaskId,candidateSourceDigest:brief.sourceDigest,acceptedDigest:"accepted",projectVersion:1,artifactVersion:null,acceptedAt:"2026-10-21T00:00:00.000Z"});fireEvent.click(screen.getByRole("button",{name:"采纳资料补全"}));await waitFor(()=>expect(controls.accept).toHaveBeenCalledWith({params:{projectId:"p-1",candidateId:brief.id},query:undefined,body:{idempotencyKey:expect.any(String),candidateSourceDigest:brief.sourceDigest,baseline:brief.baseline}}));await screen.findByText(/已取得采纳回执/);},120000);
 it("单个GET未结束时不并发轮询，卸载后不写回",async()=>{let finish!:(value:ProjectPreparationResource)=>void;controls.get.mockImplementation(()=>new Promise(resolve=>{finish=resolve;}));const mounted=render(<ProjectPreparationProvider projectId="p-1" initialPreparation={preparation([step("transcript","running")])} pollIntervalMs={1}><ProjectPipelinePanel projectId="p-1"/></ProjectPreparationProvider>);await act(async()=>{await new Promise(resolve=>setTimeout(resolve,20));});expect(controls.get).toHaveBeenCalledTimes(1);mounted.unmount();await act(async()=>finish(preparation()));expect(controls.start).not.toHaveBeenCalled();},120000);
 it("切组后旧GET结果不能回写新scope",async()=>{const deferred:Array<(value:ProjectPreparationResource)=>void>=[];controls.get.mockImplementation(()=>new Promise(resolve=>deferred.push(resolve)));const element=<ProjectPreparationProvider projectId="p-1"><ProjectPipelinePanel projectId="p-1"/></ProjectPreparationProvider>;const mounted=render(element);controls.scope={groupId:"group-b",accountId:null};mounted.rerender(<ProjectPreparationProvider projectId="p-1"><ProjectPipelinePanel projectId="p-1"/></ProjectPreparationProvider>);await waitFor(()=>expect(deferred).toHaveLength(2));const old=preparation([step("transcript","done")]);await act(async()=>deferred[0]!(old));expect(document.querySelector('[data-step="transcript"]')).toBeNull();const fresh=preparation([step("transcript","waiting_user")]);await act(async()=>deferred[1]!(fresh));expect(document.querySelector('[data-step="transcript"]')).toHaveAttribute("data-state","waiting_user");},120000);
 it("初稿采用前有脏稿则拒绝，不能发送采纳请求",async()=>{const draft:ProjectPreparationCandidate={...brief,kind:"draft",content:{kind:"draft",text:"来源初稿候选"}};controls.capture.mockImplementation(()=>{throw Error("当前脚本有未保存修改");});mount(preparation(),<ProjectPreparationCandidateCard projectId="p-1" candidate={draft}/>);await ready();fireEvent.click(screen.getByRole("button",{name:"采纳初稿"}));await screen.findByText("当前脚本有未保存修改");expect(controls.accept).not.toHaveBeenCalled();expect(controls.refresh).not.toHaveBeenCalled();},120000);
 it("初稿采纳期间新增输入，保留已保存回执且不刷新覆盖",async()=>{const draft:ProjectPreparationCandidate={...brief,kind:"draft",content:{kind:"draft",text:"来源初稿候选"}};let clean=true;controls.capture.mockReturnValue(()=>clean);let finish!:(value:unknown)=>void;controls.accept.mockImplementation(()=>new Promise(resolve=>{finish=resolve;}));mount(preparation(),<ProjectPreparationCandidateCard projectId="p-1" candidate={draft}/>);await ready();fireEvent.click(screen.getByRole("button",{name:"采纳初稿"}));await waitFor(()=>expect(controls.accept).toHaveBeenCalledTimes(1));clean=false;await act(async()=>finish({id:"receipt-real",projectId:"p-1",candidateId:draft.id}));expect(screen.getByText(/期间的输入已保留/)).toBeVisible();expect(controls.refresh).not.toHaveBeenCalled();},120000);
 it("隐藏页不轮询，重新显示只观察原任务",async()=>{const hidden=vi.spyOn(document,"hidden","get").mockReturnValue(true);try{mount(preparation([step("transcript","running")]),undefined,2);await ready();await act(async()=>{await new Promise(resolve=>setTimeout(resolve,15));});expect(controls.get).toHaveBeenCalledTimes(1);controls.get.mockResolvedValue(preparation([step("transcript","done")]));hidden.mockReturnValue(false);fireEvent(document,new Event("visibilitychange"));await waitFor(()=>expect(controls.get).toHaveBeenCalledTimes(2));expect(controls.start).not.toHaveBeenCalled();}finally{hidden.mockRestore();}},120000);
});

it("去写稿保留用户主动的script锚点，挂载不主动滚动", async () => {
  const scroll = vi.spyOn(Element.prototype, "scrollIntoView");
  scroll.mockClear();
  try {
    const { container } = mount();
    await ready();
    expect(scroll).not.toHaveBeenCalled();
    const link = container.querySelector('a[href="#script"]');
    expect(link).toHaveTextContent("去写稿");
    expect(link).not.toHaveAttribute("autofocus");
  } finally {
    scroll.mockRestore();
  }
}, 120000);

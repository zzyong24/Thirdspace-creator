import * as React from "react";
import { ENDPOINTS } from "@creatoros/contract";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  getTask: vi.fn(), listAITasks: vi.fn(), createAITask: vi.fn(), listTaskResults: vi.fn(), listTaskSteps: vi.fn(),
  confirmTask: vi.fn(), lockPrediction: vi.fn(), listPredictions: vi.fn(), getLatestScriptReview: vi.fn(),
  getExecutionTask: vi.fn(), commandExecutionTasks: vi.fn(), confirmExecutionTask: vi.fn(), createExecutionTask: vi.fn(),
}));
vi.mock("@/lib/contract-client", () => ({ client: mocks }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }) }));
vi.mock("@/components/resources/asset-preview-url", () => ({ resolveAssetPreviewUrl: vi.fn(async () => null) }));
import { AdoptCandidateCard } from "./adopt-candidate-card";
import { TaskRuntimeActions } from "./task-runtime-actions";
import { ChatThesisCard } from "@/features/copilot/chat-thesis-card";
import { ChatScriptDraftCard } from "@/features/copilot/chat-script-draft-card";
import { ChatPublishPackageCard } from "@/features/copilot/chat-publish-package-card";
import { ChatGenerateCard } from "@/features/copilot/chat-generate-card";
import { ChatReviewReportCard } from "@/features/copilot/chat-review-report-card";
import { ChatDiagnosisCard } from "@/features/copilot/chat-result-cards";
import { ExecutionTaskCard } from "@/features/copilot/execution-task-card";

beforeEach(() => {
  vi.clearAllMocks(); vi.useFakeTimers();
  mocks.getTask.mockResolvedValue({ id: "original", status: "partial", runtimeStatus: "partial", executionTaskId: "original-execution" });
  mocks.listAITasks.mockResolvedValue([]);
  mocks.createAITask.mockResolvedValue({ id: "original" });
  mocks.listTaskResults.mockResolvedValue([]); mocks.listTaskSteps.mockResolvedValue([]);
});
afterEach(() => { cleanup(); vi.useRealTimers(); vi.unstubAllGlobals(); localStorage.clear(); });
const cards = [
  { name: "论点", component: () => <ChatThesisCard taskId="original" error={null}/> },
  { name: "整稿", component: () => <ChatScriptDraftCard taskId="original" projectId="project" error={null}/> },
  { name: "发布物料", component: () => <ChatPublishPackageCard taskId="original" projectId="project" error={null}/> },
  { name: "生图", component: () => <ChatGenerateCard taskId="original" kindOf="image" error={null}/> },
  { name: "审核", component: () => <ChatReviewReportCard taskId="original" projectId="project" error={null}/> },
];
it.each(cards)("$name读到partial停止等待，不读取或采用不存在的候选、不重发", async ({ component }) => {
  const { container } = render(component());
  await act(async () => { await vi.advanceTimersByTimeAsync(1200000); });
  expect(mocks.getTask).toHaveBeenCalledTimes(1);
  expect(container.querySelector('[data-slot="task-partial"]')?.textContent).toContain("部分完成");
  expect(container.querySelector('[data-slot="task-observation-paused"]')).toBeNull();
  expect(mocks.listTaskResults).not.toHaveBeenCalled();
  expect(mocks.getLatestScriptReview).not.toHaveBeenCalled();
  expect(mocks.confirmTask).not.toHaveBeenCalled(); expect(mocks.createAITask).not.toHaveBeenCalled();
});
it("通用采纳卡在原请求partial后停止，仅保留结果查看说明", async () => {
  const { container } = render(<AdoptCandidateCard title="实际节点" description="测试观察" startLabel="开始" runningLabel="正在生成"
    taskType="fixture.node" inputData={{projectId:"project"}} parseItems={() => []} renderItem={() => null}
    adoptLabel={() => "采用"} doneLabel={() => "已采用"}/>);
  fireEvent.click(screen.getByRole("button", { name: /开始/ }));
  await act(async () => { await vi.advanceTimersByTimeAsync(1200000); });
  expect(mocks.createAITask).toHaveBeenCalledTimes(1); expect(mocks.getTask).toHaveBeenCalledTimes(1);
  expect(container.querySelector('[data-slot="task-partial"]')?.textContent).toContain("部分完成");
  expect(mocks.listTaskResults).not.toHaveBeenCalled(); expect(mocks.confirmTask).not.toHaveBeenCalled();
});
it("盲预测原task partial不自动确认或锁定，按钮不能再次提交", async () => {
  const source={conversationId:"conversation-original",sourceMessageId:"message-original",toolCallId:"tool-original"};
  localStorage.setItem("creatoros:current-group","group-original");
  let started=false;
  const task={id:"original",userId:"user-original",projectId:"project",contentOutputId:"output",taskType:"calibration.diagnose",status:"partial",runtimeStatus:"partial",executionTaskId:"original-execution",inputData:{},modelKey:"fixture",idempotencyKey:"original-key",attemptId:"original-attempt",requestFingerprint:"sha256:"+"a".repeat(64),retryOfTaskId:null,requestedAt:"2026-10-17T00:00:00.000Z",startedAt:null,completedAt:null,errorMessage:null};
  const state=()=>({policyVersion:1,source,status:started?"running":"available",subjectId:"output",projectId:"project",baselineDigest:"original-digest",baseline:{artifactId:"original-script",versionId:"original-version",sha256:"original-hash"},diagnoseTaskId:started?"original":null,resultId:null,predictionId:null,task:started?task:null});
  const requests:Array<{id:string;input:unknown}>=[];
  vi.stubGlobal("fetch",vi.fn(async(_url:unknown,init:RequestInit)=>{
    const request=JSON.parse(String(init.body));requests.push(request);
    if(request.id===ENDPOINTS.startPredictionLock.id)started=true;
    else if(request.id!==ENDPOINTS.readPredictionLockSource.id)throw Error("不允许额外写入："+request.id);
    return Response.json({data:state(),meta:{requestId:"partial-fixture"}});
  }));
  const { container } = render(<ChatDiagnosisCard diagnosis={{ dimensions: [{ key: "来源", score: 2, reason: "已有真实依据", suggestion: "核对来源" }], verdict: "待核对", mainIssues: [], priorityFixes: [] }}
    blindPredict={{ outputId: "output", projectId: "project", projectTitle: "实际来源", source }}/>);
  await act(async()=>{await vi.advanceTimersByTimeAsync(0);});
  const lock=screen.getByRole("button", { name: "锁定为盲预测" });expect(lock).toBeEnabled();
  fireEvent.click(lock);
  await act(async () => { await vi.advanceTimersByTimeAsync(1200000); });
  expect(requests.filter(r=>r.id===ENDPOINTS.startPredictionLock.id)).toEqual([{id:ENDPOINTS.startPredictionLock.id,input:{params:{conversationId:source.conversationId},body:{sourceMessageId:source.sourceMessageId,toolCallId:source.toolCallId,expectedBaselineDigest:"original-digest",policyVersion:1}}}]);
  expect(requests.filter(r=>r.id===ENDPOINTS.readPredictionLockSource.id)).toHaveLength(2);
  expect(mocks.createAITask).not.toHaveBeenCalled();expect(mocks.getTask).not.toHaveBeenCalled();
  expect(container.querySelector('[data-slot="task-partial"]')?.textContent).toContain("部分完成");
  expect(mocks.confirmTask).not.toHaveBeenCalled(); expect(mocks.lockPrediction).not.toHaveBeenCalled();
  expect(lock).toBeDisabled();fireEvent.click(lock);expect(requests.filter(r=>r.id===ENDPOINTS.startPredictionLock.id)).toHaveLength(1);
});

it("通用采纳卡重新打开保留原partial，不自动新建任务", async () => {
  mocks.listAITasks.mockResolvedValue([{ id: "original", taskType: "fixture.node", projectId: "project", status: "partial" }]);
  const { container } = render(<AdoptCandidateCard title="实际节点" description="原结果保留" startLabel="开始" runningLabel="正在生成"
    taskType="fixture.node" inputData={{projectId:"project"}} parseItems={() => []} renderItem={() => null}
    adoptLabel={() => "采用"} doneLabel={() => "已采用"}/>);
  await act(async () => { await vi.advanceTimersByTimeAsync(1200000); });
  expect(container.querySelector('[data-slot="task-partial"]')?.textContent).toContain("部分完成");
  expect(mocks.createAITask).not.toHaveBeenCalled(); expect(mocks.confirmTask).not.toHaveBeenCalled();
  expect(mocks.getTask).not.toHaveBeenCalled();
});
it.each([false, true])("执行成果partial保留真实摘要（manifest=%s），无采纳或重试", async hasManifest => {
  mocks.getExecutionTask.mockResolvedValue({ id: "original", status: "partial", executionTaskId: "original-execution", runtimeStatus: "partial",
    execType: "agentic.research", spec: { taskType: "agentic.research", goal: "读取真实来源", inputs: [], params: {}, constraints: {} },
    manifest: hasManifest ? { taskType: "agentic.research", artifacts: [], proposals: [], summary: "实际完成的来源摘要" } : null,
    adoptedAssetIds: [], errorMessage: null });
  const { container } = render(<ExecutionTaskCard taskId="original"/>);
  await act(async () => { await vi.advanceTimersByTimeAsync(1200000); });
  expect(mocks.getExecutionTask).toHaveBeenCalledTimes(1);
  expect(container.querySelector('[data-slot="task-partial"]')?.textContent).toContain("部分完成");
  if (hasManifest) expect(container.textContent).toContain("实际完成的来源摘要");
  expect(container.querySelector('[data-slot="execution-task-retry"]')).toBeNull();
  expect(mocks.confirmExecutionTask).not.toHaveBeenCalled(); expect(mocks.createExecutionTask).not.toHaveBeenCalled();
  expect(mocks.commandExecutionTasks).not.toHaveBeenCalled();
});
it("partial运行时只可刷新，不出现重试、取消或继续写动作", () => {
  render(<TaskRuntimeActions task={{ status: "partial", executionTaskId: "original-execution", runtimeStatus: "partial" }} onUpdated={vi.fn()}/>);
  expect(screen.getAllByRole("button").map(button => button.textContent)).toEqual(["刷新状态"]);
  expect(mocks.commandExecutionTasks).not.toHaveBeenCalled();
});

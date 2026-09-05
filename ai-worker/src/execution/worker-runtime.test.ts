import { describe, expect, it, vi } from "vitest";
import { createExecutionWorker } from "./worker-runtime";
import type { WorkerMessage } from "@creatoros/contract/execution-worker";
const execution = {executionTaskId: "exec-1", attempt: 1, fenceToken: "lease-1"};

function fixture(generate = vi.fn(async (): Promise<{text:string;usage:unknown}> => ({text: "正文", usage: {inputTokens: 1, outputTokens: 2}})), rejectPort?: string, heartbeatMs?: number, reservationStatus = "reserved", recovery?: "requires_reconciliation") {
  const messages: WorkerMessage[] = [];
  let settled = false;
  let unknownUsage = false;
  let revision = 0;
  let savedMessages: Array<{role:"assistant";callId:string}> = [];
  const worker = createExecutionWorker({send(message) {
    messages.push(message);
    if(message.type === "call" && message.port === "settleCall") {
      const data=message.data as {status:string;usage?:Record<string,unknown>};
      settled=data.status==="settled";unknownUsage=settled && Object.keys(data.usage ?? {}).length===0;
    }
    if(message.type === "call" && message.port === "saveCheckpoint" && rejectPort!=="saveCheckpoint") {
      const input=message.data as {expectedRevision:number;expectedLedgerSequence:number;messages:typeof savedMessages};
      expect(input.expectedRevision).toBe(revision);expect(input.expectedLedgerSequence).toBe(1);
      savedMessages=input.messages;revision++;
    }
    if (message.type === "call") queueMicrotask(() => worker.receive({version: 1, type: "reply", requestId: message.requestId, ok: message.port !== rejectPort, data:
      message.port === "readCheckpoint" ? {revision,ledgerSequence:settled?1:0,messages:savedMessages,uncheckpointedReceipts:settled && !savedMessages.length?[{callId:"call-1",kind:"model",sequence:1,resultText:"正文"}]:[],recovery:recovery ?? (unknownUsage ? "requires_reconciliation" : settled && !savedMessages.length?"requires_replay":"ready")} :
      message.port === "saveCheckpoint" ? {revision} :
      message.port === "readTaskContext" ? {kind: "model.generate", prompt: "写正文", capability: "script", maxOutputTokens: 100, operationKey: "op-1"} :
      message.port === "resolveModelCredential" ? {apiFormat: "openai_chat", baseUrl: null, model: "test", token: "private"} : message.port === "reserveCall" ? {callId:"call-1",status:reservationStatus} : message.port === "startCall" ? {callId:"call-1",status:"started"} : {}}));
  }, generate, heartbeatMs});
  return {worker, messages, generate};
}
const run = {version: 1, type: "run", requestId: "run-1", execution, deadlineAt: Date.now() + 60000};
describe("独立 Worker 端口生命周期", () => {
  it("先取得上下文与预算许可，再生成、结算并提交", async () => {
    const {worker, messages, generate} = fixture();
    worker.receive(run);
    await vi.waitFor(() => expect(messages.some(x => x.type === "stopped")).toBe(true));
    expect(generate).toHaveBeenCalledTimes(1);
    expect(messages.filter(x => x.type === "call").map(x => x.port)).toEqual(["readTaskContext", "readCheckpoint", "reserveCall", "resolveModelCredential", "startCall", "settleCall", "readCheckpoint", "saveCheckpoint", "commitResult"]);
    expect(JSON.stringify(messages)).not.toContain("private");
    worker.close();
  });
  it("重复投递同一租约不产生第二次模型调用", async () => {
    const {worker, messages, generate} = fixture();
    worker.receive(run); worker.receive(run);
    await vi.waitFor(() => expect(messages.some(x => x.type === "stopped")).toBe(true));
    worker.receive(run);
    await new Promise(resolve => setTimeout(resolve, 10));
    expect(generate).toHaveBeenCalledTimes(1);
    worker.close();
  });
  it("过期任务不申请凭据或预算", async () => {
    const {worker, messages, generate} = fixture();
    worker.receive({...run, deadlineAt: Date.now()-1});
    await vi.waitFor(() => expect(messages.some(x => x.type === "stopped")).toBe(true));
    expect(messages.filter(x => x.type === "call")).toHaveLength(0);
    expect(generate).not.toHaveBeenCalled();
    worker.close();
  });
  it("预算拒绝不执行模型", async () => {
    const {worker, messages, generate} = fixture(undefined, "reserveCall");
    worker.receive(run);
    await vi.waitFor(() => expect(messages.some(x => x.type === "stopped")).toBe(true));
    expect(generate).not.toHaveBeenCalled();
    worker.close();
  });
  it("成功提交回执异常不再提交失败覆盖结果", async () => {
    const {worker, messages} = fixture(undefined, "commitResult");
    worker.receive(run);
    await vi.waitFor(() => expect(messages.some(x => x.type === "stopped")).toBe(true));
    expect(messages.filter(x => x.type === "call" && x.port === "commitResult")).toHaveLength(1);
    expect(messages.find(x => x.type === "stopped")).toMatchObject({reason: "unknown_result"});
    worker.close();
  });
  it("长调用续租失败会中断执行，结束后不再心跳", async () => {
    const messages: WorkerMessage[] = [];
    let observedSignal: AbortSignal | undefined;
    const worker = createExecutionWorker({heartbeatMs: 5,
      send(message) {
        messages.push(message);
        if (message.type === "call") queueMicrotask(() => worker.receive({version: 1, type: "reply", requestId: message.requestId,
          ok: message.port !== "heartbeat", data: message.port === "readCheckpoint" ? {revision:0,ledgerSequence:0,messages:[],uncheckpointedReceipts:[],recovery:"ready"} : message.port === "readTaskContext"
            ? {kind: "model.generate", prompt: "正文", capability: "script", maxOutputTokens: 100, operationKey: "op"}
            : message.port === "resolveModelCredential" ? {apiFormat: "openai_chat", baseUrl: null, model: "test", token: "test"} : message.port === "reserveCall" ? {callId:"call-1",status:"reserved"} : message.port === "startCall" ? {callId:"call-1",status:"started"} : {}}));
      },
      async generate(_input, _model, signal) {
        observedSignal = signal;
        return new Promise((_resolve, reject) => signal.addEventListener("abort", () => reject(new Error("aborted")), {once: true}));
      },
    });
    worker.receive(run);
    await vi.waitFor(() => expect(messages.some(x => x.type === "stopped")).toBe(true));
    expect(observedSignal?.aborted).toBe(true);
    expect(messages.filter(x => x.type === "call" && x.port === "commitResult")).toHaveLength(0);
    const count = messages.length;
    await new Promise(resolve => setTimeout(resolve, 20));
    expect(messages).toHaveLength(count);
    worker.close();
  });
  it("启动许可拒绝时供应商调用保持为零", async () => {
    const {worker,messages,generate}=fixture(undefined,"startCall");
    worker.receive(run);
    await vi.waitFor(()=>expect(messages.some(x=>x.type==="stopped")).toBe(true));
    expect(generate).not.toHaveBeenCalled();
    expect(messages.find(x=>x.type==="stopped")).toMatchObject({reason:"unknown_result"});
    worker.close();
  });
  it.each(["started","settled","unknown","rejected"])("恢复遇到%s调用不重放供应商", async status => {
    const {worker,messages,generate}=fixture(undefined,undefined,undefined,status);
    worker.receive(run);
    await vi.waitFor(()=>expect(messages.some(x=>x.type==="stopped")).toBe(true));
    expect(generate).not.toHaveBeenCalled();
    expect(messages.filter(x=>x.type==="call" && (x.port==="startCall" || x.port==="settleCall"))).toHaveLength(0);
    expect(messages.find(x=>x.type==="stopped")).toMatchObject({reason:"unknown_result"});
    worker.close();
  });

  it("检查点保存失败禁止提交候选或覆盖已结算结果",async()=>{
    const {worker,messages,generate}=fixture(undefined,"saveCheckpoint");
    worker.receive(run);
    await vi.waitFor(()=>expect(messages.some(x=>x.type==="stopped")).toBe(true));
    expect(generate).toHaveBeenCalledTimes(1);
    expect(messages.filter(x=>x.type==="call" && x.port==="commitResult")).toHaveLength(0);
    expect(messages.filter(x=>x.type==="call" && x.port==="settleCall")).toHaveLength(1);
    expect(messages.find(x=>x.type==="stopped")).toMatchObject({reason:"unknown_result"});
    worker.close();
  });
  it("检查点要求对账时不开始新的供应商调用",async()=>{
    const {worker,messages,generate}=fixture(undefined,undefined,undefined,"reserved","requires_reconciliation");
    worker.receive(run);
    await vi.waitFor(()=>expect(messages.some(x=>x.type==="stopped")).toBe(true));
    expect(generate).not.toHaveBeenCalled();
    expect(messages.filter(x=>x.type==="call" && ["reserveCall","startCall","saveCheckpoint"].includes(x.port))).toHaveLength(0);
    expect(messages.find(x=>x.type==="stopped")).toMatchObject({reason:"unknown_result"});
    worker.close();
  });

  it("有效正文缺少usage仍保存回执并提交，未知预算不触发新调用",async()=>{
    const generate=vi.fn(async()=>({text:"正文",usage:{}}));
    const {worker,messages}=fixture(generate);
    worker.receive(run);
    await vi.waitFor(()=>expect(messages.some(x=>x.type==="stopped")).toBe(true));
    expect(generate).toHaveBeenCalledTimes(1);
    expect(messages.filter(x=>x.type==="call" && x.port==="saveCheckpoint")).toHaveLength(1);
    expect(messages.find(x=>x.type==="call" && x.port==="commitResult")).toMatchObject({data:{outcome:"succeeded",text:"正文"}});
    expect(messages.find(x=>x.type==="stopped")).toMatchObject({reason:"completed"});
    worker.close();
  });

});

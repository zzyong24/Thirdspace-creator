import { describe, expect, it, vi } from "vitest";
import { createExecutionWorker } from "./worker-runtime";
import type { WorkerMessage } from "@creatoros/contract/execution-worker";
const execution = {executionTaskId: "exec-1", attempt: 1, fenceToken: "lease-1"};

function fixture(generate = vi.fn(async () => ({text: "正文", usage: {inputTokens: 1, outputTokens: 2}})), rejectPort?: string, heartbeatMs?: number) {
  const messages: WorkerMessage[] = [];
  const worker = createExecutionWorker({send(message) {
    messages.push(message);
    if (message.type === "call") queueMicrotask(() => worker.receive({version: 1, type: "reply", requestId: message.requestId, ok: message.port !== rejectPort, data:
      message.port === "readTaskContext" ? {kind: "model.generate", prompt: "写正文", capability: "script", maxOutputTokens: 100, operationKey: "op-1"} :
      message.port === "resolveModelCredential" ? {apiFormat: "openai_chat", baseUrl: null, model: "test", token: "private"} : {}}));
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
    expect(messages.filter(x => x.type === "call").map(x => x.port)).toEqual(["readTaskContext", "resolveModelCredential", "reserveCall", "settleCall", "commitResult"]);
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
          ok: message.port !== "heartbeat", data: message.port === "readTaskContext"
            ? {kind: "model.generate", prompt: "正文", capability: "script", maxOutputTokens: 100, operationKey: "op"}
            : message.port === "resolveModelCredential" ? {apiFormat: "openai_chat", baseUrl: null, model: "test", token: "test"} : {}}));
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
});

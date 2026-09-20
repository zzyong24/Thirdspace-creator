import { describe, expect, it, vi } from "vitest";
import type { WorkbenchCapability, WorkbenchHostCall, WorkbenchResult } from "@creatoros/contract/agent-workbench";
import { createWorkbenchGateway, toAgenticToolOutcome } from "./gateway";

const capability: WorkbenchCapability = {
  name: "files.read", schemaVersion: 1, description: "读取任务文件",
  inputSchema: { type: "object", properties: { path: { type: "string" } }, required: ["path"], additionalProperties: false },
  resultSchema: { type: "object" }, effects: ["read"], requiredCapabilities: ["task.files"], platforms: ["macos"],
};
const call: WorkbenchHostCall = {
  context: { userId: "u", accountId: "a", taskId: "t", attempt: 1, fenceToken: "f", leaseId: "l", operationId: "op" },
  invocation: { name: "files.read", schemaVersion: 1, input: { path: "a.txt" } },
};
const success: WorkbenchResult = { operationId: "op", status: "succeeded", content: [{ type: "text", text: "ok" }], artifactRefs: [], progressCursor: null };

describe("可信能力网关", () => {
  it("只发现当前平台与宿主授权能力；目录重名或无效 schema 拒绝装配", () => {
    const dispatch = vi.fn(async () => success);
    const gateway = createWorkbenchGateway([capability, { ...capability, name: "browser.observe", requiredCapabilities: ["browser"], platforms: ["windows"] }], { platform: "macos", capabilities: ["task.files"], dispatch });
    expect(gateway.catalog().map(item => item.name)).toEqual(["files.read"]);
    expect(() => createWorkbenchGateway([capability, capability], { platform: "macos", capabilities: ["task.files"], dispatch })).toThrow();
    expect(() => createWorkbenchGateway([{ ...capability, inputSchema: { type: "nonsense" } }], { platform: "macos", capabilities: ["task.files"], dispatch })).toThrow();
  });

  it("模型只能提供 invocation，宿主上下文原样传入；错误版本/参数/权限不触发调度", async () => {
    const dispatch = vi.fn(async () => success);
    const gateway = createWorkbenchGateway([capability], { platform: "macos", capabilities: ["task.files"], dispatch });
    await expect(gateway.invoke({ ...call, invocation: { ...call.invocation, input: { path: "a", accountId: "other" } } }, new AbortController().signal)).rejects.toThrow();
    await expect(gateway.invoke({ ...call, invocation: { ...call.invocation, schemaVersion: 2 } }, new AbortController().signal)).rejects.toThrow();
    await expect(gateway.invoke({ ...call, context: { ...call.context, attempt: 0 } }, new AbortController().signal)).rejects.toThrow();
    expect(dispatch).not.toHaveBeenCalled();
    expect(await gateway.invoke(call, new AbortController().signal)).toEqual(success);
    expect(dispatch).toHaveBeenCalledWith(call, expect.objectContaining({ signal: expect.any(AbortSignal) }));
  });

  it("进度经契约校验与限长后转发，取消阻止新调用", async () => {
    const progress = vi.fn();
    const dispatch = vi.fn(async (_call, options) => { options.onProgress({ ...success, status: "running", content: [{ type: "text", text: "进".repeat(10000) }] }); return success; });
    const gateway = createWorkbenchGateway([capability], { platform: "macos", capabilities: ["task.files"], dispatch });
    await gateway.invoke(call, new AbortController().signal, progress);
    expect(progress).toHaveBeenCalledOnce();
    expect(progress.mock.calls[0]![0].content[0].text.length).toBeLessThan(5000);
    const cancelled = new AbortController(); cancelled.abort();
    await expect(gateway.invoke(call, cancelled.signal)).rejects.toThrow();
    expect(dispatch).toHaveBeenCalledOnce();
  });

  it("进度投影损坏不反杀已经成功的最终回执", async () => {
    const dispatch = vi.fn(async (_call, options) => {
      options.onProgress({ ...success, operationId: "wrong", status: "running", content: [{ type: "text", text: "x" }] });
      return success;
    });
    const gateway = createWorkbenchGateway([capability], { platform: "macos", capabilities: ["task.files"], dispatch });
    expect(await gateway.invoke(call, new AbortController().signal, () => { throw Error("UI closed"); })).toEqual(success);
  });

  it("已发往宿主后丢回执归 unknown/reconcile；显式未派发失败保留 fix_input", async () => {
    const gateway = createWorkbenchGateway([capability], { platform: "macos", capabilities: ["task.files"], dispatch: async () => { throw Error("socket lost"); } });
    const unknown = await gateway.invoke(call, new AbortController().signal);
    expect(unknown).toMatchObject({ status: "unknown", error: { dispatched: true, retryable: false, nextAction: "reconcile" } });
    expect(toAgenticToolOutcome(unknown, capability)).toMatchObject({ sideEffect: "unknown", error: { code: "unknown_commit" } });
    const failure: WorkbenchResult = { operationId: "op", status: "failed", artifactRefs: [], progressCursor: null, error: { code: "BAD_INPUT", retryable: false, dispatched: false, nextAction: "fix_input" } };
    expect(toAgenticToolOutcome(failure, capability)).toMatchObject({ sideEffect: "none", error: { code: "invalid_input" } });
    const login: WorkbenchResult = { ...failure, error: { code: "LOGIN_REQUIRED", retryable: false, dispatched: false, nextAction: "login" } };
    expect(toAgenticToolOutcome(login, capability)).toMatchObject({ status: "blocked", error: { code: "needs_login" } });
  });

  it("宿主回执换了 operationId 不误认成功；在途取消交给原执行链处理", async () => {
    const mismatch = createWorkbenchGateway([capability], { platform: "macos", capabilities: ["task.files"], dispatch: async () => ({ ...success, operationId: "other" }) });
    expect(await mismatch.invoke(call, new AbortController().signal)).toMatchObject({ status: "unknown", error: { nextAction: "reconcile" } });
    const controller = new AbortController();
    const cancelled = createWorkbenchGateway([capability], { platform: "macos", capabilities: ["task.files"], dispatch: async () => { controller.abort(); throw Error("cancelled"); } });
    await expect(cancelled.invoke(call, controller.signal)).rejects.toThrow("cancelled");
  });
});

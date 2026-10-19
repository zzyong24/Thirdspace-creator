import { describe, expect, it, vi } from "vitest";
import { ENDPOINTS, type RequestContext } from "@creatoros/contract";
import { createExecutionTransport, EXECUTION_OP_IDS } from "./execution.transport";
import type { ExecutionService } from "./execution.service";
import type { PersistentTaskService } from "./persistent-task.service";

const ctx: RequestContext = { userId: "t217-synthetic-owner", accountId: null, groupId: "t217-synthetic-group", requestId: "t217", source: "user" };
const endpoint = ENDPOINTS.commandTranscribeExecutionTaskV1;
const body = { taskIds: ["t217-synthetic-original"], command: "retry" as const, idempotencyKey: "t217-synthetic-intent" };
function fixture() {
  const command = vi.fn(async () => []);
  const ordinary = vi.fn(() => ({} as ExecutionService));
  const persistent = vi.fn(() => ({ command } as unknown as PersistentTaskService));
  return { command, ordinary, persistent, transport: createExecutionTransport(ordinary, persistent) };
}
const request = (body: unknown) => ({ params: undefined, query: undefined, body });
describe("版本转写命令真实transport装配", () => {
  it.each(["pause", "resume", "cancel", "retry"] as const)("新 %s 精确parse且内部设置v1，不调用legacy factory", async command => {
    const f = fixture();
    expect(await f.transport.request(endpoint, request({ ...body, command }) as never, ctx)).toEqual({ data: { tasks: [] }, meta: { requestId: ctx.requestId } });
    expect(f.command).toHaveBeenCalledExactlyOnceWith(ctx, { ...body, command, receiptProtocol: "transcribe-command-v1" });
    expect(f.persistent).toHaveBeenCalledTimes(1); expect(f.ordinary).not.toHaveBeenCalled();
    expect(EXECUTION_OP_IDS).toContain(endpoint.id);
  });
  it.each([
    undefined, {}, { ...body, extra: true }, { ...body, receiptProtocol: "transcribe-command-v1" },
    { ...body, command: "restart" }, { ...body, idempotencyKey: "" },
    { ...body, taskIds: [] }, { ...body, taskIds: ["a", "b"] }, { ...body, taskIds: ["a", "a"] },
    { taskIds: ["a"], idempotencyKey: "key" }, { taskIds: ["a"], command: "retry" },
  ])("新输入不合规 %# 在任何命令factory之前拒绝", async value => {
    const f = fixture(); await expect(f.transport.request(endpoint, request(value) as never, ctx)).rejects.toMatchObject({ name: "ExecutionValidationError", code: "ValidationError", message: "转写控制请求无效，请保留原任务核对" });
    expect(f.ordinary).not.toHaveBeenCalled(); expect(f.persistent).not.toHaveBeenCalled(); expect(f.command).not.toHaveBeenCalled();
  });
  it("旧command仅交原三个字段，保原行为", async () => {
    const f = fixture(); const input = { ...body, taskIds: ["a", "b"] };
    expect(await f.transport.request(ENDPOINTS.commandExecutionTasks, request(input) as never, ctx)).toEqual({ data: { tasks: [] }, meta: { requestId: ctx.requestId } });
    expect(f.command).toHaveBeenCalledExactlyOnceWith(ctx, input);
    expect(f.ordinary).toHaveBeenCalledTimes(1); expect(f.persistent).toHaveBeenCalledTimes(1);
  });
  it("没有可信ctx在所有factory前拒绝", async () => {
    const f = fixture(); await expect(f.transport.request(endpoint, request(body) as never)).rejects.toMatchObject({ name: "AuthenticationError" });
    expect(f.ordinary).not.toHaveBeenCalled(); expect(f.persistent).not.toHaveBeenCalled(); expect(f.command).not.toHaveBeenCalled();
  });
  it("新版本未装配persistent明确拒绝，不fallback旧service", async () => {
    const ordinary = vi.fn(() => ({} as ExecutionService));
    await expect(createExecutionTransport(ordinary).request(endpoint, request(body) as never, ctx)).rejects.toMatchObject({ name: "UnsupportedOperationError" });
    expect(ordinary).not.toHaveBeenCalled();
  });
  it("未知operation不fallback成legacy command", async () => {
    const f = fixture(); await expect(f.transport.request({ ...endpoint, id: "execution.tasks.transcribeCommand.v999" }, request(body) as never, ctx)).rejects.toMatchObject({ name: "UnsupportedOperationError" });
    expect(f.persistent).not.toHaveBeenCalled(); expect(f.command).not.toHaveBeenCalled();
  });
});

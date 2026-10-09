import { describe, expect, it } from "vitest";
import { createClient, ENDPOINTS, getCliOperationPolicy, WORKSPACE_OPERATION_SCOPES, type Transport } from "../src";

const endpoint = ENDPOINTS.commandTranscribeExecutionTaskV1;
const legacy = ENDPOINTS.commandExecutionTasks;
const commands = ["pause", "resume", "cancel", "retry"] as const;
const body = { taskIds: ["t217-synthetic-original"], command: "retry" as const, idempotencyKey: "t217-synthetic-intent" };

describe("独立版本转写命令契约", () => {
  it.each(commands)("旧三个字段 %s 完整保留", command => {
    expect(legacy.body.parse({ ...body, command })).toEqual({ ...body, command });
    expect(legacy.body.parse({ ...body, command, taskIds: ["a", "b"] }).taskIds).toEqual(["a", "b"]);
  });
  it.each(commands)("新版本 %s 使用原三个字段", command => {
    expect(endpoint.body.parse({ ...body, command })).toEqual({ ...body, command });
  });
  it.each([
    { ...body, extra: true }, { ...body, receiptProtocol: "transcribe-command-v1" },
    { ...body, command: "restart" }, { ...body, idempotencyKey: "" },
    { ...body, taskIds: [] }, { ...body, taskIds: ["a", "b"] },
    { ...body, taskIds: ["a", "a"] }, { taskIds: ["a"], idempotencyKey: "key" },
    { taskIds: ["a"], command: "retry" }, { command: "retry", idempotencyKey: "key" },
  ])("新入口严格拒绝不完整/额外/多目标输入 %#", value => {
    expect(endpoint.body.safeParse(value).success).toBe(false);
  });
  it("新旧端点不同ID/path，响应同原DTO且不增加回执字段", () => {
    expect(endpoint.id).toBe("execution.tasks.transcribeCommand.v1");
    expect(endpoint.path).toBe("/execution/tasks/transcribe-commands/v1");
    expect(endpoint.method).toBe("POST");
    expect(legacy.id).toBe("execution.tasks.command");
    expect(legacy.path).toBe("/execution/tasks/command");
    for (const operation of [endpoint, legacy]) {
      expect(operation.response.parse({ tasks: [] })).toEqual({ tasks: [] });
      expect(operation.response.safeParse({ tasks: [], receipt: {} }).success).toBe(false);
      expect(operation.response.safeParse({ tasks: [], receiptProtocol: "transcribe-command-v1" }).success).toBe(false);
    }
  });
  it("版本仅在新operation，旧schema不新增公开receiptProtocol", () => {
    expect(Object.keys(legacy.body.shape).sort()).toEqual(["command", "idempotencyKey", "taskIds"]);
    expect(Object.keys(endpoint.body.shape).sort()).toEqual(["command", "idempotencyKey", "taskIds"]);
    expect(legacy.body.safeParse({ ...body, receiptProtocol: "transcribe-command-v1" }).success).toBe(false);
  });
  it("新scope和CLI穷尽归类沿原group/write；不冒CLI缓存恢复已实现", () => {
    expect(WORKSPACE_OPERATION_SCOPES[endpoint.id]).toBe("group");
    expect(getCliOperationPolicy(endpoint.id)).toEqual(getCliOperationPolicy(legacy.id));
  });
  it("真实contract client使用新operation ID，不切回旧command", async () => {
    const calls: Array<{ id: string; body: unknown }> = [];
    const transport: Transport = { async request(operation, request) {
      calls.push({ id: operation.id, body: request.body });
      return { data: { tasks: [] }, meta: { requestId: "t217-synthetic" } };
    } };
    const client = createClient({ commandTranscribeExecutionTaskV1: endpoint }, transport);
    expect(await client.commandTranscribeExecutionTaskV1({ params: undefined, query: undefined, body })).toEqual({ tasks: [] });
    expect(calls).toEqual([{ id: endpoint.id, body }]);
    // 捕获端口仅证明client交付，HTTP旧拒绝由独立冻结旧dispatch例证明。
  });
});

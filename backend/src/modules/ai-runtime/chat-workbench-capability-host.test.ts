import { describe, expect, it, vi } from "vitest";
import type { WorkbenchCapability, WorkbenchResult } from "@creatoros/contract/agent-workbench";
import { availableWorkbenchCapabilities, createChatWorkbenchCapabilityHost } from "./chat-workbench-capability-host";
import { defineWorkbenchChatTool } from "./chat-tool-gate";
import { prepareChatToolDefinitions } from "./chat-tool-definitions";

const descriptor: WorkbenchCapability = {
  name: "files.read", schemaVersion: 1, description: "读取任务文件",
  inputSchema: { type: "object", properties: { path: { type: "string" } }, required: ["path"], additionalProperties: false },
  resultSchema: { type: "object" }, effects: ["read"], requiredCapabilities: ["task.files"], platforms: ["macos"],
};
const result: WorkbenchResult = { status: "succeeded", operationId: "call-1", content: [{ type: "text", text: "ok" }], artifactRefs: [], progressCursor: null };
const noProgress = async () => undefined;

describe("通用能力宿主", () => {
  it("旧目录仅完整匹配可信descriptor，执行/结算/未知回调均使用选中旧版本",async()=>{
    const old:WorkbenchCapability={...descriptor,name:'artifact.copy',effects:['task_write']},current={...old,schemaVersion:2,description:'新版'};
    const dispatch=vi.fn(async()=>result),commitAndSettle=vi.fn(async(_call,input)=>input.outcome),markUnknown=vi.fn(async()=>{});
    const base={catalog:[current],legacyFrozenCapabilities:[old],platform:'macos' as const,capabilities:['task.files'],dispatch,commitAndSettle,markUnknown};
    const prepared=await prepareChatToolDefinitions({'artifact.copy':defineWorkbenchChatTool(old,async()=>result)},{workbenchCapabilities:[old]});
    const frozen={tools:prepared.definitions,workbenchCapabilities:[old]},owner={userId:'user',accountId:'account'} as never;
    const ref={executionTaskId:'task',attempt:2,fenceToken:'fence'},signal=new AbortController().signal;
    const lease=async()=>({userId:'user',accountId:'account',taskId:'task',attempt:2,fenceToken:'fence',leaseId:'lease'});
    const resolve=(host=base,input=frozen)=>createChatWorkbenchCapabilityHost(host,lease,noProgress)(owner,input as never,ref,signal);
    const tools=await resolve(),tool=tools['artifact.copy']!,scope={execution:ref,callId:'call-1',signal,claimId:'claim',toolCallId:'provider',toolName:'artifact_copy'};
    const outcome=await tool.execute!(owner,{path:'a.png'},scope as never);
    await tool.commitAndSettle!(owner,{path:'a.png'},outcome,scope as never);await tool.markUnknown!(owner,scope as never);
    for(const fn of [dispatch,commitAndSettle,markUnknown])expect(fn.mock.calls[0]![0]).toMatchObject({invocation:{schemaVersion:1}});
    expect(availableWorkbenchCapabilities(base)).toEqual([current]);
    for(const changed of [{...old,description:'篡改'},{...old,effects:['read']},{...old,requiredCapabilities:[]},{...old,schemaVersion:3}])
      await expect(resolve(base,{...frozen,workbenchCapabilities:[changed as WorkbenchCapability]})).rejects.toThrow('WORKBENCH_FROZEN_CAPABILITY_UNAVAILABLE');
    await expect(resolve({...base,capabilities:[]})).rejects.toThrow();
    await expect(resolve({...base,legacyFrozenCapabilities:[old,old]})).rejects.toThrow();
    await expect(resolve({...base,catalog:[old]})).rejects.toThrow();
    await expect(resolve(base,{...frozen,tools:prepared.definitions.map(tool=>({...tool,version:'wrong'}))})).rejects.toThrow('WORKBENCH_FROZEN_DEFINITION_MISMATCH');
  });
  it("仅冻结真实装配且当前平台获授权的能力", () => {
    const host = { catalog: [descriptor], platform: "macos" as const, capabilities: ["task.files"], dispatch: vi.fn(async () => result) };
    expect(availableWorkbenchCapabilities(host).map(item => item.name)).toEqual(["files.read"]);
    expect(availableWorkbenchCapabilities({ ...host, capabilities: [] })).toEqual([]);
    expect(availableWorkbenchCapabilities({ ...host, platform: "windows" as const })).toEqual([]);
  });

  it("从原租约构造身份上下文，只用已冻结的模型参数调度并结算", async () => {
    const dispatch = vi.fn(async () => result);
    const prepared = await prepareChatToolDefinitions({ "files.read": defineWorkbenchChatTool(descriptor, async () => result) }, { workbenchCapabilities: [descriptor] });
    const host = createChatWorkbenchCapabilityHost({ catalog: [descriptor], platform: "macos", capabilities: ["task.files"], dispatch },
      async () => ({ userId: "user", accountId: "account", taskId: "task", attempt: 2, fenceToken: "fence", leaseId: "lease" }),noProgress);
    const tools = await host({ userId: "user", accountId: "account" } as never, { tools: prepared.definitions, workbenchCapabilities: [descriptor] } as never, { executionTaskId: "task", attempt: 2, fenceToken: "fence" }, new AbortController().signal);
    expect(Object.keys(tools)).toEqual(["files.read"]);
    const output = await tools["files.read"]!.execute!({ userId: "user", accountId: "account" } as never, { path: "a.txt" }, { execution: { executionTaskId: "task", attempt: 2, fenceToken: "fence" }, callId: "call-1", signal: new AbortController().signal } as never);
    expect(dispatch).toHaveBeenCalledWith({ context: { userId: "user", accountId: "account", taskId: "task", attempt: 2, fenceToken: "fence", leaseId: "lease", operationId: "call-1" }, invocation: { name: "files.read", schemaVersion: 1, input: { path: "a.txt" } } }, expect.objectContaining({ signal: expect.any(AbortSignal) }));
    expect(output).toMatchObject({ status: "ok", sideEffect: "none", data: { workbench: result } });
  });

  it("宿主进度只做投影；断线与错误回执不自动重试", async () => {
    const progress = vi.fn();
    const dispatch = vi.fn(async (call, options) => {
      options.onProgress({ status: "running", operationId: call.context.operationId, content: [{ type: "text", text: "处理中" }], artifactRefs: [], progressCursor: "cursor" });
      throw Error("host disconnected");
    });
    const prepared = await prepareChatToolDefinitions({ "files.read": defineWorkbenchChatTool(descriptor, async () => result) }, { workbenchCapabilities: [descriptor] });
    const host = createChatWorkbenchCapabilityHost({ catalog: [descriptor], platform: "macos", capabilities: ["task.files"], dispatch, progress },
      async () => ({ userId: "user", accountId: "account", taskId: "task", attempt: 2, fenceToken: "fence", leaseId: "lease" }),noProgress);
    const tools = await host({ userId: "user", accountId: "account" } as never, { tools: prepared.definitions, workbenchCapabilities: [descriptor] } as never, { executionTaskId: "task", attempt: 2, fenceToken: "fence" }, new AbortController().signal);
    const output = await tools["files.read"]!.execute!({ userId: "user", accountId: "account" } as never, { path: "a.txt" }, { execution: { executionTaskId: "task", attempt: 2, fenceToken: "fence" }, callId: "call-1", signal: new AbortController().signal } as never);
    expect(progress).toHaveBeenCalledOnce();
    expect(dispatch).toHaveBeenCalledOnce();
    expect(output).toMatchObject({ sideEffect: "unknown", error: { code: "unknown_commit", retryable: false }, data: { workbench: { operationId: "call-1", status: "unknown" } } });
    const aborted = new AbortController(); aborted.abort();
    await expect(tools["files.read"]!.execute!({ userId: "user", accountId: "account" } as never, { path: "a.txt" }, { execution: { executionTaskId: "task", attempt: 2, fenceToken: "fence" }, callId: "call-2", signal: aborted.signal } as never)).rejects.toThrow();
    expect(dispatch).toHaveBeenCalledOnce();
  });

  it("真实执行回调等待持久写入，坏进度和写入故障不覆盖已成功回执", async () => {
    const persist = vi.fn(async () => { throw Error("subscriber storage unavailable"); });
    const progress = vi.fn(() => { throw Error("subscriber disconnected"); });
    const dispatch = vi.fn(async (call, options) => {
      options.onProgress({ status: "running", operationId: "forged", content: [{type:"text",text:"假进度"}], artifactRefs: [], progressCursor: null });
      options.onProgress({ status: "running", operationId: call.context.operationId, content: [{type:"text",text:"可信进度"}], artifactRefs: [], progressCursor: "one" });
      return result;
    });
    const prepared = await prepareChatToolDefinitions({ "files.read": defineWorkbenchChatTool(descriptor, async () => result) }, { workbenchCapabilities: [descriptor] });
    const host = createChatWorkbenchCapabilityHost({ catalog: [descriptor], platform: "macos", capabilities: ["task.files"], dispatch, progress },
      async () => ({ userId: "user", accountId: "account", taskId: "task", attempt: 2, fenceToken: "fence", leaseId: "lease" }),persist);
    const ref = { executionTaskId: "task", attempt: 2, fenceToken: "fence" };
    const tools = await host({ userId: "user", accountId: "account" } as never, { tools: prepared.definitions, workbenchCapabilities: [descriptor] } as never, ref, new AbortController().signal);
    const output = await tools["files.read"]!.execute!({ userId: "user", accountId: "account" } as never, { path: "a.txt" }, { execution: ref, callId: "call-1", signal: new AbortController().signal } as never);
    expect(persist).toHaveBeenCalledOnce();
    expect(persist).toHaveBeenCalledWith(ref,"call-1",expect.objectContaining({status:"running",progressCursor:"one"}));
    expect(progress).toHaveBeenCalledOnce();
    expect(output).toMatchObject({status:"ok",data:{workbench:result}});
  });

  it("目录版本漂移和结果 schema 损坏均不能冒充成功", async () => {
    const strict = { ...descriptor, resultSchema: { type: "object", properties: { confirmed: { type: "boolean" } }, required: ["confirmed"] } };
    const prepared = await prepareChatToolDefinitions({ "files.read": defineWorkbenchChatTool(strict, async () => result) }, { workbenchCapabilities: [strict] });
    const frozen = { tools: prepared.definitions, workbenchCapabilities: [strict] } as never;
    const ref = { executionTaskId: "task", attempt: 2, fenceToken: "fence" };
    const lease = async () => ({ userId: "user", accountId: "account", taskId: "task", attempt: 2, fenceToken: "fence", leaseId: "lease" });
    const changed = createChatWorkbenchCapabilityHost({ catalog: [descriptor], platform: "macos", capabilities: ["task.files"], dispatch: async () => result }, lease,noProgress);
    await expect(changed({ userId: "user", accountId: "account" } as never, frozen, ref, new AbortController().signal)).rejects.toThrow("WORKBENCH_FROZEN_CAPABILITY_UNAVAILABLE");
    const dispatch = vi.fn(async () => result);
    const host = createChatWorkbenchCapabilityHost({ catalog: [strict], platform: "macos", capabilities: ["task.files"], dispatch }, lease,noProgress);
    const tools = await host({ userId: "user", accountId: "account" } as never, frozen, ref, new AbortController().signal);
    const outcome = await tools["files.read"]!.execute!({ userId: "user", accountId: "account" } as never, { path: "a.txt" }, { execution: ref, callId: "call-1", signal: new AbortController().signal } as never);
    expect(dispatch).toHaveBeenCalledOnce();
    expect(outcome).toMatchObject({ sideEffect: "unknown", error: { code: "unknown_commit", retryable: false } });
  });
});

import { afterAll, beforeAll, expect, it, vi } from "vitest";
import { createDb, aiTasks, executionTasks, eq, type Db } from "@creatoros/backend";
import { createAgenticBusinessExecutionService, type AgenticBusinessExecutionDeps } from "./agentic-business-execution.service";
const ctx = { userId: "agent-user", accountId: "agent-account", requestId: "test", source: "user" as const };
const stamp = "2026-09-05T00:00:00.000Z";
const spec = { taskType: "agentic.material", goal: "整理真实素材", inputs: [{ assetId: "asset", mountAs: "input.txt" }], params: {}, constraints: { timeoutSec: 600, network: "deny", maxOutputMB: 512 } };
const definition: NonNullable<AgenticBusinessExecutionDeps["definitions"]["exec.agentic.material"]> = { taskType: "agentic.material", systemPrompt: "依据真实素材", capability: "material", tools: [{ name: "material.search", version: "1", label: "搜索", description: "素材搜索", parameters: { type: "object" }, effect: "none" }] };
let db: Db; let close: () => Promise<void>;
beforeAll(async () => { const f = await createDb(); db = f.db; close = () => f.client.close(); });
afterAll(async () => close?.());
async function add(id: string, patch: Partial<typeof aiTasks.$inferInsert> = {}) {
  await db.insert(aiTasks).values({ id, userId: ctx.userId, accountId: ctx.accountId, taskType: "exec.agentic.material", status: "queued", requestedAt: stamp, idempotencyKey: id, requestFingerprint: `sha256:${"a".repeat(64)}`, inputData: { spec }, runtimeData: { modelAuthority: "preserved" }, ...patch });
}
function fixture(patch: Partial<AgenticBusinessExecutionDeps> = {}) {
  const validateInputs = vi.fn(async () => {});
  return { validateInputs, service: createAgenticBusinessExecutionService(db, { definitions: { "exec.agentic.material": definition }, budget: { maxCalls: 12, maxTokens: 10000, deadlineMs: 600000 }, maxOutputTokens: 200, now: () => stamp, validateInputs, ...patch }) };
}
it("只支持注入类型，验证真实inputs并冻结公共goal、调低预算与dryRun，不采纳用户checkpoint", async () => {
  await add("bounded", { inputData: { spec: { ...spec, params: { maxSteps: 4, maxTokens: 3000, dryRun: true, checkpoint: { stepsUsed: 0, tokensUsed: 0 } }, constraints: { ...spec.constraints, timeoutSec: 30 } } } });
  const f = fixture(); expect(f.service.supports("exec.agentic.material")).toBe(true); expect(f.service.supports("exec.agentic.research")).toBe(false);
  const mapped = await f.service.prepare(ctx, "bounded");
  expect(f.validateInputs).toHaveBeenCalledWith(ctx, spec.inputs);
  const [row] = await db.select().from(executionTasks).where(eq(executionTasks.id, mapped.executionTaskId));
  expect(row?.executionBudget).toEqual({ maxCalls: 4, maxTokens: 3000, deadlineMs: 30000 });
  expect(row?.deadlineAt).toBe("2026-09-05T00:00:30.000Z");
  expect(row?.payload).toMatchObject({ modelInput: { kind: "agentic.run", goal: spec.goal, dryRun: true, systemPrompt: definition.systemPrompt, tools: definition.tools } });
  expect(JSON.stringify(row?.payload)).not.toContain("checkpoint");
  const [business] = await db.select().from(aiTasks).where(eq(aiTasks.id, "bounded")); expect(business?.runtimeData).toEqual({ modelAuthority: "preserved" });
});
it("放大参数仍被上限裁定，映射重放保留历史定义及预算，修改公共请求拒绝", async () => {
  const initialSpec = { ...spec, params: { maxSteps: 1000, maxTokens: 1000000 } };
  await add("replay", { inputData: { spec: initialSpec } });
  const first = await fixture().service.prepare(ctx, "replay");
  const [before] = await db.select().from(executionTasks).where(eq(executionTasks.id, first.executionTaskId));
  expect(before?.executionBudget).toEqual({ maxCalls: 12, maxTokens: 10000, deadlineMs: 600000 });
  const changed = fixture({ definitions: { "exec.agentic.material": { ...definition, systemPrompt: "新配置", tools: definition.tools.map(tool => ({ ...tool, version: "2" })) } }, budget: { maxCalls: 20, maxTokens: 90000, deadlineMs: 900000 } });
  expect(await changed.service.prepare(ctx, "replay")).toEqual(first); expect(changed.validateInputs).not.toHaveBeenCalled();
  const [after] = await db.select().from(executionTasks).where(eq(executionTasks.id, first.executionTaskId)); expect(after).toEqual(before);
  await db.update(aiTasks).set({ inputData: { spec: { ...initialSpec, params: { ...initialSpec.params, checkpoint: { tokensUsed: 0 } } } } }).where(eq(aiTasks.id, "replay"));
  await expect(changed.service.prepare(ctx, "replay")).rejects.toThrow("MISMATCH");
});
it("非法输入归属、网络约束、类型和旧执行状态在转交前拒绝", async () => {
  await add("ownership");
  await expect(fixture().service.prepare({ ...ctx, accountId: "other" }, "ownership")).rejects.toThrow();
  await expect(fixture({ validateInputs: async () => { throw new Error("素材不归属当前用户"); } }).service.prepare(ctx, "ownership")).rejects.toThrow("不归属");
  for (const [id, patch] of [
    ["network", { inputData: { spec: { ...spec, constraints: { ...spec.constraints, network: "allowlist" } } } }],
    ["type", { inputData: { spec: { ...spec, taskType: "agentic.research" } } }],
    ["lease", { leaseToken: "old" }], ["started", { modelCallStartedAt: stamp }],
  ] as Array<[string, Partial<typeof aiTasks.$inferInsert>]>) {
    await add(id, patch); await expect(fixture().service.prepare(ctx, id)).rejects.toThrow();
    const [task] = await db.select().from(aiTasks).where(eq(aiTasks.id, id)); expect(task?.executionTaskId).toBeNull();
  }
});
it("启动扫描只恢复支持且无旧租约的queued任务，失败单项继续", async () => {
  await add("scan-ok"); await add("scan-fail", { inputData: { spec: { ...spec, goal: "" } } });
  await add("scan-lease", { leaseOwner: "old" }); await add("scan-other", { taskType: "exec.agentic.research" });
  const failures: string[] = [];
  await fixture().service.recoverQueued(async (_ctx, id) => { failures.push(id); await db.update(aiTasks).set({ status: "failed" }).where(eq(aiTasks.id, id)); });
  expect(failures).toContain("scan-fail");
  for (const id of ["scan-ok", "scan-lease", "scan-other"]) {
    const [row] = await db.select().from(aiTasks).where(eq(aiTasks.id, id));
    if (id === "scan-ok") expect(row?.executionTaskId).not.toBeNull(); else expect(row?.executionTaskId).toBeNull();
  }
});

it.each([
  { name: "fraction", maxSteps: 4.8, maxTokens: 3000.9, dryRun: true, calls: 4, tokens: 3000, expectedDryRun: true },
  { name: "invalid", maxSteps: "4", maxTokens: -1, dryRun: "true", calls: 12, tokens: 10000, expectedDryRun: false },
  { name: "sub-one", maxSteps: 0.4, maxTokens: 0, dryRun: 1, calls: 12, tokens: 10000, expectedDryRun: false },
])("兼容旧参数规范化：$name，不因generic params变化阻断合法任务", async ({ name, maxSteps, maxTokens, dryRun, calls, tokens, expectedDryRun }) => {
  await add(`compat-${name}`, { inputData: { spec: { ...spec, params: { maxSteps, maxTokens, dryRun } } } });
  const mapped = await fixture().service.prepare(ctx, `compat-${name}`);
  const [execution] = await db.select().from(executionTasks).where(eq(executionTasks.id, mapped.executionTaskId));
  expect(execution?.executionBudget).toEqual({ maxCalls: calls, maxTokens: tokens, deadlineMs: 600000 });
  expect(execution?.payload).toMatchObject({ modelInput: { dryRun: expectedDryRun } });
});

it("网页操作授权只从用户任务冻结，重放不能由新配置放大", async()=>{
  const research={...spec,taskType:"agentic.research",params:{browserAuthorization:{allowedDomains:["EXAMPLE.COM"],allowInteraction:true}}};
  const researchDefinition={...definition,taskType:"agentic.research" as const};
  const f=fixture({definitions:{"exec.agentic.research":researchDefinition}});
  await add("browser-scope",{taskType:"exec.agentic.research",inputData:{spec:research}});
  const first=await f.service.prepare(ctx,"browser-scope");
  const [before]=await db.select().from(executionTasks).where(eq(executionTasks.id,first.executionTaskId));
  expect(before?.payload).toMatchObject({modelInput:{browserAuthorization:{source:"user_task",allowedDomains:["example.com"],allowInteraction:true}}});
  expect(await f.service.prepare(ctx,"browser-scope")).toEqual(first);
  const [after]=await db.select().from(executionTasks).where(eq(executionTasks.id,first.executionTaskId));
  expect(after).toEqual(before);
  await db.update(aiTasks).set({inputData:{spec:{...research,params:{browserAuthorization:{allowedDomains:["evil.example"],allowInteraction:true}}}}}).where(eq(aiTasks.id,"browser-scope"));
  await expect(f.service.prepare(ctx,"browser-scope")).rejects.toThrow("MISMATCH");
});
it("无显式网页授权不产生默认授权，非法授权在转交前拒绝",async()=>{
  const f=fixture({definitions:{"exec.agentic.research":{...definition,taskType:"agentic.research"}}});
  await add("browser-none",{taskType:"exec.agentic.research",inputData:{spec:{...spec,taskType:"agentic.research"}}});
  const mapped=await f.service.prepare(ctx,"browser-none");
  const [row]=await db.select().from(executionTasks).where(eq(executionTasks.id,mapped.executionTaskId));
  expect((row?.payload as {modelInput:Record<string,unknown>}).modelInput.browserAuthorization).toBeUndefined();
  await add("browser-invalid",{taskType:"exec.agentic.research",inputData:{spec:{...spec,taskType:"agentic.research",params:{browserAuthorization:{allowedDomains:["127.0.0.1"],allowInteraction:true}}}}});
  await expect(f.service.prepare(ctx,"browser-invalid")).rejects.toThrow();
  expect((await db.select().from(aiTasks).where(eq(aiTasks.id,"browser-invalid")))[0]!.executionTaskId).toBeNull();
});

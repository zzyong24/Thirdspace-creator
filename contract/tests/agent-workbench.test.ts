import { describe, expect, it } from "vitest";
import {
  workbenchCapabilitySchema,
  workbenchInvocationSchema,
  workbenchHostCallSchema,
  workbenchResultSchema,
  workbenchPlanSchema,
  workbenchFileRequestSchema,
  workbenchCommandRequestSchema,
  workbenchBrowserLeaseSchema,
  workbenchArtifactSchema,
  workbenchArtifactRegisterRequestSchema,
  workbenchArtifactReadRequestSchema,
  workbenchArtifactVersionsRequestSchema,
  workbenchArtifactCopyRequestSchema,
} from "../src/internal/agent-workbench";

describe("T-1004 共享能力协议", () => {
  it("工具目录声明版本、影响、平台及输入输出形状", () => {
    const descriptor = {
      name: "files.read", schemaVersion: 1, description: "读取任务文件",
      inputSchema: { type: "object" }, resultSchema: { type: "object" },
      effects: ["read"], requiredCapabilities: ["task.files"], platforms: ["macos", "windows"],
    };
    expect(workbenchCapabilitySchema.parse(descriptor)).toEqual(descriptor);
    expect(workbenchCapabilitySchema.safeParse({ ...descriptor, schemaVersion: 0 }).success).toBe(false);
    expect(workbenchCapabilitySchema.safeParse({ ...descriptor, effects: ["unknown"] }).success).toBe(false);
  });

  it("模型调用体不能自报账号、任务、租约或费用", () => {
    const call = { name: "files.read", schemaVersion: 1, input: { path: "report.md" } };
    expect(workbenchInvocationSchema.parse(call)).toEqual(call);
    for (const field of ["accountId", "taskId", "attempt", "leaseId", "cost"])
      expect(workbenchInvocationSchema.safeParse({ ...call, [field]: "forged" }).success).toBe(false);
    const trusted = { userId: "user", accountId: "account", taskId: "task", attempt: 1, fenceToken: "fence", leaseId: "lease", operationId: "operation" };
    expect(workbenchHostCallSchema.safeParse({context: trusted, invocation: call}).success).toBe(true);
    expect(workbenchHostCallSchema.safeParse({context: {...trusted, attempt: 0}, invocation: call}).success).toBe(false);
  });

  it("结果区分执行前失败与已派发但回执未知", () => {
    const base = { operationId: "op-1", artifactRefs: [], progressCursor: null };
    expect(workbenchResultSchema.safeParse({ ...base, status: "succeeded", content: [{ type: "text", text: "ok" }] }).success).toBe(true);
    expect(workbenchResultSchema.safeParse({ ...base, status: "failed", error: { code: "BAD_INPUT", retryable: false, dispatched: false, nextAction: "fix_input" } }).success).toBe(true);
    expect(workbenchResultSchema.safeParse({ ...base, status: "unknown", error: { code: "RECEIPT_UNKNOWN", retryable: false, dispatched: true, nextAction: "reconcile" } }).success).toBe(true);
    expect(workbenchResultSchema.safeParse({ ...base, status: "unknown", error: { code: "RECEIPT_UNKNOWN", retryable: true, dispatched: false, nextAction: "retry" } }).success).toBe(false);
    expect(workbenchResultSchema.safeParse({ ...base, status: "failed", error: { code: "NO_COMMIT", retryable: false, dispatched: true, confirmedNoCommit: true, nextAction: "retry" } }).success).toBe(true);
    expect(workbenchResultSchema.safeParse({ ...base, status: "failed", error: { code: "UNPROVEN", retryable: false, dispatched: true, confirmedNoCommit: false, nextAction: "retry" } }).success).toBe(false);
  });

  it("计划步骤引用真实操作与产物且版本正整数", () => {
    const plan = { planRevision: 1, steps: [{ stepId: "s1", title: "读资料", dependsOn: [], status: "pending", operationRefs: [], artifactRefs: [] }] };
    expect(workbenchPlanSchema.safeParse(plan).success).toBe(true);
    expect(workbenchPlanSchema.safeParse({ ...plan, planRevision: 0 }).success).toBe(false);
    expect(workbenchPlanSchema.safeParse({ ...plan, steps: [{ ...plan.steps[0], dependsOn: ["s1"] }] }).success).toBe(false);
  });

  it("文件、命令、浏览器与产物契约不接受额外权限字段", () => {
    expect(workbenchFileRequestSchema.safeParse({ operation: "edit", path: "报告/图表.html", content: "ok", expectedVersion: 1 }).success).toBe(true);
    expect(workbenchFileRequestSchema.safeParse({ operation: "write", path: "../secret", content: "x" }).success).toBe(false);
    expect(workbenchCommandRequestSchema.safeParse({ argv: ["python", "chart.py"], cwd: ".", runtimeId: "bundled-python", timeoutMs: 30000 }).success).toBe(true);
    expect(workbenchCommandRequestSchema.safeParse({ argv: ["sh", "-c", "pwd"], cwd: ".", runtimeId: "system", timeoutMs: 30000 }).success).toBe(false);
    const lease = { leaseId: "lease", accountId: "account", taskId: "task", laneId: "lane", epoch: 1, profileKey: "profile", mode: "anonymous" };
    expect(workbenchBrowserLeaseSchema.safeParse(lease).success).toBe(true);
    expect(workbenchBrowserLeaseSchema.safeParse({ ...lease, epoch: 0 }).success).toBe(false);
    const artifact = { artifactId: "artifact", version: 1, mime: "text/html", size: 12, hash: "a".repeat(64), relativePath: "report.html", taskId: "task", provenance: ["op-1"] };
    expect(workbenchArtifactSchema.safeParse(artifact).success).toBe(true);
    expect(workbenchArtifactSchema.safeParse({ ...artifact, relativePath: "../report.html" }).success).toBe(false);
  });

  it("产物登记只接受任务相对路径，读取范围不得越界或自报归属", () => {
    expect(workbenchArtifactRegisterRequestSchema.safeParse({path:"报告/分析.html",mime:"text/html"}).success).toBe(true);
    expect(workbenchArtifactRegisterRequestSchema.safeParse({path:"../secret.html",mime:"text/html"}).success).toBe(false);
    expect(workbenchArtifactRegisterRequestSchema.safeParse({path:"report.html",mime:"text/html",accountId:"other"}).success).toBe(false);
    expect(workbenchArtifactReadRequestSchema.safeParse({artifactId:"wa-123",version:1,offset:0,limit:128_000}).success).toBe(true);
    expect(workbenchArtifactReadRequestSchema.safeParse({artifactId:"wa-123",version:1,offset:0,limit:128_001}).success).toBe(false);
    expect(workbenchArtifactRegisterRequestSchema.safeParse({path:"报告/分析.html",mime:"text/html",artifactId:"wa-123",expectedVersion:1,baseArtifactRef:{artifactId:"wa-123",version:1}}).success).toBe(true);
    expect(workbenchArtifactRegisterRequestSchema.safeParse({path:"报告/分析.html",mime:"text/html",baseArtifactRef:{artifactId:"other",version:1}}).success).toBe(false);
    expect(workbenchArtifactVersionsRequestSchema.safeParse({limit:50}).success).toBe(true);
    expect(workbenchArtifactVersionsRequestSchema.safeParse({limit:51}).success).toBe(false);
    expect(workbenchArtifactCopyRequestSchema.safeParse({sourceArtifactId:"wa-123",sourceVersion:1,targetPath:"报告/chart.png"}).success).toBe(true);
    expect(workbenchArtifactCopyRequestSchema.safeParse({sourceArtifactId:"wa-123",sourceVersion:1,targetPath:"../chart.png"}).success).toBe(false);
  });
});

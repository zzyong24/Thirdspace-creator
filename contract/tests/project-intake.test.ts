import { describe, expect, it } from "vitest";
import { z } from "zod";
import * as projectResources from "../src/resources/projects";
import { projectsOperations } from "../src/operations/projects";
import { executionTaskKindV2 } from "../src/resources/intelligence";
import { assistantActionInputSchema } from "../src/resources/assistant-system";
import { ENDPOINTS } from "../src/endpoints";
import { getCliOperationPolicy } from "../src/cli-policy";

// 用运行时断言记录缺失合同的 RED；实现后仍检查正式 registry 中的同一 schema。
const resources = projectResources as unknown as Record<string, z.ZodType>;
const operations = projectsOperations as unknown as Record<string, {
  id: string; method: string; path: string; body?: z.ZodType; response: z.ZodType;
}>;
const stamp = "2026-10-20T15:00:00.000Z";
const project = {
  id: "project-1", userId: "user-1", title: "项目", brief: "", contentCategory: "",
  source: "radar", creationMode: "guided", status: "active", currentStage: "script",
  progressPct: 0, starred: false, startedAt: stamp, targetCompletedAt: null,
  completedAt: null, archivedAt: null, createdAt: stamp, updatedAt: stamp,
};
const rawReference = {
  id: "reference-1", projectId: "project-1", sourceKey: "item:item-1:snapshot-1",
  sourceKind: "intelligence_item", itemId: "item-1", snapshotId: "snapshot-1",
  url: null, bodyAvailable: false, sourceDigest: null, transcriptHash: null,
  createdAt: stamp, updatedAt: stamp,
};
const transcriptRequest = {
  parentTaskId: "parent-1", referenceId: "reference-1", expectedSourceDigest: "source-digest",
  expectedStepRevision: 0, submissionKey: "submission-1", inputMode: "paste", text: "真实逐字稿",
};

describe("T-1382 项目统一入口合同", () => {
  it.each(["manual", "topic", "radar", "imported", "assistant", "quick_create"])(
    "资源保留真实来源 %s", (source) => {
      expect(projectResources.projectSource.parse(source)).toBe(source);
    },
  );

  it("公开 create 使用独立原三值白名单并接受可选动作键", () => {
    for (const source of ["manual", "topic", "imported"]) {
      expect(operations.createProject.body!.safeParse({ title: "标题", source }).success).toBe(true);
    }
    for (const source of ["radar", "assistant", "quick_create"]) {
      expect(operations.createProject.body!.safeParse({ title: "标题", source }).success).toBe(false);
    }
    expect(operations.createProject.body!.parse({
      title: "标题", idempotencyKey: "create-action-1",
    })).toMatchObject({ idempotencyKey: "create-action-1" });
  });

  it.each([
    { source: "manual", title: "手动", idempotencyKey: "manual-1" },
    { source: "quick_create", title: "快速", sourceItemId: "item-1", idempotencyKey: "quick-1" },
    { source: "topic", candidateId: "candidate-1" },
    { source: "radar", itemId: "item-1", positioningVersionId: "positioning-1", idempotencyKey: "radar-1" },
  ])("ensure 接受受控用户入口 $source", (input) => {
    expect(operations.ensureProject.body!.parse(input)).toMatchObject(input);
  });

  it("ensure 拒绝伪造可信来源、完成状态、跨来源字段及缺动作键", () => {
    const body = operations.ensureProject.body!;
    for (const input of [
      { source: "imported", title: "伪导入", idempotencyKey: "key-1" },
      { source: "assistant", title: "伪采纳", idempotencyKey: "key-1" },
      { source: "manual", title: "无动作键" },
      { source: "radar", itemId: "item-1" },
      { source: "topic", candidateId: "candidate-1", title: "绕过真实候选" },
      ...["userId", "accountId", "groupId", "trusted", "lease", "completedAt", "platformRef"].map(
        (field) => ({ source: "manual", title: "标题", idempotencyKey: "key-1", [field]: "forged" }),
      ),
    ]) expect(body.safeParse(input).success).toBe(false);
  });

  it("ensure 只返回真实已提交项目及可空准备任务，不接受旧占位响应", () => {
    const response = operations.ensureProject.response;
    expect(response.parse({
      project, preparationTaskId: null, sourceReferences: [rawReference], reused: false,
    })).toMatchObject({ project: { id: "project-1", source: "radar" }, preparationTaskId: null });
    expect(response.safeParse({
      project: null, preparationTaskId: null, sourceReferences: [], reused: false,
    }).success).toBe(false);
    expect(response.safeParse({ status: "legacy_pending", projectId: "" }).success).toBe(false);
  });

  it("原始来源分别验证真实素材快照或平台作品，不索取虚构 transform/hash", () => {
    const schema = resources.projectSourceReference;
    expect(schema.parse(rawReference)).toEqual(rawReference);
    const { itemId: _item, snapshotId: _snapshot, ...base } = rawReference;
    expect(schema.safeParse(base).success).toBe(false);
    expect(schema.parse({
      ...base, sourceKind: "platform_work", accountId: "account-1", platform: "douyin", externalId: "work-1",
    })).toMatchObject({ sourceKind: "platform_work", externalId: "work-1" });
    expect(schema.safeParse({ ...rawReference, transformId: "invented" }).success).toBe(false);
  });

  it("旧项目 preparation GET 有明确空态，不能以空 taskId 表示运行", () => {
    const response = operations.getProjectPreparation.response;
    const empty = {
      projectId: "project-1", origin: "manual", registration: "not_registered",
      preparationTaskId: null, revision: null, sourceReferences: [], steps: [], candidates: [],
      availableActions: ["start"], lastError: null,
    };
    expect(response.parse(empty)).toEqual(empty);
    expect(response.safeParse({ ...empty, registration: "registered" }).success).toBe(false);
  });

  it("preparation start 必须有动作键和明确步骤，不接受预算或完成状态覆盖", () => {
    const body = operations.startProjectPreparation.body!;
    const valid = { idempotencyKey: "start-1", requestedSteps: ["transcript", "source_draft"] };
    expect(body.parse(valid)).toEqual(valid);
    for (const input of [
      { idempotencyKey: "start-1", requestedSteps: [] },
      { requestedSteps: ["transcript"] },
      { ...valid, requestedSteps: ["transcript", "transcript"] },
      { ...valid, deadlineAt: stamp },
      { ...valid, status: "succeeded" },
    ]) expect(body.safeParse(input).success).toBe(false);
  });

  it("手工逐字稿要求原任务、来源 digest、步骤版本与提交键", () => {
    const body = operations.provideProjectPreparationTranscript.body!;
    expect(body.parse(transcriptRequest)).toEqual(transcriptRequest);
    for (const key of ["parentTaskId", "referenceId", "expectedSourceDigest", "expectedStepRevision", "submissionKey"]) {
      const input = { ...transcriptRequest } as Record<string, unknown>;
      delete input[key];
      expect(body.safeParse(input).success).toBe(false);
    }
    expect(body.safeParse({ ...transcriptRequest, expectedStepRevision: -1 }).success).toBe(false);
  });

  it("手工稿文件只接受受控素材文件引用，拒绝任意本机路径和存储键", () => {
    const { text: _text, ...base } = transcriptRequest;
    const body = operations.provideProjectPreparationTranscript.body!;
    const fileInput = {
      ...base, inputMode: "file", assetId: "asset-1", assetFileId: "file-1", format: "txt",
    };
    expect(body.parse(fileInput)).toEqual(fileInput);
    expect(body.safeParse({ ...base, inputMode: "file", path: "/tmp/arbitrary.txt" }).success).toBe(false);
    expect(body.safeParse({ ...fileInput, storageKey: "private/arbitrary.txt" }).success).toBe(false);
  });

  it("候选采纳必须绑定来源 digest 和真实业务基线", () => {
    const body = operations.acceptProjectPreparationCandidate.body!;
    const valid = {
      idempotencyKey: "accept-1", candidateSourceDigest: "candidate-digest",
      baseline: { kind: "digest", digest: "baseline-digest" },
    };
    expect(body.parse(valid)).toEqual(valid);
    expect(body.safeParse({ idempotencyKey: "accept-1" }).success).toBe(false);
    expect(body.safeParse({ ...valid, baseline: {} }).success).toBe(false);
    expect(body.safeParse({ ...valid, source: "assistant" }).success).toBe(false);
    expect(body.parse({
      ...valid, baseline: { kind: "versions", projectVersion: 0, artifactVersion: null },
    })).toMatchObject({ baseline: { projectVersion: 0 } });
  });

  it("运行步骤与候选采纳回执不能缺真实执行锚", () => {
    const step = {
      name: "transcript", required: true, reasonCode: "source_requires_transcript", status: "running",
      revision: 0, childTaskId: null, businessTaskId: null, inputDigest: null, outputReferences: [],
      startedAt: null, completedAt: null, lastError: null, availableActions: [],
    };
    expect(resources.projectPreparationStep.safeParse(step).success).toBe(false);
    expect(resources.projectPreparationStep.parse({ ...step, childTaskId: "child-1" })).toMatchObject({ childTaskId: "child-1" });
    expect(resources.projectPreparationAcceptanceReceipt.safeParse({
      projectId: "project-1", candidateId: "candidate-1", acceptedAt: stamp,
    }).success).toBe(false);
  });

  it("新执行 kind 可解析，assistant project.create 继续拒绝来源、平台及模型请求键", () => {
    expect(executionTaskKindV2.parse("project_preparation")).toBe("project_preparation");
    for (const extra of [
      { source: "assistant" }, { source: "radar" }, { platformRef: { platform: "douyin", externalId: "work" } },
      { idempotencyKey: "model-forged" },
    ]) {
      expect(assistantActionInputSchema.safeParse({ kind: "project.create", title: "标题", ...extra }).success).toBe(false);
    }
  });

  it("五个操作进入统一 registry 并具备明确 CLI 读写和幂等策略", () => {
    for (const [key, operationId, method, path] of [
      ["ensureProject", "projects.ensure", "POST", "/projects/ensure"],
      ["getProjectPreparation", "projects.preparation.get", "GET", "/projects/:projectId/preparation"],
      ["startProjectPreparation", "projects.preparation.start", "POST", "/projects/:projectId/preparation"],
      ["provideProjectPreparationTranscript", "projects.preparation.transcript.provide", "POST", "/projects/:projectId/preparation/transcript"],
      ["acceptProjectPreparationCandidate", "projects.preparation.candidate.accept", "POST", "/projects/:projectId/preparation/candidates/:candidateId/accept"],
    ]) {
      expect(operations[key]).toMatchObject({ id: operationId, method, path });
      expect(Object.values(ENDPOINTS).find((endpoint) => endpoint.id === operationId)).toBe(operations[key]);
      expect(getCliOperationPolicy(operationId)).toMatchObject(method === "GET"
        ? { effect: "read", idempotency: "not_applicable" }
        : { idempotency: "native" });
    }
  });
});

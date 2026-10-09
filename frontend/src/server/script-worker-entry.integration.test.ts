import { createServer } from "node:http";
import { createHash } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { execFileSync } from "node:child_process";
import { beforeAll, expect, it, vi } from "vitest";
import type {Db} from "@creatoros/backend";
import {executionTasks,executionCalls,eq} from "@creatoros/backend";
import type { Endpoint } from "@creatoros/contract";
const fixture = vi.hoisted(() => ({
  url: "",
  credentialReads: 0,
  verbatim: false,
  db:undefined as Db|undefined,
}));
vi.mock("@creatoros/backend",async original=>{const actual=await original<typeof import("@creatoros/backend")>();return {...actual,createConfiguredDb:async(...args:Parameters<typeof actual.createConfiguredDb>)=>{const result=await actual.createConfiguredDb(...args);fixture.db=result.db;return result;}};});
vi.mock("@creatoros/backend/modules/ai-runtime", async (original) => ({
  ...(await original<typeof import("@creatoros/backend/modules/ai-runtime")>()),
  resolveLlmConfig: async () => {
    fixture.credentialReads++;
    if (fixture.verbatim)
      throw new Error("VERBATIM_MUST_NOT_RESOLVE_CREDENTIAL");
    return {
      apiFormat: "openai_chat",
      baseUrl: fixture.url,
      model: "script-fixture",
      token: "fixture",
      settings: { structuredOutputs: true },
    };
  },
}));
import {
  compositeTransport,
  __resetPersistenceForTests,
} from "./persistence-client";
const ctx = {
  userId: "script-entry",
  accountId: "script-entry",
  requestId: "test",
  source: "user" as const,
};
const call = async (id: string, params: unknown, body?: unknown) =>
  (
    (await compositeTransport.request(
      { id } as Endpoint,
      { params, query: undefined, body } as never,
      ctx,
    )) as { data: any }
  ).data;
const hash = (text: string) => createHash("sha256").update(text).digest("hex");
const lines = [
  "先看真实结果。",
  "这是第一步。",
  "接着解释原因。",
  "再看实际操作。",
  "把步骤串起来。",
  "现在亲手试一遍。",
];
const voiceover = lines.join("");
const sourceText = "真实用户资料：我们先演示结果，再解释实际操作步骤。";
beforeAll(() => {
  execFileSync(process.execPath, [resolve("../ai-worker/scripts/build.mjs")], {
    stdio: "pipe",
  });
}, 30000);
it.each(["normal", "verbatim", "mismatch", "malformed", "retry"] as const)(
  "script.draft真实Worker入口：%s",
  async (mode) => {
    const directory = mkdtempSync(resolve(tmpdir(), "t915-script-entry-"));
    vi.stubEnv("DATABASE_URL", "");
    vi.stubEnv("PGLITE_DATA_DIR", resolve(directory, "db"));
    __resetPersistenceForTests();
    fixture.credentialReads = 0;
    fixture.verbatim = mode === "verbatim";
    const requests: Array<{ stage: string; body: string }> = [];
    let heldStoryboard = false;
    const server = createServer(async (req, res) => {
      const chunks: Buffer[] = [];
      for await (const chunk of req) chunks.push(Buffer.from(chunk));
      const body = Buffer.concat(chunks).toString();
      const stage = body.includes("口播主笔")
        ? "compose"
        : body.includes("逐字") && body.includes("分镜")
          ? "storyboard"
          : "unexpected";
      requests.push({ stage, body });
      if (mode === "retry" && stage === "storyboard" && !heldStoryboard) {
        heldStoryboard = true;
        res.writeHead(401, { "content-type": "application/json" });
        res.end(
          JSON.stringify({
            error: {
              message: "fixture credential expired",
              type: "authentication_error",
            },
          }),
        );
        return;
      }
      const shots = lines.map((line, i) => ({
        role: i === 0 ? "hook" : i === lines.length - 1 ? "cta" : "body",
        口播: mode === "mismatch" ? `${line}改字` : line,
        画面: "主播实际演示",
        字幕: line,
        时长: `${i * 3}-${(i + 1) * 3}s`,
      }));
      const output =
        stage === "compose"
          ? {
              centralClaim: "先演示再解释",
              audienceOldBelief: "先讲概念",
              voiceover,
            }
          : mode === "malformed"
            ? {}
            : { shots };
      res.writeHead(200, { "content-type": "application/json" });
      res.end(
        JSON.stringify({
          id: "fixture",
          object: "chat.completion",
          created: 1,
          model: "script-fixture",
          choices: [
            {
              index: 0,
              message: { role: "assistant", content: JSON.stringify(output) },
              finish_reason: "stop",
            },
          ],
          usage: { prompt_tokens: 2, completion_tokens: 3, total_tokens: 5 },
        }),
      );
    });
    await new Promise<void>((done) => server.listen(0, "127.0.0.1", done));
    fixture.url = `http://127.0.0.1:${(server.address() as { port: number }).port}/v1`;
    try {
      const project = await call("projects.create", undefined, {
        title: "隔离写稿项目",
      });
      const artifact = await call(
        "artifacts.create",
        { projectId: project.id },
        { title: "写稿目标", artifactType: "master_script", stage: "script" },
      );
      const before = await call("artifacts.versions.list", {
        artifactId: artifact.id,
      });
      const raw = " 原文逐字保留。\n第二行。 ";
      const inputData =
        mode === "verbatim"
          ? {
              projectId: project.id,
              artifactId: artifact.id,
              draftMode: "verbatim",
              verbatimSourceText: raw,
              verbatimSourceRef: "message:fixture",
              verbatimSourceLength: raw.length,
              verbatimSourceSha256: hash(raw),
            }
          : {
              projectId: project.id,
              artifactId: artifact.id,
              topic: "实际操作",
              instruction: "根据本轮资料写稿",
              sourceSnapshots: [
                {
                  sourceType: "message",
                  sourceId: "fixture-message",
                  label: "用户资料",
                  order: 0,
                  charCount: sourceText.length,
                  sha256: hash(sourceText),
                  body: sourceText,
                  complete: true,
                },
              ],
            };
      let task = await call("ai.tasks.create", undefined, {
        taskType: "script.draft",
        attemptId: `script-production-entry-${mode}`,
        inputData,
      });
      if (mode === "retry") {
        await vi.waitFor(
          async () =>
            expect(
              heldStoryboard,
              JSON.stringify({
                task: await call("ai.tasks.get", { taskId: task.id }),
                stages: requests.map((r) => r.stage),
              }),
            ).toBe(true),
          { timeout: 15000, interval: 100 },
        );
        await vi.waitFor(
          async () => {
            const current = await call("ai.tasks.get", { taskId: task.id });
            expect(current.runtimeStatus, JSON.stringify(current)).toBe(
              "waiting_user",
            );
          },
          { timeout: 10000, interval: 100 },
        );
        const sourceTask = await call("ai.tasks.get",{taskId:task.id});
        const [beforeExecution]=await fixture.db!.select().from(executionTasks).where(eq(executionTasks.id,sourceTask.executionTaskId));
        const beforeCalls=await fixture.db!.select().from(executionCalls).where(eq(executionCalls.executionTaskId,sourceTask.executionTaskId));
        // T-915：配置恢复必须原任务 resume；复制已绑定执行任务会重置预算，保持明确拒绝。
        await expect(call("ai.tasks.create",undefined,{taskType:"script.draft",attemptId:"unsafe-copied-retry",retryOfTaskId:sourceTask.id,inputData})).rejects.toThrow("请通过原执行恢复任务，不能复制任务重置预算");
        await call("execution.tasks.command",undefined,{taskIds:[sourceTask.executionTaskId],command:"resume",idempotencyKey:"script-original-config-restored"});
        const restored=await call("ai.tasks.get",{taskId:sourceTask.id});
        expect(restored.id).toBe(sourceTask.id);expect(restored.executionTaskId).toBe(sourceTask.executionTaskId);
        const [afterExecution]=await fixture.db!.select().from(executionTasks).where(eq(executionTasks.id,sourceTask.executionTaskId));
        expect(afterExecution!.deadlineAt).toBe(beforeExecution!.deadlineAt);
        expect(afterExecution!.executionBudget).toEqual(beforeExecution!.executionBudget);
        expect((await fixture.db!.select().from(executionCalls).where(eq(executionCalls.executionTaskId,sourceTask.executionTaskId))).filter(row=>beforeCalls.some(before=>before.id===row.id))).toHaveLength(beforeCalls.length);

      }
      await vi.waitFor(
        async () => {
          const read = await call("ai.tasks.get", { taskId: task.id });
          expect(read.status, JSON.stringify(read)).toBe(
            "awaiting_confirmation",
          );
        },
        { timeout: 15000, interval: 100 },
      );
      const read = await call("ai.tasks.get", { taskId: task.id });
      expect(read.executionTaskId).toBeTruthy();
      expect(["succeeded", "partial"]).toContain(read.runtimeStatus);
      expect(
        await call("artifacts.versions.list", { artifactId: artifact.id }),
      ).toEqual(before);
      const results = await call("ai.tasks.results.list", { taskId: task.id });
      expect(results).toHaveLength(1);
      expect(results[0]).toMatchObject({
        resultType: "artifact_version",
        artifactId: artifact.id,
      });
      if (mode === "verbatim") {
        expect(requests).toHaveLength(0);
        expect(fixture.credentialReads).toBe(0);
        expect(results[0].resultData.body).toBe(raw);
      } else {
        expect(requests.filter((r) => r.stage === "compose")).toHaveLength(1);
        expect(requests.some((r) => r.stage === "unexpected")).toBe(false);
        expect(requests.find((r) => r.stage === "compose")!.body).toContain(
          sourceText,
        );
        expect(
          results[0].resultData.sections.map((s: any) => s.口播).join(""),
        ).toBe(voiceover);
        if (mode === "normal")
          expect(requests.map((r) => r.stage)).toEqual([
            "compose",
            "storyboard",
          ]);
        else if (mode === "retry")
          expect(requests.map((r) => r.stage)).toEqual([
            "compose",
            "storyboard",
            "storyboard",
          ]);
        else {
          expect(read.runtimeStatus).toBe("partial");
          expect(results[0].resultData.qualityWarnings.length).toBeGreaterThan(
            0,
          );
          const storyboardRequests=requests.filter(r=>r.stage==="storyboard");
          if(mode==="malformed"){
            // T-921：整个节点共享最多两次格式恢复，repairAttempts=0时固定 1+0+2 调用。
            expect(storyboardRequests).toHaveLength(3);
            expect(storyboardRequests.slice(1).every(request=>request.body.includes("{}"))).toBe(true);
          }else expect(storyboardRequests.length).toBeLessThanOrEqual(2);
        }
      }
      expect((await call("ai.tasks.confirm", { taskId: task.id })).status).toBe(
        "succeeded",
      );
      const versions = await call("artifacts.versions.list", {
        artifactId: artifact.id,
      });
      expect(versions).toHaveLength(before.length + 1);
      const saved = await call("artifacts.get", { artifactId: artifact.id });
      expect(
        versions.find((v: any) => v.id === saved.currentVersionId)?.contentData,
      ).toEqual(results[0].resultData.contentData);
      expect((await call("ai.tasks.confirm", { taskId: task.id })).status).toBe(
        "succeeded",
      );
      expect(
        await call("artifacts.versions.list", { artifactId: artifact.id }),
      ).toHaveLength(versions.length);
    } finally {
      await (
        globalThis as { __creatorosDisposePersistence?: () => Promise<void> }
      ).__creatorosDisposePersistence?.();
      __resetPersistenceForTests();
      server.closeAllConnections();
      await new Promise<void>((done) => server.close(() => done()));
      vi.unstubAllEnvs();
      fixture.verbatim = false;
      rmSync(directory, { recursive: true, force: true });
    }
  },
  45000,
);

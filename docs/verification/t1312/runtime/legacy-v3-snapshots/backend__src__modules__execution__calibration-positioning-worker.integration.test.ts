import { createServer } from "node:http";
import { resolve } from "node:path";
import { execFileSync } from "node:child_process";
import { beforeAll, afterAll, it, expect, vi } from "vitest";
import {
  createDb,
  aiTasks,
  aiTaskResults,
  aiTaskSteps,
  eq,
  type Db,
} from "@creatoros/backend";
import { createModelWorkerDispatcher } from "./model-worker-dispatcher";
import { createPersistentTaskService } from "./persistent-task.service";
import { createStructuredBusinessExecutionService } from "../ai-runtime/structured-business-execution.service";
import {
  createCalibrationDiagnoseBusinessAdapter,
  createCalibrationScoreBusinessAdapter,
  createPositioningGenerateBusinessAdapter,
} from "../ai-runtime/calibration-positioning-business-adapters";
const ctx = {
  userId: "cal-worker",
  accountId: "cal-worker",
  requestId: "test",
  source: "user" as const,
};
const budget = { maxCalls: 4, maxTokens: 100000, deadlineMs: 60000 };
let db: Db;
let close: () => Promise<void>;
beforeAll(async () => {
  const c = await createDb();
  db = c.db;
  close = () => c.client.close();
  execFileSync(process.execPath, [resolve("../ai-worker/scripts/build.mjs")], {
    stdio: "pipe",
  });
}, 30000);
afterAll(async () => close?.());
it.each([
  ["calibration.diagnose", false],
  ["calibration.score", false],
  ["positioning.generate", false],
  ["calibration.diagnose", true],
  ["calibration.score", true],
  ["positioning.generate", true],
] as const)(
  "%s 无效=%s：真实Worker冻结来源、单次正常生成与无效输出有界失败",
  async (skillId, invalid) => {
    const id = skillId + String(invalid);
    const read = vi.fn(async () => ({ profile: null, currentStatement: null }));
    const context = { positioning: { getPositioningCenter: read } };
    const current = vi.fn(async () => ({
      rubricVersionId: "old-version",
      dimensions: [{ key: "real", label: "原评分维度" }],
    }));
    const metrics = vi.fn(async () => [{ key: "views", value: 73 }]);
    const service = createStructuredBusinessExecutionService(db, {
      budget,
      maxOutputTokens: 512,
      adapters: {
        "calibration.diagnose": createCalibrationDiagnoseBusinessAdapter({
          ...context,
          subject: {
            get: async () => ({ title: "真实作品", scriptText: "原文" }),
          },
          rubric: { current },
        }),
        "calibration.score": createCalibrationScoreBusinessAdapter({
          ...context,
          prediction: {
            get: async () => ({
              status: "locked",
              subjectType: "content_output",
              subjectId: "output",
              title: "真实作品",
              dimensions: [{ key: "real", label: "原评分维度", predicted: 3 }],
            }),
          },
          metrics: { forSubject: metrics },
        }),
        "positioning.generate":
          createPositioningGenerateBusinessAdapter(context),
      },
    });
    const skillSnapshot = {
      snapshotVersion: 1,
      userId: ctx.userId,
      accountId: ctx.accountId,
      resolvedAt: new Date().toISOString(),
      platformPolicyVersion: "1",
      platformPolicy: "只生成候选",
      skills: [
        {
          skillId,
          baseVersion: "1",
          overlayRevision: null,
          overlayVersion: null,
          effective: {
            methodSystem: "JSON",
            template: "{{rubricBlock}} {{metricsBlock}} {{positioning}}",
            tools: [],
            requiredFacets: [],
            contextRequirements: [],
            outputSchema: { type: "object" },
            completionPolicy: null,
            completionPolicyAdapter: null,
          },
        },
      ],
    };
    await db
      .insert(aiTasks)
      .values({
        id,
        userId: ctx.userId,
        accountId: ctx.accountId,
        taskType: skillId,
        idempotencyKey: id,
        requestFingerprint: "sha256:" + "0".repeat(64),
        inputData: {
          subjectType: "content_output",
          subjectId: "output",
          predictionId: "prediction",
        },
        runtimeData: { skillSnapshot },
        requestedAt: new Date().toISOString(),
      });
    const mapped = await service.prepare(ctx, id);
    await service.prepare(ctx, id);
    expect(read).toHaveBeenCalledOnce();
    current.mockImplementation(async () => ({
      rubricVersionId: "new-version",
      dimensions: [{ key: "new", label: "新维度" }],
    }));
    const good =
      skillId === "calibration.diagnose"
        ? { dimensions: [{ key: "real", score: 4, reason: "真实理由" }] }
        : skillId === "calibration.score"
          ? {
              dimensions: [
                { key: "real", score: 4, reason: "依据真实73次播放" },
              ],
            }
          : { persona: "创作者", oneLiner: "真实定位" };
    const bad =
      skillId === "positioning.generate"
        ? {}
        : {
            dimensions: [
              { key: "real", score: 99, reason: "不可用" },
              { key: "fake", score: 4, reason: "伪维度" },
            ],
          };
    let requests = 0;
    const server = createServer((req, res) => {
      req.resume();
      requests++;
      res.writeHead(200, { "content-type": "application/json" });
      res.end(
        JSON.stringify({
          id: "test",
          object: "chat.completion",
          created: 1,
          model: "fixture",
          choices: [
            {
              index: 0,
              message: {
                role: "assistant",
                content: JSON.stringify(invalid ? bad : good),
              },
              finish_reason: "stop",
            },
          ],
          usage: { prompt_tokens: 2, completion_tokens: 3, total_tokens: 5 },
        }),
      );
    });
    await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
    const worker = createModelWorkerDispatcher(db, {
      entryPath: resolve("../ai-worker/dist/execution-worker.cjs"),
      workerId: "cal-host",
      budget,
      resolveModelCredential: async () => ({
        apiFormat: "openai_chat",
        baseUrl: `http://127.0.0.1:${(server.address() as { port: number }).port}/v1`,
        model: "fixture",
        token: "fixture",
        structuredOutputs: true,
      }),
      projectCandidate: (_c, input) => service.projectCandidate(input),
    });
    try {
      await worker.drainOnce();
      const task = await createPersistentTaskService(db).get(
        ctx,
        mapped.executionTaskId,
      );
      const candidates = await db
        .select()
        .from(aiTaskResults)
        .where(eq(aiTaskResults.aiTaskId, id));
      if (invalid) {
        expect(task.status).toBe("failed");
        expect(candidates).toHaveLength(0);
        expect(requests).toBeGreaterThan(0);
        expect(requests).toBeLessThanOrEqual(budget.maxCalls);
        return;
      }
      expect(task.status).toBe("succeeded");
      expect(requests).toBe(1);
      expect(candidates).toHaveLength(1);
      expect(candidates[0]?.resultData).toMatchObject(
        skillId === "calibration.diagnose"
          ? {
              subjectId: "output",
              rubricVersionId: "old-version",
              diagnosis: good,
            }
          : skillId === "calibration.score"
            ? {
                predictionId: "prediction",
                dimensions: good.dimensions,
                metrics: [{ key: "views", value: 73 }],
              }
            : { suggestion: good },
      );
      await service.prepare(ctx, id);
      expect(await worker.drainOnce()).toBe(0);
      expect(requests).toBe(1);
      expect(read).toHaveBeenCalledOnce();
      if(skillId==="calibration.diagnose"){
        const steps=await db.select().from(aiTaskSteps).where(eq(aiTaskSteps.aiTaskId,id));
        expect(steps).toHaveLength(1);expect(steps[0]?.text).toBe("已生成编导诊断（1 维度评分）");
      }
    } finally {
      await worker.stop();
      server.closeAllConnections();
      await new Promise<void>((r) => server.close(() => r()));
    }
  },
  15000,
);

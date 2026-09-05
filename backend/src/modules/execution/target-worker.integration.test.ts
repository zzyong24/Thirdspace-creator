import { createPersistentTaskService } from "./persistent-task.service";
import { createServer } from "node:http";
import { resolve } from "node:path";
import { execFileSync } from "node:child_process";
import { beforeAll, afterAll, expect, it, vi } from "vitest";
import {
  createDb,
  aiTasks,
  aiTaskResults,
  executionCalls,
  eq,
  type Db,
} from "@creatoros/backend";
import { createModelWorkerDispatcher } from "./model-worker-dispatcher";
import { createStructuredBusinessExecutionService } from "../ai-runtime/structured-business-execution.service";
import {
  createTopicEnrichBusinessAdapter,
  createMaterialMatchBusinessAdapter,
} from "../ai-runtime/target-business-adapters";
const ctx = {
  userId: "target-worker",
  accountId: "target-worker",
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
  ["topic.enrich", false],
  ["material.match", false],
  ["topic.enrich", true],
  ["material.match", true],
] as const)(
  "%s 无效输出=%s：真实Worker有界生成，合法候选不重复",
  async (skillId, invalid) => {
    const taskId = skillId + String(invalid);
    const read = vi.fn(async () => ({ title: "真实选题", angle: "真实角度" }));
    const list = vi.fn(async () => [{ id: "real-asset", name: "真实素材" }]);
    const service = createStructuredBusinessExecutionService(db, {
      budget,
      maxOutputTokens: 512,
      adapters: {
        "topic.enrich": createTopicEnrichBusinessAdapter({
          positioning: {
            getPositioningCenter: async () => ({
              profile: null,
              currentStatement: null,
            }),
          },
          candidate: { get: read },
        }),
        "material.match": createMaterialMatchBusinessAdapter({
          positioning: {
            getPositioningCenter: async () => ({
              profile: null,
              currentStatement: null,
            }),
          },
          assertProject: async () => {},
          assets: { list },
        }),
      },
    });
    const object =
      skillId === "topic.enrich"
        ? { oneLiner: "真实卡片" }
        : {
            matches: [
              { assetId: "real-asset", role: "broll", reason: "匹配理由" },
            ],
          };
    const snapshot = {
      snapshotVersion: 1,
      userId: ctx.userId,
      accountId: ctx.accountId,
      resolvedAt: new Date().toISOString(),
      platformPolicyVersion: "1",
      platformPolicy: "仅生成候选",
      skills: [
        {
          skillId,
          baseVersion: "1",
          overlayRevision: null,
          overlayVersion: null,
          effective: {
            methodSystem: "输出JSON",
            template: "{{title}} {{topic}} {{library}}",
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
    await db.insert(aiTasks).values({
      id: taskId,
      userId: ctx.userId,
      accountId: ctx.accountId,
      taskType: skillId,
      projectId: "project",
      inputData: {
        candidateId: "real-candidate",
        topic: "真实主题",
        outputId: "output",
      },
      runtimeData: { skillSnapshot: snapshot },
      requestFingerprint: "sha256:" + "0".repeat(64),
      idempotencyKey: taskId,
      requestedAt: new Date().toISOString(),
    });
    const mapped = await service.prepare(ctx, taskId);
    expect(
      await db
        .select()
        .from(aiTaskResults)
        .where(eq(aiTaskResults.aiTaskId, taskId)),
    ).toHaveLength(0);
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
          model: "test",
          choices: [
            {
              index: 0,
              message: {
                role: "assistant",
                content: JSON.stringify(invalid ? {} : object),
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
      workerId: "target-host",
      budget,
      async resolveModelCredential() {
        return {
          apiFormat: "openai_chat",
          baseUrl: `http://127.0.0.1:${(server.address() as { port: number }).port}/v1`,
          model: "test",
          token: "fixture",
          structuredOutputs: true,
        };
      },
      projectCandidate(_ctx, input) {
        return service.projectCandidate(input);
      },
    });
    try {
      expect(await worker.drainOnce()).toBe(1);
      if (invalid) {
        expect(requests).toBeGreaterThan(0);
        expect(requests).toBeLessThanOrEqual(budget.maxCalls);
        expect((await createPersistentTaskService(db).get(ctx,mapped.executionTaskId)).status).toBe("failed");
        expect(
          await db
            .select()
            .from(aiTaskResults)
            .where(eq(aiTaskResults.aiTaskId, taskId)),
        ).toHaveLength(0);
        return;
      }
      expect(requests).toBe(1);
      const candidates = await db
        .select()
        .from(aiTaskResults)
        .where(eq(aiTaskResults.aiTaskId, taskId));
      expect(candidates).toHaveLength(1);
      expect(candidates[0]?.resultData).toMatchObject(
        skillId === "topic.enrich"
          ? { candidateId: "real-candidate", card: { oneLiner: "真实卡片" } }
          : { matches: object.matches, outputId: "output" },
      );
      expect(
        (await db.select().from(aiTasks).where(eq(aiTasks.id, taskId)))[0]
          ?.status,
      ).toBe("awaiting_confirmation");
      await service.prepare(ctx, taskId);
      expect(await worker.drainOnce()).toBe(0);
      expect(requests).toBe(1);
      expect(skillId === "topic.enrich" ? read : list).toHaveBeenCalledOnce();
      expect(
        await db
          .select()
          .from(executionCalls)
          .where(eq(executionCalls.executionTaskId, mapped.executionTaskId)),
      ).toHaveLength(1);
    } finally {
      await worker.stop();
      server.closeAllConnections();
      await new Promise<void>((r) => server.close(() => r()));
    }
  },
  15000,
);

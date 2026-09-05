import { createServer } from "node:http";
import { resolve } from "node:path";
import { execFileSync } from "node:child_process";
import { beforeAll, afterAll, it, expect } from "vitest";
import {
  createDb,
  aiTasks,
  aiTaskResults,
  aiTaskSteps,
  executionTasks,
  executionCalls,
  eq,
  type Db,
} from "@creatoros/backend";
import { buildTrendQuery } from "@creatoros/ai-worker";
import { createStructuredBusinessExecutionService } from "../ai-runtime/structured-business-execution.service";
import { createTopicGenerateBusinessAdapter } from "../ai-runtime/topic-business-adapter";
import { createModelWorkerDispatcher } from "./model-worker-dispatcher";
import { createPersistentTaskService } from "./persistent-task.service";
import { createExecutionTopicReadService } from "./execution-topic-read.service";
const ctx = {
  userId: "topic-worker",
  accountId: "topic-worker",
  requestId: "test",
  source: "user" as const,
};
const budget = { maxCalls: 15, maxTokens: 2000000, deadlineMs: 120000 };
let db: Db, close: () => Promise<void>;
beforeAll(async () => {
  const c = await createDb();
  db = c.db;
  close = () => c.client.close();
  execFileSync(process.execPath, [resolve("../ai-worker/scripts/build.mjs")], {
    stdio: "pipe",
  });
}, 30000);
afterAll(async () => close?.());
it.each(["positioning", "comments", "knowledge", "trend"] as const)(
  "%s:真实fork生成；热点429恢复复用已结算来源与抽取",
  async (basis) => {
    let current = Date.now();
    const now = () => new Date(current).toISOString();
    const id = `topic-${basis}`;
    const skills = [
      "topic.generate",
      ...(basis === "trend" ? ["trend.extract"] : []),
    ].map((skillId) => ({
      skillId,
      baseVersion: "1",
      overlayRevision: null,
      overlayVersion: null,
      effective: {
        methodSystem: "JSON",
        template:
          skillId === "trend.extract"
            ? "抽取 {{sourceName}} {{pageText}}"
            : "最终 {{basisContext}} {{signalQuality}}",
        tools: [],
        requiredFacets: [],
        contextRequirements: [],
        outputSchema: { type: "object" },
        completionPolicy: null,
        completionPolicyAdapter: null,
      },
    }));
    await db
      .insert(aiTasks)
      .values({
        id,
        userId: ctx.userId,
        accountId: ctx.accountId,
        taskType: "topic.generate",
        idempotencyKey: id,
        requestFingerprint: "sha256:" + "0".repeat(64),
        inputData: { basis },
        runtimeData: {
          skillSnapshot: {
            snapshotVersion: 1,
            userId: ctx.userId,
            accountId: ctx.accountId,
            resolvedAt: now(),
            platformPolicyVersion: "1",
            platformPolicy: "只生成候选",
            skills,
          },
        },
        requestedAt: now(),
      });
    const service = createStructuredBusinessExecutionService(db, {
      budget,
      maxOutputTokens: 512,
      adapters: {
        "topic.generate": createTopicGenerateBusinessAdapter({
          now,
          positioning: {
            getPositioningCenter: async () => ({
              profile: null,
              currentStatement: null,
            }),
          },
          sourceReader: {
            listEnabledSources: async () => [
              {
                id: "web-source",
                name: "真实网页源",
                url: "https://example.com/trends",
                domain: "example.com",
                sourceType: "web" as const,
              },
            ],
          },
        }),
      },
    });
    const mapped = await service.prepare(ctx, id);
    if (basis === "trend") {
      // 外部读取fixture明确分列：通过真实私有服务预置已确认读取事实，fork验证恢复与模型消费，不冒充实网抓取。
      const claim = await createPersistentTaskService(db, { now }).claimNext({
        workerId: "seed",
        kinds: ["ai_task"],
        executionMode: "model",
      });
      expect(claim?.task.id).toBe(mapped.executionTaskId);
      const ref = {
        executionTaskId: mapped.executionTaskId,
        attempt: claim!.lease.attempt,
        fenceToken: claim!.lease.fenceToken,
      };
      const reads = createExecutionTopicReadService(db, {
        now,
        budget,
        buildTrendQuery,
      });
      for (const target of [
        { kind: "search" as const },
        { kind: "source" as const, sourceId: "web-source" },
      ]) {
        const reserved = await reads.reserveTopicRead(ref, { target });
        await reads.startTopicRead(ref, { callId: reserved.callId });
        await reads.settleTopicRead(ref, {
          callId: reserved.callId,
          receipt:
            target.kind === "search"
              ? {
                  kind: "search",
                  status: "ok",
                  data: {
                    results: [
                      {
                        title: "搜索真实主题",
                        url: "https://example.com/search",
                        snippet: "搜索真实摘要",
                      },
                    ],
                  },
                }
              : {
                  kind: "web",
                  status: "ok",
                  data: {
                    sourceUrl: "https://example.com/trends",
                    title: "真实网页源",
                    text: "正文原始信号：今天发布的创作方法",
                  },
                },
        });
      }
      await db
        .update(executionTasks)
        .set({
          status: "queued",
          leaseOwner: null,
          leaseExpiresAt: null,
          heartbeatAt: null,
        })
        .where(eq(executionTasks.id, mapped.executionTaskId));
    }
    let requests = 0,
      extracts = 0,
      finals = 0;
    const bodies: string[] = [];
    const server = createServer((req, res) => {
      let body = "";
      req.setEncoding("utf8");
      req.on("data", (c) => (body += c));
      req.on("end", () => {
        requests++;
        bodies.push(body);
        const extracting = body.includes("正文原始信号");
        if (extracting) extracts++;
        else finals++;
        if (basis === "trend" && !extracting && finals === 1) {
          res.writeHead(429, {
            "content-type": "application/json",
            "retry-after": "1",
          });
          res.end(JSON.stringify({ error: { message: "rate limit" } }));
          return;
        }
        const object = extracting
          ? {
              signals: [
                {
                  title: "网页提取主题",
                  url: "https://example.com/topic",
                  heat: null,
                  publishedAt: null,
                },
              ],
            }
          : {
              topics: [
                {
                  title: "最终真实选题",
                  angle: "切入角度",
                  reason: "依据已读取信号",
                  sourceComments: [],
                },
              ],
            };
        res.writeHead(200, { "content-type": "application/json" });
        res.end(
          JSON.stringify({
            id: "fixture",
            object: "chat.completion",
            created: 1,
            model: "fixture",
            choices: [
              {
                index: 0,
                message: { role: "assistant", content: JSON.stringify(object) },
                finish_reason: "stop",
              },
            ],
            usage: { prompt_tokens: 2, completion_tokens: 3, total_tokens: 5 },
          }),
        );
      });
    });
    await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
    const worker = createModelWorkerDispatcher(db, {
      now,
      entryPath: resolve("../ai-worker/dist/execution-worker.cjs"),
      workerId: "topic-host",
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
      let task = await createPersistentTaskService(db, { now }).get(
        ctx,
        mapped.executionTaskId,
      );
      if (basis === "trend") {
        expect(task.runtimeStatus).toBe("retry_wait");
        const [row] = await db
          .select()
          .from(executionTasks)
          .where(eq(executionTasks.id, mapped.executionTaskId));
        current = Date.parse(row!.retryAt!) + 1;
        await worker.drainOnce();
        task = await createPersistentTaskService(db, { now }).get(
          ctx,
          mapped.executionTaskId,
        );
        expect(extracts).toBe(1);
        expect(finals).toBe(2);
        expect(requests).toBe(3);
        expect(bodies.at(-1)).toContain("网页提取主题");
        expect(bodies.at(-1)).toContain("搜索真实摘要");
        const calls = await db
          .select()
          .from(executionCalls)
          .where(eq(executionCalls.executionTaskId, mapped.executionTaskId));
        expect(calls.filter((c) => c.kind === "tool")).toHaveLength(2);
      } else expect(requests).toBe(1);
      expect(task.status).toBe("succeeded");
      const results = await db
        .select()
        .from(aiTaskResults)
        .where(eq(aiTaskResults.aiTaskId, id));
      expect(results).toHaveLength(1);
      expect(results[0]?.resultData).toMatchObject({
        items: [{ title: "最终真实选题", reason: "依据已读取信号" }],
      });
      const steps = await db
        .select()
        .from(aiTaskSteps)
        .where(eq(aiTaskSteps.aiTaskId, id));
      expect(steps).toHaveLength(1);
      expect(steps[0]?.text).toBe("已生成 1 条选题");
      await service.prepare(ctx, id);
      expect(await worker.drainOnce()).toBe(0);
      expect(
        await db.select().from(aiTaskSteps).where(eq(aiTaskSteps.aiTaskId, id)),
      ).toHaveLength(1);
    } finally {
      await worker.stop();
      server.closeAllConnections();
      await new Promise<void>((r) => server.close(() => r()));
    }
  },
  30000,
);

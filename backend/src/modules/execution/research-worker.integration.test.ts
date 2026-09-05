import { createServer } from "node:http";
import { resolve } from "node:path";
import { execFileSync } from "node:child_process";
import { beforeAll, afterAll, it, expect, vi } from "vitest";
import {
  createDb,
  aiTasks,
  aiTaskResults,
  executionTasks,
  executionCalls,
  eq,
  type Db,
} from "@creatoros/backend";
import { createModelWorkerDispatcher } from "./model-worker-dispatcher";
import { createPersistentTaskService } from "./persistent-task.service";
import { createStructuredBusinessExecutionService } from "../ai-runtime/structured-business-execution.service";
import { createResearchGatherBusinessAdapter } from "../ai-runtime/research-business-adapter";
const ctx = {
  userId: "research-worker",
  accountId: "research-worker",
  requestId: "test",
  source: "user" as const,
};
const budget = { maxCalls: 4, maxTokens: 100000, deadlineMs: 60000 };
let db: Db, close: () => Promise<void>;
beforeAll(async () => {
  const f = await createDb();
  db = f.db;
  close = () => f.client.close();
  execFileSync(process.execPath, [resolve("../ai-worker/scripts/build.mjs")], {
    stdio: "pipe",
  });
}, 30000);
afterAll(async () => close?.());
it.each(["normal", "empty", "pseudo", "repair"] as const)(
  "%s：真实fork素材生成、冻结来源和有界恢复",
  async (mode) => {
    const id = `research-worker-${mode}`;
    const read = vi.fn(async () => ({ profile: null, currentStatement: null }));
    const service = createStructuredBusinessExecutionService(db, {
      budget,
      maxOutputTokens: 512,
      adapters: {
        "research.gather_material": createResearchGatherBusinessAdapter({
          positioning: { getPositioningCenter: read },
        }),
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
          skillId: "research.gather",
          baseVersion: "1",
          overlayRevision: null,
          overlayVersion: null,
          effective: {
            methodSystem: "JSON",
            template: "{{topic}} {{angle}} {{positioning}} {{groundingNote}}",
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
        taskType: "research.gather_material",
        idempotencyKey: id,
        requestFingerprint: "sha256:" + "0".repeat(64),
        inputData: { topic: "冻结的真实主题", angle: "原始角度" },
        runtimeData: { skillSnapshot },
        requestedAt: new Date().toISOString(),
      });
    const mapped = await service.prepare(ctx, id);
    await service.prepare(ctx, id);
    expect(read).toHaveBeenCalledOnce();
    const [execution] = await db
      .select()
      .from(executionTasks)
      .where(eq(executionTasks.id, mapped.executionTaskId));
    expect(
      JSON.parse(
        (
          execution!.payload as {
            modelInput: { facets: Record<string, string> };
          }
        ).modelInput.facets.__researchGather!,
      ),
    ).toEqual({
      topic: "冻结的真实主题",
      projectId: null,
      grounding: "model_memory",
    });
    const good = {
      hooks: [{ text: "可用钩子", why: "提出真实问题" }],
      cases: [
        {
          title: "方向性案例",
          source: "伪造机构",
          opening: "待核实的角度",
          sourceUrl: "https://fake.example/source",
        },
      ],
      dataPoints: [],
      quotes: [],
    };
    const pseudo = {
      hooks: [],
      cases: [
        {
          title: "arXiv 2308.00352",
          source: "伪论文",
          opening: "引用论文",
          sourceUrl: "https://fake.example/paper",
        },
      ],
      dataPoints: [],
      quotes: [],
    };
    const empty = { hooks: [], cases: [], dataPoints: [], quotes: [] };
    let requests = 0;
    const bodies: string[] = [];
    const server = createServer((req, res) => {
      let body = "";
      req.setEncoding("utf8");
      req.on("data", (chunk) => {
        body += chunk;
      });
      req.on("end", () => {
        bodies.push(body);
        requests++;
        const output =
          mode === "empty"
            ? empty
            : mode === "pseudo"
              ? pseudo
              : mode === "repair" && requests === 1
                ? empty
                : good;
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
                message: { role: "assistant", content: JSON.stringify(output) },
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
      entryPath: resolve("../ai-worker/dist/execution-worker.cjs"),
      workerId: `host-${mode}`,
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
      const results = await db
        .select()
        .from(aiTaskResults)
        .where(eq(aiTaskResults.aiTaskId, id));
      expect(bodies[0]).toContain("冻结的真实主题");
      expect(requests).toBeGreaterThan(0);
      expect(requests).toBeLessThanOrEqual(budget.maxCalls);
      if (mode === "empty" || mode === "pseudo") {
        expect(task.status).toBe("failed");
        expect(results).toHaveLength(0);
      } else {
        expect(task.status).toBe("succeeded");
        expect(results).toHaveLength(1);
        expect(requests).toBe(mode === "normal" ? 1 : 2);
        expect(results[0]!.resultData).toMatchObject({
          grounding: "model_memory",
          topic: "冻结的真实主题",
          categories: { cases: [{ source: "模型记忆,需核实", sourceUrl: "" }] },
        });
        expect(JSON.stringify(results[0]!.resultData)).not.toContain(
          "fake.example",
        );
        const calls = await db
          .select()
          .from(executionCalls)
          .where(eq(executionCalls.executionTaskId, mapped.executionTaskId));
        expect(
          calls.filter(
            (call) => call.kind === "model" && call.status === "settled",
          ),
        ).toHaveLength(requests);
      }
      const count = requests;
      await service.prepare(ctx, id);
      expect(await worker.drainOnce()).toBe(0);
      expect(requests).toBe(count);
      expect(read).toHaveBeenCalledOnce();
    } finally {
      await worker.stop();
      server.closeAllConnections();
      await new Promise<void>((r) => server.close(() => r()));
    }
  },
  20000,
);

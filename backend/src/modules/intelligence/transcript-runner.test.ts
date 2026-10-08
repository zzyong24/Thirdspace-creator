import { describe, expect, it, vi } from "vitest";

import { createDb } from "@creatoros/backend";
import type { RequestContext } from "@creatoros/contract";
import { createPersistentTaskService } from "../execution";
import { createRecoveryWakeCoordinator } from "../../application/recovery-wake";
import { createIntelligenceService } from "./intelligence.service";
import {
  drainIntelligenceTranscriptQueue,
  runIntelligenceTranscriptTask,
  type IntelligenceTranscriptRunnerDeps,
} from "./transcript-runner";

const ctx: RequestContext = {
  userId: "user-1",
  accountId: "account-1",
  requestId: "request-1",
  source: "user",
};

function deps() {
  let serial = 0;
  return {
    now: () => "2026-07-23T12:00:00.000Z",
    nextId: (prefix: string) => `${prefix}-${++serial}`,
  };
}

describe("T-482 手动逐字稿持久队列", () => {
  it("[T-632] 启动恢复会持续消费全部历史积压，不在 20 条后停止", async () => {
    const { db, client } = await createDb();
    const d = deps();
    const tasks = createPersistentTaskService(db, d);
    const intelligence = createIntelligenceService(db, { ...d, tasks });
    try {
      const total = 25;
      for (let index = 0; index < total; index += 1) {
        const itemId = await intelligence.seedItemForTest(ctx, {
          canonicalUrl: `https://www.douyin.com/video/backlog-${index}`,
          externalId: `backlog-${index}`,
          title: `历史积压 ${index}`,
        });
        await intelligence.enqueueTranscripts(ctx, {
          itemIds: [itemId],
          idempotencyKey: `backlog-${index}`,
        });
      }

      let active = 0;
      let maxActive = 0;
      const runner: IntelligenceTranscriptRunnerDeps = {
        tasks,
        intelligence,
        transcript: {
          transcribe: async (_ctx, input) => {
            active += 1;
            maxActive = Math.max(maxActive, active);
            await new Promise((resolve) => setTimeout(resolve, 25));
            active -= 1;
            return {
              text: `逐字稿 ${input.externalId}`,
              provider: "test-asr",
              model: "test-model",
              language: "zh",
            };
          },
        },
      };
      let processed = 0;
      const batches: number[] = [];
      const recovery = createRecoveryWakeCoordinator({
        intervalMs: 10,
        lanes: {
          transcribe: async (control) => {
            const count = await drainIntelligenceTranscriptQueue(runner, {
              ...control,
              maxTasks: 4,
              concurrency: 2,
            });
            processed += count;
            batches.push(count);
          },
        },
      });
      try {
        recovery.start();
        await vi.waitFor(() => expect(processed).toBe(total), {
          timeout: 15_000,
          interval: 50,
        });
      } finally {
        await recovery.stop();
      }

      expect(processed).toBe(total);
      expect(batches.filter((count) => count > 0).length).toBeGreaterThan(1);
      expect(batches.every((count) => count <= 4)).toBe(true);
      expect(maxActive).toBe(2);
      await expect(
        tasks.list(ctx, { kind: "transcribe", status: "queued", limit: 100 }),
      ).resolves.toMatchObject({ total: 0 });
      await expect(
        tasks.list(ctx, {
          kind: "transcribe",
          status: "succeeded",
          limit: 100,
        }),
      ).resolves.toMatchObject({ total });
    } finally {
      await client.close();
    }
  });

  it("只有用户排队的 item 会调用 ASR，并把正文写回 item transcript", async () => {
    const { db, client } = await createDb();
    const d = deps();
    const tasks = createPersistentTaskService(db, d);
    const intelligence = createIntelligenceService(db, { ...d, tasks });
    try {
      const itemId = await intelligence.seedItemForTest(ctx, {
        canonicalUrl: "https://www.douyin.com/video/123",
        externalId: "123",
        title: "视频 123",
      });
      const queued = await intelligence.enqueueTranscripts(ctx, {
        itemIds: [itemId],
        idempotencyKey: "manual-1",
      });
      const task = queued.tasks[0]!;
      await runIntelligenceTranscriptTask(
        ctx,
        { taskId: task.id },
        {
          tasks,
          intelligence,
          workerId: () => "transcript-worker",
          transcript: {
            transcribe: async () => ({
              text: "这是用户手动请求后取得的逐字稿。",
              provider: "openai",
              model: "whisper-1",
              language: "zh",
            }),
          },
        },
      );
      const detail = await intelligence.getItem(ctx, itemId);
      expect(detail.transcript).toMatchObject({
        status: "done",
        text: "这是用户手动请求后取得的逐字稿。",
        source: "asr",
        provider: "openai",
      });
      expect((await tasks.get(ctx, task.id)).status).toBe("succeeded");
    } finally {
      await client.close();
    }
  });

  it("ASR 未配置时任务与逐字稿都进入 blocked，不伪装为成功空文本", async () => {
    const { db, client } = await createDb();
    const d = deps();
    const tasks = createPersistentTaskService(db, d);
    const intelligence = createIntelligenceService(db, { ...d, tasks });
    try {
      const itemId = await intelligence.seedItemForTest(ctx, {
        canonicalUrl: "https://www.douyin.com/video/456",
        externalId: "456",
        title: "视频 456",
      });
      const queued = await intelligence.enqueueTranscripts(ctx, {
        itemIds: [itemId],
        idempotencyKey: "manual-2",
      });
      const task = queued.tasks[0]!;
      await runIntelligenceTranscriptTask(
        ctx,
        { taskId: task.id },
        {
          tasks,
          intelligence,
          workerId: () => "transcript-worker",
          transcript: {
            transcribe: async () => {
              throw Object.assign(new Error("ASR 未配置"), {
                name: "TranscribeConfigError",
              });
            },
          },
        },
      );
      expect((await intelligence.getItem(ctx, itemId)).transcript).toMatchObject(
        {
          status: "blocked",
          text: null,
          errorCode: "MODEL_NOT_CONFIGURED",
        },
      );
      expect(await tasks.get(ctx, task.id)).toMatchObject({
        status: "blocked",
      });
    } finally {
      await client.close();
    }
  });
});

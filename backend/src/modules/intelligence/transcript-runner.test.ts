import { beforeEach, afterEach, describe, expect, it } from "vitest";

import { createRecoveryWakeCoordinator } from "../../application/recovery-wake";
import { createDb } from "@creatoros/backend";
import type { RequestContext } from "@creatoros/contract";
import { createPersistentTaskService } from "../execution";
import { createIntelligenceService } from "./intelligence.service";
import {
  drainIntelligenceTranscriptQueue,
  runIntelligenceTranscriptTask,
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
  let store: Awaited<ReturnType<typeof createDb>>;
  beforeEach(async () => { store = await createDb(); });
  afterEach(async () => { await store?.client.close(); });
  it("[T-632] 启动恢复会持续消费全部历史积压，不在 20 条后停止", async () => {
    const { db } = store;
    const d = deps();
    const tasks = createPersistentTaskService(db, d);
    const intelligence = createIntelligenceService(db, { ...d, tasks });
    {
      const total = 25;
      const originalIds: string[] = [];
      for (let index = 0; index < total; index += 1) {
        const itemId = await intelligence.seedItemForTest(ctx, {
          canonicalUrl: `https://www.douyin.com/video/backlog-${index}`,
          externalId: `backlog-${index}`,
          title: `历史积压 ${index}`,
        });
        const queued = await intelligence.enqueueTranscripts(ctx, {
          itemIds: [itemId],
          idempotencyKey: `backlog-${index}`,
        });
        originalIds.push(...queued.tasks.map(task => task.id));
      }

      let active = 0;
      let maxActive = 0;
      let activeLanes = 0;
      let maxActiveLanes = 0;
      let waves = 0;
      let processed = 0;
      const called: string[] = [];
      let releasePair!: () => void;
      const pairEntered = new Promise<void>(resolve => { releasePair = resolve; });
      let finished!: () => void;
      const allProcessed = new Promise<void>(resolve => { finished = resolve; });
      const errors: unknown[] = [];
      const coordinator = createRecoveryWakeCoordinator({
        intervalMs: 5,
        onError: (_kind, error) => { errors.push(error); finished(); },
        lanes: { transcribe: async control => {
          waves += 1;
          activeLanes += 1;
          maxActiveLanes = Math.max(maxActiveLanes, activeLanes);
          try {
            processed += await drainIntelligenceTranscriptQueue({
              tasks, intelligence,
              transcript: { transcribe: async (_ctx, input) => {
                active += 1;
                maxActive = Math.max(maxActive, active);
                called.push(input.externalId!);
                // 首对真实领取进入确定性屏障，保两并发而不延长原测试预算。
                if (called.length === 1) await pairEntered;
                else if (called.length === 2) releasePair();
                active -= 1;
                return {text: `逐字稿 ${input.externalId}`, provider: "test-asr", model: "test-model", language: "zh"};
              } },
            }, {...control, maxTasks: 4, concurrency: 2});
            if (processed === total) finished();
          } finally { activeLanes -= 1; }
        } },
      });
      try {
        coordinator.start();
        expect(coordinator.run("transcribe")).toBe(coordinator.run("transcribe"));
        await allProcessed;
      } finally { await coordinator.stop(); }
      expect(errors).toEqual([]);
      expect(maxActiveLanes).toBe(1);
      expect(waves).toBeGreaterThanOrEqual(7);
      expect(called.sort()).toEqual(Array.from({length: total}, (_, index) => `backlog-${index}`).sort());
      const beforeStop = {waves, calls: called.length};
      coordinator.wake("transcribe");
      await coordinator.run("transcribe");
      expect({waves, calls: called.length}).toEqual(beforeStop);
      const succeeded = await tasks.list(ctx, {kind: "transcribe", status: "succeeded", limit: 100});
      expect(succeeded.rows.map(task => task.id).sort()).toEqual(originalIds.sort());

      expect(processed).toBe(total);
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
    }
  });

  it("只有用户排队的 item 会调用 ASR，并把正文写回 item transcript", async () => {
    const { db } = store;
    const d = deps();
    const tasks = createPersistentTaskService(db, d);
    const intelligence = createIntelligenceService(db, { ...d, tasks });
    {
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
    }
  });

  it("ASR 未配置时任务与逐字稿都进入 blocked，不伪装为成功空文本", async () => {
    const { db } = store;
    const d = deps();
    const tasks = createPersistentTaskService(db, d);
    const intelligence = createIntelligenceService(db, { ...d, tasks });
    {
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
    }
  });
});

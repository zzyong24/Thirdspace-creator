import { describe, expect, it } from "vitest";

import { createDb } from "@creatoros/backend";
import type { RequestContext } from "@creatoros/contract";
import { createPersistentTaskService } from "../execution";
import { runProjectScriptCandidateTask } from "./project-script-candidate.runner";

const ctx: RequestContext = {
  userId: "user-script-runner",
  accountId: "account-script-runner",
  requestId: "request-script-runner",
  source: "user",
};

describe("T-482 Project 稿件候选异步 runner", () => {
  it("读取来源上下文后把候选写入 checkpoint 并结束为 succeeded", async () => {
    const { db, client } = await createDb();
    let serial = 0;
    const tasks = createPersistentTaskService(db, {
      now: () => "2026-07-23T18:00:00.000Z",
      nextId: (prefix) => `${prefix}-${++serial}`,
    });
    try {
      const task = await tasks.enqueue(ctx, {
        kind: "script_candidate",
        ownerType: "project",
        ownerId: "project-1",
        idempotencyKey: "script-generate-1",
        payload: {
          referenceIds: ["reference-1"],
          strategy: "结合定位重写",
        },
      });
      await runProjectScriptCandidateTask(
        ctx,
        { taskId: task.id },
        {
          tasks,
          workerId: "worker-script-1",
          references: {
            getSourceContexts: async () => [
              {
                transcript: { text: "来源逐字稿" },
              },
            ],
          } as never,
          generator: {
            generate: async (_ctx, input) => ({
              text: `自己的纯口播稿：${input.strategy}`,
            }),
          },
        },
      );
      expect(await tasks.get(ctx, task.id)).toMatchObject({
        status: "succeeded",
        checkpoint: {
          candidateText: "自己的纯口播稿：结合定位重写",
          referenceIds: ["reference-1"],
          strategy: "结合定位重写",
        },
      });
    } finally {
      await client.close();
    }
  });
});

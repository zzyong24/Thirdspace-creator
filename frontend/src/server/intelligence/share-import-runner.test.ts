import { describe, expect, it, vi } from "vitest";
import type { RequestContext } from "@creatoros/contract";
import type {
  PersistentTaskClaim,
  PersistentTaskService,
} from "@creatoros/backend/modules/execution";

import { runDouyinShareImportTask } from "./share-import-runner";

const ctx: RequestContext = {
  userId: "user-1",
  accountId: "account-1",
  requestId: "request-1",
  source: "user",
};

function claim(): PersistentTaskClaim {
  return {
    task: {
      id: "task-1",
      userId: "user-1",
      accountId: "account-1",
      kind: "share_import",
      ownerType: "item_import",
      ownerId: "share-import:one",
      status: "running",
      priority: 30,
      idempotencyKey: "import-1",
      checkpoint: null,
      leaseOwner: "worker-1",
      leaseExpiresAt: "2026-07-23T18:03:00.000Z",
      heartbeatAt: "2026-07-23T18:00:00.000Z",
      attempt: 1,
      maxAttempts: 3,
      costEstimate: null,
      createdAt: "2026-07-23T18:00:00.000Z",
      updatedAt: "2026-07-23T18:00:00.000Z",
    },
    payload: {
      collectionId: "collection-1",
      shareInput: "https://v.douyin.com/abc/",
      requestedBy: "user",
    },
    lease: { workerId: "worker-1", attempt: 1 },
  };
}

describe("[T-482] 单条分享导入持久任务", () => {
  it("把真实作品连同外层任务 lease 交给领域服务完成归档", async () => {
    const saveCheckpoint = vi.fn().mockResolvedValue({});
    const finish = vi.fn().mockResolvedValue({});
    const tasks = {
      saveCheckpoint,
      finish,
    } as unknown as PersistentTaskService;
    const importDouyinSharedItem = vi.fn().mockResolvedValue({
      item: { id: "item-1" },
      transcriptStatus: "not_requested",
      transcriptQueued: false,
    });
    await runDouyinShareImportTask(
      ctx,
      { taskId: "task-1", existingClaim: claim() },
      {
        tasks,
        now: () => "2026-07-23T18:00:00.000Z",
        fetcher: {
          fetch: vi.fn().mockResolvedValue({
            shareUrl: "https://v.douyin.com/abc/",
            resolvedUrl:
              "https://www.douyin.com/video/7350000000000000000",
            browserSessionRef: "douyin-profile:account-1",
            item: {
              type: "video",
              platform: "douyin",
              externalId: "7350000000000000000",
              canonicalUrl:
                "https://www.douyin.com/video/7350000000000000000",
              authorId: "author-1",
              authorName: "真实博主",
              title: "真实作品",
              summary: null,
              coverUrl: null,
              publishedAt: null,
              durationMs: null,
            },
          }),
        },
        intelligence: {
          importDouyinSharedItem,
        } as never,
      },
    );

    expect(importDouyinSharedItem).toHaveBeenCalledWith(
      ctx,
      expect.objectContaining({
        taskId: "task-1",
        lease: {
          taskId: "task-1",
          workerId: "worker-1",
          attempt: 1,
        },
        collectionId: "collection-1",
        browserSessionRef: "douyin-profile:account-1",
      }),
    );
    // 成功 checkpoint 与任务终态由领域服务原子收口，host 不重复写。
    expect(saveCheckpoint).not.toHaveBeenCalled();
    expect(finish).not.toHaveBeenCalled();
  });

  it("登录态失效进入 blocked，不伪装成功空记录", async () => {
    const finish = vi.fn().mockResolvedValue({});
    await runDouyinShareImportTask(
      ctx,
      { taskId: "task-1", existingClaim: claim() },
      {
        tasks: { finish } as unknown as PersistentTaskService,
        fetcher: {
          fetch: vi
            .fn()
            .mockRejectedValue(
              new Error("DouyinNotLoggedInError: 请先登录"),
            ),
        },
        intelligence: {} as never,
      },
    );
    expect(finish).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "blocked",
        errorCode: "LOGIN_REQUIRED",
      }),
    );
  });
});

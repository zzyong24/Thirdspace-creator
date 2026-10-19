import { describe, expect, it, vi } from "vitest";
import type { RequestContext } from "@creatoros/contract";
import type {
  PersistentTaskClaim,
  PersistentTaskService,
} from "@creatoros/backend/modules/execution";

import { runDouyinShareImportTask } from "@creatoros/backend/modules/intelligence";

const ctx: RequestContext = {
  userId: "user-1",
  accountId: "account-1",
  requestId: "request-1",
  source: "user",
};

function claim(
  payload: Record<string, unknown> = {},
): PersistentTaskClaim {
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
      errorCode: null,
      errorMessage: null,
      costEstimate: null,
      createdAt: "2026-07-23T18:00:00.000Z",
      updatedAt: "2026-07-23T18:00:00.000Z",
    },
    payload: {
      collectionId: "collection-1",
      shareInput: "https://v.douyin.com/abc/",
      requestedBy: "user",
      ...payload,
    },
    lease: { workerId: "worker-1", attempt: 1, fenceToken: "share-fence" },
  };
}

describe("[T-482] 单条分享导入持久任务", () => {
  it("把真实作品连同外层任务 lease 交给领域服务完成归档", async () => {
    const saveCheckpoint = vi.fn().mockResolvedValue({});
    const finish = vi.fn().mockResolvedValue({});
    const tasks = {
      get:vi.fn().mockResolvedValue(claim().task),
      heartbeat:vi.fn().mockResolvedValue(claim().task),
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

  it("登录态失效进入 waiting_user，不伪装成功空记录", async () => {
    const finish = vi.fn().mockResolvedValue({});
    await runDouyinShareImportTask(
      ctx,
      { taskId: "task-1", existingClaim: claim() },
      {
        tasks: { finish,get:vi.fn().mockResolvedValue(claim().task),heartbeat:vi.fn().mockResolvedValue(claim().task) } as unknown as PersistentTaskService,
        fetcher: {
          fetch: vi
            .fn()
            .mockRejectedValue(
              Object.assign(new Error("请先登录"),{name:"DouyinNotLoggedInError"}),
            ),
        },
        intelligence: {} as never,
      },
    );
    expect(finish).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "waiting_user",
        errorCode: "LOGIN_REQUIRED",
      }),
    );
  });

  it("验证码进入 waiting_user/CAPTCHA，保留可恢复状态", async () => {
    const finish = vi.fn().mockResolvedValue({});
    await runDouyinShareImportTask(
      ctx,
      { taskId: "task-1", existingClaim: claim() },
      {
        tasks: { finish,get:vi.fn().mockResolvedValue(claim().task),heartbeat:vi.fn().mockResolvedValue(claim().task) } as unknown as PersistentTaskService,
        fetcher: {
          fetch: vi.fn().mockRejectedValue(Object.assign(new Error("人机校验"),{name:"DouyinCaptchaError"})),
        },
        intelligence: {} as never,
      },
    );
    expect(finish).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "waiting_user",
        errorCode: "CAPTCHA",
      }),
    );
  });

  it("仅持久 payload 明确授权时续接转写，live 唤醒失败不反转父任务", async () => {
    const finish = vi.fn().mockResolvedValue({});
    const importDouyinSharedItem = vi.fn().mockResolvedValue({
      item: { id: "item-1" },
      transcriptStatus: "queued",
      transcriptQueued: true,
      transcriptTaskIds: ["transcript-task-1"],
    });
    const onTranscriptTasksQueued = vi
      .fn()
      .mockRejectedValue(new Error("worker unavailable"));
    await runDouyinShareImportTask(
      ctx,
      {
        taskId: "task-1",
        existingClaim: claim({ transcribeAfterImport: true }),
      },
      {
        tasks: { finish,get:vi.fn().mockResolvedValue(claim().task),heartbeat:vi.fn().mockResolvedValue(claim().task) } as unknown as PersistentTaskService,
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
        intelligence: { importDouyinSharedItem } as never,
        onTranscriptTasksQueued,
      },
    );
    expect(importDouyinSharedItem).toHaveBeenCalledWith(
      ctx,
      expect.objectContaining({ transcribeAfterImport: true }),
    );
    expect(onTranscriptTasksQueued).toHaveBeenCalledWith(ctx, [
      "transcript-task-1",
    ]);
    expect(finish).not.toHaveBeenCalled();
  });

  it("普通分享明确向领域层传 false，不能被 host 自动升级为转写", async () => {
    const importDouyinSharedItem = vi.fn().mockResolvedValue({
      item: { id: "item-1" },
      transcriptStatus: "not_requested",
      transcriptQueued: false,
      transcriptTaskIds: [],
    });
    await runDouyinShareImportTask(
      ctx,
      { taskId: "task-1", existingClaim: claim() },
      {
        tasks: {get:vi.fn().mockResolvedValue(claim().task),heartbeat:vi.fn().mockResolvedValue(claim().task)} as unknown as PersistentTaskService,
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
        intelligence: { importDouyinSharedItem } as never,
      },
    );
    expect(importDouyinSharedItem).toHaveBeenCalledWith(
      ctx,
      expect.objectContaining({ transcribeAfterImport: false }),
    );
  });
});

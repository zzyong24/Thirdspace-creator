import { describe, expect, it } from "vitest";

import { createDb } from "@creatoros/backend";
import { ENDPOINTS, type RequestContext } from "@creatoros/contract";
import { createPersistentTaskService } from "../execution";
import { createIntelligenceService } from "./intelligence.service";
import {
  createIntelligenceTransport,
  INTELLIGENCE_OP_IDS,
} from "./intelligence.transport";

const ctx: RequestContext = {
  userId: "user-contract",
  accountId: "account-contract",
  requestId: "request-contract",
  source: "user",
};

describe("T-482 内容雷达 transport 契约", () => {
  it("只声明当前已有真实实现的 30 个 operation", () => {
    expect(INTELLIGENCE_OP_IDS).toHaveLength(30);
    expect(INTELLIGENCE_OP_IDS).toContain("intelligence.workspace.get");
    expect(INTELLIGENCE_OP_IDS).toContain("intelligence.collectors.list");
    expect(INTELLIGENCE_OP_IDS).toContain(
      "intelligence.transcripts.enqueue",
    );
    expect(INTELLIGENCE_OP_IDS).toContain(
      "intelligence.transcripts.uploadManual",
    );
    expect(INTELLIGENCE_OP_IDS).toContain(
      "intelligence.items.importDouyinShare",
    );
    expect(INTELLIGENCE_OP_IDS).toContain(
      "intelligence.transforms.previewTopic",
    );
    expect(INTELLIGENCE_OP_IDS).toContain(
      "intelligence.transforms.confirmTopic",
    );
    expect(INTELLIGENCE_OP_IDS).toContain(
      "intelligence.migrations.inventory",
    );
    expect(INTELLIGENCE_OP_IDS).toContain(
      "intelligence.migrations.rollback",
    );
    expect(INTELLIGENCE_OP_IDS).toContain(
      "projects.intelligence.attach",
    );
    expect(INTELLIGENCE_OP_IDS).toContain("projects.intelligence.list");
    expect(INTELLIGENCE_OP_IDS).toContain(
      "projects.scripts.generateCandidate",
    );
    expect(INTELLIGENCE_OP_IDS).toContain(
      "projects.scripts.acceptCandidate",
    );
  });

  it("workspace/source/run 响应通过共享 Zod 契约", async () => {
    const { db, client } = await createDb();
    let serial = 0;
    const deps = {
      now: () => "2026-07-23T12:00:00.000Z",
      nextId: (prefix: string) => `${prefix}-${++serial}`,
    };
    const tasks = createPersistentTaskService(db, deps);
    const service = createIntelligenceService(db, { ...deps, tasks });
    const transport = createIntelligenceTransport(() => service);
    try {
      const workspace = (await transport.request(
        ENDPOINTS.getIntelligenceWorkspace,
        {
          params: undefined,
          query: { accountId: ctx.accountId! },
          body: undefined,
        },
        ctx,
      )) as { data: unknown };
      expect(
        ENDPOINTS.getIntelligenceWorkspace.response.parse(workspace.data)
          .collections,
      ).toHaveLength(2);

      const sharedItemImport = (await transport.request(
        ENDPOINTS.importDouyinShareItem,
        {
          params: undefined,
          query: undefined,
          body: {
            accountId: ctx.accountId!,
            collectionId: null,
            shareInput: "3.21 复制打开抖音 https://v.douyin.com/example/",
            idempotencyKey: "share-import-contract",
          },
        },
        ctx,
      )) as { data: unknown };
      const parsedShareImport =
        ENDPOINTS.importDouyinShareItem.response.parse(
          sharedItemImport.data,
        );
      expect(parsedShareImport.task.kind).toBe("share_import");
      expect(parsedShareImport.task.status).toBe("queued");

      const itemId = await service.seedItemForTest(ctx, {
        canonicalUrl: "https://www.douyin.com/video/manual-contract",
        externalId: "manual-contract",
        title: "人工稿契约",
      });
      const uploaded = (await transport.request(
        ENDPOINTS.uploadManualIntelligenceTranscript,
        {
          params: undefined,
          query: undefined,
          body: {
            itemId,
            inputMode: "file",
            format: "txt",
            fileName: "人工稿.txt",
            text: "人工上传的逐字稿正文",
          },
        },
        ctx,
      )) as { data: unknown };
      expect(
        ENDPOINTS.uploadManualIntelligenceTranscript.response.parse(
          uploaded.data,
        ).transcript,
      ).toMatchObject({
        itemId,
        status: "done",
        source: "manual",
        text: "人工上传的逐字稿正文",
      });

      const created = (await transport.request(
        ENDPOINTS.createIntelligenceSource,
        {
          params: undefined,
          query: undefined,
          body: {
            accountId: ctx.accountId!,
            collectionId: null,
            type: "rss",
            config: {
              type: "rss",
              url: "https://example.com/feed.xml",
            },
            monitorEnabled: false,
            runInitial: true,
            idempotencyKey: "source-rss-contract",
          },
        },
        ctx,
      )) as { data: unknown };
      const parsed =
        ENDPOINTS.createIntelligenceSource.response.parse(created.data);
      expect(parsed.source.type).toBe("rss");
      expect(parsed.run?.status).toBe("queued");
      expect(parsed.task?.kind).toBe("source_sync");
    } finally {
      await client.close();
    }
  });
});

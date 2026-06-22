import { describe, it, expect, beforeEach } from "vitest";
import { createDb, type Db } from "@creatoros/backend";
import { ENDPOINTS } from "@creatoros/contract";
import type { Endpoint, RequestContext } from "@creatoros/contract";
import { createAnalyticsRepository } from "./analytics.repository";
import {
  createAnalyticsService,
  type AnalyticsPublishingPort,
} from "./analytics.service";
import { createAnalyticsTransport } from "./analytics.transport";
import { metricSnapshotResource } from "./analytics.schema";

// Task 4 — contract conformance. Drive each op through the transport against a
// seeded pglite store; metricSnapshotResource.array().parse(envelope.data)
// succeeds; list meta carries page/pageSize/total.

const NOW = "2026-06-21T00:00:00.000Z";
const ctx: RequestContext = { userId: "user-a", requestId: "req-1", source: "user" };

const pubEndpoint = ENDPOINTS.getPublicationAnalytics as unknown as Endpoint;
const projEndpoint = ENDPOINTS.getProjectAnalytics as unknown as Endpoint;

describe("analytics contract conformance", () => {
  let db: Db;
  let transport: ReturnType<typeof createAnalyticsTransport>;

  beforeEach(async () => {
    ({ db } = await createDb());
    let seq = 0;
    const repo = createAnalyticsRepository(db, {
      now: () => NOW,
      nextId: (prefix: string) => `${prefix}-${++seq}`,
    });
    const publishing: AnalyticsPublishingPort = {
      resolvePublication: () => Promise.resolve(),
      listPublicationIdsByProject: () => Promise.resolve(["pub-1"]),
    };
    const service = createAnalyticsService({ repo, publishing });
    await service.appendSnapshot(ctx, {
      publicationId: "pub-1",
      ingestionRunId: "run-1",
      capturedAt: "2026-06-12T10:00:00.000Z",
      source: "platform_api",
      rawMetrics: { views: 18420 },
      values: [
        { metricKey: "views", numericValue: 18420, unit: "count", dimensions: {} },
      ],
    });
    transport = createAnalyticsTransport(() => service);
  });

  it("analytics.publications.get returns metricSnapshotResource[] with list meta", async () => {
    const envelope = await transport.request(
      pubEndpoint,
      { params: { publicationId: "pub-1" }, query: { page: 1, pageSize: 20 } } as never,
      ctx,
    );
    const data = (envelope as { data: unknown }).data;
    expect(() => metricSnapshotResource.array().parse(data)).not.toThrow();
    const meta = (envelope as { meta: Record<string, unknown> }).meta;
    expect(meta.page).toBe(1);
    expect(meta.pageSize).toBe(20);
    expect(meta.total).toBe(1);
    // user_id is dropped from the DTO (SPEC §9).
    expect(JSON.stringify(data)).not.toContain("user_id");
    expect(JSON.stringify(data)).not.toContain("userId");
  });

  it("analytics.projects.get returns metricSnapshotResource[] with list meta", async () => {
    const envelope = await transport.request(
      projEndpoint,
      { params: { projectId: "project-x" }, query: { page: 1, pageSize: 20 } } as never,
      ctx,
    );
    const data = (envelope as { data: unknown }).data;
    expect(() => metricSnapshotResource.array().parse(data)).not.toThrow();
    const meta = (envelope as { meta: Record<string, unknown> }).meta;
    expect(meta.total).toBe(1);
    expect(meta.requestId).toBe("req-1");
  });
});

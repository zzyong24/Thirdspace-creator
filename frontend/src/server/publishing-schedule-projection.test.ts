import { describe, expect, it, vi } from "vitest";
import type { RequestContext } from "@creatoros/contract";
import {
  buildPublishingScheduleProjection,
  type PublishingScheduleProjectionDeps,
} from "./publishing-schedule-projection";

const ctx: RequestContext = {
  userId: "user-a",
  accountId: "acct-1",
  requestId: "req-1",
  source: "user",
};

function stubs(options?: { analyticsFails?: boolean }) {
  const getCalendarRequestContext = vi.fn(async () => ({
    referenceInstant: "2026-07-29T01:00:00.000Z",
    effectiveTimezone: "Asia/Shanghai",
    today: "2026-07-29",
  }));
  const listCalendar = vi.fn(async () => ({
    rows: [
      {
        id: "cal-1",
        userId: "user-a",
        accountId: "acct-1",
        projectId: "project-1",
        plannedDate: "2026-07-31",
        plannedAt: "2026-07-31T12:00:00.000Z",
        contentOutputId: null,
        candidateId: null,
        status: "planned",
        note: "",
        publishedAt: null,
        createdAt: "2026-07-29T01:00:00.000Z",
        updatedAt: "2026-07-29T01:00:00.000Z",
      },
    ],
    total: 1,
  }));
  const listProjectsForComposition = vi.fn(async () => [
    {
      id: "project-1",
      title: "七月收官",
      status: "active",
      source: "manual",
      currentStage: "publishing",
      updatedAt: "2026-07-29T01:00:00.000Z",
    },
  ]);
  const listOutputRefsByProjects = vi.fn(async () => [
    {
      projectId: "project-1",
      outputId: "output-1",
      title: "七月收官成片",
      contentType: "video",
      status: "published",
    },
  ]);
  const listPublicationsByOutputIds = vi.fn(async () => [
    {
      id: "publication-1",
      contentOutputId: "output-1",
      platform: "douyin",
      status: "removed",
      currentRevisionId: "revision-1",
      scheduledAt: null,
      publishedAt: "2026-07-28T16:30:00.000Z",
      removedAt: "2026-07-29T00:00:00.000Z",
      hiddenAt: null,
      createdAt: "2026-07-28T16:00:00.000Z",
    },
  ]);
  const listCurrentRevisionSummariesByPublicationIds = vi.fn(async () => [
    {
      publicationId: "publication-1",
      revisionId: "revision-1",
      title: "真实标题",
      coverAssetId: "asset-cover",
    },
  ]);
  const listLatestSnapshotsByPublicationIds = vi.fn(async () => {
    if (options?.analyticsFails) throw new Error("analytics down");
    return [
      {
        id: "snapshot-1",
        publicationId: "publication-1",
        capturedAt: "2026-07-29T02:00:00.000Z",
        rawMetrics: { views: 1200, likes: 60, comments: 12 },
      },
    ];
  });

  return {
    deps: {
      calendar: { getCalendarRequestContext, listCalendar },
      projects: {
        listProjectsForComposition,
        listOutputRefsByProjects,
      },
      publishing: {
        listPublicationsByOutputIds,
        listCurrentRevisionSummariesByPublicationIds,
      },
      analytics: { listLatestSnapshotsByPublicationIds },
    } as unknown as PublishingScheduleProjectionDeps,
    calls: {
      getCalendarRequestContext,
      listCalendar,
      listProjectsForComposition,
      listOutputRefsByProjects,
      listPublicationsByOutputIds,
      listCurrentRevisionSummariesByPublicationIds,
      listLatestSnapshotsByPublicationIds,
    },
  };
}

describe("[T-599] publishing schedule batch projection", () => {
  it("六个批量数据端口各调用一次，并按 identity timezone 归入月历日", async () => {
    const { deps, calls } = stubs();
    const result = await buildPublishingScheduleProjection(
      deps,
      ctx,
      "2026-07",
    );

    expect(result.calendar.state).toBe("ready");
    if (result.calendar.state === "ready") {
      expect(result.calendar.viewModel.publications[0]).toMatchObject({
        id: "publication-1",
        dateKey: "2026-07-29",
        title: "真实标题",
        coverAssetId: "asset-cover",
      });
    }
    expect(result.performance.error).toBeNull();
    expect(result.performance.metrics[0]?.value).toBe("1,200");
    for (const call of [
      calls.listCalendar,
      calls.listProjectsForComposition,
      calls.listOutputRefsByProjects,
      calls.listPublicationsByOutputIds,
      calls.listCurrentRevisionSummariesByPublicationIds,
      calls.listLatestSnapshotsByPublicationIds,
    ]) {
      expect(call).toHaveBeenCalledTimes(1);
    }
    expect(calls.getCalendarRequestContext).toHaveBeenCalledTimes(1);
  });

  it("analytics 失败只让右侧表现报错，月历仍保留排期和发布事实", async () => {
    const { deps } = stubs({ analyticsFails: true });
    const result = await buildPublishingScheduleProjection(
      deps,
      ctx,
      "2026-07",
    );

    expect(result.calendar.state).toBe("ready");
    expect(result.performance.scenario).toBe("error");
    expect(result.performance.error?.message).toContain("analytics down");
  });
});

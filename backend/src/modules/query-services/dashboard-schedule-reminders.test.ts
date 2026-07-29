import { describe, expect, it } from "vitest";
import type { DashboardPage } from "@creatoros/contract";
import { composeDashboardTodos } from "./dashboard-schedule-reminders";

type Todo = DashboardPage["todos"][number];

const stored = (id: string): Todo => ({
  id,
  title: `任务 ${id}`,
  projectId: "project-stored",
  projectTitle: "普通任务",
  stage: "script",
  dueAt: null,
  priority: 3,
  status: "todo",
  origin: "task",
  reason: null,
  plannedDate: null,
  href: null,
  completable: true,
});

const video = (id: string): Todo => ({
  ...stored(id),
  title: "成片待采纳",
  origin: "system_derived",
  reason: "video_render",
  href: "/projects/project-stored/production",
  completable: false,
});

describe("[T-599] composeDashboardTodos", () => {
  it("派生逾期/今天/临近未就绪提醒，并跳过已发布、归档、导入和无项目旧 entry", () => {
    const result = composeDashboardTodos({
      today: "2026-07-29",
      schedules: [
        { id: "late", projectId: "p-late", plannedDate: "2026-07-28" },
        { id: "today", projectId: "p-today", plannedDate: "2026-07-29" },
        { id: "soon", projectId: "p-soon", plannedDate: "2026-07-31" },
        { id: "ready-soon", projectId: "p-ready", plannedDate: "2026-07-30" },
        { id: "published", projectId: "p-published", plannedDate: "2026-07-28" },
        { id: "archived", projectId: "p-archived", plannedDate: "2026-07-28" },
        { id: "imported", projectId: "p-imported", plannedDate: "2026-07-28" },
        { id: "legacy", projectId: null, plannedDate: "2026-07-28" },
      ],
      projects: [
        {
          id: "p-late",
          title: "逾期项目",
          status: "active",
          source: "manual",
          currentStage: "publishing",
          updatedAt: "2026-07-29T08:00:00.000Z",
          outputs: [{ id: "o-late", status: "ready" }],
        },
        {
          id: "p-today",
          title: "今天项目",
          status: "active",
          source: "manual",
          currentStage: "script",
          updatedAt: "2026-07-29T07:00:00.000Z",
          outputs: [],
        },
        {
          id: "p-soon",
          title: "临近项目",
          status: "active",
          source: "manual",
          currentStage: "production",
          updatedAt: "2026-07-29T06:00:00.000Z",
          outputs: [{ id: "o-soon", status: "editing" }],
        },
        {
          id: "p-ready",
          title: "已就绪项目",
          status: "active",
          source: "manual",
          currentStage: "publishing",
          updatedAt: "2026-07-29T05:00:00.000Z",
          outputs: [{ id: "o-ready", status: "ready" }],
        },
        {
          id: "p-published",
          title: "已发布项目",
          status: "active",
          source: "manual",
          currentStage: "review",
          updatedAt: "2026-07-29T04:00:00.000Z",
          outputs: [],
        },
        {
          id: "p-archived",
          title: "归档项目",
          status: "archived",
          source: "manual",
          currentStage: "script",
          updatedAt: "2026-07-29T03:00:00.000Z",
          outputs: [],
        },
        {
          id: "p-imported",
          title: "导入项目",
          status: "active",
          source: "imported",
          currentStage: "review",
          updatedAt: "2026-07-29T02:00:00.000Z",
          outputs: [],
        },
      ],
      publishedProjectIds: new Set(["p-published"]),
      videoTodos: [],
      storedTodos: [],
    });

    expect(result.map((todo) => todo.reason)).toEqual([
      "overdue",
      "today",
      "upcoming_not_ready",
    ]);
    expect(result[0]).toMatchObject({
      id: "schedule:late:overdue",
      title: "发布排期已逾期 · 7月28日",
      href: "/projects/p-late/publishing",
      origin: "system_derived",
      completable: false,
    });
  });

  it("最多 3 条排期、1 条成片，且 stored 非空时保留至少 1 个槽位", () => {
    const project = (id: string, updatedAt: string) => ({
      id,
      title: id,
      status: "active",
      source: "manual",
      currentStage: "script" as const,
      updatedAt,
      outputs: [],
    });
    const result = composeDashboardTodos({
      today: "2026-07-29",
      schedules: [
        { id: "s1", projectId: "p1", plannedDate: "2026-07-28" },
        { id: "s2", projectId: "p2", plannedDate: "2026-07-28" },
        { id: "s3", projectId: "p3", plannedDate: "2026-07-29" },
        { id: "s4", projectId: "p4", plannedDate: "2026-07-29" },
      ],
      projects: [
        project("p1", "2026-07-29T01:00:00.000Z"),
        project("p2", "2026-07-29T02:00:00.000Z"),
        project("p3", "2026-07-29T03:00:00.000Z"),
        project("p4", "2026-07-29T04:00:00.000Z"),
      ],
      publishedProjectIds: new Set(),
      videoTodos: [video("video-1"), video("video-2")],
      storedTodos: [stored("stored-1"), stored("stored-2")],
    });

    expect(result).toHaveLength(5);
    expect(result.map((todo) => todo.id)).toEqual([
      "schedule:s2:overdue",
      "schedule:s1:overdue",
      "schedule:s4:today",
      "video-1",
      "stored-1",
    ]);
  });
});

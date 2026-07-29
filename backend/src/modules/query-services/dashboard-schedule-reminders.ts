import type { DashboardPage } from "@creatoros/contract";

type DashboardTodo = DashboardPage["todos"][number];

export interface ActiveProjectSchedule {
  id: string;
  projectId: string | null;
  plannedDate: string;
}

export interface ScheduleProjectFact {
  id: string;
  title: string;
  status: string;
  source: string;
  currentStage: DashboardTodo["stage"];
  updatedAt: string;
  outputs: ReadonlyArray<{ id: string; status: string }>;
}

export interface DashboardScheduleInput {
  today: string;
  schedules: ReadonlyArray<ActiveProjectSchedule>;
  projects: ReadonlyArray<ScheduleProjectFact>;
  publishedProjectIds: ReadonlySet<string>;
  videoTodos: ReadonlyArray<DashboardTodo>;
  storedTodos: ReadonlyArray<DashboardTodo>;
}

const REASON_ORDER = {
  overdue: 0,
  today: 1,
  upcoming_not_ready: 2,
} as const;

function addCalendarDays(date: string, days: number): string {
  const [year, month, day] = date.split("-").map(Number);
  const instant = new Date(Date.UTC(year!, month! - 1, day! + days));
  return instant.toISOString().slice(0, 10);
}

function displayDate(date: string): string {
  const [, month, day] = date.split("-").map(Number);
  return `${month}月${day}日`;
}

/**
 * T-599 首页排期提醒是只读投影：不创建 task/notification，也不允许手工完成。
 * 这里同时执行稳定排序、总量配额与 stored todo 防饥饿。
 */
export function composeDashboardTodos(
  input: DashboardScheduleInput,
): DashboardTodo[] {
  const projects = new Map(input.projects.map((project) => [project.id, project]));
  const upcomingBoundary = addCalendarDays(input.today, 2);

  const scheduleTodos = input.schedules
    .flatMap((entry) => {
      if (!entry.projectId) return [];
      const project = projects.get(entry.projectId);
      if (
        !project ||
        project.status === "archived" ||
        project.status === "completed" ||
        project.source === "imported" ||
        input.publishedProjectIds.has(project.id)
      ) {
        return [];
      }

      const outputReady = project.outputs.some(
        (output) => output.status === "ready" || output.status === "published",
      );
      const reason =
        entry.plannedDate < input.today
          ? ("overdue" as const)
          : entry.plannedDate === input.today
            ? ("today" as const)
            : entry.plannedDate <= upcomingBoundary && !outputReady
              ? ("upcoming_not_ready" as const)
              : null;
      if (!reason) return [];

      const dateLabel = displayDate(entry.plannedDate);
      const title =
        reason === "overdue"
          ? `发布排期已逾期 · ${dateLabel}`
          : reason === "today"
            ? `今天计划发布 · ${dateLabel}`
            : `排期临近，内容还未就绪 · ${dateLabel}`;

      return [
        {
          id: `schedule:${entry.id}:${reason}`,
          title,
          projectId: project.id,
          projectTitle: project.title,
          stage: project.currentStage,
          dueAt: null,
          priority: (reason === "upcoming_not_ready" ? 2 : 1) as 1 | 2,
          status: "todo" as const,
          origin: "system_derived" as const,
          reason,
          plannedDate: entry.plannedDate,
          href: outputReady
            ? `/projects/${project.id}/publishing`
            : `/projects/${project.id}`,
          completable: false,
          projectUpdatedAt: project.updatedAt,
        },
      ];
    })
    .sort(
      (a, b) =>
        REASON_ORDER[a.reason] - REASON_ORDER[b.reason] ||
        a.plannedDate.localeCompare(b.plannedDate) ||
        b.projectUpdatedAt.localeCompare(a.projectUpdatedAt) ||
        a.projectId.localeCompare(b.projectId),
    )
    .slice(0, 3)
    .map(({ projectUpdatedAt: _projectUpdatedAt, ...todo }) => todo);

  const maxVideo = input.videoTodos.slice(0, 1);
  const reserveStored = input.storedTodos.length > 0 ? 1 : 0;
  const scheduleLimit = Math.min(scheduleTodos.length, 5 - reserveStored);
  const withVideo = [
    ...scheduleTodos.slice(0, scheduleLimit),
    ...maxVideo.slice(0, Math.max(0, 5 - reserveStored - scheduleLimit)),
  ];
  return [
    ...withVideo,
    ...input.storedTodos.slice(0, Math.max(0, 5 - withVideo.length)),
  ];
}

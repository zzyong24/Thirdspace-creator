import { describe, expect, it } from "vitest";

import {
  detectTaskNotifications,
  mergeTaskNotifications,
  NOTIFY_STATUSES,
  type TaskStatusRow,
} from "./task-notifications";

// [T-239g] 长任务完成 → 对话内通知卡:纯检测逻辑单测。
//   ① NOTIFY_STATUSES 只含「跑完/失败/待确认」三态,进行中不在内;
//   ② 首帧(seeded=false)只播种快照、绝不产通知(否则每次进面板刷历史已完成任务);
//   ③ running→succeeded/failed/awaiting_confirmation 各产一条通知,进行中不产;
//   ④ 同一 status 反复出现不重复通知;awaiting_confirmation→succeeded 是新事件、再产一条;
//   ⑤ failed 通知带原因(errorMessage 透传);
//   ⑥ 快照合并(非重建):任务翻页掉出再回来,已知 status 保留、不误触二次通知。

const row = (over: Partial<TaskStatusRow> & { id: string }): TaskStatusRow => ({
  taskType: "script.draft",
  status: "running",
  ...over,
});

describe("NOTIFY_STATUSES", () => {
  it("只含需知会的三个终态,进行中不在内", () => {
    expect(NOTIFY_STATUSES.has("succeeded")).toBe(true);
    expect(NOTIFY_STATUSES.has("failed")).toBe(true);
    expect(NOTIFY_STATUSES.has("awaiting_confirmation")).toBe(true);
    expect(NOTIFY_STATUSES.has("queued")).toBe(false);
    expect(NOTIFY_STATUSES.has("running")).toBe(false);
    expect(NOTIFY_STATUSES.has("cancelled")).toBe(false);
  });
});

describe("detectTaskNotifications", () => {
  it("首帧只播种快照,不产任何通知(即使已是终态)", () => {
    const { notifications, nextSnapshot } = detectTaskNotifications(
      new Map(),
      [
        row({ id: "a", status: "succeeded" }),
        row({ id: "b", status: "running" }),
        row({ id: "c", status: "awaiting_confirmation" }),
      ],
      false,
    );
    expect(notifications).toEqual([]);
    expect(nextSnapshot.get("a")).toBe("succeeded");
    expect(nextSnapshot.get("b")).toBe("running");
    expect(nextSnapshot.get("c")).toBe("awaiting_confirmation");
  });

  it("running→succeeded:产一条 succeeded 通知", () => {
    const seed = detectTaskNotifications(
      new Map(),
      [row({ id: "a", status: "running" })],
      false,
    );
    const { notifications } = detectTaskNotifications(
      seed.nextSnapshot,
      [row({ id: "a", status: "succeeded" })],
      true,
    );
    expect(notifications).toEqual([
      { taskId: "a", taskType: "script.draft", status: "succeeded", errorMessage: null },
    ]);
  });

  it("running→failed:通知诚实带原因(errorMessage 透传)", () => {
    const seed = detectTaskNotifications(
      new Map(),
      [row({ id: "a", status: "running" })],
      false,
    );
    const { notifications } = detectTaskNotifications(
      seed.nextSnapshot,
      [row({ id: "a", status: "failed", errorMessage: "模型被取消(MiniMax cancelled)" })],
      true,
    );
    expect(notifications).toHaveLength(1);
    expect(notifications[0]).toMatchObject({
      taskId: "a",
      status: "failed",
      errorMessage: "模型被取消(MiniMax cancelled)",
    });
  });

  it("running→awaiting_confirmation:产一条待确认通知", () => {
    const seed = detectTaskNotifications(
      new Map(),
      [row({ id: "a", status: "running" })],
      false,
    );
    const { notifications } = detectTaskNotifications(
      seed.nextSnapshot,
      [row({ id: "a", status: "awaiting_confirmation" })],
      true,
    );
    expect(notifications).toHaveLength(1);
    expect(notifications[0]!.status).toBe("awaiting_confirmation");
  });

  it("进行中(queued/running)不产通知", () => {
    const seed = detectTaskNotifications(
      new Map(),
      [row({ id: "a", status: "queued" })],
      false,
    );
    const { notifications } = detectTaskNotifications(
      seed.nextSnapshot,
      [row({ id: "a", status: "running" })],
      true,
    );
    expect(notifications).toEqual([]);
  });

  it("同一 status 反复出现不重复通知(before===status 短路)", () => {
    const seed = detectTaskNotifications(
      new Map(),
      [row({ id: "a", status: "running" })],
      false,
    );
    const first = detectTaskNotifications(
      seed.nextSnapshot,
      [row({ id: "a", status: "succeeded" })],
      true,
    );
    expect(first.notifications).toHaveLength(1);
    const second = detectTaskNotifications(
      first.nextSnapshot,
      [row({ id: "a", status: "succeeded" })],
      true,
    );
    expect(second.notifications).toEqual([]);
  });

  it("awaiting_confirmation→succeeded 是不同状态迁移,再产一条(用户已采纳→彻底完成)", () => {
    const seed = detectTaskNotifications(
      new Map(),
      [row({ id: "a", status: "awaiting_confirmation" })],
      false,
    );
    const { notifications } = detectTaskNotifications(
      seed.nextSnapshot,
      [row({ id: "a", status: "succeeded" })],
      true,
    );
    expect(notifications).toHaveLength(1);
    expect(notifications[0]!.status).toBe("succeeded");
  });

  it("快照合并:任务翻页掉出本轮 rows 再回来,不误触二次通知", () => {
    const seed = detectTaskNotifications(
      new Map(),
      [row({ id: "a", status: "running" })],
      false,
    );
    const done = detectTaskNotifications(
      seed.nextSnapshot,
      [row({ id: "a", status: "succeeded" })],
      true,
    );
    expect(done.notifications).toHaveLength(1);
    // 下一轮 a 掉出 rows(翻页),只剩别的任务 —— a 的 status 仍保留在快照。
    const other = detectTaskNotifications(
      done.nextSnapshot,
      [row({ id: "b", status: "running" })],
      true,
    );
    expect(other.notifications).toEqual([]);
    expect(other.nextSnapshot.get("a")).toBe("succeeded");
    // a 又回来(仍 succeeded)—— before===succeeded,不再通知。
    const back = detectTaskNotifications(
      other.nextSnapshot,
      [row({ id: "a", status: "succeeded" })],
      true,
    );
    expect(back.notifications).toEqual([]);
  });

  it("多任务同轮各自迁移:分别产通知", () => {
    const seed = detectTaskNotifications(
      new Map(),
      [
        row({ id: "a", status: "running" }),
        row({ id: "b", status: "running" }),
        row({ id: "c", status: "running" }),
      ],
      false,
    );
    const { notifications } = detectTaskNotifications(
      seed.nextSnapshot,
      [
        row({ id: "a", status: "succeeded" }),
        row({ id: "b", status: "failed", errorMessage: "boom" }),
        row({ id: "c", status: "running" }), // 仍在跑 → 不通知
      ],
      true,
    );
    expect(notifications.map((n) => n.taskId).sort()).toEqual(["a", "b"]);
  });

  it("同轮大量项目重建因缺逐字稿失败时，聚合成一条并保留真实数量", () => {
    const running = Array.from({ length: 40 }, (_, i) =>
      row({ id: `reconstruct-${i}`, taskType: "reconstruct.project" }),
    );
    const seed = detectTaskNotifications(new Map(), running, false);
    const failed = running.map((item, i) => ({
      ...item,
      status: "failed",
      errorMessage: `项目 project-${i} 无逐字稿(D3 尚未绑定),无法反推重建`,
    }));

    const { notifications } = detectTaskNotifications(
      seed.nextSnapshot,
      failed,
      true,
    );

    expect(notifications).toHaveLength(1);
    expect(notifications[0]).toMatchObject({
      taskType: "reconstruct.project",
      status: "failed",
      count: 40,
      errorMessage: "逐字稿尚未就绪，系统会在转写完成后继续。",
    });
  });

  it("同一批失败跨轮到达时仍合并到原通知，而不是继续弹新卡", () => {
    const first = [{
      taskId: "bulk:reconstruct.project:failed:missing-transcript",
      taskType: "reconstruct.project",
      status: "failed" as const,
      errorMessage: "逐字稿尚未就绪，系统会在转写完成后继续。",
      count: 24,
    }];
    const next = [{ ...first[0]!, count: 16 }];

    expect(mergeTaskNotifications(first, next)).toEqual([
      { ...first[0]!, count: 40 },
    ]);
  });

  it("不改入参 prev(返回新 Map)", () => {
    const prev = new Map<string, string>();
    const { nextSnapshot } = detectTaskNotifications(
      prev,
      [row({ id: "a", status: "succeeded" })],
      false,
    );
    expect(prev.size).toBe(0);
    expect(nextSnapshot).not.toBe(prev);
    expect(nextSnapshot.get("a")).toBe("succeeded");
  });
});

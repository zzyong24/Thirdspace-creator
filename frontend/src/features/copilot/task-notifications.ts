import {taskRuntimeStatus} from '@/lib/ai-task-runtime';
/**
 * [T-239g] 长任务完成 → 对话内通知卡:纯检测逻辑(无 React 依赖,可直接单测)。
 *
 * SPEC 2026-07-11 director-agent-hardening §2-S7:ai_tasks 到「需知会」终态时,
 * 不靠用户盯着任务列表刷 —— 前端轮询 ai.tasks.list(既有 feed,复用不重造),对比
 * 前后两轮的状态快照,检出「本轮新到达需知会终态」的任务 → 生成一张轻通知。
 *
 * 「需知会」终态 = succeeded / failed / awaiting_confirmation:
 *   - succeeded:长任务(拆片/批量归因/渲染)跑完了;
 *   - failed:诚实告知失败(带原因);
 *   - awaiting_confirmation:跑完初稿、等你确认(§12 状态机里它非终态,但对用户即「该看了」)。
 * 进行中(queued/running)绝不通知(不打扰)。
 *
 * 机制刻意最小:不引服务端推送/WebSocket 基建,只在既有 feed 轮询上叠一层纯 diff。
 * 服务端存储零改动(ai_messages 不落 system 卡)—— 通知是前端会话期的瞬态,关掉即走。
 */

// 「需知会」状态集合(§12 状态机中「跑完/失败/待确认」三态)。进行中态不在内。
export const NOTIFY_STATUSES: ReadonlySet<string> = new Set([
  "succeeded",
  "failed",
  "awaiting_confirmation",
  "waiting_user", "unknown_result", "paused", "partial",
]);

export type TaskNotifyStatus =
  | "succeeded"
  | "failed"
  | "awaiting_confirmation" | "waiting_user" | "unknown_result" | "paused" | "partial";

/** feed 行的最小投影(ai.tasks.list 返回 aiTaskResource 的子集,含 errorMessage 供失败带原因)。 */
export interface TaskStatusRow {
  readonly id: string;
  readonly taskType: string;
  readonly status: string;
  readonly errorMessage?: string | null;
  readonly executionTaskId?:string|null;
  readonly runtimeStatus?:string|null;
}

/** 一条通知的载荷(渲染层据 taskType 查中文名、据 status 选文案/配色、据 errorMessage 带原因)。 */
export interface TaskNotification {
  readonly taskId: string;
  readonly taskType: string;
  readonly status: TaskNotifyStatus;
  readonly errorMessage: string | null;
  /** 同一轮同因后台任务合并后的真实数量；单条省略。 */
  readonly count?: number;
  readonly executionTaskId?:string|null;
  readonly runtimeStatus?:string|null;
}

export interface DetectResult {
  /** 本轮新到达需知会终态的任务(可能为空)。 */
  readonly notifications: TaskNotification[];
  /** 下一轮对比的基线快照(合并 prev + 本轮 rows,不可变,不改入参)。 */
  readonly nextSnapshot: Map<string, string>;
}

const RECONSTRUCT_MISSING_TRANSCRIPT_KEY = "missing-transcript";

function reconstructFailureGroup(errorMessage: string | null): {
  key: string;
  displayMessage: string | null;
} {
  const raw = (errorMessage ?? "").trim();
  if (raw.includes("无逐字稿") && raw.includes("无法反推重建")) {
    return {
      key: RECONSTRUCT_MISSING_TRANSCRIPT_KEY,
      displayMessage: "逐字稿尚未就绪，系统会在转写完成后继续。",
    };
  }
  return { key: raw || "unknown", displayMessage: errorMessage };
}

/** 把跨轮到达的同一后台批失败继续并入原卡；普通任务按 taskId 覆盖最新状态。 */
export function mergeTaskNotifications(
  previous: readonly TaskNotification[],
  incoming: readonly TaskNotification[],
): TaskNotification[] {
  const byId = new Map(previous.map((n) => [n.taskId, n]));
  for (const notification of incoming) {
    const existing = byId.get(notification.taskId);
    if (existing && notification.taskId.startsWith("bulk:")) {
      byId.set(notification.taskId, {
        ...notification,
        count: (existing.count ?? 1) + (notification.count ?? 1),
      });
    } else {
      byId.set(notification.taskId, notification);
    }
  }
  return Array.from(byId.values());
}

/**
 * 对比上轮状态快照与本轮 feed 行,产出「本轮新到达需知会终态」的通知。
 *
 * @param prev    上一轮的 taskId → status 快照(首帧传空 Map)。
 * @param rows    本轮 feed 行(创作类任务;scheduled.* 巡航噪音应由调用侧先过滤掉)。
 * @param seeded  是否已完成首帧「只播种不通知」——首帧(false)只提示需处理的等待/未知/暂停,
 *                历史已完成任务仍不重复提示。
 *
 * 迁移判据:本轮 `status ∈ NOTIFY_STATUSES` 且与上轮已知 status **不同** → 一条通知。
 * 覆盖:running→succeeded/failed、running→awaiting_confirmation、awaiting_confirmation→succeeded。
 * 同一 status 反复出现(还没被采纳的 awaiting)不会重复通知(before===status 短路)。
 *
 * 快照用「合并」而非「重建」:pageSize 有限,任务翻页掉出再回来时 before 仍在,不会误触
 * 二次通知(已知 status 保留);会话期内 id 数量有界,增长可忽略。
 */
export function detectTaskNotifications(
  prev: ReadonlyMap<string, string>,
  rows: readonly TaskStatusRow[],
  seeded: boolean,
): DetectResult {
  const nextSnapshot = new Map<string, string>(prev);
  const notifications: TaskNotification[] = [];
  for (const row of rows) {
    const before = nextSnapshot.get(row.id);
    const status=taskRuntimeStatus(row);
    nextSnapshot.set(row.id, status);
    // 每轮普通对话已在消息区显示回答，不再当作后台长任务完成提示。
    // 失败和需要用户处理的状态仍保留，避免吞掉恢复入口。
    if (row.taskType === "copilot.assist" && status === "succeeded") continue;
    if (!seeded && !["waiting_user","unknown_result","paused"].includes(status)) continue;
    if (NOTIFY_STATUSES.has(status) && before !== status) {
      notifications.push({
        taskId: row.id,
        taskType: row.taskType,
        status: status as TaskNotifyStatus,
        executionTaskId:row.executionTaskId,runtimeStatus:row.runtimeStatus,
        errorMessage: row.errorMessage ?? null,
      });
    }
  }
  // 历史项目重建属于后台批处理：同一轮同因失败若逐条展示，会把一个根因放大成
  // “疯狂弹出”。只对该批处理类型按状态+原始原因聚合；用户主动发起的创作任务仍逐条保留。
  const compacted: TaskNotification[] = [];
  const reconstructGroupIndexes = new Map<string, number>();
  for (const notification of notifications) {
    if (
      notification.taskType !== "reconstruct.project" ||
      notification.status !== "failed"
    ) {
      compacted.push(notification);
      continue;
    }
    const failureGroup = reconstructFailureGroup(notification.errorMessage);
    const key = `${notification.status}\u0000${failureGroup.key}`;
    const existingIndex = reconstructGroupIndexes.get(key);
    if (existingIndex !== undefined) {
      const existing = compacted[existingIndex]!;
      compacted[existingIndex] = {
        ...existing,
        count: (existing.count ?? 1) + 1,
      };
    } else {
      const grouped = {
        ...notification,
        taskId: `bulk:${notification.taskType}:${notification.status}:${failureGroup.key}`,
        errorMessage: failureGroup.displayMessage,
        count: 1,
      };
      reconstructGroupIndexes.set(key, compacted.length);
      compacted.push(grouped);
    }
  }
  return { notifications: compacted, nextSnapshot };
}

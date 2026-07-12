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
]);

export type TaskNotifyStatus =
  | "succeeded"
  | "failed"
  | "awaiting_confirmation";

/** feed 行的最小投影(ai.tasks.list 返回 aiTaskResource 的子集,含 errorMessage 供失败带原因)。 */
export interface TaskStatusRow {
  readonly id: string;
  readonly taskType: string;
  readonly status: string;
  readonly errorMessage?: string | null;
}

/** 一条通知的载荷(渲染层据 taskType 查中文名、据 status 选文案/配色、据 errorMessage 带原因)。 */
export interface TaskNotification {
  readonly taskId: string;
  readonly taskType: string;
  readonly status: TaskNotifyStatus;
  readonly errorMessage: string | null;
}

export interface DetectResult {
  /** 本轮新到达需知会终态的任务(可能为空)。 */
  readonly notifications: TaskNotification[];
  /** 下一轮对比的基线快照(合并 prev + 本轮 rows,不可变,不改入参)。 */
  readonly nextSnapshot: Map<string, string>;
}

/**
 * 对比上轮状态快照与本轮 feed 行,产出「本轮新到达需知会终态」的通知。
 *
 * @param prev    上一轮的 taskId → status 快照(首帧传空 Map)。
 * @param rows    本轮 feed 行(创作类任务;scheduled.* 巡航噪音应由调用侧先过滤掉)。
 * @param seeded  是否已完成首帧「只播种不通知」——首帧(false)只记快照、绝不产通知,
 *                否则每次进面板会把历史已完成任务全刷成通知(噪音)。
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
    nextSnapshot.set(row.id, row.status);
    if (!seeded) continue; // 首帧只播种
    if (NOTIFY_STATUSES.has(row.status) && before !== row.status) {
      notifications.push({
        taskId: row.id,
        taskType: row.taskType,
        status: row.status as TaskNotifyStatus,
        errorMessage: row.errorMessage ?? null,
      });
    }
  }
  return { notifications, nextSnapshot };
}

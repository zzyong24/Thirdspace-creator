"use client";

/**
 * [T-247] 待办卡(client 岛)—— 从 dashboard-page 的纯展示 TodoCard 升级:
 * 每行加「完成」勾选 → `tasks.patch { status: 'done' }`(契约 op 早已存在,
 * 此前前端零调用 = 待办数字永远减不下去)。
 *
 * 交互:点勾选 → 乐观置完成态(行划线 + 勾实心)→ 打 op → router.refresh()
 * 让服务端读侧回流(dashboard 的 todos 组合读只取未完成,刷新后该行消失、
 * 计数减一)。op 失败 → 回滚乐观态,行内提示可重试,绝不假装已完成。
 */

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Check } from "lucide-react";

import { SectionCard } from "@/components/project/section-card";
import { TagChip } from "@/components/content/tag-chip";
import { STAGE_LABELS as CANONICAL_STAGE_LABELS } from "@/lib/stage-labels";
import { client } from "@/lib/contract-client";
import { cn } from "@/lib/utils";
import type { DashboardViewModel, TodoRow } from "@/types/view-models";
import type { ProjectStageName } from "@/types/domain";

// ---------------------------------------------------------------------------
// 展示辅助(与 dashboard-page 同词表;抽到本文件因 dashboard-page 引 server-only
// client,client 岛不能反向 import 它)。
// ---------------------------------------------------------------------------

const STAGE_LABELS: Record<ProjectStageName | string, string> = {
  ...CANONICAL_STAGE_LABELS,
  recording: "录制",
  editing: "剪辑",
  ready: "已就绪",
};

function stageLabel(stage: string): string {
  return STAGE_LABELS[stage] ?? stage;
}

const PRIORITY_LABELS: Record<number, string> = {
  1: "高",
  2: "高",
  3: "中",
  4: "低",
  5: "低",
};

const PRIORITY_TONES: Record<number, "warning" | "info" | "neutral"> = {
  1: "warning",
  2: "warning",
  3: "info",
  4: "neutral",
  5: "neutral",
};

function priorityLabel(priority: number): string {
  return PRIORITY_LABELS[priority] ?? "中";
}

function priorityTone(priority: number): "warning" | "info" | "neutral" {
  return PRIORITY_TONES[priority] ?? "neutral";
}

/** [T-076] review → 复盘页;其余 stage 一律落稿面。 */
function todoHref(todo: TodoRow): string {
  return todo.stage === "review"
    ? `/projects/${todo.projectId}/review`
    : `/projects/${todo.projectId}`;
}

// ---------------------------------------------------------------------------
// TodoCard
// ---------------------------------------------------------------------------

export function TodoCard({
  todos,
  scheduleReminderReadState = { state: "ready", error: null },
}: {
  todos: ReadonlyArray<TodoRow>;
  scheduleReminderReadState?: DashboardViewModel["scheduleReminderReadState"];
}) {
  const router = useRouter();
  // 乐观完成集合(点勾后立即划线;refresh 回流后行由服务端读侧移除)。
  const [doneIds, setDoneIds] = React.useState<ReadonlySet<string>>(new Set());
  // 打 op 在途的任务(防连点);失败任务 → 行内错误提示。
  const [pendingId, setPendingId] = React.useState<string | null>(null);
  const [errorId, setErrorId] = React.useState<string | null>(null);

  const complete = React.useCallback(
    (taskId: string) => {
      if (pendingId !== null) return;
      setPendingId(taskId);
      setErrorId(null);
      // 乐观:立即划线。
      setDoneIds((prev) => new Set(prev).add(taskId));
      void (async () => {
        try {
          await client.patchTask({
            params: { taskId },
            query: undefined,
            body: { status: "done" },
          });
          router.refresh();
        } catch {
          // 失败回滚乐观态(诚实,不假装已完成),行内提示可重试。
          setDoneIds((prev) => {
            const next = new Set(prev);
            next.delete(taskId);
            return next;
          });
          setErrorId(taskId);
        } finally {
          setPendingId(null);
        }
      })();
    },
    [pendingId, router],
  );

  return (
    <div data-slot="todo-card">
      <SectionCard title="待办事项" description={`${todos.length} 项待处理任务`}>
        {scheduleReminderReadState.state === "error" ? (
          <div
            data-slot="schedule-reminder-error"
            role="alert"
            className="mb-2 flex items-center justify-between gap-3 rounded-card border border-warning/30 bg-warning/10 px-3 py-2 text-xs text-foreground"
          >
            <span>{scheduleReminderReadState.error.message}</span>
            <button
              type="button"
              onClick={() => router.refresh()}
              className="shrink-0 font-medium text-brand hover:underline"
            >
              重试
            </button>
          </div>
        ) : null}
        {/* [T-054] 空态引导:0 待办时把人送去下一步(选题池)。 */}
        {todos.length === 0 && scheduleReminderReadState.state === "ready" ? (
          <div
            data-slot="todo-empty"
            className="flex flex-col items-start gap-2 rounded-card border border-dashed border-border bg-surface-subtle px-3.5 py-4"
          >
            <Link
              href="/topics"
              className="text-sm font-medium text-brand hover:underline"
            >
              去选题池挑一条 →
            </Link>
          </div>
        ) : null}
        <ul
          data-slot="todo-list"
          className="flex flex-col gap-2"
          aria-label="待办任务"
        >
          {todos.slice(0, 5).map((todo) => {
            const done = doneIds.has(todo.id);
            return (
              <li
                key={todo.id}
                data-slot="todo-row"
                data-priority={todo.priority}
                data-done={done ? "true" : "false"}
              >
                <div
                  className={cn(
                    "flex items-start gap-2.5 rounded-card border border-border bg-surface p-3 transition-colors",
                    done ? "opacity-60" : "hover:border-brand/40 hover:bg-surface-subtle",
                  )}
                >
                  {/* [T-247] 完成勾选 → tasks.patch { status: 'done' }。
                      [T-302] 派生待办(completable===false,如「成片待采纳」)不给勾选:
                      它由当前状态驱动(采纳/丢弃后自动消失),不经 tasks.patch;占位圆点保持对齐。 */}
                  {todo.completable === false ? (
                    <span
                      aria-hidden="true"
                      data-slot="todo-derived-dot"
                      className="mt-0.5 flex size-4.5 shrink-0 items-center justify-center rounded-full border border-border-strong bg-surface-subtle"
                    >
                      <span className="size-1.5 rounded-full bg-brand" />
                    </span>
                  ) : (
                    <button
                      type="button"
                      data-slot="todo-complete"
                      aria-label={`完成任务:${todo.title}`}
                      aria-pressed={done}
                      disabled={pendingId !== null || done}
                      onClick={() => complete(todo.id)}
                      className={cn(
                        "mt-0.5 flex size-4.5 shrink-0 items-center justify-center rounded-full border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                        done
                          ? "border-brand bg-brand text-brand-foreground"
                          : "border-border-strong bg-surface hover:border-brand",
                      )}
                    >
                      {done ? (
                        <Check aria-hidden="true" className="size-3" />
                      ) : null}
                    </button>
                  )}
                  {/* D3: each todo deep-links to its project(派生项走 href 直达对应页)。 */}
                  <Link
                    href={todo.href ?? todoHref(todo)}
                    data-slot="todo-row-link"
                    className="flex min-w-0 flex-1 flex-col gap-1.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span
                        className={cn(
                          "truncate text-sm font-medium text-foreground",
                          done && "line-through",
                        )}
                      >
                        {todo.title}
                      </span>
                      <TagChip
                        label={priorityLabel(todo.priority)}
                        tone={priorityTone(todo.priority)}
                        size="sm"
                      />
                    </div>
                    <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
                      <span className="truncate">{todo.projectTitle}</span>
                      <span>{stageLabel(todo.stage)}</span>
                    </div>
                    {todo.plannedDate ? (
                      <div
                        data-slot="todo-planned-date"
                        className="flex items-center gap-1.5 text-xs text-brand"
                      >
                        <span>排期</span>
                        <time dateTime={todo.plannedDate}>
                          {todo.plannedDate}
                        </time>
                      </div>
                    ) : null}
                  </Link>
                </div>
                {errorId === todo.id ? (
                  <p
                    data-slot="todo-complete-error"
                    role="alert"
                    className="mt-1 text-xs text-destructive"
                  >
                    标记完成失败,请重试。
                  </p>
                ) : null}
              </li>
            );
          })}
        </ul>
      </SectionCard>
    </div>
  );
}

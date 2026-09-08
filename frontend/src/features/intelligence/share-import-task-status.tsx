"use client";
import type { ExecutionTaskResourceV2 } from "@creatoros/contract";
import { Button } from "@/components/ui/button";
import { shareImportStatus } from "./use-share-import-tasks";

const labels: Record<string, string> = {
  queued: "已排队", running: "正在识别并建档", retry_wait: "等待自动重试",
  waiting_user: "等待你处理", paused: "已暂停", pause_requested: "正在暂停",
  cancel_requested: "正在取消", cancelled: "已取消", succeeded: "建档完成",
  failed: "导入失败", blocked: "导入受阻", unknown_result: "结果待核对",
};
export function ShareImportTaskStatus({task, busy, canCommand, onCommand, onRefresh}: {
  task: ExecutionTaskResourceV2; busy: boolean; canCommand: boolean;
  onCommand(action: "resume" | "cancel"): void; onRefresh(): void;
}) {
  const status = shareImportStatus(task);
  const resumable = ["waiting_user", "paused"].includes(status);
  const cancellable = ["queued", "running", "retry_wait", "waiting_user", "paused", "pause_requested", "unknown_result", "blocked"].includes(status);
  return <div className="grid gap-2 rounded-xl border border-border px-3 py-2 text-xs">
    <p className="font-medium">{labels[status] ?? status}</p>
    <p className="break-all text-muted-foreground">任务 {task.id}</p>
    {task.errorMessage ? <p>{task.errorMessage}</p> : null}
    {status === "waiting_user" ? <p>如需登录或验证码，请在采集浏览器完成处理后继续原任务。无需重新粘贴提交。</p> : null}
    {status === "unknown_result" ? <p>保留原任务并刷新核对，请勿重复提交同一分享。</p> : null}
    {task.retryAt && status === "retry_wait" ? <p>下次重试：{new Date(task.retryAt).toLocaleString()}</p> : null}
    <div className="flex gap-2">
      {canCommand && resumable ? <Button size="sm" variant="outline" disabled={busy} onClick={() => onCommand("resume")}>继续原任务</Button> : null}
      {canCommand && cancellable ? <Button size="sm" variant="outline" disabled={busy} onClick={() => onCommand("cancel")}>取消任务</Button> : null}
      <Button size="sm" variant="ghost" disabled={busy} onClick={onRefresh}>刷新状态</Button>
    </div>
  </div>;
}

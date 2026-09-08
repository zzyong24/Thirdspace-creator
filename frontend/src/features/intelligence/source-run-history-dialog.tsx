"use client";
import { Dialog,DialogContent,DialogDescription,DialogHeader,DialogTitle } from "@/components/ui/dialog";
import * as React from "react";
import { dateLabel,runResultMessage,runStatusLabel } from "./intelligence-display";
import type { RadarApi,RadarRun,RadarSource } from "./intelligence-workbench-types";
export function SourceRunHistoryDialog({
  source,
  api,
  onClose,
}: {
  source: RadarSource | null;
  api: RadarApi;
  onClose: () => void;
}) {
  const [runs, setRuns] = React.useState<RadarRun[]>([]);
  const [loading, setLoading] = React.useState(Boolean(source));
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!source) return;
    setLoading(true);setError(null);setRuns([]);
    let cancelled = false;
    void api
      .listRuns(source.id)
      .then((rows) => {
        if (!cancelled) setRuns(rows);
      })
      .catch(() => {
        if (!cancelled) setError("运行记录读取失败，请稍后重试。");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [api, source]);

  return (
    <Dialog
      open={Boolean(source)}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{source?.displayName ?? "来源"} · 运行记录</DialogTitle>
          <DialogDescription>
            {source?.monitorEnabled
              ? `每日自动同步；APP 运行时执行，错过后下次打开补跑。下次计划：${dateLabel(source.nextRunAt ?? null)}`
              : "当前仅手动同步，不会定时运行。"}
          </DialogDescription>
        </DialogHeader>
        <div className="max-h-[420px] space-y-2 overflow-y-auto">
          {loading ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              正在读取运行记录…
            </p>
          ) : error ? (
            <p className="rounded-xl bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {error}
            </p>
          ) : runs.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              还没有同步记录。
            </p>
          ) : (
            runs.map((run) => (
              <div
                key={run.id}
                className="rounded-xl border border-border/80 px-3 py-2.5"
              >
                <div className="flex items-center justify-between gap-3">
                  <span className="text-sm font-medium">
                    {runStatusLabel(run.status)}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {dateLabel(run.startedAt ?? run.createdAt)}
                  </span>
                </div>
                <p className="mt-1 text-xs leading-5 text-muted-foreground">
                  扫描 {run.scannedCount} · 新增 {run.newCount} · 更新{" "}
                  {run.updatedCount} · 失败 {run.failedCount}
                </p>
                {run.errorCode ? (
                  <p className="mt-1 text-xs text-destructive">
                    {runResultMessage(run)}
                  </p>
                ) : null}
              </div>
            ))
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}


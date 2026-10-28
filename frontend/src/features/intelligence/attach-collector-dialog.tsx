"use client";
import Link from "next/link";
import * as React from "react";
import { Button } from "@/components/ui/button";
import { Dialog,DialogContent,DialogDescription,DialogFooter,DialogHeader,DialogTitle } from "@/components/ui/dialog";
import type { RadarApi,RadarScope,RadarSource } from "./intelligence-workbench-types";

/** 给未登录时保存的博主主页补关联抖音采集账号，关联成功后由调用方发起同步。 */
export function AttachCollectorDialog({
  source,
  scope,
  api,
  onClose,
  onAttached,
}: {
  source: RadarSource | null;
  scope: RadarScope;
  api: RadarApi;
  onClose: () => void;
  onAttached: (source: RadarSource) => Promise<void> | void;
}) {
  const [collectors, setCollectors] = React.useState<Awaited<ReturnType<RadarApi["listCollectors"]>> | null>(null);
  const [collectorAccountId, setCollectorAccountId] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);

  React.useEffect(() => {
    if (!source) return;
    let cancelled = false;
    setCollectors(null);
    setError(null);
    void api.listCollectors(scope).then(
      (rows) => {
        if (cancelled) return;
        setCollectors(rows);
        setCollectorAccountId(rows[0]?.accountId ?? "");
      },
      () => {
        if (cancelled) return;
        setCollectors([]);
        setError("暂时无法读取可用的抖音账号，请稍后重试。");
      },
    );
    return () => {
      cancelled = true;
    };
  }, [api, scope, source]);

  const attach = async () => {
    if (!source || !collectorAccountId || busy) return;
    setBusy(true);
    setError(null);
    try {
      const updated = await api.updateSource({ sourceId: source.id, collectorAccountId, expectedVersion: source.version });
      await onAttached(updated);
    } catch (caught) {
      setError(caught instanceof Error && caught.message ? caught.message : "关联没有完成，请刷新后重试。");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={source !== null} onOpenChange={(open) => { if (!open && !busy) onClose(); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>关联抖音账号后同步</DialogTitle>
          <DialogDescription>
            {`「${source?.displayName ?? ""}」是在未登录时保存的主页。抖音只向登录用户展示作品列表，关联一个已登录的抖音账号后即可同步。`}
          </DialogDescription>
        </DialogHeader>
        {collectors === null ? (
          <p role="status" className="text-sm text-muted-foreground">正在读取可用抖音账号…</p>
        ) : collectors.length === 0 ? (
          <p className="text-sm leading-6 text-muted-foreground">
            还没有可用的抖音账号。请先到
            <Link href="/accounts" className="mx-1 text-primary underline underline-offset-2">账号管理</Link>
            扫码登录抖音，再回来关联。
          </p>
        ) : (
          <label className="grid gap-1 text-xs text-muted-foreground">
            采集账号
            <select
              aria-label="关联采集账号"
              value={collectorAccountId}
              onChange={(event) => setCollectorAccountId(event.target.value)}
              className="h-9 rounded-xl border border-input bg-background px-3 text-sm text-foreground"
            >
              {collectors.map((collector) => (
                <option key={collector.accountId} value={collector.accountId}>{collector.accountHandle}</option>
              ))}
            </select>
          </label>
        )}
        {error ? (
          <div role="alert" className="rounded-xl border border-danger/25 bg-danger-soft px-3 py-2 text-sm text-danger">{error}</div>
        ) : null}
        <DialogFooter>
          <Button type="button" variant="outline" disabled={busy} onClick={onClose}>取消</Button>
          <Button type="button" disabled={busy || !collectorAccountId} onClick={() => void attach()}>
            {busy ? "正在关联…" : "关联并同步"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

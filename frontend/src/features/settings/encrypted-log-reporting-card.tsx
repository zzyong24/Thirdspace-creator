"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { SectionCard } from "@/components/project/section-card";
import { Button } from "@/components/ui/button";
import { client } from "@/lib/contract-client";
type Status = Awaited<ReturnType<typeof client.getLogReporting>>;
const empty = { params: undefined, query: undefined, body: undefined };
export function EncryptedLogReportingCard() {
  const [status, setStatus] = useState<Status | null>(null);
  const [logs, setLogs] = useState(false);
  const [metrics, setMetrics] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const generation = useRef(0);
  const load = useCallback(async () => {
    const token = ++generation.current;
    setError(null);
    try {
      const next = await client.getLogReporting(empty);
      if (token !== generation.current) return;
      setStatus(next);
      setLogs(next.enabled);
      setMetrics(next.metricsEnabled);
    } catch {
      if (token === generation.current)
        setError("共享状态暂时无法读取，请重试。");
    }
  }, []);
  useEffect(() => {
    void load();
    return () => {
      generation.current++;
    };
  }, [load]);
  const save = async () => {
    if (!status || pending) return;
    const token = generation.current;
    setPending(true);
    setError(null);
    try {
      await client.setLogReporting({
        params: undefined,
        query: undefined,
        body: { enabled: logs, metricsEnabled: metrics, consentVersion: 2 },
      });
      if (token === generation.current) await load();
    } catch {
      if (token === generation.current)
        setError("保存失败，授权状态没有改变，请重试。");
    } finally {
      if (generation.current === token || generation.current === token + 1)
        setPending(false);
    }
  };
  return (
    <SectionCard
      title="运行诊断共享"
      description="按用途选择；软件运行且空闲时，每天最多上报一轮。"
    >
      <div className="space-y-4" data-slot="encrypted-log-reporting">
        <p className="text-sm text-muted-foreground">
          接收方为 Growth
          运营服务。诊断日志先在本机脱敏、加密，再发送完整运行日志，可能包含异常详情和运行上下文；管理员可解密排障，云端保留30天。运行指标仅含成功率、异常次数、耗时与随机安装别名，云端保留90天，不含正文、提示词、账号或密钥。
        </p>
        {!status ? (
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-sm">
              {error ? "状态读取失败" : "正在读取共享状态…"}
            </span>
            {error && (
              <Button size="sm" variant="outline" onClick={() => void load()}>
                重试读取
              </Button>
            )}
          </div>
        ) : (
          <>
            <div className="space-y-3 rounded-lg border px-4 py-3">
              <label className="flex items-start gap-3 text-sm">
                <input
                  type="checkbox"
                  aria-label="共享加密诊断日志"
                  className="mt-1"
                  checked={logs}
                  disabled={
                    pending ||
                    (!status.uploadAvailable && !status.enabled && !logs)
                  }
                  onChange={(event) => setLogs(event.target.checked)}
                />
                <span>
                  <span className="font-medium">加密诊断日志</span>
                  <span className="mt-1 block text-muted-foreground">
                    异常立即在本机记录，留到下一日空闲时发送。
                  </span>
                </span>
              </label>
              <label className="flex items-start gap-3 text-sm">
                <input
                  type="checkbox"
                  aria-label="共享运行指标"
                  className="mt-1"
                  checked={metrics}
                  disabled={pending}
                  onChange={(event) => setMetrics(event.target.checked)}
                />
                <span>
                  <span className="font-medium">运行指标</span>
                  <span className="mt-1 block text-muted-foreground">
                    任务成功、失败、取消与未知结果分别统计。
                  </span>
                </span>
              </label>
            </div>
            {!status.uploadAvailable && (
              <p role="status" className="text-sm text-muted-foreground">
                诊断日志需从桌面软件启动后开启；运行指标仍可单独管理。
              </p>
            )}
            <div className="flex flex-wrap items-center gap-3">
              <Button
                size="sm"
                disabled={
                  pending ||
                  (logs === status.enabled && metrics === status.metricsEnabled)
                }
                onClick={() => void save()}
              >
                {pending ? "正在保存…" : "保存共享设置"}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                disabled={pending}
                onClick={() => void load()}
              >
                刷新状态
              </Button>
              <span className="text-sm text-muted-foreground">
                日志{status.enabled ? "已开启" : "未开启"} · 指标
                {status.metricsEnabled ? "已开启" : "未开启"}
              </span>
            </div>
            <div
              className="space-y-1 text-sm text-muted-foreground"
              aria-live="polite"
            >
              <p>
                {status.lastUploadedAt
                  ? `最近收到：${new Date(status.lastUploadedAt).toLocaleString("zh-CN")}`
                  : "尚未上报"}{" "}
                · 待发指标记录 {status.pendingCount} 条
              </p>
              {status.nextAttemptAt &&
                (status.enabled || status.metricsEnabled) && (
                  <p>
                    下次可上报：
                    {new Date(status.nextAttemptAt).toLocaleString("zh-CN")}
                    以后，等待软件空闲。
                  </p>
                )}
              {status.remotePaused && (
                <p>运营端已暂停数据发送，后续日轮次会检查恢复配置。</p>
              )}
              {status.lastErrorCode && (
                <p>
                  {status.lastErrorCode.startsWith("LOG_PENDING_SOURCE") ||
                  status.lastErrorCode === "LOG_PENDING_EXPIRED"
                    ? "部分旧日志已无法恢复，其余日志会继续发送。"
                    : status.lastErrorCode === "LOG_PENDING_ROUND_BUDGET"
                      ? "本轮额度不足，剩余日志留待后续日轮次。"
                      : "上次发送未完成，下一日空闲时再试。"}
                </p>
              )}
            </div>
          </>
        )}
        <p className="text-sm text-muted-foreground">
          生成、渲染、导出和发布期间推迟发送；退出软件会取消发送。取消勾选并保存可撤回对应用途，停止后续上报，已收到的数据仍按保留期清理。
        </p>
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
      </div>
    </SectionCard>
  );
}

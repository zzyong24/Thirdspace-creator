"use client";

/**
 * [T-363] ModelConfigTransferCard — 设置页「模型」页签的配置导出/导入兜底卡。
 *
 * 动机:重置工作区 / 换机 / 库损坏后,模型配置(厂商/模型/baseUrl/密钥)是用户最疼的
 * 重配成本。归档迁回(workspace-restore)是自动兜底;这张卡是**手动兜底**:随时把全部
 * model_configurations 行导出成 JSON 文件自管,需要时一键导回。
 *
 * 敏感值边界(与 route/service 注释一致,UI 端必须明示):
 *   - 导出文件**包含模型密钥**(库中存储形态:桌面端为本机 master key 加密的密文;
 *     dev/无 keychain 环境等同明文强度)→ 卡上常驻警示「注意保管,勿外发」。
 *   - 跨机器导入:密文解不开 → 配置照导、逐行提示重填密钥(诚实,不假装可用)。
 *
 * 走 /api/v1/settings-transfer/models(GET 导出 / POST 导入);导入成功后 router.refresh()
 * 让 SSR 读到的模型卡刷新(与其它设置突变同款 seam)。
 */

import * as React from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { SectionCard } from "@/components/project/section-card";
import {
  AlertCircle,
  CheckCircle2,
  Download,
  Loader2,
  ShieldAlert,
  Upload,
} from "lucide-react";

interface ImportRowResult {
  capability: string;
  ok: boolean;
  secret: "imported" | "kept-existing" | "unrecoverable" | null;
  message?: string;
}

interface ImportReport {
  total: number;
  imported: number;
  failed: number;
  rows: ImportRowResult[];
}

type Phase = "idle" | "exporting" | "importing";

export function ModelConfigTransferCard() {
  const router = useRouter();
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const [phase, setPhase] = React.useState<Phase>("idle");
  const [error, setError] = React.useState("");
  const [report, setReport] = React.useState<ImportReport | null>(null);

  const busy = phase !== "idle";

  const doExport = React.useCallback(() => {
    if (busy) return;
    setPhase("exporting");
    setError("");
    setReport(null);
    void (async () => {
      try {
        const res = await fetch("/api/v1/settings-transfer/models");
        if (!res.ok) {
          const data = (await res.json().catch(() => ({}))) as { error?: string };
          throw new Error(data.error ?? `导出失败(HTTP ${res.status})`);
        }
        const blob = await res.blob();
        // 从下载头取文件名(route 侧带日期);取不到给兜底名。
        const disposition = res.headers.get("content-disposition") ?? "";
        const match = /filename="([^"]+)"/.exec(disposition);
        const filename = match?.[1] ?? "creatoros-model-config.json";
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
      } catch (err) {
        setError(err instanceof Error ? err.message : "导出失败,请重试");
      } finally {
        setPhase("idle");
      }
    })();
  }, [busy]);

  const doImport = React.useCallback(
    (file: File) => {
      setPhase("importing");
      setError("");
      setReport(null);
      void (async () => {
        try {
          const text = await file.text();
          let parsed: unknown;
          try {
            parsed = JSON.parse(text);
          } catch {
            throw new Error("所选文件不是合法的 JSON,请选择导出的配置文件");
          }
          const res = await fetch("/api/v1/settings-transfer/models", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(parsed),
          });
          const data = (await res.json().catch(() => ({}))) as {
            ok?: boolean;
            report?: ImportReport;
            error?: string;
          };
          if (!res.ok || !data.ok || !data.report) {
            throw new Error(data.error ?? `导入失败(HTTP ${res.status})`);
          }
          setReport(data.report);
          // SSR 模型卡读真库 → 刷新让导入结果立即可见(与其它设置突变同款 seam)。
          router.refresh();
        } catch (err) {
          setError(err instanceof Error ? err.message : "导入失败,请重试");
        } finally {
          setPhase("idle");
        }
      })();
    },
    [router],
  );

  const unrecoverable = report?.rows.filter((r) => r.secret === "unrecoverable") ?? [];
  const failedRows = report?.rows.filter((r) => !r.ok) ?? [];

  return (
    <SectionCard
      title="配置备份"
      description="导出 / 导入全部模型配置(重置工作区、换机后的兜底)"
    >
      <div
        data-slot="model-config-transfer-card"
        className="flex flex-col gap-3"
      >
        {/* 敏感值警示:常驻,不折叠。 */}
        <div className="flex items-start gap-2 rounded-md border border-warning/40 bg-warning/10 p-3">
          <ShieldAlert
            aria-hidden="true"
            className="mt-0.5 size-4 shrink-0 text-warning"
          />
          <p className="text-xs text-muted-foreground">
            导出文件<strong className="font-medium text-foreground">包含模型密钥</strong>
            (以本机密钥加密;未启用加密的环境等同明文)。请妥善保管,不要发送给他人。
            密文只在本机可解:换机导入时配置仍会导入,但密钥需重新填写。
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            type="button"
            size="sm"
            variant="outline"
            data-slot="model-config-export"
            disabled={busy}
            onClick={doExport}
          >
            {phase === "exporting" ? (
              <Loader2 aria-hidden="true" className="size-4 shrink-0 animate-spin" />
            ) : (
              <Download aria-hidden="true" className="size-4 shrink-0" />
            )}
            导出配置
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            data-slot="model-config-import"
            disabled={busy}
            onClick={() => fileInputRef.current?.click()}
          >
            {phase === "importing" ? (
              <Loader2 aria-hidden="true" className="size-4 shrink-0 animate-spin" />
            ) : (
              <Upload aria-hidden="true" className="size-4 shrink-0" />
            )}
            导入配置
          </Button>
          <input
            ref={fileInputRef}
            type="file"
            accept="application/json,.json"
            className="hidden"
            data-slot="model-config-import-input"
            onChange={(e) => {
              const file = e.target.files?.[0];
              // 允许重复选同一文件(重试)——先清值再处理。
              e.target.value = "";
              if (file) doImport(file);
            }}
          />
        </div>

        {error ? (
          <p
            data-slot="model-config-transfer-feedback"
            data-tone="error"
            className="flex items-center gap-1.5 text-xs text-destructive"
          >
            <AlertCircle aria-hidden="true" className="size-3.5 shrink-0" />
            {error}
          </p>
        ) : null}

        {report ? (
          <div
            data-slot="model-config-import-report"
            className="flex flex-col gap-1.5 rounded-md border border-border bg-surface-subtle p-3"
          >
            <p className="flex items-center gap-1.5 text-xs font-medium text-foreground">
              <CheckCircle2
                aria-hidden="true"
                className="size-3.5 shrink-0 text-success"
              />
              已导入 {report.imported}/{report.total} 条配置
              {report.failed > 0 ? `,${report.failed} 条失败` : ""}
            </p>
            {unrecoverable.length > 0 ? (
              <p className="text-xs text-muted-foreground">
                以下能力的密钥来自其它机器、无法解密,配置已导入,请在对应卡片重新填写密钥:
                {unrecoverable.map((r) => r.capability).join("、")}
              </p>
            ) : null}
            {failedRows.map((r) => (
              <p key={r.capability} className="text-xs text-destructive">
                {r.capability}:{r.message ?? "导入失败"}
              </p>
            ))}
          </div>
        ) : null}
      </div>
    </SectionCard>
  );
}

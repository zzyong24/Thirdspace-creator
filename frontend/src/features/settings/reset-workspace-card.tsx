"use client";

/**
 * [T-332 S5] ResetWorkspaceCard — 设置页「重置工作区」危险区卡
 * (SPEC 2026-07-15 账号全域隔离 §5.4;0042 迁移 NULL guard 错误文案
 * 「本版本要求重置数据:设置 → 重置工作区」承诺的兑现)。
 *
 * 流程(时序):
 *   点「重置工作区」→ 二次确认弹层(列明将清除的内容 + 输入确认词「重置」+
 *   可选「在 Finder 查看数据目录」)→ POST /api/v1/local/reset-workspace 落
 *   reset-pending 标记(**不动数据**,PGlite 单写者活库改名有风险)→ 卡片转
 *   成功态「已安排重置,重启应用后生效」+「立即重启」→ 下次启动 Tauri Rust 壳
 *   在 spawn sidecar 前把 db/ 与 .auth/ 归档改名(*.archived-<ts>,不物理删除)
 *   → 全新空库跑迁移 + seed → 用户从「绑定抖音号」重新开始。
 *
 * 桌面专属:web/SSR → 「桌面端专属」诚实空态(照 DiagnosticLogsCard 姿态:SSR
 * 首帧 desktop=false,挂载后 isDesktopRuntimeClient() 翻真,无水合漂移)。
 */

import * as React from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { SectionCard } from "@/components/project/section-card";
import {
  isDesktopRuntimeClient,
  relaunchApp,
} from "@/lib/desktop-updater";
import {
  AlertCircle,
  CheckCircle2,
  FolderOpen,
  Loader2,
  RotateCcw,
  TriangleAlert,
} from "lucide-react";

/** 确认词 —— 与 route 侧 plan.ts 的 RESET_CONFIRM_WORD 同值(route 会再验,不信任 UI)。 */
const CONFIRM_WORD = "重置";

/** 确认弹层里列明「将清除什么」(重启归档后新库自然为空的内容,逐条对齐 SPEC §5.4)。 */
const RESET_SCOPE_ITEMS: ReadonlyArray<string> = [
  "所有项目、脚本与素材记录",
  "选题、定位与知识库数据",
  "发布记录、采集数据与复盘",
  "账号绑定与抖音 / 网站登录态",
];

/**
 * [T-363] 确认弹层里列明「将保留什么」:重置只动清除范围 —— user 级资产(PRESERVE 清单,
 * backend/src/reset-preserve.ts 单一真值)在归档后的首次启动自动迁回新库。
 * 只加说明文案,确认交互(弹层 + 确认词 + route 再验)原样不动(用户硬约束)。
 */
const RESET_KEEP_ITEMS: ReadonlyArray<string> = [
  "AI 模型配置与密钥",
  "技能(skill)定制与版本历史",
  "激活状态(无需重新输入激活码)",
  "登录身份与偏好设置",
];

type Phase = "idle" | "submitting" | "scheduled" | "error";

export function ResetWorkspaceCard() {
  // SSR 首帧 desktop=false → 渲空态;挂载后 isDesktopRuntimeClient() 翻真(无水合漂移)。
  const [isDesktop, setIsDesktop] = React.useState(false);
  const [dialogOpen, setDialogOpen] = React.useState(false);
  const [confirmText, setConfirmText] = React.useState("");
  const [phase, setPhase] = React.useState<Phase>("idle");
  const [message, setMessage] = React.useState("");
  // 「立即重启」按钮态:idle / 请求中 / relaunch 不可用(引导手动重启)。
  const [relaunchState, setRelaunchState] = React.useState<
    "idle" | "relaunching" | "manual"
  >("idle");

  React.useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- 桌面运行态只能在挂载后的浏览器环境探测，SSR 首帧保持 false
    setIsDesktop(isDesktopRuntimeClient());
  }, []);

  const confirmMatches = confirmText.trim() === CONFIRM_WORD;
  const busy = phase === "submitting";

  // 「在 Finder 查看数据目录」—— 复用 reveal-logs 同款 sidecar `open` 姿态,指向 appData
  // 根目录(内含 db/ 与 .auth/),用户重置前可自行拷贝备份(轻量导出,不做打包导出)。
  const revealDataDir = React.useCallback(() => {
    void fetch("/api/v1/local/reveal-data-dir", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    }).catch(() => {
      // 打不开也不阻塞重置流程(纯辅助入口),静默即可。
    });
  }, []);

  const submit = React.useCallback(() => {
    if (busy || !confirmMatches) return;
    setPhase("submitting");
    setMessage("");
    void (async () => {
      try {
        const res = await fetch("/api/v1/local/reset-workspace", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ confirm: confirmText.trim() }),
        });
        const data = (await res.json().catch(() => ({}))) as {
          ok?: boolean;
          error?: string;
        };
        if (res.ok && data.ok) {
          setPhase("scheduled");
          setDialogOpen(false);
        } else {
          setPhase("error");
          setMessage(data.error ?? "重置请求失败,请重试");
        }
      } catch {
        setPhase("error");
        setMessage("重置请求失败,请重试");
      }
    })();
  }, [busy, confirmMatches, confirmText]);

  // [T-332 选型] 重启走既有 @tauri-apps/plugin-process relaunch(desktop-updater 薄封装,
  // T-180 更新卡同款)。本架构 webview 加载 http://127.0.0.1 的 sidecar,client 端 Tauri
  // 桥有过不可靠前科(T-241/252/257)→ relaunchApp() 返回 false 时诚实降级为「请手动
  // 退出并重新打开应用」,绝不假装已重启。
  const relaunch = React.useCallback(() => {
    if (relaunchState === "relaunching") return;
    setRelaunchState("relaunching");
    void (async () => {
      const ok = await relaunchApp();
      if (!ok) setRelaunchState("manual");
      // ok=true 时 app 即将整体重启,无需回置状态。
    })();
  }, [relaunchState]);

  // web / SSR → 诚实空态:重置的是本机数据目录,web 端无此概念。
  if (!isDesktop) {
    return (
      <SectionCard
        title="重置工作区"
        description="桌面端数据重置"
        action={
          <Badge
            data-slot="reset-workspace-badge"
            data-status="unavailable"
            variant="outline"
            className="border-border bg-surface-subtle text-muted-foreground"
          >
            桌面端专属
          </Badge>
        }
      >
        <div
          data-slot="reset-workspace-card"
          data-desktop="false"
          className="flex items-start gap-3 rounded-md border border-border bg-surface-subtle p-3"
        >
          <div
            aria-hidden="true"
            className="flex size-10 shrink-0 items-center justify-center rounded-full bg-destructive/10 text-destructive"
          >
            <RotateCcw className="size-5" />
          </div>
          <div className="flex min-w-0 flex-col gap-0.5">
            <span className="text-sm font-medium text-foreground">
              重置工作区为桌面端功能
            </span>
            <span className="text-xs text-muted-foreground">
              桌面客户端可一键归档本机数据目录、从零开始。Web 端无本机数据目录。
            </span>
          </div>
        </div>
      </SectionCard>
    );
  }

  return (
    <SectionCard
      title="重置工作区"
      description="归档本机全部数据,从零开始"
      className="border-destructive/40"
      action={
        <Badge
          data-slot="reset-workspace-badge"
          data-status="danger"
          variant="outline"
          className="border-destructive/40 bg-destructive/10 text-destructive"
        >
          危险区
        </Badge>
      }
    >
      <div
        data-slot="reset-workspace-card"
        data-desktop="true"
        className="flex flex-col gap-3"
      >
        {phase === "scheduled" ? (
          // 成功态:标记已落盘,重启生效。
          <div
            data-slot="reset-workspace-scheduled"
            className="flex flex-col gap-2 rounded-md border border-border bg-surface-subtle p-3"
          >
            <p className="flex items-center gap-1.5 text-sm font-medium text-success">
              <CheckCircle2 aria-hidden="true" className="size-4 shrink-0" />
              已安排重置,重启应用后生效
            </p>
            <p className="text-xs text-muted-foreground">
              下次启动时,现有数据目录会整体归档改名保留在磁盘(不物理删除),应用将以全新工作区启动,请从「绑定抖音号」重新开始。
            </p>
            <div className="flex items-center justify-end gap-2">
              {relaunchState === "manual" ? (
                <span
                  data-slot="reset-workspace-manual-hint"
                  className="text-xs text-muted-foreground"
                >
                  自动重启不可用,请手动退出并重新打开应用。
                </span>
              ) : (
                <Button
                  type="button"
                  size="sm"
                  data-slot="reset-workspace-relaunch"
                  disabled={relaunchState === "relaunching"}
                  onClick={relaunch}
                >
                  {relaunchState === "relaunching" ? (
                    <Loader2
                      aria-hidden="true"
                      className="size-4 shrink-0 animate-spin"
                    />
                  ) : (
                    <RotateCcw aria-hidden="true" className="size-4 shrink-0" />
                  )}
                  立即重启
                </Button>
              )}
            </div>
          </div>
        ) : (
          <div className="flex items-center gap-3 rounded-md border border-destructive/40 bg-destructive/5 p-3">
            <div
              aria-hidden="true"
              className="flex size-10 shrink-0 items-center justify-center rounded-full bg-destructive/10 text-destructive"
            >
              <TriangleAlert className="size-5" />
            </div>
            <div className="flex min-w-0 flex-1 flex-col gap-0.5">
              <span className="text-sm font-medium text-foreground">
                重置全部数据
              </span>
              <span className="text-xs text-muted-foreground">
                清空项目、选题、素材、发布与账号绑定,从零开始。旧数据归档保留在磁盘,不会物理删除。
              </span>
            </div>
            <Button
              type="button"
              size="sm"
              variant="destructive"
              data-slot="reset-workspace-action"
              onClick={() => {
                setConfirmText("");
                setMessage("");
                setPhase("idle");
                setDialogOpen(true);
              }}
            >
              <RotateCcw aria-hidden="true" className="size-4 shrink-0" />
              重置工作区
            </Button>
          </div>
        )}
      </div>

      {/* 二次确认弹层(嵌套 Dialog,Radix Portal 到 body,不受 SettingsDialog 限制)。 */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent
          showCloseButton
          data-slot="reset-workspace-dialog"
          className="flex max-w-md flex-col gap-4"
        >
          <div className="flex flex-col gap-1">
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <TriangleAlert aria-hidden="true" className="size-5 shrink-0" />
              确认重置工作区?
            </DialogTitle>
            <DialogDescription>
              此操作会清空当前工作区并在重启后从零开始。
            </DialogDescription>
          </div>

          <div className="flex flex-col gap-2 rounded-md border border-destructive/40 bg-destructive/5 p-3">
            <span className="text-xs font-medium text-foreground">
              将清除以下内容:
            </span>
            <ul className="flex list-disc flex-col gap-1 pl-4 text-xs text-muted-foreground">
              {RESET_SCOPE_ITEMS.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </div>

          {/* [T-363] 保留范围:PRESERVE 资产重启后自动迁回,弹层如实告知(只加文案,交互不动)。 */}
          <div
            data-slot="reset-workspace-keep-scope"
            className="flex flex-col gap-2 rounded-md border border-border bg-surface-subtle p-3"
          >
            <span className="text-xs font-medium text-foreground">
              将保留以下内容(重启后自动恢复):
            </span>
            <ul className="flex list-disc flex-col gap-1 pl-4 text-xs text-muted-foreground">
              {RESET_KEEP_ITEMS.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </div>

          <p className="text-xs text-muted-foreground">
            操作可逆:旧数据会整体归档保留在磁盘(目录改名为 *.archived-时间戳),
            <strong className="font-medium text-foreground">不会物理删除</strong>
            ;需要恢复时把归档目录改回原名即可。
          </p>

          <button
            type="button"
            data-slot="reset-workspace-reveal"
            onClick={revealDataDir}
            className="inline-flex items-center gap-1.5 self-start text-xs font-medium text-brand hover:underline"
          >
            <FolderOpen aria-hidden="true" className="size-3.5 shrink-0" />
            重置前在 Finder 里查看数据目录
          </button>

          <div className="flex flex-col gap-1.5">
            <label
              htmlFor="reset-workspace-confirm-input"
              className="text-xs text-muted-foreground"
            >
              输入「{CONFIRM_WORD}」以确认:
            </label>
            <Input
              id="reset-workspace-confirm-input"
              data-slot="reset-workspace-confirm-input"
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              placeholder={CONFIRM_WORD}
              autoComplete="off"
            />
          </div>

          {phase === "error" ? (
            <p
              data-slot="reset-workspace-feedback"
              data-tone="error"
              className="flex items-center gap-1.5 text-xs text-destructive"
            >
              <AlertCircle aria-hidden="true" className="size-3.5 shrink-0" />
              {message}
            </p>
          ) : null}

          <div className="flex items-center justify-end gap-2">
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => setDialogOpen(false)}
              disabled={busy}
            >
              取消
            </Button>
            <Button
              type="button"
              size="sm"
              variant="destructive"
              data-slot="reset-workspace-confirm"
              disabled={!confirmMatches || busy}
              onClick={submit}
            >
              {busy ? (
                <Loader2
                  aria-hidden="true"
                  className="size-4 shrink-0 animate-spin"
                />
              ) : (
                <RotateCcw aria-hidden="true" className="size-4 shrink-0" />
              )}
              确认重置
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </SectionCard>
  );
}

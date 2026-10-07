"use client";
import * as React from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ownedDeviceCommand, safeVerificationUrl, type OwnedDeviceIntent, type OwnedDeviceView } from "@/lib/owned-devices";

const FAILURE = "连接未完成。请保留这次连接后重试，你原来的授权与项目不会受影响。";
const buttonClass = "min-h-11 h-auto whitespace-normal px-4 py-2 text-base";
export function OwnedDevicePanel({ enabled = true, intent = "register_device", hideUnavailable = false }: { enabled?: boolean; intent?: OwnedDeviceIntent; hideUnavailable?: boolean }): React.JSX.Element | null {
  const [view, setView] = React.useState<OwnedDeviceView | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [deviceLabel, setDeviceLabel] = React.useState("这台电脑");
  const [activationCode, setActivationCode] = React.useState("");
  const [codeOpen, setCodeOpen] = React.useState(false);
  const epoch = React.useRef(0);
  const inFlight = React.useRef(false);
  const mounted = React.useRef(false);
  const queuedResume = React.useRef(false);
  const actionRef = React.useRef<() => Promise<void>>(async () => {});
  const headingRef = React.useRef<HTMLHeadingElement>(null);

  async function action(command: "start" | "poll" | "resume") {
    if (inFlight.current) { if (command === "resume") queuedResume.current = true; return; }
    inFlight.current = true;
    const generation = epoch.current;
    setBusy(true); setError(null);
    try {
      const result = await ownedDeviceCommand(command, command === "start" ? { intent, deviceLabel, ...(activationCode.trim() ? { activationCode: activationCode.trim() } : {}) } : undefined);
      if (mounted.current && epoch.current === generation) {
        setView(result);
        if (command === "start") setActivationCode("");
      }
    } catch (reason) {
      if (mounted.current && epoch.current === generation) setError(typeof reason === "string" && reason.length <= 300 ? reason : FAILURE);
    } finally {
      inFlight.current = false;
      if (mounted.current) setBusy(false);
      if (mounted.current && queuedResume.current) { queuedResume.current = false; void action("resume"); }
    }
  }
  React.useEffect(() => { actionRef.current = () => action("poll"); });
  React.useEffect(() => {
    if (!enabled) return;
    mounted.current = true;
    void action("resume");
    return () => { mounted.current = false; epoch.current += 1; };
    // 用户输入不会替换原生正在恢复的意向。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled]);
  React.useEffect(() => {
    if (!enabled || !view || view.state !== "waiting" || busy || error) return;
    const timeout = window.setTimeout(() => void actionRef.current(), (view.retryAfterSeconds ?? 5) * 1000);
    return () => window.clearTimeout(timeout);
  }, [enabled, view, busy, error]);

  async function cancel() {
    // 取消允许越过在途等待；原生 generation 负责阻止迟到结果保存。
    epoch.current += 1; setError(null);
    try {
      const result = await ownedDeviceCommand("cancel");
      if (mounted.current) { setView(result); setBusy(inFlight.current); headingRef.current?.focus(); }
    } catch { if (mounted.current) setError("停止连接未完成，请解锁系统凭据库后再次取消。上次连接不会自动被替换。"); }
  }
  async function open() {
    if (!view?.verificationUrl) return;
    try { const url = safeVerificationUrl(view.verificationUrl); const { openUrl } = await import("@tauri-apps/plugin-opener"); await openUrl(url); }
    catch { setError("官方确认页未能打开，请重试“打开官方确认页”。这次连接已保留。"); }
  }
  async function manageDevices() {
    try { const { openUrl } = await import("@tauri-apps/plugin-opener"); await openUrl("https://growth.aitongban.cloud/app/products"); }
    catch { setError("产品与设备页面未能打开，请重试。产品已连接本人账号。"); }
  }
  async function restart() {
    try { const { relaunch } = await import("@tauri-apps/plugin-process"); await relaunch(); }
    catch { setError("本机授权已保存。自动重启未完成，请手动关闭并重新打开软件。"); }
  }
  if (!enabled || hideUnavailable && view?.state === "unavailable") return null;
  const waiting = view?.state === "waiting";
  const finished = view?.state === "activated" || view?.state === "linked";
  const title = intent === "link_owner" ? "账号与设备" : "用手机号连接已有产品";
  return (
    <section aria-label={title} className="grid min-w-0 gap-4 rounded-lg border border-primary/20 bg-primary/5 p-4 text-base leading-6">
      <h2 ref={headingRef} tabIndex={-1} className="text-base font-semibold outline-none">{title}</h2>
      <p className="text-base text-muted-foreground">{intent === "link_owner" ? "连接本人手机号后，可在官方页面管理已连接的两台电脑。" : "验证本人手机号，选择已有产品，再确认这台电脑。有效期与额度沿用原产品。"}</p>
      {view && <p role="status" aria-live="polite" className="break-words text-base">{view.message}</p>}
      {waiting ? <>
        <div className="rounded-md bg-background p-3 text-center"><p className="text-base">本次确认短码</p><p className="mt-2 font-mono text-xl font-semibold tracking-widest">{view.userCode}</p></div>
        <p className="text-base text-muted-foreground">网页确认后回到这里，软件核对并保存授权才算本机启用。关闭或刷新软件可继续上次连接。</p>
        {view.intent !== intent && <p className="text-base">正在继续上次{view.intent === "link_owner" ? "账号" : "设备"}连接。若需换一种操作，请先停止这次连接。</p>}
        <div className="grid gap-2"><Button className={buttonClass} variant="outline" onClick={() => void open()}>打开官方确认页</Button><Button className={buttonClass} disabled={busy} onClick={() => void action("poll")}>{busy ? "正在核对连接结果…" : "我已确认，核对结果"}</Button><Button className={buttonClass} variant="outline" onClick={() => void cancel()}>停止这次连接</Button></div>
      </> : finished ? <>
        {view.state === "activated" && <Button className={buttonClass} onClick={() => void restart()}>已启用，重新进入软件</Button>}
        {view.state === "linked" && <Button className={buttonClass} variant="outline" onClick={() => void manageDevices()}>管理产品与设备</Button>}
      </> : view?.state === "unavailable" ? null : <>
        {intent === "register_device" && <><label className="grid gap-2 text-base">电脑名称<Input className="min-h-11 text-base" value={deviceLabel} maxLength={64} disabled={busy} onChange={(event) => setDeviceLabel(event.target.value)} /></label><Button className={buttonClass} variant="outline" disabled={busy} aria-expanded={codeOpen} onClick={() => setCodeOpen(!codeOpen)}>已有原激活码？</Button>{codeOpen && <label className="grid gap-2 text-base">原激活码（仅部分历史产品需要）<Input className="min-h-11 text-base" value={activationCode} maxLength={256} disabled={busy} autoComplete="off" type="password" onChange={(event) => setActivationCode(event.target.value)} /></label>}</>}
        <Button className={buttonClass} disabled={busy} onClick={() => void action("start")}>{busy ? "正在恢复或创建连接…" : intent === "link_owner" ? "连接手机号账号" : view?.state === "expired" ? "重新连接已有产品" : "连接本人已有产品"}</Button>
        {error && <Button className={buttonClass} variant="outline" disabled={busy} onClick={() => void action("resume")}>恢复上次连接</Button>}
      </>}
      {error && <p role="alert" className="break-words text-base text-destructive">{error}</p>}
    </section>
  );
}

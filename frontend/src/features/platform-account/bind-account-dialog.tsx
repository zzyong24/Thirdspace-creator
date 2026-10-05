"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { CreateAccountForm, ConnectXhsAccount, ConnectKuaishouAccount } from "./account-manager-interactive-region";

const platforms = [
  {id: "douyin", label: "抖音", description: "短视频与创作者数据"},
  {id: "xiaohongshu", label: "小红书", description: "笔记、视频与账号数据"},
  {id: "kuaishou", label: "快手", description: "视频与创作者数据"},
] as const;
type BindPlatform = typeof platforms[number]["id"];

/** 选平台仅控制本页弹层，真实授权在选定平台的既有操作中发起。 */
export function BindAccountDialog() {
  const [open, setOpen] = React.useState(false);
  const [selected, setSelected] = React.useState<BindPlatform | null>(null);
  const [busy, setBusy] = React.useState(false);
  const label = platforms.find(platform => platform.id === selected)?.label;
  return <Dialog open={open} onOpenChange={next => {
    if (busy) return;
    setOpen(next);
    if (!next) setSelected(null);
  }}>
    <DialogTrigger asChild><Button type="button">绑定账号</Button></DialogTrigger>
    <DialogContent className="sm:max-w-lg" showCloseButton={!busy}
      onEscapeKeyDown={event => {if (busy) event.preventDefault();}}
      onInteractOutside={event => {if (busy) event.preventDefault();}}>
      <DialogHeader>
        <DialogTitle>{selected ? `绑定${label}账号` : "选择账号平台"}</DialogTitle>
        <DialogDescription>{selected ? "扫码将在本机浏览器中完成，成功后自动读取真实账号。" : "选择你要绑定的平台，再进行扫码授权。"}</DialogDescription>
      </DialogHeader>
      {!selected ? <div className="space-y-3">
        {platforms.map(platform => <button key={platform.id} type="button" aria-label={platform.label}
          className="flex w-full items-center justify-between gap-3 rounded-lg border border-border p-4 text-left hover:border-primary hover:bg-primary/5 focus-visible:outline-2 focus-visible:outline-primary"
          onClick={() => setSelected(platform.id)}>
          <span className="font-medium">{platform.label}</span><span className="text-xs text-muted-foreground">{platform.description}</span>
        </button>)}
        <p className="text-xs text-muted-foreground">公众号扫码绑定尚未接入；文章编辑和导出可以正常使用。</p>
      </div> : <div className="space-y-4">
        {selected === "douyin" && <CreateAccountForm onBusyChange={setBusy} />}
        {selected === "xiaohongshu" && <ConnectXhsAccount onBusyChange={setBusy} />}
        {selected === "kuaishou" && <ConnectKuaishouAccount onBusyChange={setBusy} />}
        {busy && <p role="status" className="rounded-md bg-muted p-3 text-sm">请在弹出的浏览器完成授权。返回结果后可关闭或重新选择平台。</p>}
        <Button type="button" variant="ghost" disabled={busy} onClick={() => setSelected(null)}>返回选择平台</Button>
      </div>}
    </DialogContent>
  </Dialog>;
}

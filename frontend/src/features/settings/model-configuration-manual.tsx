"use client";

import * as React from "react";
import {
  BookOpenCheck,
  CheckCircle2,
  KeyRound,
  Mic2,
  PlugZap,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

function Field({
  label,
  value,
  tone = "default",
}: {
  label: string;
  value: string;
  tone?: "default" | "secret";
}) {
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <span className="text-[10px] font-medium text-muted-foreground">{label}</span>
      <span className="truncate rounded-md border border-border bg-surface px-2.5 py-2 font-mono text-[11px] text-foreground">
        {tone === "secret" ? "••••••••••••" : value}
      </span>
    </div>
  );
}

function ManualFigure({
  slot,
  eyebrow,
  title,
  children,
}: {
  slot: string;
  eyebrow: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <figure
      data-slot={slot}
      className="overflow-hidden rounded-xl border border-border bg-surface shadow-sm"
    >
      <figcaption className="flex items-center justify-between border-b border-border bg-surface-subtle px-4 py-2.5">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-brand">
            {eyebrow}
          </p>
          <p className="text-xs font-medium text-foreground">{title}</p>
        </div>
        <span className="rounded-full bg-brand-soft px-2 py-1 text-[10px] text-brand">
          界面示意
        </span>
      </figcaption>
      <div className="grid gap-2.5 p-4 sm:grid-cols-2">{children}</div>
    </figure>
  );
}

export function ModelConfigurationManual() {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="sm"
          aria-label="打开模型配置手册"
          className="shrink-0 gap-1.5"
        >
          <BookOpenCheck className="size-4" aria-hidden="true" />
          配置手册
        </Button>
      </DialogTrigger>
      <DialogContent
        aria-label="模型配置手册"
        className="max-h-[86vh] max-w-[920px] overflow-y-auto p-0 sm:max-w-[920px]"
      >
        <DialogHeader className="border-b border-border bg-surface-subtle px-6 py-5 pr-14">
          <div className="flex items-center gap-2 text-brand">
            <PlugZap className="size-5" aria-hidden="true" />
            <DialogTitle className="text-lg">模型配置手册</DialogTitle>
          </div>
          <DialogDescription>
            通常只需选供应商、填写模型 ID 和密钥。只有使用 New API / 自建中转站时，
            才需要展开高级设置填写地址和协议。
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-6 px-6 pb-6">
          <section className="grid gap-3 pt-1 sm:grid-cols-3">
            {[
              ["1", "先选供应商", "优先使用表单里的供应商预设，地址和接口格式会自动带出。"],
              ["2", "再填模型和密钥", "模型 ID 以供应商控制台为准；密钥只保存在本机。"],
              ["3", "保存并测试", "一次点击先保存当前填写，再按正式聊天的流式通路验证。"],
            ].map(([step, title, detail]) => (
              <div
                key={step}
                className="rounded-xl border border-border bg-surface p-3"
              >
                <span className="inline-flex size-6 items-center justify-center rounded-full bg-brand text-xs font-semibold text-brand-foreground">
                  {step}
                </span>
                <p className="mt-2 text-sm font-medium text-foreground">{title}</p>
                <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                  {detail}
                </p>
              </div>
            ))}
          </section>

          <section className="flex flex-col gap-3">
            <div>
              <h3 className="text-sm font-semibold text-foreground">
                文字与对话模型（必配）
              </h3>
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                MiniMax、Kimi、DeepSeek 等直接选对应预设，地址和协议会自动填好。
                你只需要从服务商控制台复制准确的模型 ID 和密钥。
              </p>
            </div>
            <ManualFigure
              slot="model-manual-figure-default"
              eyebrow="截图 01"
              title="MiniMax 文本模型填写示例"
            >
              <Field label="供应商预设" value="MiniMax" />
              <Field label="模型" value="MiniMax-M2.5（以控制台为准）" />
              <Field label="接口地址" value="https://api.minimaxi.com/anthropic" />
              <Field label="接口格式" value="Anthropic 兼容" />
              <Field label="API 密钥" value="" tone="secret" />
              <div className="flex items-center gap-2 rounded-md bg-success-soft px-3 py-2 text-xs text-success">
                <CheckCircle2 className="size-4 shrink-0" aria-hidden="true" />
                点击“保存并测试”
              </div>
            </ManualFigure>
          </section>

          <section className="flex flex-col gap-3">
            <div>
              <h3 className="text-sm font-semibold text-foreground">
                New API / 自建中转站
              </h3>
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                供应商选“自定义”后展开高级设置。Base URL 必须是 API 地址，很多中转站需要以
                /v1 结尾；接口格式按渠道实际支持选择 OpenAI Chat 或 OpenAI Responses，
                不能只凭模型名称猜。
              </p>
            </div>
            <ManualFigure
              slot="model-manual-figure-relay"
              eyebrow="截图 02"
              title="New API / 中转站填写示例"
            >
              <Field label="供应商预设" value="自定义" />
              <Field label="模型" value="控制台显示的精确模型 ID" />
              <Field label="Base URL" value="https://your-relay.example/v1" />
              <Field label="接口格式" value="按渠道选择 Chat 或 Responses" />
              <Field label="API 密钥" value="" tone="secret" />
              <div className="rounded-md bg-brand-soft px-3 py-2 text-xs leading-relaxed text-brand">
                测试必须收到真实流式文本；网页 200 或空流不会再显示“连通”。
              </div>
            </ManualFigure>
          </section>

          <section className="flex flex-col gap-3">
            <div className="flex items-start gap-2">
              <span className="mt-0.5 inline-flex size-7 items-center justify-center rounded-lg bg-brand-soft text-brand">
                <Mic2 className="size-4" aria-hidden="true" />
              </span>
              <div>
                <h3 className="text-sm font-semibold text-foreground">
                  语音转文字 ASR（建议配置）
                </h3>
                <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                  建议配置 ASR 转录模型，避免本地转录时间过长。未配置时仍可使用本地
                  Whisper，但处理较慢；系统会按小批次逐步补齐历史作品。
                </p>
              </div>
            </div>
            <ManualFigure
              slot="model-manual-figure-asr"
              eyebrow="截图 03"
              title="小米 MiMo ASR 填写示例"
            >
              <Field label="ASR 供应商" value="小米 MiMo（推荐）" />
              <Field label="模型" value="mimo-v2.5-asr" />
              <Field label="API 密钥" value="" tone="secret" />
              <div className="rounded-md bg-brand-soft px-3 py-2 text-xs leading-relaxed text-brand">
                选择预设后接口地址会自动填写；只有接其他供应商时才需要打开高级设置。
              </div>
            </ManualFigure>
          </section>

          <section className="rounded-xl border border-warning/30 bg-warning/5 p-4">
            <div className="flex items-start gap-2">
              <KeyRound className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden="true" />
              <div>
                <h3 className="text-sm font-medium text-foreground">
                  最常见的三个错误
                </h3>
                <ul className="mt-2 list-disc space-y-1 pl-4 text-xs leading-relaxed text-muted-foreground">
                  <li>把官网地址当成 API 地址；请使用供应商文档里的 Base URL。</li>
                  <li>模型显示名不等于模型 ID；必须复制控制台提供的真实 ID。</li>
                  <li>Kimi 开放平台与 Kimi Code 的地址和密钥不能混用。</li>
                </ul>
              </div>
            </div>
          </section>
        </div>
      </DialogContent>
    </Dialog>
  );
}

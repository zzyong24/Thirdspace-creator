"use client";

import { ArrowRight } from "lucide-react";
import styles from "./positioning-conversation.module.css";

export type PositioningStartMode = "optimize" | "pivot" | "scratch";

// 「继续深入当前账号」= optimize：用户已明确选择沿当前账号深化，本轮生成的定位提案会自动采纳
// （仍走原 confirmDiscovery / upsertProfile 采纳门，失败可重试，历史版本可复制为草稿回退）。
const STARTERS = [
  { mode: "optimize", title: "继续深入当前账号", prompt: "我想继续深入当前账号，先聊目前的内容和瓶颈。" },
  { mode: "pivot", title: "调整到一个新方向", prompt: "我想调整到新方向，先聊想改变什么、保留哪些积累。" },
  { mode: "scratch", title: "完全从零开始", prompt: "我想完全从零开始定位，先聊我的经历和优势。" },
] as const satisfies ReadonlyArray<{ mode: PositioningStartMode; title: string; prompt: string }>;

export const SCRATCH_POSITIONING_PROMPT = STARTERS.find((item) => item.mode === "scratch")!.prompt;

export function PositioningConversationStart({ onPick, disabled, hasMaster = false, onSoftClear }: {
  readonly onPick: (prompt: string, mode: PositioningStartMode) => void;
  readonly disabled: boolean;
  readonly hasMaster?: boolean;
  readonly onSoftClear?: () => void;
}) {
  return (
    <section className={styles.start} aria-label="定位方式" data-slot="positioning-conversation-start">
      <div className={styles.starters}>
        {STARTERS.map((item) => (
          <button key={item.title} type="button" data-mode={item.mode} disabled={disabled} onClick={() => onPick(item.prompt, item.mode)}>
            <strong>{item.title}</strong>
            <ArrowRight size={16} aria-hidden="true" />
          </button>
        ))}
      </div>
      {hasMaster && onSoftClear ? (
        <button
          type="button"
          data-slot="positioning-soft-clear"
          disabled={disabled}
          onClick={() => {
            if (window.confirm("清除本次对话中的现有定位信息？当前定位母版不会被删除，会从零开启新的定位对话。")) {
              onSoftClear();
            }
          }}
          className="mt-3 inline-flex min-h-10 items-center rounded-md border border-border px-3 text-sm font-medium text-foreground transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
        >
          清除现有定位信息
        </button>
      ) : null}
    </section>
  );
}

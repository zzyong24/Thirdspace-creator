"use client";

/**
 * [T-094] 对话内知识蒸馏结果卡 —— knowledge.distill 工具产的一批知识原子候选,渲成
 * **蒸馏批量确认门**(共享组件 KnowledgeAtomGate,与倾倒场旧确认门同语义):每条可勾选/
 * 改 type/改 title/改出处,人点「采纳选中 N 条」才逐条 knowledge.create 物化(铁律②),
 * 「原文同时存档」默认勾选(多存一条 reference)。
 *
 * 错误态(实录根因):MiniMax 内容安全审核拦截输入(new_sensitive/1026)等平台错误,
 * 服务端已转**人话**随结果带回(result.error)—— 这里渲错误卡而非裸机器码;
 * suggestSwitchModel=true 时附「去设置」链接(换模型降级走人工确认,不自动切换)。
 */

import * as React from "react";
import Link from "next/link";

import {
  KnowledgeAtomGate,
  type DistilledAtom,
} from "@/features/knowledge/knowledge-atom-gate";

export interface ChatDistillResult {
  atoms: ReadonlyArray<DistilledAtom>;
  suggestedTags: ReadonlyArray<string>;
  originalText: string;
  error: string | null;
  suggestSwitchModel: boolean;
}

export function ChatDistillCard({ result }: { result: ChatDistillResult }) {
  if (result.error) {
    return (
      <div
        data-slot="chat-distill-card"
        data-error="true"
        role="alert"
        className="mt-1 flex w-full max-w-[420px] flex-col gap-1.5 rounded-[10px] border border-destructive/40 bg-destructive/5 px-3 py-2"
      >
        <span className="text-[10px] font-medium uppercase tracking-wide text-destructive">
          蒸馏失败
        </span>
        <p className="text-[12px] leading-relaxed text-destructive">
          {result.error}
        </p>
        {result.suggestSwitchModel ? (
          <Link
            href="/settings?highlight=text-model"
            data-slot="chat-distill-settings-link"
            className="self-start text-[11px] font-medium text-brand underline underline-offset-2"
          >
            去设置 AI 模型 →
          </Link>
        ) : null}
        <p className="text-[11px] text-text-subtle">
          原文还在对话里 —— 调整后重发即可再蒸一次。
        </p>
      </div>
    );
  }

  if (result.atoms.length === 0) {
    return (
      <div
        data-slot="chat-distill-card"
        data-empty="true"
        className="mt-1 rounded-[10px] border border-dashed border-border px-3 py-2 text-[11px] text-text-subtle"
      >
        这轮没蒸出可用的知识原子 —— 换段材料或补充上下文再试。
      </div>
    );
  }

  return (
    <div
      data-slot="chat-distill-card"
      className="mt-1 flex w-full max-w-[480px] flex-col gap-1.5 rounded-[10px] border border-border bg-surface p-2.5"
    >
      <span className="text-[10px] font-medium uppercase tracking-wide text-brand">
        知识蒸馏 · {result.atoms.length} 个原子候选 · 采纳后进知识库
      </span>
      <KnowledgeAtomGate
        atoms={result.atoms}
        suggestedTags={result.suggestedTags}
        originalText={result.originalText}
      />
    </div>
  );
}

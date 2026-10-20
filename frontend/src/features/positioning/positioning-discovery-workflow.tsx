"use client";

import Link from "next/link";
import { ArrowRight, MessageCircleMore, ShieldCheck, Sparkles } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { copilotDeepLink } from "@/features/copilot/copilot-deeplink";
import type { PositioningDiscoverySessionResource } from "@creatoros/contract";

const SOURCE_MODE_LABELS = {
  optimize: "基于当前账号继续深入",
  pivot: "调整到一个新方向",
  scratch: "重新定位",
} as const;

const OPTION_LABELS: Record<string, string> = {
  "personal-brand": "建立个人品牌",
  "lead-generation": "获得客户线索",
  "professional-trust": "建立专业信任",
  "content-income": "内容直接变现",
  "company-brand": "服务组织品牌",
  practice: "一线实战经验",
  expertise: "专业知识体系",
  resources: "行业资源与信息",
  expression: "表达与讲故事",
  "life-story": "独特人生经历",
  founder: "创业者 / 主理人",
  professional: "职场人 / 专业克制",
  industry: "行业从业者",
  consumer: "本地或垂直消费者",
  "decision-maker": "企业决策者",
  "avoid-pitfalls": "避坑与判断",
  method: "方法与步骤",
  case: "案例与拆解",
  trend: "趋势与情报",
  tool: "工具与效率",
  "real-case": "真实项目案例",
  "result-data": "结果或数据",
  process: "工作过程",
  testimonial: "客户 / 学员反馈",
  building: "还在积累",
  direct: "坦率直接",
  story: "故事化",
  humor: "轻松幽默",
  companion: "温和陪伴",
};

const THEME_LABELS: Record<string, string> = {
  goal: "目标",
  strength: "真实优势",
  audience: "主要受众",
  need: "核心需求",
  proof: "可信证明",
  expression: "表达与边界",
};

/**
 * T-707：旧六页问卷退役。定位中心只保留一个 Copilot 入口；旧会话的已保存答案
 * 会作为可编辑上下文带进对话，但不再决定用户有没有资格生成定位候选。
 */
export function PositioningDiscoveryWorkflow({
  initialSession,
  hasCurrentProfile,
}: {
  readonly initialSession: PositioningDiscoverySessionResource | null;
  readonly hasCurrentProfile: boolean;
}) {
  const savedCount = initialSession?.answers.length ?? 0;
  const prefill = buildCopilotPrefill(initialSession, hasCurrentProfile);

  return (
    <section
      id="positioning-discovery"
      data-testid="positioning-copilot-entry"
      className="rounded-card border border-border bg-surface p-5 shadow-card"
    >
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0 max-w-3xl">
          <div className="flex items-center gap-2">
            <span className="flex size-9 items-center justify-center rounded-control bg-brand-soft text-brand">
              <MessageCircleMore className="size-5" />
            </span>
            <div>
              <h2 className="text-base font-semibold text-foreground">
                定位对话
              </h2>
            </div>
          </div>

          <p className="mt-4 text-sm leading-6 text-muted-foreground">
            支持继续深入、调整方向或重新定位，每轮只问一个关键问题。
          </p>

          <div className="mt-4 flex flex-wrap gap-2 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2.5 py-1">
              <Sparkles className="size-3.5" /> 随时可说“先给我一版”
            </span>
            <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2.5 py-1">
              <ShieldCheck className="size-3.5" /> 未采纳前不改当前母版
            </span>
            {initialSession ? (
              <Badge variant="outline">
                已恢复 {savedCount} 条旧前采信息 · {SOURCE_MODE_LABELS[initialSession.sourceMode]}
              </Badge>
            ) : null}
          </div>
        </div>

        <Link
          href={copilotDeepLink(
            "positioning",
            "positioning.generate",
            undefined,
            prefill,
            "surface:positioning",
          )}
          data-testid="positioning-open-copilot"
          className="inline-flex h-10 shrink-0 items-center gap-2 rounded-control bg-brand px-4 text-sm font-medium text-brand-foreground transition-colors hover:bg-brand/90"
        >
          {initialSession ? "继续定位对话" : "开始定位对话"}
          <ArrowRight className="size-4" />
        </Link>
      </div>
    </section>
  );
}

export function buildCopilotPrefill(
  session: PositioningDiscoverySessionResource | null,
  hasCurrentProfile: boolean,
): string {
  const savedAnswers = (session?.answers ?? [])
    .map((answer) => {
      const values = answer.skipped
        ? "暂不确定"
        : [
            ...answer.selectedOptionIds.map((id) => OPTION_LABELS[id] ?? id),
            answer.customText.trim(),
          ]
            .filter(Boolean)
            .join("；");
      return `- ${THEME_LABELS[answer.themeId] ?? answer.themeId}：${values || "待补充"}`;
    })
    .join("\n");
  // 对话节奏、通版账号和即时生成规则由 chatbox.positioning 的系统模板负责。
  // 输入框只保留用户可读的开场和原有资料，不重复展示执行说明，也不截断旧答案。
  return [
    session
      ? "帮我继续梳理账号定位。"
      : hasCurrentProfile
        ? "帮我梳理账号定位，先确认是继续深入、调整方向，还是重新定位。"
        : "帮我梳理账号定位，从最关键的问题开始。",
    ...(session ? [`定位路径：${session.sourceMode}\n本次起点：${SOURCE_MODE_LABELS[session.sourceMode]}。`] : []),
    ...(savedAnswers ? [`已保存的信息：\n${savedAnswers}`] : []),
  ].join("\n\n");
}

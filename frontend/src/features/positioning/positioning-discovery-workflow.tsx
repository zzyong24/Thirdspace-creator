"use client";

import * as React from "react";
import Link from "next/link";
import {
  ArrowRight,
  BookOpenCheck,
  Check,
  CircleHelp,
  ExternalLink,
  Globe2,
  Loader2,
  RefreshCcw,
  Search,
  Sparkles,
  Target,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { copilotDeepLink } from "@/features/copilot/copilot-deeplink";
import { client } from "@/lib/contract-client";
import { cn } from "@/lib/utils";
import type {
  PositioningDiscoverySessionResource,
  PositioningDiscoverySourceMode,
  PositioningDiscoveryThemeId,
} from "@creatoros/contract";

type Theme = {
  id: PositioningDiscoveryThemeId;
  eyebrow: string;
  title: string;
  description: string;
  options: Array<{ id: string; label: string; hint: string }>;
};

const DISCOVERY_DRAFT_VERSION = 1;

type DiscoveryLocalDraft = {
  version: typeof DISCOVERY_DRAFT_VERSION;
  sessionId: string;
  revision: number;
  activeThemeId: PositioningDiscoveryThemeId;
  selected: string[];
  customText: string;
  skipped: boolean;
  query: string;
  researchMarket: "cn" | "global";
  researchLanguage: "zh-CN" | "any";
};

function discoveryDraftKey(session: PositioningDiscoverySessionResource) {
  return `creatoros:positioning-discovery-draft:v${DISCOVERY_DRAFT_VERSION}:${session.accountId}:${session.id}`;
}

function readDiscoveryDraft(
  session: PositioningDiscoverySessionResource,
): DiscoveryLocalDraft | null {
  try {
    const raw = window.localStorage.getItem(discoveryDraftKey(session));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<DiscoveryLocalDraft>;
    if (
      parsed.version !== DISCOVERY_DRAFT_VERSION ||
      parsed.sessionId !== session.id ||
      parsed.revision !== session.revision ||
      !THEMES.some((theme) => theme.id === parsed.activeThemeId) ||
      !Array.isArray(parsed.selected)
    ) {
      return null;
    }
    return parsed as DiscoveryLocalDraft;
  } catch {
    return null;
  }
}

function removeDiscoveryDraft(session: PositioningDiscoverySessionResource) {
  try {
    window.localStorage.removeItem(discoveryDraftKey(session));
  } catch {
    // 浏览器禁用存储时退回服务端逐题保存，不阻断前采。
  }
}

const THEMES: Theme[] = [
  {
    id: "goal",
    eyebrow: "先确定终点",
    title: "你希望这个 IP 最终帮你完成什么？",
    description: "可以多选。目标不同，内容结构、信任建立和转化方式都会不同。",
    options: [
      { id: "personal-brand", label: "建立个人品牌", hint: "被行业持续记住" },
      { id: "lead-generation", label: "获得客户线索", hint: "为业务带来咨询" },
      { id: "professional-trust", label: "建立专业信任", hint: "让用户先认可你" },
      { id: "content-income", label: "内容直接变现", hint: "课程、广告或会员" },
      { id: "company-brand", label: "服务组织品牌", hint: "为团队或公司发声" },
    ],
  },
  {
    id: "strength",
    eyebrow: "找到可持续供给",
    title: "你最有把握长期讲清楚什么？",
    description: "不要只看兴趣，优先选择你拥有真实经历、方法或资源的部分。",
    options: [
      { id: "practice", label: "一线实战经验", hint: "亲手做过很多次" },
      { id: "expertise", label: "专业知识体系", hint: "能讲原理和方法" },
      { id: "resources", label: "行业资源与信息", hint: "接近真实现场" },
      { id: "expression", label: "表达与讲故事", hint: "擅长把复杂事说懂" },
      { id: "life-story", label: "独特人生经历", hint: "经历本身有稀缺性" },
    ],
  },
  {
    id: "audience",
    eyebrow: "选择主要服务对象",
    title: "你最想先帮助哪一类人？",
    description: "先选最重要的一群人，而不是试图让所有人都喜欢。",
    options: [
      { id: "founder", label: "创业者 / 主理人", hint: "关心增长与经营" },
      { id: "professional", label: "职场人", hint: "关心能力与发展" },
      { id: "industry", label: "行业从业者", hint: "关心专业进阶" },
      { id: "consumer", label: "本地或垂直消费者", hint: "关心购买决策" },
      { id: "decision-maker", label: "企业决策者", hint: "关心效率和结果" },
    ],
  },
  {
    id: "need",
    eyebrow: "锁定内容价值",
    title: "这群人最需要你提供什么帮助？",
    description: "选的是用户愿意持续关注你的理由，不只是一个宽泛领域。",
    options: [
      { id: "avoid-pitfalls", label: "避坑与判断", hint: "减少错误决策" },
      { id: "method", label: "方法与步骤", hint: "拿走就能执行" },
      { id: "case", label: "案例与拆解", hint: "从真实结果中学习" },
      { id: "trend", label: "趋势与情报", hint: "更早看懂变化" },
      { id: "tool", label: "工具与效率", hint: "更快完成工作" },
    ],
  },
  {
    id: "proof",
    eyebrow: "准备信任证据",
    title: "你有哪些内容能证明自己不是空谈？",
    description: "先盘点可公开的证据；暂时没有也可以选“还在积累”。",
    options: [
      { id: "real-case", label: "真实项目案例", hint: "有完整过程与结果" },
      { id: "result-data", label: "结果或数据", hint: "可量化的变化" },
      { id: "process", label: "工作过程", hint: "方法如何落地" },
      { id: "testimonial", label: "客户 / 学员反馈", hint: "第三方验证" },
      { id: "building", label: "还在积累", hint: "先用过程建立可信度" },
    ],
  },
  {
    id: "expression",
    eyebrow: "确定表达边界",
    title: "你希望别人如何感受到你？",
    description: "选择主要表达气质；不能说、不能做的内容请补充在下方。",
    options: [
      { id: "professional", label: "专业克制", hint: "严谨、清楚、有依据" },
      { id: "direct", label: "坦率直接", hint: "有判断，不绕弯" },
      { id: "story", label: "故事化", hint: "用人物和冲突承载观点" },
      { id: "humor", label: "轻松幽默", hint: "降低理解门槛" },
      { id: "companion", label: "温和陪伴", hint: "让用户感到被理解" },
    ],
  },
];

const MODE_META: Array<{
  id: PositioningDiscoverySourceMode;
  title: string;
  description: string;
  note: string;
}> = [
  {
    id: "optimize",
    title: "在现有方向上优化",
    description: "保留已有定位和作品作为辅助证据，重新做一遍完整前采。",
    note: "适合方向基本正确，但表达不够清楚",
  },
  {
    id: "pivot",
    title: "转向一个新方向",
    description: "旧内容只作为经验参考，不默认继承原来的受众和内容边界。",
    note: "适合业务、赛道或目标人群发生变化",
  },
  {
    id: "scratch",
    title: "完全从零开始",
    description: "本轮不读取旧定位、旧版本和旧作品，避免历史内容带偏判断。",
    note: "适合旧账号内容很乱，或希望重新出发",
  },
];

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : "操作失败，请稍后重试。";
}

function optionLabel(themeId: PositioningDiscoveryThemeId, optionId: string) {
  return (
    THEMES.find((theme) => theme.id === themeId)?.options.find(
      (option) => option.id === optionId,
    )?.label ?? optionId
  );
}

export function PositioningDiscoveryWorkflow({
  initialSession,
  hasCurrentProfile,
}: {
  initialSession: PositioningDiscoverySessionResource | null;
  hasCurrentProfile: boolean;
}) {
  const initialAnsweredIds = new Set(
    initialSession?.answers.map((answer) => answer.themeId),
  );
  const initialActiveThemeId =
    THEMES.find((theme) => !initialAnsweredIds.has(theme.id))?.id ?? "goal";
  const initialActiveAnswer = initialSession?.answers.find(
    (answer) => answer.themeId === initialActiveThemeId,
  );
  const [session, setSession] =
    React.useState<PositioningDiscoverySessionResource | null>(initialSession);
  const [choosingMode, setChoosingMode] = React.useState(!hasCurrentProfile);
  const [activeThemeId, setActiveThemeId] =
    React.useState<PositioningDiscoveryThemeId>(initialActiveThemeId);
  const [busy, setBusy] = React.useState(false);
  const [researching, setResearching] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [selected, setSelected] = React.useState<string[]>(
    initialActiveAnswer?.selectedOptionIds ?? [],
  );
  const [customText, setCustomText] = React.useState(
    initialActiveAnswer?.customText ?? "",
  );
  const [skipped, setSkipped] = React.useState(
    initialActiveAnswer?.skipped ?? false,
  );
  const [query, setQuery] = React.useState("");
  const [researchMarket, setResearchMarket] = React.useState<"cn" | "global">(
    "cn",
  );
  const [researchLanguage, setResearchLanguage] = React.useState<
    "zh-CN" | "any"
  >("zh-CN");
  const [draftCacheReady, setDraftCacheReady] = React.useState(false);
  const [draftRestored, setDraftRestored] = React.useState(false);

  // 当前问题在点「保存并继续」前也持续落本机。路由跳转、刷新或应用重启后，
  // 只恢复同账号、同会话、同 revision 的草稿，绝不拿旧草稿覆盖新的服务端答案。
  React.useEffect(() => {
    if (!session) return;
    if (session.status === "ready") {
      removeDiscoveryDraft(session);
      const readyTimer = window.setTimeout(() => {
        setDraftCacheReady(true);
        setDraftRestored(false);
      }, 0);
      return () => window.clearTimeout(readyTimer);
    }
    const draft = readDiscoveryDraft(session);
    const restoreTimer = window.setTimeout(() => {
      if (draft) {
        setActiveThemeId(draft.activeThemeId);
        setSelected(draft.selected);
        setCustomText(draft.customText);
        setSkipped(draft.skipped);
        setQuery(draft.query);
        setResearchMarket(draft.researchMarket);
        setResearchLanguage(draft.researchLanguage);
        setDraftRestored(
          draft.selected.length > 0 ||
            draft.customText.trim().length > 0 ||
            draft.skipped ||
            draft.query.trim().length > 0,
        );
      }
      setDraftCacheReady(true);
    }, 0);
    return () => window.clearTimeout(restoreTimer);
  }, [session]);

  React.useEffect(() => {
    if (!session || !draftCacheReady || session.status === "ready") return;
    const draft: DiscoveryLocalDraft = {
      version: DISCOVERY_DRAFT_VERSION,
      sessionId: session.id,
      revision: session.revision,
      activeThemeId,
      selected,
      customText,
      skipped,
      query,
      researchMarket,
      researchLanguage,
    };
    try {
      window.localStorage.setItem(
        discoveryDraftKey(session),
        JSON.stringify(draft),
      );
    } catch {
      // 隐私模式/磁盘配额异常时不影响正常提交。
    }
  }, [
    activeThemeId,
    customText,
    draftCacheReady,
    query,
    researchLanguage,
    researchMarket,
    selected,
    session,
    skipped,
  ]);

  const activeTheme = THEMES.find((theme) => theme.id === activeThemeId)!;
  const showTheme = React.useCallback(
    (
      themeId: PositioningDiscoveryThemeId,
      sourceSession: PositioningDiscoverySessionResource | null = session,
    ) => {
      const answer = sourceSession?.answers.find(
        (item) => item.themeId === themeId,
      );
      setActiveThemeId(themeId);
      setSelected(answer?.selectedOptionIds ?? []);
      setCustomText(answer?.customText ?? "");
      setSkipped(answer?.skipped ?? false);
    },
    [session],
  );

  const start = React.useCallback(async (mode: PositioningDiscoverySourceMode) => {
    setBusy(true);
    setError(null);
    try {
      const next = await client.startDiscovery({
        params: undefined,
        query: undefined,
        body: { sourceMode: mode },
      });
      setSession(next);
      setDraftCacheReady(false);
      setDraftRestored(false);
      setChoosingMode(false);
      showTheme("goal", next);
    } catch (cause) {
      setError(errorText(cause));
    } finally {
      setBusy(false);
    }
  }, [showTheme]);

  const saveAnswer = React.useCallback(async () => {
    if (!session) return;
    setBusy(true);
    setError(null);
    try {
      const next = await client.updateDiscoveryAnswer({
        params: { sessionId: session.id },
        query: undefined,
        body: {
          themeId: activeThemeId,
          selectedOptionIds: selected,
          customText,
          skipped,
          expectedRevision: session.revision,
        },
      });
      removeDiscoveryDraft(session);
      setDraftRestored(false);
      setSession(next);
      const currentIndex = THEMES.findIndex((theme) => theme.id === activeThemeId);
      const nextTheme = THEMES[currentIndex + 1];
      if (nextTheme) showTheme(nextTheme.id, next);
    } catch (cause) {
      setError(errorText(cause));
    } finally {
      setBusy(false);
    }
  }, [activeThemeId, customText, selected, session, showTheme, skipped]);

  const research = React.useCallback(async () => {
    if (!session) return;
    setResearching(true);
    setError(null);
    try {
      const next = await client.researchDiscovery({
        params: { sessionId: session.id },
        query: undefined,
        body: {
          query,
          purpose: `补充「${activeTheme.title}」的公开行业信息`,
          targetThemeId: activeThemeId,
          market: researchMarket,
          language: researchLanguage,
          expectedRevision: session.revision,
        },
      });
      setSession(next);
      const normalizedQuery = query.trim();
      const currentCandidates = next.webReferences.filter(
        (reference) =>
          !reference.adopted && reference.query === normalizedQuery,
      );
      if (currentCandidates.length === 0) {
        setError(
          "没有找到符合当前地区、语言和关键词的结果。可以换个更具体的关键词，或放宽搜索范围。",
        );
      }
      setQuery("");
    } catch (cause) {
      setError(errorText(cause));
    } finally {
      setResearching(false);
    }
  }, [
    activeTheme.title,
    activeThemeId,
    query,
    researchLanguage,
    researchMarket,
    session,
  ]);

  const setEvidence = React.useCallback(
    async (evidenceId: string, adopted: boolean) => {
      if (!session) return;
      setError(null);
      try {
        const next = await client.setDiscoveryEvidence({
          params: { sessionId: session.id, evidenceId },
          query: undefined,
          body: { adopted, expectedRevision: session.revision },
        });
        setSession(next);
      } catch (cause) {
        setError(errorText(cause));
      }
    },
    [session],
  );

  if (!session || choosingMode) {
    return (
      <section
        id="positioning-discovery"
        data-testid="positioning-discovery-entry"
        className="rounded-[22px] border border-slate-200 bg-[linear-gradient(135deg,#fffdf7_0%,#f8fafc_68%,#eef7f4_100%)] p-5 shadow-[0_18px_50px_-38px_rgba(15,23,42,.45)]"
      >
        <div className="mb-5 flex flex-wrap items-start justify-between gap-4">
          <div className="max-w-2xl">
            <div className="mb-2 flex items-center gap-2 text-xs font-semibold tracking-[0.16em] text-emerald-700">
              <Target className="size-4" /> 定位前采
            </div>
            <h2 className="text-lg font-semibold text-slate-950">
              先把人、业务和内容边界问清楚，再让 AI 给方向
            </h2>
            <p className="mt-1.5 text-sm leading-6 text-slate-600">
              不管有没有历史作品，都完整走一遍。系统给你可多选的答案，也允许补充自己的情况。
            </p>
          </div>
          {hasCurrentProfile && !choosingMode ? (
            <Button onClick={() => setChoosingMode(true)}>
              开始新的定位前采 <ArrowRight className="size-4" />
            </Button>
          ) : null}
        </div>

        {choosingMode ? (
          <div className="grid gap-3 lg:grid-cols-3">
            {MODE_META.map((mode, index) => (
              <button
                key={mode.id}
                type="button"
                disabled={busy}
                onClick={() => void start(mode.id)}
                className="group rounded-2xl border border-slate-200 bg-white/90 p-4 text-left transition hover:-translate-y-0.5 hover:border-emerald-300 hover:shadow-lg disabled:opacity-60"
              >
                <span className="mb-5 flex size-7 items-center justify-center rounded-full bg-slate-900 text-xs font-semibold text-white">
                  {index + 1}
                </span>
                <span className="block font-semibold text-slate-950">{mode.title}</span>
                <span className="mt-1.5 block text-sm leading-5 text-slate-600">
                  {mode.description}
                </span>
                <span className="mt-4 block border-t border-slate-100 pt-3 text-xs text-slate-500">
                  {mode.note}
                </span>
              </button>
            ))}
          </div>
        ) : null}

        {error ? <p className="mt-3 text-sm text-destructive">{error}</p> : null}
      </section>
    );
  }

  const answeredIds = new Set(session.answers.map((answer) => answer.themeId));
  const completed = session.status === "ready";
  const adoptedReferences = session.webReferences.filter((item) => item.adopted);
  const prompt = buildCopilotPrompt(session);

  return (
    <section
      id="positioning-discovery"
      data-testid="positioning-discovery-workflow"
      className="grid min-h-0 flex-1 overflow-hidden rounded-[22px] border border-slate-200 bg-[#f7f8f6] shadow-[0_20px_55px_-42px_rgba(15,23,42,.5)] lg:grid-cols-[210px_minmax(0,1fr)_320px]"
    >
      <aside className="border-b border-slate-200 bg-[#eef1eb] p-4 lg:border-b-0 lg:border-r">
        <div className="mb-5">
          <p className="text-xs font-semibold tracking-[0.15em] text-emerald-700">
            定位前采
          </p>
          <p className="mt-1 text-sm font-medium text-slate-900">
            {MODE_META.find((mode) => mode.id === session.sourceMode)?.title}
          </p>
          <p className="mt-2 text-xs text-slate-500">
            已完成 {answeredIds.size} / {THEMES.length}
          </p>
        </div>
        <nav className="grid grid-cols-2 gap-2 lg:grid-cols-1">
          {THEMES.map((theme, index) => {
            const active = theme.id === activeThemeId;
            const done = answeredIds.has(theme.id);
            return (
              <button
                key={theme.id}
                type="button"
                onClick={() => showTheme(theme.id)}
                className={cn(
                  "flex items-center gap-2 rounded-xl px-3 py-2.5 text-left text-sm transition",
                  active
                    ? "bg-slate-950 text-white shadow-sm"
                    : "text-slate-600 hover:bg-white/80 hover:text-slate-950",
                )}
              >
                <span
                  className={cn(
                    "flex size-5 shrink-0 items-center justify-center rounded-full text-[11px]",
                    done
                      ? "bg-emerald-500 text-white"
                      : active
                        ? "bg-white/15 text-white"
                        : "bg-white text-slate-500",
                  )}
                >
                  {done ? <Check className="size-3" /> : index + 1}
                </span>
                <span className="truncate">{theme.eyebrow}</span>
              </button>
            );
          })}
        </nav>
        <button
          type="button"
          onClick={() => setChoosingMode(true)}
          className="mt-5 inline-flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-900"
        >
          <RefreshCcw className="size-3.5" /> 重新选择路径
        </button>
      </aside>

      <div className="min-h-0 overflow-y-auto bg-white p-5 lg:p-7">
        <div className="mx-auto max-w-2xl">
          {draftRestored ? (
            <div
              data-slot="positioning-discovery-draft-restored"
              className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2"
            >
              <p className="text-xs text-emerald-800">
                已恢复上次未保存的前采内容，你可以接着填写。
              </p>
              <button
                type="button"
                onClick={() => {
                  removeDiscoveryDraft(session);
                  const answer = session.answers.find(
                    (item) => item.themeId === activeThemeId,
                  );
                  setSelected(answer?.selectedOptionIds ?? []);
                  setCustomText(answer?.customText ?? "");
                  setSkipped(answer?.skipped ?? false);
                  setQuery("");
                  setDraftRestored(false);
                }}
                className="text-xs font-medium text-emerald-900 underline underline-offset-2"
              >
                清除未保存内容
              </button>
            </div>
          ) : null}
          <p className="text-xs font-semibold tracking-[0.16em] text-emerald-700">
            {activeTheme.eyebrow}
          </p>
          <h2 className="mt-2 text-xl font-semibold leading-8 text-slate-950">
            {activeTheme.title}
          </h2>
          <p className="mt-1 text-sm leading-6 text-slate-500">
            {activeTheme.description}
          </p>

          <div className="mt-6 grid gap-2 sm:grid-cols-2">
            {activeTheme.options.map((option) => {
              const checked = selected.includes(option.id);
              return (
                <button
                  key={option.id}
                  type="button"
                  aria-pressed={checked}
                  onClick={() => {
                    setSkipped(false);
                    setSelected((current) =>
                      current.includes(option.id)
                        ? current.filter((id) => id !== option.id)
                        : [...current, option.id],
                    );
                  }}
                  className={cn(
                    "flex min-h-20 items-start gap-3 rounded-2xl border p-3.5 text-left transition",
                    checked
                      ? "border-emerald-500 bg-emerald-50/70 shadow-[0_0_0_1px_rgba(16,185,129,.1)]"
                      : "border-slate-200 bg-white hover:border-slate-400",
                  )}
                >
                  <span
                    className={cn(
                      "mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-md border",
                      checked
                        ? "border-emerald-600 bg-emerald-600 text-white"
                        : "border-slate-300 bg-white",
                    )}
                  >
                    {checked ? <Check className="size-3.5" /> : null}
                  </span>
                  <span>
                    <span className="block text-sm font-medium text-slate-900">
                      {option.label}
                    </span>
                    <span className="mt-0.5 block text-xs text-slate-500">
                      {option.hint}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>

          <div className="mt-4">
            <label className="mb-1.5 block text-xs font-medium text-slate-600">
              还有更准确的说法？直接补充
            </label>
            <Textarea
              value={customText}
              onChange={(event) => {
                setCustomText(event.target.value);
                if (event.target.value) setSkipped(false);
              }}
              placeholder={
                activeTheme.id === "expression"
                  ? "例如：不做夸张承诺，不讨论未经验证的数据；希望表达更像一位有经验的同行。"
                  : "写下选项没有覆盖到的真实情况……"
              }
              className="min-h-24 resize-y"
            />
          </div>

          <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
            <button
              type="button"
              onClick={() => {
                setSelected([]);
                setCustomText("");
                setSkipped(true);
              }}
              className={cn(
                "inline-flex items-center gap-1.5 text-xs",
                skipped ? "font-medium text-emerald-700" : "text-slate-500",
              )}
            >
              <CircleHelp className="size-3.5" /> 暂不确定，先继续
            </button>
            <Button disabled={busy} onClick={() => void saveAnswer()}>
              {busy ? <Loader2 className="size-4 animate-spin" /> : null}
              保存并继续 <ArrowRight className="size-4" />
            </Button>
          </div>

          <div className="mt-8 rounded-2xl border border-sky-200 bg-sky-50/60 p-4">
            <div className="flex items-start gap-3">
              <span className="flex size-8 shrink-0 items-center justify-center rounded-xl bg-white text-sky-700 shadow-sm">
                <Globe2 className="size-4" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-slate-900">需要时再联网补充</p>
                <p className="mt-1 text-xs leading-5 text-slate-600">
                  只搜索下面这行关键词，用来补充公开行业信息。不会发送整份访谈、账号资料或逐字稿。
                </p>
                <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                  <Input
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    placeholder="例如：杭州家装 IP 用户高频痛点"
                    maxLength={80}
                  />
                  <Button
                    variant="outline"
                    disabled={researching || query.trim().length < 2}
                    onClick={() => void research()}
                  >
                    {researching ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : (
                      <Search className="size-4" />
                    )}
                    联网补充
                  </Button>
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-3 text-[11px] text-slate-600">
                  <label className="inline-flex items-center gap-1.5">
                    地区
                    <select
                      aria-label="搜索地区"
                      value={researchMarket}
                      onChange={(event) =>
                        setResearchMarket(event.target.value as "cn" | "global")
                      }
                      className="rounded-md border border-sky-200 bg-white px-2 py-1 text-slate-800"
                    >
                      <option value="cn">中国大陆</option>
                      <option value="global">全球</option>
                    </select>
                  </label>
                  <label className="inline-flex items-center gap-1.5">
                    语言
                    <select
                      aria-label="搜索语言"
                      value={researchLanguage}
                      onChange={(event) =>
                        setResearchLanguage(
                          event.target.value as "zh-CN" | "any",
                        )
                      }
                      className="rounded-md border border-sky-200 bg-white px-2 py-1 text-slate-800"
                    >
                      <option value="zh-CN">简体中文</option>
                      <option value="any">不限</option>
                    </select>
                  </label>
                  <span>默认优先国内中文来源</span>
                </div>
                <p className="mt-2 text-[11px] text-slate-500">
                  用途：补充“{activeTheme.title}”的公开信息 · 去向：右侧联网参考（采用后才进入证据）
                  <br />二次搜索会替换上一批未采用结果，已经采用的证据会保留。
                </p>
              </div>
            </div>
          </div>

          {error ? <p className="mt-4 text-sm text-destructive">{error}</p> : null}
        </div>
      </div>

      <aside className="min-h-0 overflow-y-auto border-t border-slate-200 bg-[#fbfaf6] p-4 lg:border-l lg:border-t-0">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-semibold text-slate-950">定位证据板</p>
            <p className="mt-0.5 text-xs text-slate-500">只收你确认过的信息</p>
          </div>
          <BookOpenCheck className="size-5 text-emerald-700" />
        </div>

        <div className="mt-4 space-y-2">
          {session.sourceMode !== "scratch" ? (
            <div className="rounded-xl border border-amber-200 bg-amber-50/70 p-3">
              <p className="text-[11px] font-medium text-amber-800">作品证据 · 辅助参考</p>
              <p className="mt-1 text-xs leading-5 text-amber-950/75">
                已登记 {session.inputManifest.legacyWorkIds.length} 条代表作品锚点。
                生成方向时才按需读取，不等待全部作品逐字稿，也不会覆盖你的回答。
              </p>
            </div>
          ) : (
            <div className="rounded-xl border border-slate-200 bg-white p-3">
              <p className="text-[11px] font-medium text-slate-500">从零开始 · 已隔离旧资料</p>
              <p className="mt-1 text-xs leading-5 text-slate-700">
                旧定位和旧作品没有进入本次生成输入。
              </p>
            </div>
          )}
          {session.answers.map((answer) => (
            <div key={answer.themeId} className="rounded-xl border border-slate-200 bg-white p-3">
              <p className="text-[11px] font-medium text-slate-500">
                {THEMES.find((theme) => theme.id === answer.themeId)?.eyebrow}
              </p>
              <p className="mt-1 text-xs leading-5 text-slate-800">
                {answer.skipped
                  ? "暂不确定"
                  : [
                      ...answer.selectedOptionIds.map((id) =>
                        optionLabel(answer.themeId, id),
                      ),
                      answer.customText,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
              </p>
            </div>
          ))}
          {session.answers.length === 0 ? (
            <div className="rounded-xl border border-dashed border-slate-300 p-4 text-center text-xs text-slate-500">
              完成一个问题后，答案会沉淀在这里。
            </div>
          ) : null}
        </div>

        <div className="mt-6 flex items-center justify-between">
          <p className="text-xs font-semibold text-slate-700">联网参考</p>
          <Badge variant="outline">已采用 {adoptedReferences.length}</Badge>
        </div>
        <div className="mt-2 space-y-2">
          {session.webReferences.map((reference) => (
            <div key={reference.id} className="rounded-xl border border-slate-200 bg-white p-3">
              <div className="flex items-start justify-between gap-2">
                <a
                  href={reference.url}
                  target="_blank"
                  rel="noreferrer"
                  className="line-clamp-2 text-xs font-medium leading-5 text-slate-900 hover:text-sky-700"
                >
                  {reference.title} <ExternalLink className="inline size-3" />
                </a>
                <button
                  type="button"
                  onClick={() => void setEvidence(reference.id, !reference.adopted)}
                  className={cn(
                    "shrink-0 rounded-full px-2 py-1 text-[11px] font-medium",
                    reference.adopted
                      ? "bg-emerald-100 text-emerald-800"
                      : "bg-slate-100 text-slate-600 hover:bg-slate-200",
                  )}
                >
                  {reference.adopted ? "已采用" : "采用"}
                </button>
              </div>
              <p className="mt-1 line-clamp-3 text-[11px] leading-4 text-slate-500">
                {reference.snippet || "该结果暂无摘要，请打开来源核对。"}
              </p>
              <p className="mt-1 text-[10px] text-slate-400">
                {reference.market === "cn" ? "中国大陆" : "全球"} · {reference.language === "zh-CN" ? "简体中文" : "语言不限"}
              </p>
            </div>
          ))}
          {session.webReferences.length === 0 ? (
            <p className="rounded-xl bg-slate-100/70 p-3 text-[11px] leading-5 text-slate-500">
              联网是可选项。只在某个问题缺少行业背景时，用关键词补充即可。
            </p>
          ) : null}
        </div>

        <div className="mt-6 rounded-2xl bg-slate-950 p-4 text-white">
          <div className="flex items-center gap-2 text-sm font-semibold">
            <Sparkles className="size-4 text-emerald-300" /> 前采完成后
          </div>
          <p className="mt-2 text-xs leading-5 text-slate-300">
            AI 会基于这张证据板给出 2–3 个可比较方向；你选择后才生成正式定位母版。
          </p>
          {completed ? (
            <Button
              asChild
              className="mt-3 w-full bg-emerald-400 text-slate-950 hover:bg-emerald-300"
            >
              <Link
                href={copilotDeepLink(
                  "positioning",
                  "positioning.generate",
                  undefined,
                  prompt,
                )}
              >
                生成 2–3 个定位方向 <ArrowRight className="size-4" />
              </Link>
            </Button>
          ) : (
            <Button disabled className="mt-3 w-full">
              还差 {THEMES.length - answeredIds.size} 个问题
            </Button>
          )}
        </div>
      </aside>
    </section>
  );
}

function buildCopilotPrompt(session: PositioningDiscoverySessionResource): string {
  const mode = MODE_META.find((item) => item.id === session.sourceMode)?.title ?? "定位前采";
  const answers = session.answers
    .map((answer) => {
      const theme = THEMES.find((item) => item.id === answer.themeId);
      const value = answer.skipped
        ? "暂不确定"
        : [
            ...answer.selectedOptionIds.map((id) => optionLabel(answer.themeId, id)),
            answer.customText,
          ]
            .filter(Boolean)
            .join("；");
      return `- ${theme?.title ?? answer.themeId}：${value}`;
    })
    .join("\n");
  const references = session.webReferences
    .filter((item) => item.adopted)
    .map((item) => `- ${item.title}：${item.snippet}（${item.url}）`)
    .join("\n");
  return `【定位前采已完成】\n前采会话ID：${session.id}\n前采版本：${session.revision}\n前采路径代码：${session.sourceMode}\n路径：${mode}\n以下是用户逐项确认的前采答案：\n${answers}\n\n采用的公开联网参考：\n${references || "无"}\n\n请不要重复访谈，也不要把旧作品当成唯一答案。先基于以上证据给我 2–3 个差异明确、可比较的定位方向，用“适合谁 / 核心价值 / 内容主轴 / 差异化 / 风险”说明；等我选择一个方向后，再调用 positioning.generate 形成可采纳的正式定位提案。调用时必须原样传入 discoverySessionId、discoveryRevision、sourceMode，并把我选中的方向短名称传入 selectedDirectionKey。`;
}

"use client";

/**
 * ChatBox slice 2 的对话内 generative UI(SPEC §3.4)—— calibration.diagnose / review.analyze /
 * positioning.generate 三个工具的结果(候选,非实体)经 tool-result part 流回前端,这里把它们
 * 各渲成对应候选卡嵌进对话气泡:
 *   - 维度评分类(calibration.diagnosis)→ 维度评分表(读 calibration 中栏评分表范式),**只读展示**
 *     (对话里的诊断不直接铸预测;真·按用户 rubric 的盲预测走工作台「开始预测」那条任务链)。
 *   - 候选类(review.learnings / positioning.suggestion)→ 复用「逐条/整条采纳」交互,走现有直采门:
 *       · 经验 → client.createLearning(去重后直接进入知识库,机制⑤飞轮);
 *       · 定位 → client.upsertProfile + createStatement(写入定位母版 + 追加 AI 版本)。
 *     与 ChatCandidateCard 同理:候选已在工具结果里,无需再起 AI 任务 —— 直接渲 + 采纳走确认门。
 *
 * 铁律②:AI 只产候选,人确认才物化。所有「采纳」按钮按下才调 create;不自动落库。
 */

import * as React from "react";
import { useRouter } from "next/navigation";
import {TaskRuntimeActions,taskRuntimeStatus,type RuntimeTask} from "@/components/ai/task-runtime-actions";
import { client } from "@/lib/contract-client";
import { createAiTaskAttemptId } from "@/lib/ai-task-attempt";

type AdoptState = "idle" | "adopting" | "adopted" | "error" | "stale";

function isDiscoveryConflict(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const record = error as { code?: unknown; name?: unknown; message?: unknown };
  return (
    record.code === "ConflictError" ||
    record.name === "DiscoveryConflictError" ||
    (typeof record.message === "string" &&
      /定位方向或当前母版已经变化|前采.*版本|ConflictError/u.test(record.message))
  );
}

// ── 维度评分诊断卡(calibration.diagnosis)──────────────────────────────────
// [T-103a] 盲预测进对话:诊断卡在**稿面盲预测场景**(blindPredict != null,即深链带
// content_output subject 的稿面右栏)长出「锁定为盲预测」确认动作 —— 铁律②确认门从
// 后台任务流搬进对话卡。锁定前是对话内候选(可继续追问重新诊断);点「锁定」= 一次确认
// 动作承载 immutable 语义:走**既有后台流同一条端点链**(createAITask calibration.diagnose
// → 轮询 awaiting_confirmation → confirmTask 铸 draft Prediction → lockPrediction 定死),
// 用创作者真实变现 rubric 铸出不可改的 locked Prediction(对话里的通用维度盲评只是给人看
// 的候选,真·预测按真 rubric 由服务端确认端点铸)。非盲预测场景(blindPredict == null,如
// 校准/复盘surface的诊断)仍是只读展示,引导去校准中心。
export interface ChatDiagnosisDimension {
  key: string;
  score: number;
  reason: string;
  suggestion: string;
}
export interface ChatDiagnosis {
  dimensions: ChatDiagnosisDimension[];
  verdict: string;
  mainIssues: string[];
  priorityFixes: string[];
}

// [T-103a] 稿面盲预测锁定所需的 subject —— content_output 挂点(为空则先自愈铸一个,与
// 登记表单/旧盲预测行同款)+ 项目上下文(标题/项目 id,铸 output 兜底)。
export interface BlindPredictLockContext {
  readonly outputId: string | null;
  readonly projectId: string;
  readonly projectTitle: string;
}

type LockPhase = "idle" | "locking" | "locked" | "error";

// 轮询诊断任务的间隔(与 blind-predict-row/chat-generate-card 同款 4s;测试可 0 化去抖）。
const DEFAULT_POLL_INTERVAL_MS = 4000;

export function ChatDiagnosisCard({
  diagnosis,
  blindPredict,
  pollIntervalMs = DEFAULT_POLL_INTERVAL_MS,
}: {
  readonly diagnosis: ChatDiagnosis | null;
  /** [T-103a] 稿面盲预测场景的锁定上下文;null = 非盲预测(只读诊断,不长锁定动作)。 */
  readonly blindPredict?: BlindPredictLockContext | null;
  /** 轮询间隔(测试注入 0 去掉真等待;生产默认 4000)。 */
  readonly pollIntervalMs?: number;
}) {
  const router = useRouter();
  const [phase, setPhase] = React.useState<LockPhase>("idle");
  const taskRef=React.useRef<{id:string}|null>(null),subjectRef=React.useRef<string|null>(blindPredict?.outputId??null),attemptRef=React.useRef<string|null>(null);
  const [runtimeTask,setRuntimeTask]=React.useState<RuntimeTask|null>(null);
  // 卸载后停止在 await 链里 setState(与旧盲预测行同款长任务守卫)。
  const cancelledRef = React.useRef(false);
  React.useEffect(
    () => () => {
      cancelledRef.current = true;
    },
    [],
  );

  // [T-103a] 「锁定为盲预测」:走既有后台盲预测端点链铸 immutable locked Prediction。
  // 复用旧 blind-predict-row 那条零新 op 的链路(createAITask→轮询→confirmTask→lockPrediction),
  // 只是触发点从后台按钮搬进对话卡、且铸完直接锁死(锁定=确认门,承载 immutable 语义)。
  const lock = React.useCallback(() => {
    if (!blindPredict || phase === "locking" || phase === "locked") return;
    setPhase("locking");
    void (async () => {
      try {
        // 1. 确保有 ContentOutput 挂点(纯站内项目可能还没走制作)。
        let subjectId = subjectRef.current;
        if (!subjectId) {
          const created = (await client.createOutput({
            params: { projectId: blindPredict.projectId },
            query: undefined,
            body: { title: blindPredict.projectTitle || "主内容" },
          })) as { id: string };
          subjectId = created.id;subjectRef.current=subjectId;
        }
        // 2. 起编导诊断任务(既有盲预测流:按真实变现 rubric 铸 draft Prediction)。
        const task = taskRef.current??(await client.createAITask({
          params: undefined,
          query: undefined,
          body: {
            taskType: "calibration.diagnose",
            attemptId: attemptRef.current??(attemptRef.current=createAiTaskAttemptId()),
            inputData: { subjectType: "content_output", subjectId },
          },
        })) as { id: string };
        taskRef.current=task;
        // 3. 轮询到 awaiting_confirmation → confirmTask 铸 draft Prediction → 拿 predictionId。
        for (let i = 0; i < 75; i++) {
          if (cancelledRef.current) return;
          await new Promise((r) => setTimeout(r, pollIntervalMs));
          if (cancelledRef.current) return;
          const status = (await client.getTask({
            params: { taskId: task.id },
            query: undefined,
            body: undefined,
          })) as RuntimeTask;
          setRuntimeTask(status);
          if(status.executionTaskId&&["paused","waiting_user","unknown_result","failed","cancelled","blocked"].includes(taskRuntimeStatus(status))){setPhase("error");return;}
          if (status.status === "awaiting_confirmation") {
            // confirmTask 铸 draft Prediction 但只回 task(不回 predictionId)。故 confirm 后
            // 从 listPredictions(user-scoped, createdAt desc)取该 subject 最新一条 draft →
            // 拿到它的 id。全程只用既有端点,无新写路径。
            await client.confirmTask({
              params: { taskId: task.id },
              query: undefined,
              body: undefined,
            });
            if (cancelledRef.current) return;
            // listPredictions 客户端直返数组(isList,createdAt desc)—— 与稿面
            // readBlindPrediction 同款读法。
            const raw = await client.listPredictions({
              params: undefined,
              query: { page: 1, pageSize: 100 },
              body: undefined,
            });
            const rows = (Array.isArray(raw) ? raw : []) as Array<{
              id: string;
              subjectId: string;
              status: string;
            }>;
            const draft = rows.find(
              (r) => r.subjectId === subjectId && r.status === "draft",
            );
            // 4. lockPrediction 定死(immutable)。取不到 draft 则诚实置 error(不假装锁成功);
            // draft 已落库,稿面盲预测行会显示草稿态可手动补锁。
            if (draft) {
              await client.lockPrediction({
                params: { predictionId: draft.id },
                query: undefined,
                body: undefined,
              });
            }
            if (!cancelledRef.current) {
              setPhase(draft ? "locked" : "error");
              router.refresh();
            }
            return;
          }
          if (status.status === "cancelled" || status.status === "failed") {
            if (!cancelledRef.current) setPhase("error");
            return;
          }
        }
        if (!cancelledRef.current) setPhase("error");
      } catch {
        if (!cancelledRef.current) setPhase("error");
      }
    })();
  }, [blindPredict, phase, router, pollIntervalMs]);

  if (!diagnosis || diagnosis.dimensions.length === 0) return null;
  return (
    <div
      data-slot="chat-diagnosis-card"
      data-blind-predict={blindPredict ? "true" : "false"}
      className="mt-1.5 flex flex-col gap-1.5 rounded-lg border border-brand/20 bg-surface/70 p-2"
    >
      <span className="text-[10px] font-medium uppercase tracking-wide text-brand">
        {blindPredict ? "AI 编导盲预测 · 逐维度诊断" : "AI 编导诊断 · 逐维度盲评"}
      </span>
      <ul className="flex flex-col gap-1" aria-label="维度评分">
        {diagnosis.dimensions.map((d, i) => (
          <li
            key={`${d.key}-${i}`}
            data-slot="chat-diagnosis-dim"
            className="flex flex-col gap-0.5 rounded-control border border-border bg-surface px-2.5 py-1.5"
          >
            <div className="flex items-center gap-2">
              <span className="min-w-0 flex-1 text-[13px] font-medium text-foreground">
                {d.key}
              </span>
              <span className="shrink-0 rounded-full bg-brand-soft px-1.5 py-0.5 text-[10px] font-medium text-brand">
                {d.score} / 5
              </span>
            </div>
            {d.reason ? (
              <span className="text-[11px] text-text-subtle">{d.reason}</span>
            ) : null}
            {d.suggestion ? (
              <span className="text-[11px] text-muted-foreground">
                建议：{d.suggestion}
              </span>
            ) : null}
          </li>
        ))}
      </ul>
      {diagnosis.verdict ? (
        <p className="text-[13px] font-medium text-foreground">
          综合判断：{diagnosis.verdict}
        </p>
      ) : null}
      {diagnosis.priorityFixes.length > 0 ? (
        <p className="text-[11px] text-muted-foreground">
          优先修改：{diagnosis.priorityFixes.join("；")}
        </p>
      ) : null}
      {blindPredict ? (
        // [T-103a] 盲预测确认门:锁定前是候选(可继续追问重生);点「锁定」= immutable。
        phase === "locked" ? (
          <div
            data-slot="chat-diagnosis-locked"
            className="flex flex-wrap items-center gap-2 border-t border-border/60 pt-1.5"
          >
            <span className="rounded-full bg-surface-subtle px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
              已锁定 · 不可改
            </span>
            <a
              href="/settings?tab=calibration"
              data-slot="chat-diagnosis-retro-link"
              className="text-[11px] font-medium text-brand hover:underline"
            >
              看复盘 →
            </a>
          </div>
        ) : (
          <div className="flex flex-col gap-1 border-t border-border/60 pt-1.5">
            <div className="flex items-center gap-2">
              <button
                type="button"
                data-slot="chat-diagnosis-lock"
                disabled={phase === "locking" || !!runtimeTask?.executionTaskId&&["paused","waiting_user","unknown_result","failed","cancelled","blocked"].includes(taskRuntimeStatus(runtimeTask))}
                onClick={lock}
                className="inline-flex h-6 items-center rounded-control bg-brand px-2 text-[10px] font-medium text-brand-foreground hover:bg-brand/90 disabled:opacity-50"
              >
                {phase === "locking" ? "锁定中…" : "锁定为盲预测"}
              </button>
              {phase === "error" ? (
                <span className="text-[10px] text-destructive">
                  尚未确认锁定完成，请查看原任务状态
                </span>
              ) : null}
            </div>
            {runtimeTask?.executionTaskId?<TaskRuntimeActions task={runtimeTask} onUpdated={lock}/>:null}
            <span className="text-[9.5px] text-text-subtle">
              锁定 = 用你的变现 rubric 铸一份发布前盲预测并定死(不可改),发布后用真实数据对照校准；
              锁定前可继续追问、重新诊断。
            </span>
          </div>
        )
      ) : (
        <p className="text-[9.5px] text-text-subtle">
          对话诊断为通用维度盲评；要按你的变现 rubric 铸盲预测,去校准中心「开始预测」。
        </p>
      )}
    </div>
  );
}

// ── 经验卡(review.learnings)—— 逐条采纳 → 去重后直接进知识库 ─────────────────────────
export interface ChatLearningItem {
  title: string;
  insight: string;
}

export function ChatLearningsCard({
  items,
  error = null,
}: {
  readonly items: readonly ChatLearningItem[];
  /** [T-224 诚实门] 没读到真逐字稿 → 空 items + 非空 error:渲诚实提示卡(要 projectId/逐字稿),不产经验卡。 */
  readonly error?: string | null;
}) {
  const router = useRouter();
  const [state, setState] = React.useState<ReadonlyMap<number, AdoptState>>(
    () => new Map(),
  );
  const setAt = React.useCallback(
    (i: number, s: AdoptState) =>
      setState((prev) => new Map(prev).set(i, s)),
    [],
  );
  const adopt = React.useCallback(
    async (i: number, l: ChatLearningItem) => {
      setAt(i, "adopting");
      try {
        await client.createLearning({
          params: undefined,
          query: undefined,
          body: { title: l.title, insight: l.insight },
        });
        setAt(i, "adopted");
        router.refresh();
      } catch {
        setAt(i, "error");
      }
    },
    [router, setAt],
  );

  // [T-224 诚实门] 没读到真逐字稿 → 不产经验卡,渲诚实提示(要 projectId/逐字稿)。
  if (items.length === 0) {
    if (error) {
      return (
        <div
          data-slot="chat-learnings-empty"
          className="mt-1.5 flex flex-col gap-1 rounded-lg border border-amber-500/30 bg-amber-500/5 p-2.5"
        >
          <span className="text-[10px] font-medium uppercase tracking-wide text-amber-600">
            无法拆解 · 需要真逐字稿
          </span>
          <span className="text-[13px] leading-snug text-foreground">{error}</span>
        </div>
      );
    }
    return null;
  }
  return (
    <div
      data-slot="chat-learnings-card"
      className="mt-1.5 flex flex-col gap-1.5 rounded-lg border border-brand/20 bg-surface/70 p-2"
    >
      <span className="text-[10px] font-medium uppercase tracking-wide text-brand">
        AI 复盘经验 · 逐条采纳进知识库
      </span>
      <ul className="flex flex-col gap-1.5" aria-label="复盘经验候选">
        {items.map((l, i) => {
          const s = state.get(i) ?? "idle";
          return (
            <li
              key={i}
              data-slot="chat-learning-item"
              className="flex flex-col gap-1 rounded-control border border-border bg-surface px-2.5 py-1.5"
            >
              <span className="text-[13px] font-medium leading-snug text-foreground">
                {l.title}
              </span>
              {l.insight ? (
                <span className="text-[11px] text-text-subtle">{l.insight}</span>
              ) : null}
              <div className="flex items-center gap-2">
                {s === "adopted" ? (
                  <span
                    data-slot="chat-learning-adopted"
                    className="text-[10px] font-medium text-success"
                  >
                    ✓ 已进入知识库
                  </span>
                ) : (
                  <button
                    type="button"
                    data-slot="chat-learning-adopt"
                    disabled={s === "adopting"}
                    onClick={() => adopt(i, l)}
                    className="inline-flex h-6 items-center rounded-control bg-brand px-2 text-[10px] font-medium text-brand-foreground hover:bg-brand/90 disabled:opacity-50"
                  >
                    {s === "adopting" ? "沉淀中…" : "采纳"}
                  </button>
                )}
                {s === "error" ? (
                  <span className="text-[10px] text-destructive">失败,重试</span>
                ) : null}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

// ── 定位卡(positioning.suggestion)—— 整条采纳 → upsertProfile + createStatement ─────────
export interface ChatPositioningSuggestion {
  persona: string;
  field: string;
  audience: string;
  differentiation: string;
  capabilities: string[];
  oneLiner: string;
  keywords: string[];
  // [T-058①] 富 facets(不做什么/核心痛点/核心价值/表达风格等)—— 采纳全量写入,
  // 否则用户看到的完整母版落库即丢一半(实录复盘的核心 bug)。
  facets?: {
    contentScope?: string;
    avoid?: string;
    corePain?: string;
    coreValue?: string;
    tone?: string;
    statusNote?: string;
  };
  // [T-234] 定位硬约束(下游规则)—— 键与 contract creatorProfileDownstreamRules 对齐。
  // AI 从访谈里提炼的硬约束(不做什么/表达红线/题材边界/效果要求/变现约束),采纳时
  // 只写非空键(与手动表单同一合并语义,不把空值覆盖已有规则)。
  downstreamRules?: {
    topicRule?: string;
    scriptRule?: string;
    projectRule?: string;
    forbidRule?: string;
    expressionRule?: string;
  };
}

export interface ChatPositioningDiscoveryProvenance {
  sessionId: string;
  candidateId: string;
  candidateRevision: number;
}

// [T-234] downstreamRules 的 5 个键(顺序 = 手动表单/契约声明顺序)。
const RULE_KEYS = [
  "topicRule",
  "scriptRule",
  "projectRule",
  "forbidRule",
  "expressionRule",
] as const;
type RuleKey = (typeof RULE_KEYS)[number];
const RULE_LABELS: Record<RuleKey, string> = {
  topicRule: "选题规则",
  scriptRule: "写稿规则",
  projectRule: "项目规则",
  forbidRule: "禁止事项",
  expressionRule: "表达风格规则",
};

// keywords 须正好 3 个(createStatement 不变量)。截断/补空,与 positioning-runner 的 clamp 同义。
function clampKeywords(raw: readonly string[]): [string, string, string] {
  const out = raw.slice(0, 3);
  while (out.length < 3) out.push("");
  return [out[0]!, out[1]!, out[2]!];
}

export function ChatPositioningCard({
  suggestion,
  discovery = null,
}: {
  readonly suggestion: ChatPositioningSuggestion | null;
  readonly discovery?: ChatPositioningDiscoveryProvenance | null;
}) {
  const router = useRouter();
  const [state, setState] = React.useState<AdoptState>("idle");
  const idempotencyKeyRef = React.useRef<string | null>(null);

  const adopt = React.useCallback(async () => {
    if (!suggestion || state === "adopting" || state === "adopted" || state === "stale") {
      return;
    }
    setState("adopting");
    try {
      // 定位中心前采产出的提案走单一原子确认门：画像、完整母版快照、不可变陈述版本和
      // session 终态同事务提交。重复点击复用同一 idempotencyKey，不会追加第二个版本。
      if (discovery) {
        const center = await client.getPositioningCenter({
          params: undefined,
          query: undefined,
          body: undefined,
        });
        idempotencyKeyRef.current ??= createAiTaskAttemptId();
        await client.confirmDiscovery({
          params: { sessionId: discovery.sessionId },
          query: undefined,
          body: {
            candidateId: discovery.candidateId,
            candidateRevision: discovery.candidateRevision,
            expectedCurrentStatementId: center.currentStatement?.id ?? null,
            idempotencyKey: idempotencyKeyRef.current,
            proposal: {
              persona: suggestion.persona,
              field: suggestion.field,
              audience: suggestion.audience,
              differentiation: suggestion.differentiation,
              capabilities: suggestion.capabilities,
              facets: {
                contentScope: suggestion.facets?.contentScope ?? "",
                avoid: suggestion.facets?.avoid ?? "",
                corePain: suggestion.facets?.corePain ?? "",
                coreValue: suggestion.facets?.coreValue ?? "",
                tone: suggestion.facets?.tone ?? "",
                statusNote: "",
              },
              downstreamRules: {
                topicRule: suggestion.downstreamRules?.topicRule ?? "",
                scriptRule: suggestion.downstreamRules?.scriptRule ?? "",
                projectRule: suggestion.downstreamRules?.projectRule ?? "",
                forbidRule: suggestion.downstreamRules?.forbidRule ?? "",
                expressionRule:
                  suggestion.downstreamRules?.expressionRule ?? "",
              },
              oneLiner: suggestion.oneLiner,
              keywords: clampKeywords(suggestion.keywords),
              productAnchorIds: [],
            },
          },
        });
        setState("adopted");
        router.refresh();
        return;
      }
      // [T-234] 硬约束合并:AI 只对聊到的键给值,没聊到的是空串。契约层对 downstreamRules
      // 的缺省键会补 ""(zod default),直接传部分对象会把库里已有规则抹空 —— 故先读现有
      // profile,逐键「新值非空则取新值,否则保留现值」合成全量对象再提交(与手动表单
      // 「只改动非空、不覆盖已有」的语义一致)。全空则整个字段省略(服务端保留现值)。
      const newRules = suggestion.downstreamRules ?? {};
      const hasNewRules = RULE_KEYS.some((k) => (newRules[k] ?? "").trim());
      let mergedRules: Record<RuleKey, string> | null = null;
      if (hasNewRules) {
        let prevRules: Partial<Record<RuleKey, string>> = {};
        try {
          const existing = await client.getProfile({
            params: undefined,
            query: undefined,
            body: undefined,
          });
          prevRules = existing.downstreamRules ?? {};
        } catch {
          // 尚无 profile(404)→ 现值按空处理,不阻断采纳。
        }
        mergedRules = Object.fromEntries(
          RULE_KEYS.map((k) => {
            const next = (newRules[k] ?? "").trim();
            return [k, next || (prevRules[k] ?? "")];
          }),
        ) as Record<RuleKey, string>;
      }
      // 写入定位母版(5 facet)。
      await client.upsertProfile({
        params: undefined,
        query: undefined,
        body: {
          persona: suggestion.persona,
          field: suggestion.field,
          audience: suggestion.audience,
          differentiation: suggestion.differentiation,
          capabilities: suggestion.capabilities,
          // [T-058①] 富 facets 全量随采纳落库(契约本就支持,此前漏传)。
          ...(suggestion.facets
            ? {
                facets: {
                  contentScope: suggestion.facets.contentScope ?? "",
                  avoid: suggestion.facets.avoid ?? "",
                  corePain: suggestion.facets.corePain ?? "",
                  coreValue: suggestion.facets.coreValue ?? "",
                  tone: suggestion.facets.tone ?? "",
                  statusNote: suggestion.facets.statusNote ?? "",
                },
              }
            : {}),
          // [T-234] 硬约束随采纳落库(已与现有规则逐键合并;全空则省略 = 保留现值)。
          ...(mergedRules ? { downstreamRules: mergedRules } : {}),
        },
      });
      // 追加一条定位陈述版本(oneLiner + 3 关键词)—— 仅在 oneLiner 非空时(createStatement 要求)。
      if (suggestion.oneLiner.trim()) {
        await client.createStatement({
          params: undefined,
          query: undefined,
          body: {
            oneLiner: suggestion.oneLiner,
            keywords: clampKeywords(suggestion.keywords),
            productAnchorIds: [],
          },
        });
      }
      setState("adopted");
      router.refresh();
    } catch (error) {
      setState(discovery && isDiscoveryConflict(error) ? "stale" : "error");
    }
  }, [discovery, router, state, suggestion]);

  if (!suggestion || (!suggestion.oneLiner && !suggestion.persona)) return null;

  // [T-234] 卡上先展示 AI 提炼的硬约束(非空键),用户看清是什么再决定采纳。
  const ruleRows: ReadonlyArray<readonly [string, string]> = RULE_KEYS.map(
    (k) => [RULE_LABELS[k], (suggestion.downstreamRules?.[k] ?? "").trim()] as const,
  ).filter(([, v]) => v.length > 0);

  const facets: ReadonlyArray<readonly [string, string]> = [
    ["人设", suggestion.persona],
    ["领域", suggestion.field],
    ["人群", suggestion.audience],
    ["差异化", suggestion.differentiation],
    ["内容范围", suggestion.facets?.contentScope ?? ""],
    ["不做什么", suggestion.facets?.avoid ?? ""],
    ["核心痛点", suggestion.facets?.corePain ?? ""],
    ["核心价值", suggestion.facets?.coreValue ?? ""],
    ["表达风格", suggestion.facets?.tone ?? ""],
  ];

  return (
    <div
      data-slot="chat-positioning-card"
      className="mt-1.5 flex flex-col gap-1.5 rounded-lg border border-brand/20 bg-surface/70 p-2"
    >
      <span className="text-[10px] font-medium uppercase tracking-wide text-brand">
        AI 定位提案 · 采纳写入定位母版
      </span>
      <div className="flex flex-col gap-1 rounded-control border border-border bg-surface px-2.5 py-2">
        {suggestion.oneLiner ? (
          <p className="text-[13px] font-medium leading-snug text-foreground">
            {suggestion.oneLiner}
          </p>
        ) : null}
        <dl className="grid grid-cols-1 gap-0.5 sm:grid-cols-2">
          {facets
            .filter(([, v]) => v.length > 0)
            .map(([label, value]) => (
              <div key={label} className="flex gap-1 text-[10px]">
                <dt className="shrink-0 text-text-subtle">{label}</dt>
                <dd className="text-muted-foreground">{value}</dd>
              </div>
            ))}
        </dl>
        {suggestion.keywords.filter(Boolean).length > 0 ? (
          <div className="flex flex-wrap gap-1">
            {suggestion.keywords.filter(Boolean).map((kw) => (
              <span
                key={kw}
                className="rounded-full bg-secondary px-1.5 py-0.5 text-[9.5px] text-secondary-foreground"
              >
                {kw}
              </span>
            ))}
          </div>
        ) : null}
        {/* [T-234] 硬约束组(downstreamRules)—— 采纳前可见,采纳时只写非空键。 */}
        {ruleRows.length > 0 ? (
          <div
            data-slot="chat-positioning-rules"
            className="flex flex-col gap-0.5 rounded-control border border-warning/30 bg-warning/5 px-2 py-1.5"
          >
            <span className="text-[9.5px] font-medium uppercase tracking-wide text-warning">
              这些是硬性要求,后续选题、写稿都会遵守。
            </span>
            {ruleRows.map(([label, value]) => (
              <div key={label} className="flex gap-1 text-[10px]">
                <span className="shrink-0 text-text-subtle">{label}</span>
                <span className="text-muted-foreground">{value}</span>
              </div>
            ))}
          </div>
        ) : null}
        <div className="flex items-center gap-2">
          {state === "adopted" ? (
            <span
              data-slot="chat-positioning-adopted"
              className="text-[10px] font-medium text-success"
            >
              ✓ 已写入当前定位
            </span>
          ) : (
            <button
              type="button"
              data-slot="chat-positioning-adopt"
              disabled={state === "adopting" || state === "stale"}
              onClick={adopt}
              className="inline-flex h-6 items-center rounded-control bg-brand px-2 text-[10px] font-medium text-brand-foreground hover:bg-brand/90 disabled:opacity-50"
            >
              {state === "adopting"
                ? "采纳中…"
                : state === "stale"
                  ? "定位卡已过期"
                  : "采纳为当前定位"}
            </button>
          )}
          {state === "error" ? (
            <span className="text-[10px] text-destructive">采纳失败,重试</span>
          ) : null}
          {state === "stale" ? (
            <span className="text-[10px] leading-relaxed text-warning">
              前采内容在生成后有更新，这张定位卡已过期。请重新生成后再采纳，现有定位没有被覆盖。
            </span>
          ) : null}
        </div>
      </div>
    </div>
  );
}

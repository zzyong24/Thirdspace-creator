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
import { TaskObservationNotice, useTaskObservation } from "@/components/ai/task-observation";
import { TaskPartialNotice } from "@/components/ai/task-partial-notice";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {taskRuntimeStatus,type RuntimeTask} from "@/components/ai/task-runtime-actions";
import { client } from "@/lib/contract-client";
import { createAiTaskAttemptId } from "@/lib/ai-task-attempt";

import {type PredictionLockSource,type PredictionLockState} from "@creatoros/contract";
import {createCreationWorkspace,creationScopeKey,readCreationScope,useCreationScope} from "@/lib/creation-workspace-scope";

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
// 原卡片来源绑定由服务端读回；前端不查找项目最新预测。
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

// 卡片的原消息/工具位置是唯一锁定入口；页面VM只保留展示上下文。
export interface BlindPredictLockContext {
  readonly outputId: string | null;
  readonly projectId: string;
  readonly projectTitle: string;
  readonly source?: PredictionLockSource | null;
}
const DEFAULT_POLL_INTERVAL_MS = 4000;
type LockController = { refresh(): Promise<void>; act(): Promise<void>; command(action:"resume"|"retry"|"cancel"):Promise<void> };
export function ChatDiagnosisCard({diagnosis,blindPredict,pollIntervalMs=DEFAULT_POLL_INTERVAL_MS}: {
  readonly diagnosis: ChatDiagnosis | null;
  readonly blindPredict?: BlindPredictLockContext | null;
  readonly pollIntervalMs?: number;
}) {
  const router=useRouter(),scope=useCreationScope(),scopeKey=creationScopeKey(scope);
  const source=blindPredict?.source,conversationId=source?.conversationId,sourceMessageId=source?.sourceMessageId,toolCallId=source?.toolCallId;
  const identity=JSON.stringify([scopeKey,!!blindPredict,conversationId,sourceMessageId,toolCallId]);
  const observation=useTaskObservation(identity),{pause:pauseObservation}=observation;
  const [view,setView]=React.useState<{identity:string;state:PredictionLockState|null;busy:boolean;error:string|null}>({identity,state:null,busy:false,error:null});
  const state=view.identity===identity?view.state:null,busy=view.identity===identity&&view.busy,error=view.identity===identity?view.error:null;
  const controller=React.useRef<LockController|null>(null),generation=React.useRef(0);

  const routerRef=React.useRef(router);routerRef.current=router;
  React.useEffect(()=>{
    const workspace=createCreationWorkspace(scope);workspace.activate();const scopedClient=workspace.client;
    const epoch=++generation.current;let active=true,intent=false,acting=false,loop:Promise<void>|null=null,read:Promise<PredictionLockState|null>|null=null;
    let latest:PredictionLockState|null=null,reads=0;const confirmed=new Set<string>(),commandKeys=new Map<string,string>();
    const current=()=>active&&generation.current===epoch&&creationScopeKey(readCreationScope())===scopeKey;
    const update=(patch:Partial<typeof view>)=>{if(current())setView(previous=>({...previous,identity,...patch}));};
    update({state:null,busy:false,error:null});
    const location=conversationId&&sourceMessageId&&toolCallId?{conversationId,sourceMessageId,toolCallId}:null;
    const sameSource=(value:PredictionLockState)=>location&&value.source.conversationId===location.conversationId&&value.source.sourceMessageId===location.sourceMessageId&&value.source.toolCallId===location.toolCallId;
    const accept=(value:PredictionLockState)=>{
      if(!current())return null;
      if(!sameSource(value))throw Error('原卡片的锁定回执不匹配，请回原对话核对。');
      latest=value;update({state:value,error:null});return value;
    };
    const fetchState=():Promise<PredictionLockState|null>=>{
      if(read)return read;
      const pending=(async()=>{if(!current()||!location)return null;
        return accept(await scopedClient.readPredictionLockSource({params:{conversationId:location.conversationId},query:{sourceMessageId:location.sourceMessageId,toolCallId:location.toolCallId},body:undefined}));
      })();
      read=pending;
      void pending.finally(()=>{if(read===pending)read=null;}).catch(()=>{});
      return pending;
    };
    const observe=():Promise<void>=>{
      if(loop)return loop;
      const pending=(async()=>{try{for(;;){
        const value=await fetchState();if(!value||!current())return;
        if(value.status==='awaiting_confirmation'&&intent){
          const taskId=value.diagnoseTaskId;
          if(!taskId||value.task?.id!==taskId||confirmed.has(taskId)){intent=false;return;}
          confirmed.add(taskId);await scopedClient.confirmTask({params:{taskId},query:undefined,body:undefined});
          if(!current())return;continue;
        }
        if(value.status==='locked'){if(intent)routerRef.current.refresh();intent=false;return;}
        if(value.status!=='running'||value.task?.status==='partial'){intent=false;return;}
        if(++reads%75===0&&!await pauseObservation())return;
        if(!current())return;await new Promise(resolve=>setTimeout(resolve,pollIntervalMs));if(!current())return;
      }}catch(caught){intent=false;update({error:caught instanceof Error?caught.message:'尚未确认锁定完成，请保留原任务核对。'});}finally{update({busy:false});}})();
      loop=pending;void pending.finally(()=>{if(loop===pending)loop=null;}).catch(()=>{});return pending;
    };
    const control:LockController={refresh:observe,async command(action){
      const task=latest?.task;if(acting||!current()||!task?.executionTaskId)return;
      acting=true;update({busy:true,error:null});
      const key=task.executionTaskId+':'+action;if(!commandKeys.has(key))commandKeys.set(key,crypto.randomUUID());
      try{await scopedClient.commandExecutionTasks({params:undefined,query:undefined,body:{taskIds:[task.executionTaskId],command:action,idempotencyKey:commandKeys.get(key)!}});commandKeys.delete(key);if(current())await observe();}
      catch(caught){update({error:caught instanceof Error?caught.message:'原任务操作结果尚未确认，请核对原任务。'});}
      finally{acting=false;update({busy:false});}
    },async act(){
      if(acting||!current()||!location||!latest||!['available','awaiting_confirmation'].includes(latest.status))return;
      acting=true;intent=true;update({busy:true,error:null});
      try{
        if(latest.status==='available'){
          if(!latest.baselineDigest)throw Error('原稿基线尚无法确认，请回原对话核对。');
          accept(await scopedClient.startPredictionLock({params:{conversationId:location.conversationId},query:undefined,body:{sourceMessageId:location.sourceMessageId,toolCallId:location.toolCallId,expectedBaselineDigest:latest.baselineDigest,policyVersion:1}}));
        }
        if(current())await observe();
      }catch(caught){intent=false;update({error:caught instanceof Error?caught.message:'锁定结果尚未确认，请查看原卡片。'});}
      finally{acting=false;update({busy:false});}
    }};
    controller.current=control;
    if(blindPredict&&location)void observe();
    return()=>{active=false;intent=false;workspace.dispose();if(controller.current===control)controller.current=null;};
  },[identity,scopeKey,conversationId,sourceMessageId,toolCallId,pollIntervalMs,pauseObservation,!!blindPredict]);
  const runtimeTask=state?.task as RuntimeTask|null|undefined;
  const locked=state?.status==='locked';
  const partial=runtimeTask?.status==='partial',runtimeStatus=runtimeTask?taskRuntimeStatus(runtimeTask):null;
  const canAct=!!source&&!busy&&!error&&!partial&&!!state&&['available','awaiting_confirmation'].includes(state.status);
  const unavailable=!source?'原卡片来源未记录，无法确认锁定状态。':!state&&!error?'正在读取原卡片状态…':state?.status==='legacy_unknown'?'这张旧卡片没有可恢复的锁定回执。':state?.status==='missing'?'原锁定记录不可用，请保留当前卡片。':state?.status==='unknown'?'原任务结果尚未确认，请保留原任务核对。':state?.status==='failed'?'原任务未完成，请查看原任务状态。':null;
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
      <TaskObservationNotice {...observation} />
      <TaskPartialNotice visible={partial} />
      {blindPredict&&state?.baseline?<p className="break-all text-xs text-muted-foreground" data-slot="chat-diagnosis-baseline">确认稿版本：{state.baseline.versionId}</p>:null}
      {blindPredict&&state&&!state.baseline?<p className="text-xs text-muted-foreground">原锁定基线：尚无确认稿</p>:null}
      {blindPredict&&state?.diagnoseTaskId&&!locked?<p className="break-all text-xs text-muted-foreground">原任务：{state.diagnoseTaskId}{runtimeTask?` · ${runtimeTask.status}`:''}</p>:null}
      {blindPredict ? (
        // [T-103a] 盲预测确认门:锁定前是候选(可继续追问重生);点「锁定」= immutable。
        locked ? (
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
                disabled={!canAct}
                onClick={()=>void controller.current?.act()}
                className="inline-flex h-6 items-center rounded-control bg-brand px-2 text-[10px] font-medium text-brand-foreground hover:bg-brand/90 disabled:opacity-50"
              >
                {busy||state?.status==='running' ? "锁定中…" : state?.status==='awaiting_confirmation' ? "继续锁定" : "锁定为盲预测"}
              </button>
            </div>
            {unavailable?<span className="text-xs text-muted-foreground" role="status">{unavailable}</span>:null}
            {error?<span className="text-xs text-destructive" role="alert">{error}</span>:null}
            {source&&!runtimeTask?.executionTaskId&&(error||state&&['failed','unknown','missing'].includes(state.status))?<button type="button" className="self-start text-xs text-brand hover:underline" disabled={busy} onClick={()=>void controller.current?.refresh()}>刷新原卡状态</button>:null}
            {runtimeTask?.executionTaskId?<div className="flex flex-wrap items-center gap-2 text-xs">
              {runtimeStatus&&['paused','waiting_user','failed'].includes(runtimeStatus)?<button type="button" disabled={busy} onClick={()=>void controller.current?.command(runtimeStatus==='failed'?'retry':'resume')}>{runtimeStatus==='failed'?'重试原任务':'继续原任务'}</button>:null}
              {runtimeStatus&&['queued','running','retry_wait','paused','waiting_user','unknown_result','pause_requested'].includes(runtimeStatus)?<button type="button" disabled={busy} onClick={()=>void controller.current?.command('cancel')}>取消任务</button>:null}
              <button type="button" disabled={busy} onClick={()=>void controller.current?.refresh()}>刷新状态</button>
            </div>:null}
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
  source?: string;
  applicability?: string;
}

export function ChatLearningsCard({
  items, projectId, observations = [], hypotheses = [], nextExperiment = "", insufficientReason = "",
  error = null,
}: {
  readonly items: readonly ChatLearningItem[];
  readonly projectId?: string | null;
  readonly observations?: readonly string[];
  readonly hypotheses?: readonly string[];
  readonly nextExperiment?: string;
  readonly insufficientReason?: string;
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
          body: { title: l.title, insight: l.insight, ...(projectId ? {projectId} : {}), source:l.source, applicability:l.applicability },
        });
        setAt(i, "adopted");
        router.refresh();
      } catch {
        setAt(i, "error");
      }
    },
    [router, setAt, projectId],
  );

  // [T-224 诚实门] 没读到真逐字稿 → 不产经验卡,渲诚实提示(要 projectId/逐字稿)。
  if (items.length === 0 && !observations.length && !hypotheses.length && !nextExperiment && !insufficientReason) {
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
        复盘观察与下一次检验
      </span>
      {observations.length > 0 ? <div className="text-xs"><strong>实际观察</strong>{observations.map((text,i)=><p key={i}>{text}</p>)}</div> : null}
      {hypotheses.length > 0 ? <div className="text-xs"><strong>待验证解释</strong>{hypotheses.map((text,i)=><p key={i}>{text}</p>)}</div> : null}
      {nextExperiment ? <p className="text-xs"><strong>下一条检验：</strong>{nextExperiment}</p> : null}
      {insufficientReason ? <p className="text-xs text-text-subtle">暂不沉淀经验：{insufficientReason}</p> : null}
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
              {l.source ? <p className="text-xs text-text-subtle">依据：{l.source}</p> : null}
              {l.applicability ? <p className="text-xs text-text-subtle">适用条件：{l.applicability}</p> : null}
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
                    disabled={s === "adopting" || !projectId || !l.source?.trim() || !l.applicability?.trim()}
                    title={!projectId || !l.source?.trim() || !l.applicability?.trim() ? "请重新复盘以补齐来源项目、依据与适用条件" : undefined}
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
  autoAdopt = false,
}: {
  readonly suggestion: ChatPositioningSuggestion | null;
  readonly discovery?: ChatPositioningDiscoveryProvenance | null;
  /** 用户已选「继续深入当前账号」：提案到达即走同一采纳门自动写入，不再等手动点击。 */
  readonly autoAdopt?: boolean;
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

  const adoptable = Boolean(suggestion && (suggestion.oneLiner || suggestion.persona));
  // 自动采纳只尝试一次：失败后回到手动「重试」，过期卡不重试，避免对同一候选反复写入。
  const autoTriedRef = React.useRef(false);
  React.useEffect(() => {
    if (!autoAdopt || !adoptable || autoTriedRef.current || state !== "idle") return;
    autoTriedRef.current = true;
    void adopt();
  }, [adopt, adoptable, autoAdopt, state]);

  if (!suggestion || !adoptable) {
    return autoAdopt ? (
      <p
        data-slot="chat-positioning-auto-empty"
        role="status"
        className="mt-1.5 rounded-lg border border-border bg-surface/70 px-2.5 py-2 text-[11px] leading-relaxed text-muted-foreground"
      >
        本轮没有生成可采纳的定位提案，当前定位未改动。可以继续补充信息，或直接说“先给我一版”。
      </p>
    ) : null;
  }

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
        {autoAdopt ? "AI 定位提案 · 继续深入当前账号，自动采纳" : "AI 定位提案 · 采纳写入定位母版"}
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
            <>
              <span
                data-slot="chat-positioning-adopted"
                className="text-[10px] font-medium text-success"
              >
                {autoAdopt ? "✓ 已自动写入当前定位" : "✓ 已写入当前定位"}
              </span>
              {/* 撤销/再编辑：定位中心「编辑当前定位」可改，历史版本可「复制为草稿」恢复旧版。 */}
              <Link
                href="/positioning"
                data-slot="chat-positioning-revise"
                className="text-[10px] text-brand underline-offset-2 hover:underline"
              >
                去定位中心修改或恢复历史版本
              </Link>
            </>
          ) : (
            <button
              type="button"
              data-slot="chat-positioning-adopt"
              disabled={state === "adopting" || state === "stale"}
              onClick={adopt}
              className="inline-flex h-6 items-center rounded-control bg-brand px-2 text-[10px] font-medium text-brand-foreground hover:bg-brand/90 disabled:opacity-50"
            >
              {state === "adopting"
                ? autoAdopt ? "自动采纳中…" : "采纳中…"
                : state === "stale"
                  ? "定位卡已过期"
                  : "采纳为当前定位"}
            </button>
          )}
          {state === "error" ? (
            <span data-slot="chat-positioning-adopt-error" className="text-[10px] text-destructive">{autoAdopt ? "自动采纳未完成，当前定位未改动，可点按钮重试" : "采纳失败,重试"}</span>
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

"use client";

import * as React from "react";
import { createAiTaskAttemptId } from "@/lib/ai-task-attempt";
import { taskRuntimeStatus } from "@/lib/ai-task-runtime";
import { assertTranscribeScope, clearLocalReference, readExactTranscribeTask, readLocalReference, readTaskQuery, readProjectTranscribeSnapshot, stableOwnerKey, storeLocalReference, writeTaskQuery, TranscribeTaskProgress, useTranscribeScope, type LocalTranscribeReference, type AITaskResource } from "@/features/copilot/transcribe-task-progress";

const BUTTON = "min-h-11 min-w-11 rounded-control border border-border px-3 py-2 text-base disabled:opacity-50";
export function TranscribeNowButton({ projectId, awemeId = null, initialState = "idle" }: {
  projectId: string; awemeId?: string | null;
  initialState?: "idle" | "queued" | "running" | "failed" | "done" | "unknown";
}) {
  const { scope, error: scopeError, reload } = useTranscribeScope();
  const [reference, setReference] = React.useState<LocalTranscribeReference | null>(null);
  const referenceRef = React.useRef<LocalTranscribeReference | null>(null);
  const [verifiedTask, setVerifiedTask] = React.useState<AITaskResource | null>(null);
  const [snapshot, setSnapshot] = React.useState<{ hasTranscript: boolean; noAssociatedTasks: boolean } | null>(null);
  const [busy, setBusy] = React.useState(false), [message, setMessage] = React.useState<string | null>(null);
  const [snapshotReload, setSnapshotReload] = React.useState(0), [snapshotReading, setSnapshotReading] = React.useState(false);
  const [snapshotError, setSnapshotError] = React.useState<string | null>(null);
  const flight = React.useRef(false), epoch = React.useRef(0), alive = React.useRef(true);
  function remember(row: LocalTranscribeReference) { referenceRef.current = row; setReference(row); return scope ? storeLocalReference(scope, row) : false; }
  React.useEffect(() => { alive.current = true; return () => { alive.current = false; ++epoch.current; }; }, []);
  React.useEffect(() => {
    const turn = ++epoch.current; setBusy(false); setVerifiedTask(null); setSnapshot(null); setSnapshotReading(Boolean(scope)); setSnapshotError(null);
    if (!scope) { setReference(null); setMessage(null); return; }
    const prior = referenceRef.current;
    const saved = prior?.ownerKey === stableOwnerKey(scope) && prior.projectId === projectId ? prior : readLocalReference(scope, projectId);
    const queryId = readTaskQuery(scope, projectId);
    const row: LocalTranscribeReference = { ownerKey: stableOwnerKey(scope), scopeKey: scope.key, projectId, ...saved,
      ...(queryId && !saved?.pending?.acceptedTaskId ? { taskId: queryId } : {}) };
    referenceRef.current = row; setReference(row);
    const current = () => alive.current && turn === epoch.current;
    // 真正候选读取在浏览器走现meta能力；RSC的普通client array不证明全量没有。
    void readProjectTranscribeSnapshot(scope, projectId, awemeId, current).then(result => {
      if (current()) setSnapshot({ hasTranscript: result.hasTranscript, noAssociatedTasks: !result.candidates.length });
    }, () => { if (current()) setSnapshotError("当前正文/关联任务读取未确认，不发起新的请求；可重新读取或查看原任务"); }).finally(() => { if (current()) setSnapshotReading(false); });
    return () => { ++epoch.current; };
  }, [scope?.key, projectId, awemeId, snapshotReload]);
  function invalid() {
    if (scope) clearLocalReference(scope, projectId); // 只清canonical/query，保pending/tombstone。
    ++epoch.current; setReference(null); setVerifiedTask(null); setSnapshot(null);
    setMessage("当前身份或引用未确认；原请求仍保留，请重新读取身份及本人任务"); void reload();
  }
  function invalidReference() {
    if (!scope) return;
    const old = referenceRef.current;
    clearLocalReference(scope, projectId);
    remember({ ownerKey: stableOwnerKey(scope), scopeKey: scope.key, projectId,
      ...(old?.pending ? { pending: old.pending } : {}), ...(old?.tombstone ? { tombstone: true } : {}) });
    setVerifiedTask(null); setMessage("原任务引用不可读取；原请求记录仍保留，未另建请求");
  }
  function verified(task: AITaskResource) {
    if (!scope || !alive.current) return;
    setVerifiedTask(task);
    const old = referenceRef.current;
    const row: LocalTranscribeReference = { ownerKey: stableOwnerKey(scope), scopeKey: scope.key, projectId, taskId: task.id,
      ...(old?.pending && old.pending.acceptedTaskId !== task.id ? { pending: old.pending } : {}),
      ...(old?.tombstone ? { tombstone: true } : {}) };
    remember(row); writeTaskQuery(scope, projectId, task.id);
  }
  async function submit(checkOriginal: boolean) {
    if (!scope || flight.current) return;
    const old = referenceRef.current;
    const replacement = verifiedTask && (taskRuntimeStatus(verifiedTask) === "cancelled" || (taskRuntimeStatus(verifiedTask) === "failed" && !verifiedTask.executionTaskId));
    if (old?.tombstone || (!checkOriginal && (old?.pending || !snapshot || snapshot.hasTranscript || (old?.taskId ? !replacement : !snapshot.noAssociatedTasks)))) return;
    const frozen = scope, turn = epoch.current;
    const current = () => alive.current && turn === epoch.current;
    flight.current = true; setBusy(true); setMessage(null);
    try {
      await assertTranscribeScope(frozen);
      if (!current()) return;
      const existing = referenceRef.current?.pending;
      if (checkOriginal && !existing) return;
      if (existing && (existing.origin.ownerKey !== stableOwnerKey(frozen) || existing.origin.accountId !== frozen.accountId)) { setMessage("原请求与当前选择的身份或账号不一致；请返回原身份/账号核对，仅可查看当前本人任务"); return; }
      const project = await frozen.client.getProject({ params: { projectId }, query: undefined, body: undefined });
      const source = project.platformRef.platform === "douyin" ? project.platformRef.externalId : "";
      if (!source || (awemeId && source !== awemeId) || (existing && source !== existing.expectedAwemeId)) { setMessage("原作品来源已变化，不能再次提交原请求；保留原请求以便核对"); return; }
      if (!existing) {
        const fresh = await readProjectTranscribeSnapshot(frozen, projectId, source, current);
        if (!current()) return;
        if (fresh.hasTranscript || (!replacement && fresh.candidates.length)) { setMessage("当前已有稿件或关联任务，请先查看原任务"); return; }
        if (verifiedTask) {
          const task = await readExactTranscribeTask(frozen, verifiedTask.id, projectId, source);
          if (!(taskRuntimeStatus(task) === "cancelled" || (taskRuntimeStatus(task) === "failed" && !task.executionTaskId))) { setMessage("原任务状态已变化，请先查看"); return; }
        }
      }
      const pending = existing || { projectId, attemptId: createAiTaskAttemptId(), expectedAwemeId: source,
        origin: { ownerKey: stableOwnerKey(frozen), accountId: frozen.accountId, scopeKey: frozen.key } };
      const row: LocalTranscribeReference = { ...(referenceRef.current || {}), ownerKey: stableOwnerKey(frozen), scopeKey: frozen.key, projectId, pending };
      // 保原nonce/来源并验证持久读回，失败时不POST。版本变化不生成新封套或新bucket。
      if (!remember(row)) { setMessage("无法保留原请求恢复记录，本次未发送转写；仍可查看本人任务"); return; }
      const result = await frozen.client.transcribeProjectWork({ params: { projectId }, query: undefined, body: { attemptId: pending.attemptId } });
      await assertTranscribeScope(frozen);
      if (!current()) return;
      if (!result.taskId || typeof result.taskId !== "string") { setMessage("响应未提供准确任务引用；保原请求记录核对，不另行发起"); return; }
      const accepted: LocalTranscribeReference = { ...row, pending: { ...pending, acceptedTaskId: result.taskId } };
      remember(accepted); setMessage("原请求已受理，正在回读准确任务；没有另行发起");
      const task = await readExactTranscribeTask(frozen, result.taskId, projectId, source);
      if (!current()) return;
      verified(task); setMessage("已确认原任务，可查看步骤与当前稿件");
    } catch (failure) {
      if (!current()) return;
      const status = (failure as { status?: number }).status;
      if ((failure as Error).name === "TranscribeScopeChanged" || [401, 403].includes(status || 0)) { invalid(); return; }
      setMessage(referenceRef.current?.pending?.acceptedTaskId ? "原任务已受理，详情读取未确认；请查看原任务，不要另建" : "原请求结果未确认；保原请求记录，只核对原请求，不重新发起");
    } finally { flight.current = false; if (current()) setBusy(false); }
  }
  if (!scope) return <div className="min-w-0 space-y-2 text-base"><p role="status">{scopeError || "正在确认当前身份"}</p><button type="button" className={BUTTON} onClick={() => { void reload(); }}>重新读取身份</button></div>;
  const pending = reference?.pending;
  const selected = pending?.acceptedTaskId || reference?.taskId;
  const replacement = verifiedTask && (taskRuntimeStatus(verifiedTask) === "cancelled" || (taskRuntimeStatus(verifiedTask) === "failed" && !verifiedTask.executionTaskId));
  const canCreate = !pending && !reference?.tombstone && snapshot && !snapshot.hasTranscript && (selected ? Boolean(replacement) : snapshot.noAssociatedTasks);
  const canCheck = pending && pending.origin.ownerKey === stableOwnerKey(scope) && pending.origin.accountId === scope.accountId;
  return <div className="min-w-0 max-w-full space-y-3 text-base">
    {(snapshot ? snapshot.hasTranscript : initialState === "done") ? <p>当前项目已有稿件；仍可查看原转写任务。</p> : <button type="button" className={BUTTON} data-slot="draft-transcribe-now" disabled={busy || !canCreate} onClick={() => { void submit(false); }}>{replacement ? "明确重新发起本作品" : "立即抓取逐字稿"}</button>}
    {!snapshot ? <p role="status">当前正文和本人关联任务尚未确认；未确认前不发起新请求。</p> : null}
    <button type="button" className={BUTTON} disabled={busy || snapshotReading} onClick={() => { setSnapshot(null); setSnapshotReading(true); setSnapshotReload(value => value + 1); }}>{snapshotReading ? "正在读取正文和关联任务" : "重新读取正文和关联任务"}</button>
    {snapshotError ? <p role="alert">{snapshotError}</p> : null}
    {message ? <p role="status">{message}</p> : null}
    {reference?.tombstone ? <p role="alert">原恢复记录不完整，保未知标记并禁止新请求；请核对本人原任务，不会因记录缺失而再次发起。</p> : null}
    {pending ? <div className="space-y-2"><p>原请求结果仍待核对。版本变化不解除此记录，选择另一任务也不证明原请求已确认。</p>{pending.acceptedTaskId ? <p className="break-all">已受理任务编号：{pending.acceptedTaskId}；详情仍待读取确认。</p> : null}<button type="button" className={BUTTON} disabled={busy || !canCheck} onClick={() => { void submit(true); }}>核对原请求</button>{!canCheck ? <p>当前选择与原请求不同，仅可查看当前本人任务；请返回原身份或账号核对。</p> : null}</div> : null}
    <TranscribeTaskProgress key={`${scope.key}:${projectId}`} scope={scope} taskId={selected} projectId={projectId} awemeId={awemeId} onVerified={verified} onScopeInvalid={invalid} onReferenceInvalid={invalidReference} />
  </div>;
}

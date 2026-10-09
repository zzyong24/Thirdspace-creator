"use client";

import * as React from "react";
import { ENDPOINTS, createClient, requestListWithMeta, type ExecutionTaskResourceV2 } from "@creatoros/contract";
import { createHttpTransport, readCurrentAccountId, readCurrentGroupId, HttpTransportError } from "@/lib/http-transport";
import { taskRuntimeStatus } from "@/lib/ai-task-runtime";

export type AITaskResource = ReturnType<typeof ENDPOINTS.getTask.response.parse>;
type AITaskStepResource = ReturnType<typeof ENDPOINTS.listTaskSteps.response.parse>;

const PREFIX = "creatoros:transcribe:v2:";
const TERMINAL = new Set(["succeeded", "partial", "failed", "cancelled"]);
const CANCELLABLE = new Set(["queued", "running", "retry_wait", "paused", "waiting_user", "unknown_result", "pause_requested"]);
const BUTTON = "min-h-11 min-w-11 rounded-control border border-border px-3 py-2 text-base disabled:opacity-50";
const NO_INPUT = { params: undefined, query: undefined, body: undefined };

export function selectionKey(): string {
  return JSON.stringify([readCurrentGroupId() || null, readCurrentAccountId() || null]);
}
export type TranscribeScope = {
  key: string;
  selection: string;
  userId: string;
  groupId: string | null;
  groupVersion: number | null;
  accountId: string | null;
  membershipVersion: number | null;
  transport: ReturnType<typeof createHttpTransport>;
  client: ReturnType<typeof createClient<typeof ENDPOINTS>>;
};
class ScopeChanged extends Error {
  constructor() { super("当前身份或工作区已变化，请重新读取"); this.name = "TranscribeScopeChanged"; }
}
class ReferenceUnavailable extends Error { constructor() { super("原任务引用不可读取，请核对本人原任务"); this.name = "TranscribeReferenceUnavailable"; } }
export async function readTranscribeScope(): Promise<TranscribeScope> {
  const selection = selectionKey();
  const groupId = readCurrentGroupId() || null;
  const accountId = readCurrentAccountId() || null;
  if (!groupId && !accountId) throw new ScopeChanged();
  const transport = createHttpTransport("/api/v1", { groupId, accountId });
  const client = createClient(ENDPOINTS, transport);
  const user = await client.getSettings(NO_INPUT);
  let groupVersion: number | null = null;
  let membershipVersion: number | null = null;
  if (groupId) {
    const group = await client.getAccountGroup({ ...NO_INPUT, params: { groupId } });
    if (group.userId !== user.id) throw new ScopeChanged();
    groupVersion = group.version;
    if (accountId) {
      const member = group.members.find(row => row.accountId === accountId && row.leftAt === null && row.status === "active");
      if (!member) throw new ScopeChanged();
      membershipVersion = member.version;
    }
  }
  if (selection !== selectionKey()) throw new ScopeChanged();
  return { key: JSON.stringify([user.id, groupId, groupVersion, accountId, membershipVersion]), selection,
    userId: user.id, groupId, groupVersion, accountId, membershipVersion, transport, client };
}
export function clearScopeReferences(scope: TranscribeScope): void {
  // 只隔离显示/query；unknown请求与命令记录不能因失权、网络或版本变化删除。
  clearTaskQuery(scope.key);
}
export function stableOwnerKey(scope: TranscribeScope): string {
  return JSON.stringify([scope.userId, scope.groupId ? "group" : "legacy-account", scope.groupId || scope.accountId]);
}
function inWorkspace(row: { userId: string; groupId?: string | null }, scope: TranscribeScope) {
  return row.userId === scope.userId && (scope.groupId ? row.groupId === scope.groupId : row.groupId == null || row.groupId === `grp_legacy_${scope.accountId}`);
}
export async function assertTranscribeScope(scope: TranscribeScope): Promise<void> {
  if (selectionKey() !== scope.selection) { clearScopeReferences(scope); throw new ScopeChanged(); }
  const current = await readTranscribeScope();
  if (current.key !== scope.key) { clearScopeReferences(scope); throw new ScopeChanged(); }
}
export function useTranscribeScope() {
  const [scope, setScope] = React.useState<TranscribeScope | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const previous = React.useRef<TranscribeScope | null>(null);
  const epoch = React.useRef(0);
  const reload = React.useCallback(async () => {
    const turn = ++epoch.current;
    // 每次重新确认身份都先撤旧视图；同选择的用户/版本变化也不能延续旧授权显示。
    setScope(null);
    try {
      const next = await readTranscribeScope();
      if (turn !== epoch.current) return;
      if (previous.current && previous.current.key !== next.key) clearScopeReferences(previous.current);
      previous.current = next; setScope(next); setError(null);
    } catch {
      if (turn !== epoch.current) return;
      if (previous.current) clearScopeReferences(previous.current);
      previous.current = null; setScope(null); setError("身份或工作区未确认，请重新读取；原请求记录保留，此时不发起新请求");
    }
  }, []);
  React.useEffect(() => {
    void reload();
    const changed = () => { void reload(); };
    window.addEventListener("creatoros:accounts-changed", changed);
    window.addEventListener("storage", changed);
    window.addEventListener("focus", changed);
    return () => { ++epoch.current; window.removeEventListener("creatoros:accounts-changed", changed); window.removeEventListener("storage", changed); window.removeEventListener("focus", changed); };
  }, [reload]);
  return { scope, error, reload };
}

export type PendingTranscribe = {
  projectId: string; attemptId: string; expectedAwemeId: string; acceptedTaskId?: string;
  origin: { ownerKey: string; accountId: string | null; scopeKey: string };
};
export type LocalTranscribeReference = {
  ownerKey: string; scopeKey: string; projectId: string; taskId?: string;
  pending?: PendingTranscribe; tombstone?: true;
};
function localKey(scope: TranscribeScope, projectId: string) { return PREFIX + "request:" + encodeURIComponent(stableOwnerKey(scope)) + ":" + encodeURIComponent(projectId); }
export function readLocalReference(scope: TranscribeScope, projectId: string): LocalTranscribeReference | null {
  const tombstone: LocalTranscribeReference = { ownerKey: stableOwnerKey(scope), scopeKey: scope.key, projectId, tombstone: true };
  try {
    const text = window.sessionStorage.getItem(localKey(scope, projectId));
    if (!text) return null;
    const raw: unknown = JSON.parse(text);
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return tombstone;
    const row = raw as LocalTranscribeReference;
    if (row.ownerKey !== stableOwnerKey(scope) || row.projectId !== projectId || typeof row.scopeKey !== "string" || !row.scopeKey) return tombstone;
    if (Object.hasOwn(row, "taskId") && (typeof row.taskId !== "string" || !row.taskId)) return tombstone;
    if (Object.hasOwn(row, "tombstone") && row.tombstone !== true) return tombstone;
    if (Object.hasOwn(row, "pending")) {
      const pending = row.pending;
      if (!pending || typeof pending !== "object" || Array.isArray(pending)) return tombstone;
      if (pending.projectId !== projectId || typeof pending.attemptId !== "string" || pending.attemptId.length < 16 || pending.attemptId.length > 128 || typeof pending.expectedAwemeId !== "string" || !pending.expectedAwemeId || !pending.origin || typeof pending.origin !== "object" || Array.isArray(pending.origin) || pending.origin.ownerKey !== row.ownerKey || typeof pending.origin.scopeKey !== "string" || !pending.origin.scopeKey || (pending.origin.accountId !== null && (typeof pending.origin.accountId !== "string" || !pending.origin.accountId)) || (Object.hasOwn(pending, "acceptedTaskId") && (typeof pending.acceptedTaskId !== "string" || !pending.acceptedTaskId))) return tombstone;
    }
    return row;
  } catch { return tombstone; }
}
export function storeLocalReference(scope: TranscribeScope, row: LocalTranscribeReference): boolean {
  if (row.ownerKey !== stableOwnerKey(scope) || scope.selection !== selectionKey()) return false;
  try {
    const key = localKey(scope, row.projectId), serialized = JSON.stringify(row);
    window.sessionStorage.setItem(key, serialized);
    return window.sessionStorage.getItem(key) === serialized;
  } catch { return false; }
}
export function clearLocalReference(scope: TranscribeScope, projectId: string): void {
  const prior = readLocalReference(scope, projectId);
  if (prior) storeLocalReference(scope, { ownerKey: prior.ownerKey, scopeKey: scope.key, projectId, ...(prior.pending ? { pending: prior.pending } : {}), ...(prior.tombstone ? { tombstone: true } : {}) });
  clearTaskQuery(scope.key);
}
function clearTaskQuery(scopeKey?: string) {
  if (typeof window === "undefined") return;
  const url = new URL(window.location.href);
  if (scopeKey && url.searchParams.get("transcribeScope") !== scopeKey) return;
  url.searchParams.delete("transcribeTask"); url.searchParams.delete("transcribeScope");
  window.history.replaceState(window.history.state, "", url);
}
export function readTaskQuery(scope: TranscribeScope, projectId: string): string | null {
  const url = new URL(window.location.href);
  if (url.pathname !== `/projects/${encodeURIComponent(projectId)}`) return null;
  if (url.searchParams.get("transcribeScope") !== scope.key) { clearTaskQuery(); return null; }
  return url.searchParams.get("transcribeTask") || null;
}
export function writeTaskQuery(scope: TranscribeScope, projectId: string, taskId: string): void {
  const url = new URL(window.location.href);
  if (scope.selection !== selectionKey() || url.pathname !== `/projects/${encodeURIComponent(projectId)}`) return;
  url.searchParams.set("transcribeScope", scope.key); url.searchParams.set("transcribeTask", taskId);
  window.history.replaceState(window.history.state, "", url);
}
function taskAwemeIds(task: AITaskResource): string[] {
  return Array.isArray(task.inputData.awemeIds) ? task.inputData.awemeIds.filter((id): id is string => typeof id === "string") : typeof task.inputData.awemeId === "string" ? [task.inputData.awemeId] : [];
}
function matches(task: AITaskResource, projectId?: string, awemeId?: string | null) {
  return !projectId || task.projectId === projectId || Boolean(awemeId && taskAwemeIds(task).includes(awemeId));
}
export async function readExactTranscribeTask(scope: TranscribeScope, taskId: string, projectId?: string, awemeId?: string | null) {
  await assertTranscribeScope(scope);
  const task = await scope.client.getTask({ ...NO_INPUT, params: { taskId } });
  if (task.id !== taskId || !inWorkspace(task, scope) || task.taskType !== "transcribe.douyin" || !matches(task, projectId, awemeId)) throw new ReferenceUnavailable();
  // task.groupVersion/membershipVersion 是历史冻结事实，不用当前版本遮挡合法历史。
  await assertTranscribeScope(scope);
  return task;
}
function checkPage(meta: { page: number; pageSize: number; total: number }, page: number, cursor: { total: number | null; seen: Set<string> }, rows: readonly { id: string }[]) {
  if (meta.page !== page || meta.pageSize !== 100 || !Number.isInteger(meta.total) || meta.total < 0 || (cursor.total !== null && cursor.total !== meta.total)) throw new Error("分页读数未稳定，请重新读取");
  const expected = Math.max(0, Math.min(meta.pageSize, meta.total - (page - 1) * meta.pageSize));
  if (rows.length !== expected) throw new Error("分页条目未读完整，请重新读取");
  for (const row of rows) {
    if (typeof row.id !== "string" || !row.id || cursor.seen.has(row.id)) throw new Error("分页条目重复或引用不完整，请重新读取");
    cursor.seen.add(row.id);
  }
  cursor.total = meta.total;
  if (page * meta.pageSize >= meta.total && cursor.seen.size !== meta.total) throw new Error("分页总数未确认，请重新读取");
}
export async function readTranscribeCandidates(scope: TranscribeScope, projectId: string, awemeId: string | null, current: () => boolean) {
  const found = new Map<string, AITaskResource>();
  const cursor = { total: null as number | null, seen: new Set<string>() };
  for (let page = 1; current(); page++) {
    const result = await requestListWithMeta(scope.transport, ENDPOINTS.listAITasks, { ...NO_INPUT, query: { page, pageSize: 100, taskType: "transcribe.douyin" } });
    checkPage(result.meta, page, cursor, result.data);
    if (!current() || scope.selection !== selectionKey()) throw new ScopeChanged();
    for (const task of result.data) if (inWorkspace(task, scope) && task.taskType === "transcribe.douyin" && matches(task, projectId, awemeId)) found.set(task.id, task);
    if (result.meta.page * result.meta.pageSize >= result.meta.total) { await assertTranscribeScope(scope); return [...found.values()]; }
    if (!result.data.length) throw new Error("任务列表尚未读完整，请重新读取");
  }
  throw new ScopeChanged();
}
export async function hasCurrentTranscript(scope: TranscribeScope, projectId: string, awemeId: string, current: () => boolean) {
  const cursor = { total: null as number | null, seen: new Set<string>() };
  for (let page = 1; current(); page++) {
    const artifacts = await requestListWithMeta(scope.transport, ENDPOINTS.listArtifacts, { ...NO_INPUT, params: { projectId }, query: { page, pageSize: 100 } });
    checkPage(artifacts.meta, page, cursor, artifacts.data);
    if (!current()) throw new ScopeChanged();
    for (const artifact of artifacts.data) {
      if (artifact.artifactType !== "output_script" || !artifact.currentVersionId) continue;
      const versionCursor = { total: null as number | null, seen: new Set<string>() };
      for (let versionPage = 1; current(); versionPage++) {
        const versions = await requestListWithMeta(scope.transport, ENDPOINTS.listArtifactVersions, { ...NO_INPUT, params: { artifactId: artifact.id }, query: { page: versionPage, pageSize: 100 } });
        checkPage(versions.meta, versionPage, versionCursor, versions.data);
        if (!current()) throw new ScopeChanged();
        const version = versions.data.find(row => row.id === artifact.currentVersionId);
        if (version) { if (version.contentData.awemeId === awemeId) return true; break; }
        if (versions.meta.page * versions.meta.pageSize >= versions.meta.total) throw new Error("当前正文版本引用未找到，请重新读取；未确认为没有稿件");
        if (!versions.data.length) throw new Error("正文版本读取未完成");
      }
    }
    if (artifacts.meta.page * artifacts.meta.pageSize >= artifacts.meta.total) return false;
    if (!artifacts.data.length) throw new Error("正文读取未完成");
  }
  throw new ScopeChanged();
}
export async function readProjectTranscribeSnapshot(scope: TranscribeScope, projectId: string, awemeId: string | null, current: () => boolean) {
  await assertTranscribeScope(scope);
  const project = await scope.client.getProject({ ...NO_INPUT, params: { projectId } });
  const source = project.platformRef.platform === "douyin" ? project.platformRef.externalId : "";
  if (!source || (awemeId && source !== awemeId)) throw new ReferenceUnavailable();
  const hasTranscript = await hasCurrentTranscript(scope, projectId, source, current);
  const candidates = await readTranscribeCandidates(scope, projectId, source, current);
  await assertTranscribeScope(scope);
  if (!current()) throw new ScopeChanged();
  return { source, hasTranscript, candidates };
}
type CommandRecord = {
  ownerKey: string; taskId: string; executionTaskId: string; action: "cancel" | "resume" | "retry";
  key: string; baselineAttempt: number; baselineStatus: string;
  outcome: "unknown" | "accepted" | "rejected";
};
function commandStorageKey(scope: TranscribeScope, executionTaskId: string) { return PREFIX + "command:" + encodeURIComponent(stableOwnerKey(scope)) + ":" + encodeURIComponent(executionTaskId); }
function readCommandRecord(scope: TranscribeScope, executionTaskId: string): CommandRecord | "incomplete" | null {
  try {
    const text = window.sessionStorage.getItem(commandStorageKey(scope, executionTaskId));
    if (!text) return null;
    const row = JSON.parse(text) as CommandRecord;
    if (!row || row.ownerKey !== stableOwnerKey(scope) || row.executionTaskId !== executionTaskId || typeof row.taskId !== "string" || !["cancel", "resume", "retry"].includes(row.action) || typeof row.key !== "string" || !row.key || !Number.isInteger(row.baselineAttempt) || typeof row.baselineStatus !== "string" || !["unknown", "accepted", "rejected"].includes(row.outcome)) return "incomplete";
    return row;
  } catch { return "incomplete"; }
}
function storeCommandRecord(scope: TranscribeScope, row: CommandRecord): boolean {
  if (row.ownerKey !== stableOwnerKey(scope) || scope.selection !== selectionKey()) return false;
  try {
    const key = commandStorageKey(scope, row.executionTaskId), serialized = JSON.stringify(row);
    window.sessionStorage.setItem(key, serialized);
    return window.sessionStorage.getItem(key) === serialized;
  } catch { return false; }
}
export async function readExactExecution(scope: TranscribeScope, task: AITaskResource): Promise<ExecutionTaskResourceV2> {
  if (!task.executionTaskId) throw new ReferenceUnavailable();
  const matched: ExecutionTaskResourceV2[] = [];
  const cursor = { total: null as number | null, seen: new Set<string>() };
  for (let page = 1;; page++) {
    const result = await requestListWithMeta(scope.transport, ENDPOINTS.listExecutionTasks, { ...NO_INPUT, query: { page, pageSize: 100, kind: "ai_task", ownerId: task.id } });
    checkPage(result.meta, page, cursor, result.data);
    for (const row of result.data) if ("ownerType" in row && row.id === task.executionTaskId && row.kind === "ai_task" && row.ownerType === "ai_task" && row.ownerId === task.id && inWorkspace(row, scope)) matched.push(row);
    if (result.meta.page * result.meta.pageSize >= result.meta.total) break;
    if (!result.data.length) throw new Error("原执行引用读取未完成");
  }
  await assertTranscribeScope(scope);
  if (matched.length !== 1) throw new ReferenceUnavailable();
  return matched[0]!;
}
const LABEL: Record<string, string> = { queued: "已排队", running: "处理中", retry_wait: "等待重试", pause_requested: "暂停请求已受理", paused: "已暂停", waiting_user: "等待处理原提示", unknown_result: "调用结果待核对", cancel_requested: "停止请求已受理，等待确认", cancelled: "任务已取消", failed: "任务失败", partial: "原任务部分结果可用", succeeded: "任务已完成", awaiting_confirmation: "等待确认原结果" };

export function TranscribeTaskProgress({ scope, taskId, projectId, awemeId = null, onVerified, onScopeInvalid, onReferenceInvalid }: {
  scope: TranscribeScope; taskId?: string | null; projectId?: string; awemeId?: string | null;
  onVerified?: (task: AITaskResource) => void; onScopeInvalid?: () => void; onReferenceInvalid?: () => void;
}) {
  const [open, setOpen] = React.useState(false);
  const [selected, setSelected] = React.useState(taskId || null);
  const selectedRef = React.useRef(selected); selectedRef.current = selected;
  const [task, setTask] = React.useState<AITaskResource | null>(null);
  const [steps, setSteps] = React.useState<AITaskStepResource[]>([]);
  const [candidates, setCandidates] = React.useState<AITaskResource[]>([]);
  const [confirmed, setConfirmed] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [notice, setNotice] = React.useState<string | null>(null);
  const [projectHref, setProjectHref] = React.useState<string | null>(null);
  const generation = React.useRef(0), alive = React.useRef(true), flight = React.useRef(false);
  const trigger = React.useRef<HTMLButtonElement>(null);
  const callbacks = React.useRef({ onVerified, onScopeInvalid, onReferenceInvalid }); callbacks.current = { onVerified, onScopeInvalid, onReferenceInvalid };
  const [commandUnknown, setCommandUnknown] = React.useState(false);
  const denied = React.useRef(false);
  function selectTask(next: string | null) { selectedRef.current = next; ++generation.current; setSelected(next); }
  React.useEffect(() => { selectTask(taskId || null); }, [taskId]);
  React.useEffect(() => { alive.current = true; return () => { alive.current = false; ++generation.current; }; }, []);
  function close() { ++generation.current; setOpen(false); trigger.current?.focus(); }
  function withdrawScope() {
    ++generation.current; denied.current = true; clearScopeReferences(scope);
    setTask(null); setSteps([]); setCandidates([]); setProjectHref(null); setConfirmed(false); setBusy(false); setNotice(null); setCommandUnknown(true);
    callbacks.current.onScopeInvalid?.();
  }
  async function copyTaskId() {
    if (!task || !confirmed || busy) return;
    const id = task.id, turn = generation.current;
    const current = () => alive.current && turn === generation.current && selectedRef.current === id && scope.selection === selectionKey();
    try {
      if (!navigator.clipboard?.writeText) throw new Error("复制功能不可用");
      await navigator.clipboard.writeText(id);
      if (current()) setNotice("已复制准确任务编号");
    } catch { if (current()) setNotice("复制失败，请选择并复制任务编号"); }
  }
  async function refresh(turn: number) {
    if (flight.current) return false;
    flight.current = true; setBusy(true); setConfirmed(false); setProjectHref(null);
    const current = () => alive.current && turn === generation.current && scope.selection === selectionKey();
    try {
      await assertTranscribeScope(scope);
      if (!current()) return false;
      if (!selected) {
        if (projectId) {
          const rows = await readTranscribeCandidates(scope, projectId, awemeId, current);
          if (!current()) return false;
          setCandidates(rows); setError(null);
        }
        return false;
      }
      const next = await readExactTranscribeTask(scope, selected, projectId, awemeId);
      if (!current()) return false;
      setTask(next); callbacks.current.onVerified?.(next);
      // 该端口没有分页 query，实际返回本任务全部 stepNo 升序步骤。
      const nextSteps = (await requestListWithMeta(scope.transport, ENDPOINTS.listTaskSteps, { ...NO_INPUT, params: { taskId: next.id } })).data;
      await assertTranscribeScope(scope);
      if (!current()) return false;
      setSteps(nextSteps); setConfirmed(true); setError(null);
      if (next.executionTaskId) {
        const execution = await readExactExecution(scope, next);
        if (!current()) return false;
        const record = readCommandRecord(scope, execution.id);
        setCommandUnknown(record === "incomplete" || record?.outcome === "unknown");
        // status/attempt只证明当前原执行事实，不猜它由哪个命令key触发。
      } else setCommandUnknown(false);
      const targetProject = projectId || next.projectId;
      let nextProjectHref: string | null = null;
      if (targetProject) {
        const project = await scope.client.getProject({ ...NO_INPUT, params: { projectId: targetProject } });
        const sourceIds = taskAwemeIds(next);
        if (project.platformRef.platform === "douyin" && sourceIds.includes(project.platformRef.externalId) && await hasCurrentTranscript(scope, project.id, project.platformRef.externalId, current)) {
          await assertTranscribeScope(scope);
          nextProjectHref = `/projects/${encodeURIComponent(project.id)}`;
        }
      }
      if (current()) setProjectHref(nextProjectHref);
      return TERMINAL.has(taskRuntimeStatus(next));
    } catch (failure) {
      const status = (failure as { status?: number }).status;
      if (!current()) {
        if (alive.current && turn === generation.current) withdrawScope();
        return false;
      }
      if (failure instanceof ScopeChanged || [401, 403].includes(status || 0)) {
        withdrawScope();
      } else if (failure instanceof ReferenceUnavailable || status === 404) {
        // 错误query/失效task引用与身份改变不是同一事实；不删无关的未知请求封套。
        denied.current = true; setTask(null); setSteps([]); setProjectHref(null); callbacks.current.onReferenceInvalid?.();
      }
      setError("读取未确认，请刷新原任务；未重新发起转写"); setConfirmed(false); return false;
    } finally { flight.current = false; if (current()) setBusy(false); }
  }
  React.useEffect(() => {
    const turn = ++generation.current;
    setTask(null); setSteps([]); setConfirmed(false); setError(null); setProjectHref(null); setBusy(false); setCommandUnknown(false); denied.current = false;
    if (!open) return;
    let timer: ReturnType<typeof setTimeout> | undefined, stopped = false;
    async function poll() {
      if (stopped || denied.current || turn !== generation.current || document.hidden) return;
      if (flight.current) { timer = setTimeout(() => { void poll(); }, 3000); return; }
      const terminal = await refresh(turn);
      if (!stopped && !denied.current && turn === generation.current && selected && !terminal) timer = setTimeout(() => { void poll(); }, 3000);
    }
    const visible = () => { if (!document.hidden) { if (timer) clearTimeout(timer); void poll(); } else if (timer) clearTimeout(timer); };
    void poll(); document.addEventListener("visibilitychange", visible);
    return () => { stopped = true; if (timer) clearTimeout(timer); document.removeEventListener("visibilitychange", visible); };
  }, [open, selected, scope.key]);
  function allowed(action: "cancel" | "resume" | "retry", row: AITaskResource) {
    const status = taskRuntimeStatus(row);
    return action === "cancel" ? CANCELLABLE.has(status) : action === "resume" ? ["paused", "waiting_user"].includes(status) : status === "failed";
  }
  async function command(action: "cancel" | "resume" | "retry") {
    if (!task?.executionTaskId || !confirmed || flight.current || busy || commandUnknown || !allowed(action, task)) return;
    const turn = generation.current, original = task; flight.current = true; setBusy(true); setConfirmed(false); setError(null);
    const current = () => alive.current && generation.current === turn && scope.selection === selectionKey();
    let record: CommandRecord | null = null;
    let awaitingCommandResponse = false;
    try {
      const fresh = await readExactTranscribeTask(scope, original.id, projectId, awemeId);
      const execution = await readExactExecution(scope, fresh);
      if (!current()) return;
      const existing = readCommandRecord(scope, execution.id);
      if (existing === "incomplete" || existing?.outcome === "unknown") { setCommandUnknown(true); setNotice("原操作结果未确认，可刷新查看原任务；暂不能再次停止、继续或重试"); return; }
      if (fresh.executionTaskId !== original.executionTaskId || !allowed(action, fresh) || (execution.runtimeStatus ?? execution.status) !== taskRuntimeStatus(fresh)) { setTask(fresh); setNotice("原任务状态已变化，请刷新"); return; }
      record = { ownerKey: stableOwnerKey(scope), taskId: fresh.id, executionTaskId: execution.id, action, key: crypto.randomUUID(), baselineAttempt: execution.attempt, baselineStatus: execution.runtimeStatus ?? execution.status, outcome: "unknown" };
      if (!storeCommandRecord(scope, record)) { setNotice("无法保留原操作恢复记录；本次未发送命令，只能查看原任务"); return; }
      setCommandUnknown(true);
      awaitingCommandResponse = true;
      const response = await scope.client.commandExecutionTasks({ ...NO_INPUT, body: { taskIds: [record.executionTaskId], command: action, idempotencyKey: record.key } });
      awaitingCommandResponse = false; // 后续身份/回读错误不能反推这次POST被拒绝。
      await assertTranscribeScope(scope);
      if (!current()) return;
      const rows = response.tasks.filter(row => row.id === record!.executionTaskId && row.kind === "ai_task" && row.ownerType === "ai_task" && row.ownerId === record!.taskId && inWorkspace(row, scope));
      const expected = action === "cancel" ? ["cancel_requested", "cancelled"] : ["queued"];
      if (rows.length !== 1 || !expected.includes(rows[0]!.runtimeStatus ?? rows[0]!.status)) { setNotice("响应没有准确原命令结果；结果仍未知，只核对原任务"); return; }
      if (!storeCommandRecord(scope, { ...record, outcome: "accepted" })) { setNotice("已收到准确响应但无法持久保留；请保原任务，暂停后续操作"); return; }
      setCommandUnknown(false);
      setNotice(action === "cancel" ? rows[0]!.status === "cancelled" ? "已收到任务取消确认，正在回读原任务" : "停止请求已受理，等待确认" : "原操作已受理，正在回读原任务；不会延长原任务期限");
    } catch (failure) {
      if (record && awaitingCommandResponse && failure instanceof HttpTransportError && [400, 401, 403, 404, 409, 422].includes(failure.status)) {
        // 原服务在事务中整体拒绝；明确HTTP拒绝不是受理，也不是缺ACK。
        const kept = storeCommandRecord(scope, { ...record, outcome: "rejected" });
        if (current()) { setCommandUnknown(!kept); setNotice(kept ? "服务端拒绝了原命令；请刷新原任务，未标为受理" : "拒绝结果未能保留，请仅核对原任务"); }
      } else if (current()) { setCommandUnknown(Boolean(record)); setNotice("原操作结果未确认，可刷新查看原任务；暂不能再次停止、继续或重试"); }
      if (alive.current && turn === generation.current && (failure instanceof ScopeChanged || (failure instanceof HttpTransportError && [401, 403].includes(failure.status)) || scope.selection !== selectionKey())) withdrawScope();
    } finally {
      flight.current = false;
      if (current()) { setBusy(false); await refresh(turn); }
    }
  }
  const status = task ? taskRuntimeStatus(task) : null;
  return <section className="min-w-0 max-w-full space-y-3 text-base" aria-label="转写进度">
    <button ref={trigger} type="button" className={BUTTON} onClick={() => open ? close() : setOpen(true)} aria-expanded={open}>{open ? "收起转写进度" : "查看转写进度"}</button>
    {open ? <div className="min-w-0 space-y-3 rounded-control border border-border p-3" onKeyDown={event => { if (event.key === "Escape") { event.stopPropagation(); close(); } }}>
      {projectId ? <a className="inline-flex min-h-11 items-center text-base underline" href={`/projects/${encodeURIComponent(projectId)}`}>返回原项目稿件</a> : null}
      <p role="status">{status ? LABEL[status] || "原任务状态待核对" : busy ? "正在读取本人任务" : "请选择准确的关联任务"}</p>
      {notice ? <p role="status">{notice}</p> : null}
      {error ? <p role="alert">{error}</p> : null}
      {commandUnknown ? <p role="alert">原操作结果仍未确认。可刷新查看原任务、使用已保存稿件；暂不能再次停止、继续或重试。</p> : null}
      {status === "unknown_result" ? <p>调用结果待核对，请保留原任务；此处不会重试识别。</p> : null}
      {task ? <p className="break-all">任务编号：{task.id}</p> : null}
      {!selected && !busy && !error && !candidates.length ? <p>本次读取未找到与此作品关联的本人任务。</p> : null}
      {!selected ? <ul className="space-y-2">{candidates.map(row => <li key={row.id}><button className={`${BUTTON} w-full break-all text-left`} type="button" disabled={busy} onClick={() => { selectTask(row.id); setNotice(null); }}>选择任务 {row.id} · {LABEL[taskRuntimeStatus(row)] || "待核对"} · {row.requestedAt} · {taskAwemeIds(row).length || "待核对"} 个作品</button></li>)}</ul> : null}
      {task && taskAwemeIds(task).length > 1 ? <p>这是含 {taskAwemeIds(task).length} 个作品的批量任务；停止会作用于整个原任务。</p> : null}
      <ol className="space-y-2">{steps.map((step, index) => <li key={`${selected}:row:${index}`}  className="break-words whitespace-pre-wrap">第 {step.stepNo} 步：{step.text}</li>)}</ol>
      <div className="flex flex-wrap gap-2">
        <button type="button" className={BUTTON} disabled={busy} onClick={() => { void refresh(generation.current); }}>刷新原任务</button>
        {task?.executionTaskId && status && CANCELLABLE.has(status) ? <button type="button" className={BUTTON} disabled={busy || !confirmed || commandUnknown} onClick={() => { void command("cancel"); }}>停止原任务</button> : null}
        {task?.executionTaskId && status === "failed" ? <button type="button" className={BUTTON} disabled={busy || !confirmed || commandUnknown} onClick={() => { void command("retry"); }}>重试原任务</button> : null}
        {task?.executionTaskId && status && ["paused", "waiting_user"].includes(status) ? <button type="button" className={BUTTON} disabled={busy || !confirmed || commandUnknown} onClick={() => { void command("resume"); }}>继续原任务</button> : null}
        {task ? <button type="button" className={BUTTON} disabled={busy || !confirmed} onClick={() => { void copyTaskId(); }}>复制任务编号</button> : null}
        {projectHref ? <a className="inline-flex min-h-11 items-center text-base underline" href={projectHref}>查看当前项目稿件</a> : null}
        {projectId && selected ? <button type="button" className={BUTTON} disabled={busy} onClick={() => { selectTask(null); setNotice(null); }}>选择其他关联任务</button> : null}
      </div>
      <p>当前稿件可能来自已有版本；这里不会把已有正文记作本次保存。</p>
    </div> : null}
  </section>;
}

/** 对话回执只传其真实 taskId；不复用 research exec 卡或复活全局三卡。 */
export function TranscribeTaskReceipt({ taskId }: { taskId: string }) {
  const { scope, error, reload } = useTranscribeScope();
  if (!scope) return <div className="text-base"><p role="status">{error || "正在确认当前身份"}</p><button className={BUTTON} onClick={() => { void reload(); }}>重新读取身份</button></div>;
  return <TranscribeTaskProgress key={`${scope.key}:${taskId}`} scope={scope} taskId={taskId} onScopeInvalid={() => { void reload(); }} />;
}

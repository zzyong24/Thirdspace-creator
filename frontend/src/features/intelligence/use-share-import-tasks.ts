"use client";

import * as React from "react";
import type { ExecutionTaskResourceV2 } from "@creatoros/contract";
import {radarScope,radarScopeKey,radarTaskInScope} from "./intelligence-workbench-types";
import type { RadarScopeInput,RadarApi } from "./intelligence-workbench-types";
import { HttpTransportError } from "@/lib/http-transport";
import { operationKey } from "./radar-operation-key";

export const shareImportStatus = (task: ExecutionTaskResourceV2) => task.runtimeStatus ?? task.status;
const finished = (task: ExecutionTaskResourceV2) => ["succeeded", "cancelled", "failed"].includes(shareImportStatus(task));

/** 只观察原分享导入执行记录；关闭弹窗不撤销任务，重新挂载从持久列表恢复。 */
export function useShareImportTasks(inputScope: RadarScopeInput, api: RadarApi, open: boolean, onDone: () => void) {
  const {groupId,accountId}=radarScope(inputScope);
  const scope=React.useMemo(()=>({groupId,accountId}),[groupId,accountId]);
  const scopeKey=radarScopeKey(scope);
  const currentScope=React.useRef(scopeKey);
  React.useLayoutEffect(()=>{currentScope.current=scopeKey;},[scopeKey,scope]);
  const reads=React.useRef(new Set<string>());
  const [tasks, setTasks] = React.useState<ExecutionTaskResourceV2[]>([]);
  const [error, setError] = React.useState<string | null>(null);
  const [hasMore, setHasMore] = React.useState(false);
  const nextPage = React.useRef(1);
  const [pending, setPending] = React.useState(false);
  const [unconfirmed, setUnconfirmed] = React.useState(false);
  const [commandBusy, setCommandBusy] = React.useState<string | null>(null);
  const tasksRef = React.useRef(tasks);
  const alive = React.useRef(true);
  const done = React.useRef(onDone);
  React.useLayoutEffect(()=>{done.current=onDone;},[onDone]);
  const notified = React.useRef(new Set<string>());
  const submission = React.useRef<Parameters<RadarApi["importDouyinShare"]>[0] | null>(null);
  const requests = React.useRef(new Map<string, Parameters<RadarApi["importDouyinShare"]>[0]>());
  const submitting = React.useRef(false);
  const commanding = React.useRef(false);
  const commandKeys = React.useRef(new Map<string, string>());
  React.useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);

  const merge = React.useCallback((rows: ExecutionTaskResourceV2[]) => {
    if (!alive.current || currentScope.current!==scopeKey) return;
    const map = new Map(tasksRef.current.map(task => [task.id, task]));
    for (const task of rows) {
      if (!radarTaskInScope(task,scope) || task.kind !== "share_import" || task.ownerType !== "item_import") continue;
      const previous = map.get(task.id);
      if (previous && previous.updatedAt > task.updatedAt) continue;
      map.set(task.id, task);
      if (shareImportStatus(task) === "succeeded" && !notified.current.has(task.id)) {
        notified.current.add(task.id);
        done.current();
      }
    }
    const next = [...map.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    tasksRef.current = next;
    setTasks(next);
  }, [scopeKey,scope]);

  const refresh = React.useCallback(async (task?: ExecutionTaskResourceV2, older = false) => {
    const readKey=task?.ownerId??"list";
    if (!api.listShareImportTasks || reads.current.has(readKey)) return;
    reads.current.add(readKey);
    try {
      let rows: ExecutionTaskResourceV2[] = [];
      if (task) {
        rows = await api.listShareImportTasks({...scope, ownerId: task.ownerId});
      } else {
        // 不用兼容 status 过滤，避免漏掉存储中的 retry_wait/waiting_user。
        let page = older ? nextPage.current : 1;
        let more = false;
        for (let count = 0; count < 5; count++) {
          const batch = await api.listShareImportTasks({...scope, page});
          if (!alive.current || currentScope.current!==scopeKey) return;
          rows.push(...batch.filter(row => !["succeeded", "cancelled"].includes(shareImportStatus(row))));
          more = batch.length === 100;
          page++;
          if (!more || rows.length >= 20) break;
        }
        nextPage.current = page;
        if (alive.current && currentScope.current===scopeKey) setHasMore(more);
      }
      merge(rows);
      if (alive.current && currentScope.current===scopeKey) setError(task && !rows.some(row => row.id === task.id) ? "列表中暂未读到原任务，已保留任务 ID，请稍后刷新核对。" : null);
    } catch {
      if (alive.current && currentScope.current===scopeKey) setError("暂时无法读取导入任务，原任务仍保留，请刷新核对。");
    } finally { reads.current.delete(readKey); }
  }, [scopeKey,scope, api, merge]);

  React.useEffect(() => { if (open) void refresh(); }, [open, refresh]);
  React.useEffect(() => {
    let stopped = false;
    let timer: ReturnType<typeof setTimeout>;
    const observe = async () => {
      // waiting_user/unknown_result 也观察，允许另一入口处理后在此显示真实状态。
      const active = [...new Map(tasksRef.current.filter(task => !finished(task)).map(task => [task.ownerId, task])).values()];
      for (const task of active) { if (stopped) return; await refresh(task); }
      if (!stopped) timer = setTimeout(observe, 4000);
    };
    timer = setTimeout(observe, 4000);
    return () => { stopped = true; clearTimeout(timer); };
  }, [refresh]);

  async function submit(shareInput: string, collectionId: string | null) {
    if (submitting.current) return false;
    // 失败/断线后复用冻结请求与同一个 key，绝不把未知提交当成新任务。
    const fingerprint = JSON.stringify([shareInput.trim(), collectionId]);
    submission.current ??= requests.current.get(fingerprint) ?? {...scope, shareInput: shareInput.trim(), collectionId, idempotencyKey: operationKey("douyin-share-import")};
    requests.current.set(fingerprint, submission.current);
    submitting.current = true;
    setPending(true); setError(null);
    try {
      const result = await api.importDouyinShare(submission.current);
      if (!alive.current || currentScope.current!==scopeKey) return false;
      if (!radarTaskInScope(result.task,scope) || result.task.kind !== "share_import" || result.task.ownerType !== "item_import") throw new Error("任务回执归属不匹配");
      merge([result.task]);
      submission.current = null;
      setUnconfirmed(false);
      return true;
    } catch (cause) {
      if (alive.current && currentScope.current===scopeKey) {
        // 明确的校验/权限拒绝没有接受任务，可更正输入；网络/服务未知结果保留请求。
        const rejected = cause instanceof HttpTransportError && [400, 401, 403, 404, 422].includes(cause.status);
        if (rejected) { submission.current = null; requests.current.delete(fingerprint); }
        setUnconfirmed(!rejected);
        setError(rejected ? cause.message : "提交回执尚未确认。请核对原提交；将使用相同输入与幂等标识，不会另建一次请求。");
      }
      return false;
    } finally {
      submitting.current = false;
      if (alive.current && currentScope.current===scopeKey) setPending(false);
    }
  }

  async function command(task: ExecutionTaskResourceV2, action: "resume" | "cancel") {
    if (!api.commandTask || commanding.current) return;
    const key = `${task.id}:${action}`;
    if (!commandKeys.current.has(key)) commandKeys.current.set(key, operationKey(`share-${action}`));
    commanding.current = true; setCommandBusy(task.id); setError(null);
    try {
      await api.commandTask({taskId: task.id, command: action, idempotencyKey: commandKeys.current.get(key)!});
      commandKeys.current.delete(key);
      if (alive.current && currentScope.current===scopeKey) await refresh(task);
    } catch {
      if (alive.current && currentScope.current===scopeKey) setError("操作回执尚未确认，请刷新原任务；再次操作会复用相同指令标识。");
    } finally {
      commanding.current = false;
      if (alive.current && currentScope.current===scopeKey) setCommandBusy(null);
    }
  }

  return {tasks, hasMore, error, pending, unconfirmed, commandBusy, submit, command, refresh};
}

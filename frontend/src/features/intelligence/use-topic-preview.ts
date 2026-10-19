"use client";
import * as React from "react";
import type { RadarApi,RadarItemDetail } from "./intelligence-workbench-types";
import { operationKey } from "./radar-operation-key";
import { isTopicTaskPending,isTopicTaskPolling,topicTaskAttention,topicTaskStatus } from "./topic-task-state";

type PendingPreviewAttempt = {
  itemId: string;
  sourceSnapshotId: string;
  positioningVersionId?: string;
  idempotencyKey: string;
  baselineTransforms: Record<string, string>;
};

const inMemoryPreviewAttempts = new Map<string, PendingPreviewAttempt>();

function availablePreviewStorages(): Storage[] {
  const storages: Storage[] = [];
  try {
    storages.push(window.localStorage);
  } catch {
    // Private browsing can deny access before a storage method is called.
  }
  try {
    storages.push(window.sessionStorage);
  } catch {
    // Memory remains the last resort for this mounted session.
  }
  return storages;
}

function previewAttemptStorageKey(itemId: string, sourceSnapshotId: string) {
  return `creatoros:radar-topic-preview:v1:${itemId}:${sourceSnapshotId}`;
}

function readPreviewAttempt(storageKey: string): PendingPreviewAttempt | null {
  for (const storage of availablePreviewStorages()) {
    try {
      const stored = storage.getItem(storageKey);
      if (!stored) continue;
      const parsed = JSON.parse(stored) as PendingPreviewAttempt;
      if (parsed.idempotencyKey && parsed.sourceSnapshotId) {
        inMemoryPreviewAttempts.set(storageKey, parsed);
        return parsed;
      }
    } catch {
      // Try the other browser storage before falling back to the current session.
    }
  }
  return inMemoryPreviewAttempts.get(storageKey) ?? null;
}

function writePreviewAttempt(
  storageKey: string,
  attempt: PendingPreviewAttempt,
): boolean {
  inMemoryPreviewAttempts.set(storageKey, attempt);
  const serialized = JSON.stringify(attempt);
  for (const storage of availablePreviewStorages()) {
    try {
      storage.setItem(storageKey, serialized);
      return true;
    } catch {
      // Try the other browser storage before refusing an unrecoverable request.
    }
  }
  inMemoryPreviewAttempts.delete(storageKey);
  return false;
}

function clearPreviewAttempt(storageKey: string, idempotencyKey: string) {
  const current = readPreviewAttempt(storageKey);
  if (current?.idempotencyKey !== idempotencyKey) return;
  inMemoryPreviewAttempts.delete(storageKey);
  for (const storage of availablePreviewStorages()) {
    try {
      storage.removeItem(storageKey);
    } catch {
      // The in-memory copy is still cleared; no newer attempt is removed.
    }
  }
}

function transformSignature(transform: RadarItemDetail["transforms"][number]) {
  return JSON.stringify([
    transform.status,
    transform.taskStatus ?? null,
    transform.taskRuntimeStatus ?? null,
    transform.executionTaskId ?? null,
  ]);
}

function acceptedPreviewTransform(detail: RadarItemDetail, attempt: PendingPreviewAttempt) {
  if (detail.item.id !== attempt.itemId) return undefined;
  // SEMANTIC_BOUNDARY_ALLOW: 请求身份匹配只用于幂等恢复，不判断创作内容。
  return detail.transforms.find(transform =>
    transform.idempotencyKey === attempt.idempotencyKey &&
    transform.sourceSnapshotId === attempt.sourceSnapshotId,
  );
}

function isRewriteOnlySnapshot(
  snapshot: RadarItemDetail["transforms"][number]["outputSnapshot"],
) {
  return snapshot?.generationMode === "rewrite_only" ||
    snapshot?.adaptedDraft?.generationMode === "rewrite_only";
}

function topicPreviewPollDelayMs(attempt: number): number {
  return Math.min(400 + attempt * 100, 2_500);
}

export function useTopicPreview({api,detail,positioningVersionId,setDetail,setNotice,setBusy,activeDetailItemId}:{api:RadarApi;detail:RadarItemDetail|null;positioningVersionId:string|null;setDetail:React.Dispatch<React.SetStateAction<RadarItemDetail|null>>;setNotice:React.Dispatch<React.SetStateAction<string|null>>;setBusy:React.Dispatch<React.SetStateAction<boolean>>;activeDetailItemId:React.MutableRefObject<string|null>}){
 const [topicGenerating,setTopicGenerating]=React.useState(false);
 const topicGenerationInFlight=React.useRef(false);
 const generation=React.useRef(0);
 const topicPollingKeys=React.useRef(new Set<string>());
 const [previewNeedsReconciliation,setPreviewNeedsReconciliation]=React.useState(false);
 const mounted=React.useRef(true);
  React.useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const trackTopicTransform = React.useCallback(
    (itemId: string, transformId: string) => {
      const pollingKey = `${itemId}:${transformId}`;
      if (topicPollingKeys.current.has(pollingKey)) return;
      topicPollingKeys.current.add(pollingKey);

      void (async () => {
        try {
          for (
            let attempt = 0;
            mounted.current && activeDetailItemId.current === itemId;
            attempt += 1
          ) {
            if (attempt > 0) {
              await new Promise((resolve) =>
                window.setTimeout(
                  resolve,
                  topicPreviewPollDelayMs(attempt - 1),
                ),
              );
            }
            if (
              !mounted.current ||
              activeDetailItemId.current !== itemId
            ) {
              return;
            }

            let refreshed: RadarItemDetail;
            try {
              refreshed = await api.getItem(itemId);
            } catch {
              // 后台任务仍然存在时，单次详情读取抖动不能中止自动回显。
              continue;
            }
            if (
              !mounted.current ||
              activeDetailItemId.current !== itemId
            ) {
              return;
            }
            setDetail((current) =>
              current?.item.id === itemId ? refreshed : current,
            );

            const currentTransform = refreshed.transforms.find(
              (transform) => transform.id === transformId,
            );
            if (!currentTransform) continue;
            const attention=topicTaskAttention(topicTaskStatus(currentTransform));
            if(attention){setNotice(currentTransform.taskErrorMessage?.trim()||attention);return;}

            const snapshot = currentTransform.outputSnapshot;
            const progress = snapshot?.generationProgress;
            const taskStatus = topicTaskStatus(currentTransform);
            const rewriteOnly = isRewriteOnlySnapshot(snapshot);
            const complete = Boolean(
              snapshot &&
                (progress?.rewriteDraft?.status === "completed" ||
                  progress?.draft?.status === "completed" ||
                  (rewriteOnly
                    ? Boolean(
                        snapshot.adaptedDraft?.contentText?.trim() &&
                          !isTopicTaskPending(taskStatus) &&
                          !topicTaskAttention(taskStatus),
                      )
                    : !progress && snapshot.title?.trim())),
            );
            if (complete) {
              setNotice("改写稿已生成，可以直接编辑和复制；采纳为选题是可选操作。");
              return;
            }
            if (progress?.topic?.status === "completed") {
              setNotice("选题已生成，正在生成本账号改写初稿。");
            } else if (progress?.decomposition?.status === "completed") {
              setNotice("逐字稿已拆解，正在生成选题和改写策略。");
            }
          }
          if (
            mounted.current &&
            activeDetailItemId.current === itemId
          ) {
            setNotice(
              "生成任务处理时间较长，可稍后刷新查看结果；请勿重复生成。",
            );
          }
        } finally {
          topicPollingKeys.current.delete(pollingKey);
        }
      })();
    },
    [api],
  );

  const trackedTopicTransform = detail?.transforms[0] ?? null;
  const trackedTopicSnapshot = trackedTopicTransform?.outputSnapshot ?? null;
  const trackedTopicProgress = trackedTopicSnapshot?.generationProgress;
  const trackedTopicStatus = topicTaskStatus(trackedTopicTransform);
  const trackedRewriteOnly = isRewriteOnlySnapshot(trackedTopicSnapshot);
  const trackedTopicComplete = Boolean(
    trackedTopicSnapshot &&
      (trackedTopicProgress?.rewriteDraft?.status === "completed" ||
        trackedTopicProgress?.draft?.status === "completed" ||
        (trackedRewriteOnly
          ? Boolean(
              trackedTopicSnapshot.adaptedDraft?.contentText?.trim() &&
                !isTopicTaskPending(trackedTopicStatus) &&
                !topicTaskAttention(trackedTopicStatus),
            )
          : !trackedTopicProgress && trackedTopicSnapshot.title?.trim())),
  );

  React.useEffect(() => {
    const itemId = detail?.item.id;
    const sourceSnapshotId = detail?.snapshots[0]?.id;
    if (!itemId || !sourceSnapshotId) {
      setPreviewNeedsReconciliation(false);
      return;
    }
    const storageKey = previewAttemptStorageKey(itemId, sourceSnapshotId);
    const attempt = readPreviewAttempt(storageKey);
    if (!attempt) {
      setPreviewNeedsReconciliation(false);
      return;
    }
    if (acceptedPreviewTransform(detail, attempt)) {
      clearPreviewAttempt(storageKey, attempt.idempotencyKey);
      setPreviewNeedsReconciliation(false);
      return;
    }
    setPreviewNeedsReconciliation(true);
  }, [detail]);

  React.useEffect(() => {
    const itemId = detail?.item.id;
    const transformId = trackedTopicTransform?.id;
    const taskStatus = topicTaskStatus(trackedTopicTransform);
    if (
      !itemId ||
      !transformId ||
      trackedTopicComplete ||
      !isTopicTaskPolling(taskStatus)
    ) {
      return;
    }
    trackTopicTransform(itemId, transformId);
  }, [
    detail?.item.id,
    trackTopicTransform,
    trackedTopicComplete,
    trackedTopicTransform?.id,
    trackedTopicTransform?.taskStatus,
    trackedTopicTransform?.taskRuntimeStatus,
  ]);

  const previewTopic = React.useCallback(async () => {
    const sourceSnapshotId = detail?.snapshots[0]?.id;
    if (!detail || !sourceSnapshotId) return;
    if (topicGenerationInFlight.current) {
      setNotice("改写稿正在生成，无需重复点击。");
      return;
    }
    topicGenerationInFlight.current = true;
    const currentGeneration=++generation.current;
    setBusy(true);
    setTopicGenerating(true);
    setNotice(null);
    const storageKey = previewAttemptStorageKey(detail.item.id, sourceSnapshotId);
    let attempt = readPreviewAttempt(storageKey);
    if (attempt) {
      // First read the current task state. If the server already accepted the prior
      // request, resume that task instead of posting another attempt.
      try {
        const refreshed = await api.getItem(detail.item.id);
        if (!mounted.current || activeDetailItemId.current !== detail.item.id) return;
        setDetail((current) => current?.item.id === detail.item.id ? refreshed : current);
        if (acceptedPreviewTransform(refreshed, attempt)) {
          clearPreviewAttempt(storageKey, attempt.idempotencyKey);
          setPreviewNeedsReconciliation(false);
          const acceptedTransform = acceptedPreviewTransform(refreshed, attempt);
          if (acceptedTransform) trackTopicTransform(detail.item.id, acceptedTransform.id);
          setNotice("已找到原生成任务，正在继续读取结果。请勿重复发起。");
          topicGenerationInFlight.current = false;
          setTopicGenerating(false);
          setBusy(false);
          return;
        }
      } catch {
        // Replaying the same key below is safe if the read itself is unavailable.
      }
    } else {
      attempt = {
        itemId: detail.item.id,
        sourceSnapshotId,
        ...(positioningVersionId ? { positioningVersionId } : {}),
        idempotencyKey: operationKey("topic-preview"),
        baselineTransforms: Object.fromEntries(
          detail.transforms.map((transform) => [transform.id, transformSignature(transform)]),
        ),
      };
      // Persist before sending so an interrupted response can recover with this key.
      if (!writePreviewAttempt(storageKey, attempt)) {
        setNotice("无法保存本次请求编号，请检查浏览器存储权限后再试。未发送生成请求。");
        topicGenerationInFlight.current = false;
        setTopicGenerating(false);
        setBusy(false);
        return;
      }
    }
    try {
      const started = await api.previewTopic({
        itemId: attempt.itemId,
        sourceSnapshotId: attempt.sourceSnapshotId,
        ...(attempt.positioningVersionId ? { positioningVersionId: attempt.positioningVersionId } : {}),
        idempotencyKey: attempt.idempotencyKey,
      });
      if(!mounted.current||activeDetailItemId.current!==detail.item.id)return;
      clearPreviewAttempt(storageKey, attempt.idempotencyKey);
      setPreviewNeedsReconciliation(false);
      const reusableOutputSnapshot =
        (started.transform.outputSnapshot as RadarItemDetail["transforms"][number]["outputSnapshot"]) ??
        detail.transforms.find(
          (transform) => transform.id === started.transform.id,
        )?.outputSnapshot ??
        detail.transforms.find((transform) => transform.outputSnapshot !== null)
          ?.outputSnapshot ??
        null;
      const pendingTransform: RadarItemDetail["transforms"][number] = {
        id: started.transform.id,
        idempotencyKey: attempt.idempotencyKey,
        sourceSnapshotId: attempt.sourceSnapshotId,
        status: started.transform.status,
        taskStatus: started.task.status as RadarItemDetail["transforms"][number]["taskStatus"],
        taskRuntimeStatus: started.task.runtimeStatus,
        executionTaskId: started.task.id,
        taskErrorCode: null,
        taskErrorMessage: null,
        // 重试只替换执行状态；后端会复用检查点，前端也不能在等待期间
        // 把已经生成的拆解、选题或改写初稿清空。
        outputSnapshot: reusableOutputSnapshot,
        targetTopicId: started.transform.targetTopicId,
      };
      setDetail((current) =>
        current?.item.id === detail.item.id
          ? {
              ...current,
              transforms: [
                pendingTransform,
                ...current.transforms.filter(
                  (transform) => transform.id !== pendingTransform.id,
                ),
              ],
            }
          : current,
      );
      setNotice(
        reusableOutputSnapshot
          ? "已保留现有内容，正在生成新的改写稿。"
          : attempt.positioningVersionId
            ? "正在生成改写稿，完成后可直接编辑和复制。"
            : "正在生成通用改写稿（未应用账号定位），完成后可直接编辑和复制。",
      );
      trackTopicTransform(detail.item.id, started.transform.id);
    } catch {
      if(!mounted.current||activeDetailItemId.current!==detail.item.id)return;
      // The request may have reached the server even though its response was lost.
      // Read the original item before offering a retry; unresolved requests keep their key.
      try {
        const refreshed = await api.getItem(detail.item.id);
        if (!mounted.current || activeDetailItemId.current !== detail.item.id) return;
        setDetail((current) => current?.item.id === detail.item.id ? refreshed : current);
        if (acceptedPreviewTransform(refreshed, attempt)) {
          clearPreviewAttempt(storageKey, attempt.idempotencyKey);
          setPreviewNeedsReconciliation(false);
          const acceptedTransform = acceptedPreviewTransform(refreshed, attempt);
          if (acceptedTransform) trackTopicTransform(detail.item.id, acceptedTransform.id);
          setNotice("已找到原生成任务，正在继续读取结果。请勿重复发起。");
          return;
        }
      } catch {
        // Keep the persisted idempotency key so the next reconciliation reuses it.
      }
      setPreviewNeedsReconciliation(true);
      setNotice("改写稿请求结果暂未确认。本次请求已保留；再次核对时会沿用同一请求，不会新建重复任务。");
    } finally {
      if(generation.current===currentGeneration){topicGenerationInFlight.current = false;setTopicGenerating(false);setBusy(false);}
    }
  }, [api, detail, positioningVersionId, setDetail, setNotice, setBusy, activeDetailItemId, trackTopicTransform]);

 return {topicGenerating,previewTopic,previewNeedsReconciliation,resetTopicPreview:()=>{generation.current++;topicGenerationInFlight.current=false;setTopicGenerating(false);}};
}

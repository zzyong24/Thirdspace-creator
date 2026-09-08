"use client";
import * as React from "react";
import type { RadarApi,RadarItemDetail } from "./intelligence-workbench-types";
import { operationKey } from "./radar-operation-key";
import { isTopicTaskPolling,topicTaskAttention,topicTaskStatus } from "./topic-task-state";
const TOPIC_PREVIEW_POLL_TIMEOUT_MS=480_000;
function topicPreviewPollDelayMs(attempt: number): number {
  return Math.min(400 + attempt * 100, 2_500);
}

export function useTopicPreview({api,detail,positioningVersionId,setDetail,setNotice,setBusy,activeDetailItemId}:{api:RadarApi;detail:RadarItemDetail|null;positioningVersionId:string|null;setDetail:React.Dispatch<React.SetStateAction<RadarItemDetail|null>>;setNotice:React.Dispatch<React.SetStateAction<string|null>>;setBusy:React.Dispatch<React.SetStateAction<boolean>>;activeDetailItemId:React.MutableRefObject<string|null>}){
 const [topicGenerating,setTopicGenerating]=React.useState(false);
 const topicGenerationInFlight=React.useRef(false);
 const generation=React.useRef(0);
 const topicPollingKeys=React.useRef(new Set<string>());
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

      const startedAt = Date.now();
      void (async () => {
        try {
          for (
            let attempt = 0;
            Date.now() - startedAt < TOPIC_PREVIEW_POLL_TIMEOUT_MS;
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
            const complete = Boolean(
              snapshot &&
                (progress
                  ? progress.draft?.status === "completed"
                  : snapshot.title?.trim()),
            );
            if (complete) {
              setNotice(
                snapshot?.adaptedDraft?.contentText
                  ? "选题候选和改写初稿已生成，请检查后确认写入选题池。"
                  : "选题候选已生成，请检查后确认写入选题池。",
              );
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
  const trackedTopicComplete = Boolean(
    trackedTopicSnapshot &&
      (trackedTopicProgress
        ? trackedTopicProgress.draft?.status === "completed"
        : trackedTopicSnapshot.title?.trim()),
  );

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
    if (!detail || !sourceSnapshotId || !positioningVersionId) return;
    if (topicGenerationInFlight.current) {
      setNotice("选题候选正在生成，无需重复点击。");
      return;
    }
    topicGenerationInFlight.current = true;
    const currentGeneration=++generation.current;
    setBusy(true);
    setTopicGenerating(true);
    setNotice(null);
    try {
      const started = await api.previewTopic({
        itemId: detail.item.id,
        sourceSnapshotId,
        positioningVersionId,
        idempotencyKey: operationKey("topic-preview"),
      });
      if(!mounted.current||activeDetailItemId.current!==detail.item.id)return;
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
        status: started.transform.status,
        taskStatus: started.task.status as RadarItemDetail["transforms"][number]["taskStatus"],
        taskRuntimeStatus: started.task.runtimeStatus,
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
          ? "已保留现有生成结果，正在重试未完成部分。"
          : "选题候选正在结合当前定位生成，完成前不会写入选题池。",
      );
      trackTopicTransform(detail.item.id, started.transform.id);
    } catch {
      if(!mounted.current||activeDetailItemId.current!==detail.item.id)return;
      setNotice("选题候选生成失败，请检查定位版本和来源快照后重试。");
    } finally {
      if(generation.current===currentGeneration){topicGenerationInFlight.current = false;setTopicGenerating(false);setBusy(false);}
    }
  }, [api, detail, positioningVersionId, trackTopicTransform]);

 return {topicGenerating,previewTopic,resetTopicPreview:()=>{generation.current++;topicGenerationInFlight.current=false;setTopicGenerating(false);}};
}

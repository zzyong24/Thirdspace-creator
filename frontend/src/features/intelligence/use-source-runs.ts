"use client";
import * as React from "react";
import { isRunActive,runResultMessage } from "./intelligence-display";
import { favoriteFoldersErrorMessage } from "./intelligence-errors";
import type { RadarApi,RadarWorkspace } from "./intelligence-workbench-types";
import { operationKey } from "./radar-operation-key";

export function useSourceRuns({api,workspace,setNotice,refresh}:{api:RadarApi;workspace:RadarWorkspace;setNotice:React.Dispatch<React.SetStateAction<string|null>>;refresh:()=>void}){
 const [runningSourceIds,setRunningSourceIds]=React.useState<Set<string>>(()=>new Set(workspace.health.filter(health=>isRunActive(health.lastRunStatus)).map(health=>health.sourceId)));
 const watchedRunIds=React.useRef(new Set<string>());
 const mounted=React.useRef(true);
 React.useEffect(()=>{mounted.current=true;return ()=>{mounted.current=false;};},[]);
  React.useEffect(()=>{setRunningSourceIds(current=>new Set([...current].filter(id=>{const health=workspace.health.find(row=>row.sourceId===id);return !health||isRunActive(health.lastRunStatus);})));},[workspace.health]);
  const watchRun = React.useCallback(
    async (sourceId: string, runId: string) => {
      setRunningSourceIds((current) => new Set(current).add(sourceId));
      for (let attempt = 0; attempt < 120; attempt += 1) {
        try {
          if(!mounted.current)return;
          const result = await api.getRun(runId);
          if(!mounted.current)return;
          if (!isRunActive(result.run.status)) {
            setRunningSourceIds((current) => {
              const next = new Set(current);
              next.delete(sourceId);
              return next;
            });
            const sourceType = workspace.sources.find(
              (source) => source.id === sourceId,
            )?.type;
            setNotice(runResultMessage(result.run, sourceType));
            refresh();
            return;
          }
        } catch {
          // 短暂读取失败不把仍在后台执行的任务误判为失败。
        }
        await new Promise((resolve) => setTimeout(resolve, 1_000));
      }
      if(!mounted.current)return;
      setRunningSourceIds(current=>{const next=new Set(current);next.delete(sourceId);return next;});
      setNotice("同步仍在后台运行，可打开该来源的“运行记录”查看最新进度。");
      refresh();
    },
    [api, refresh, workspace.sources],
  );

  React.useEffect(() => {
    // 页面重开/刷新后，服务端 workspace 可能仍有 queued/running run。只恢复
    // spinner 不恢复监听会让按钮永远转圈；这里按 lastRunId 重新挂 watcher。
    for (const health of workspace.health) {
      if (
        health.lastRunId &&
        isRunActive(health.lastRunStatus) &&
        !watchedRunIds.current.has(health.lastRunId)
      ) {
        watchedRunIds.current.add(health.lastRunId);
        void watchRun(health.sourceId, health.lastRunId);
      }
    }
  }, [watchRun, workspace.health]);

  const runSource = React.useCallback(
    async (sourceId: string) => {
      if (runningSourceIds.has(sourceId)) {
        setNotice("该来源正在同步，无需重复点击。");
        return;
      }
      setRunningSourceIds((current) => new Set(current).add(sourceId));
      setNotice("正在创建同步任务…");
      try {
        const result = await api.startRun({
          sourceId,
          idempotencyKey: operationKey("manual-sync"),
        });
        if(!mounted.current)return;
        setNotice("已开始同步，完成后作品会自动出现在列表中。");
        watchedRunIds.current.add(result.run.id);
        void watchRun(sourceId, result.run.id);
      } catch (error) {
        if(!mounted.current)return;
        setRunningSourceIds((current) => {
          const next = new Set(current);
          next.delete(sourceId);
          return next;
        });
        const status = (error as { status?: unknown })?.status;
        const source = workspace.sources.find((item) => item.id === sourceId);
        setNotice(
          status === 409
            ? "该来源已经在排队或同步中，无需重复操作。"
            : source?.type === "favorites_folder"
              ? favoriteFoldersErrorMessage(error)
              : "同步任务没有创建成功，请检查来源配置后重试；错误类型已写入本地诊断日志。",
        );
      }
    },
    [api, runningSourceIds, watchRun, workspace.sources],
  );


 return {runningSourceIds,runSource,watchRun};
}

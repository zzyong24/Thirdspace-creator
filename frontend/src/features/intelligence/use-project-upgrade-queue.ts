"use client";
import * as React from "react";
import type {ExecutionTaskResourceV2} from "@creatoros/contract";
import {radarTaskInScope,radarScopeKey} from "./intelligence-workbench-types";
import type {RadarScope,RadarApi} from "./intelligence-workbench-types";
import {operationKey} from "./radar-operation-key";

export function upgradeProjectId(task?:ExecutionTaskResourceV2):string|null {
  const checkpoint=task?.checkpoint;
  return checkpoint && typeof checkpoint==="object" && "projectId" in checkpoint && typeof checkpoint.projectId==="string"?checkpoint.projectId:null;
}
export function upgradeNeedsResultCheck(task?:ExecutionTaskResourceV2):boolean {
  return task?.status === "blocked" && (task.runtimeStatus === "unknown_result" || ["BOUND_ASR_RESULT_UNKNOWN", "TRANSCRIBE_ASR_RESULT_UNKNOWN", "ASR_STAGE_REQUIRES_RECONCILIATION", "INTELLIGENCE_ASR_REQUIRES_RECONCILIATION", "CALL_RESULT_UNKNOWN"].includes(task.errorCode ?? ""));
}
export function upgradeNotice(task?:ExecutionTaskResourceV2):string|null {
  if (upgradeNeedsResultCheck(task)) return "转写结果尚未确认，升级已暂停，已完成内容保留。可打开作品详情补充逐字稿，再继续升级。";
  if (task?.errorCode === "STALE_WORKSPACE_MEMBERSHIP") return "暂时无法确认任务的原账号信息。已完成内容已保留，可点击「重试升级」重试；若仍失败，请在账号组中核对该账号。";
  if (task?.runtimeStatus === "retry_wait") return task.errorMessage ?? (task.errorCode ? "处理遇到临时问题，系统已安排重试。" : null);
  return task?.errorMessage ?? null;
}

export function upgradeLabel(task?:ExecutionTaskResourceV2):string {
  if(!task)return "升级为项目";
  if(task.status==="succeeded")return "查看项目";
  if(upgradeNeedsResultCheck(task))return "检查并继续升级";
  if(["failed","blocked"].includes(task.status))return "重试升级";
  if(task.status==="cancelled")return "重新加入队列";
  if(task.status==="paused")return "继续升级";
  const point=task.checkpoint as {stage?:string}|null;
  return ({transcribing:"AI 转写中",generating:"拆解与写稿中",creating_project:"创建项目中",completed:"查看项目"} as Record<string,string>)[point?.stage??""]??"升级排队中";
}

export function useProjectUpgradeQueue({api,accountId,groupId,positioningVersionId,setNotice}:RadarScope & {api:RadarApi;positioningVersionId:string|null;setNotice:(value:string|null)=>void}){
  const scope=React.useMemo(()=>({groupId,accountId}),[groupId,accountId]);
  const scopeKey=radarScopeKey(scope);
  const currentScope=React.useRef(scopeKey);
  React.useLayoutEffect(()=>{currentScope.current=scopeKey;},[scopeKey,scope]);
  const [tasks,setTasks]=React.useState<ExecutionTaskResourceV2[]>([]);
  const tasksRef=React.useRef<ExecutionTaskResourceV2[]>([]);
  const [total,setTotal]=React.useState({scopeKey,total:0});
  const refreshRequest=React.useRef(()=>{});
  const [submitting,setSubmitting]=React.useState<Set<string>>(new Set());
  const pending=React.useRef(new Set<string>());
  const mounted=React.useRef(true);
  const merge=React.useCallback((rows:ExecutionTaskResourceV2[])=>{if(currentScope.current!==scopeKey)return;
    const map=new Map(tasksRef.current.filter(task=>radarTaskInScope(task,scope)).map(task=>[task.id,task]));
    for(const row of rows)if(radarTaskInScope(row,scope))map.set(row.id,row);
    const next=[...map.values()].sort((a,b)=>a.createdAt.localeCompare(b.createdAt));
    tasksRef.current=next;setTasks(next);
  },[scopeKey,scope]);
  React.useEffect(()=>{
    mounted.current=true;
    let disposed=false,reading=false,refreshQueued=false;
    let timer:ReturnType<typeof setTimeout>|undefined;
    let lastDiscovery=Date.now();
    const observable=(task:ExecutionTaskResourceV2)=>["queued","running","retry_wait","pause_requested","cancel_requested"].includes(task.runtimeStatus??task.status);
    const schedule=()=>{
      clearTimeout(timer);
      if(disposed||document.hidden)return;
      const active=tasksRef.current.some(task=>radarTaskInScope(task,scope)&&observable(task));
      const untilDiscovery=Math.max(0,lastDiscovery+60_000-Date.now());
      timer=setTimeout(()=>void refresh(Date.now()-lastDiscovery>=60_000),Math.min(active?3000:60_000,untilDiscovery));
    };
    const refresh=async(full=true)=>{
      if(disposed||!api.listProjectUpgrades)return;
      clearTimeout(timer);
      if(document.hidden){refreshQueued ||= full;return;}
      if(reading){refreshQueued ||= full;return;}
      refreshQueued=false;
      reading=true;
      try{
        if(full||!api.getProjectUpgrade){
          lastDiscovery=Date.now();
          for(let page=1;;page++){
            const result=await api.listProjectUpgrades({...scope,page});
            if(disposed||currentScope.current!==scopeKey)return;
            merge(result.tasks);setTotal({scopeKey,total:result.total});
            if(result.tasks.length===0 || page*100>=result.total)break;
          }
        }else{
          for(const task of tasksRef.current.filter(task=>radarTaskInScope(task,scope)&&observable(task))){
            try{
              const result=await api.getProjectUpgrade(task);
              if(disposed||currentScope.current!==scopeKey)return;
              merge([result]);
            }catch{/* 单项读取失败不阻断其他原任务的进度恢复。 */}
            if(disposed||currentScope.current!==scopeKey)return;
          }
        }
      }catch{/* 保留已有进度和任务编号，下一次发现/唤醒恢复。 */}finally{
        reading=false;
        if(!disposed){
          if(refreshQueued&&!document.hidden){refreshQueued=false;void refresh(true);}
          else schedule();
        }
      }
    };
    const wake=()=>void refresh(true);
    const visibility=()=>{clearTimeout(timer);if(!document.hidden)wake();};
    refreshRequest.current=wake;
    void refresh(true);
    window.addEventListener("focus",wake);document.addEventListener("visibilitychange",visibility);
    return()=>{disposed=true;mounted.current=false;clearTimeout(timer);window.removeEventListener("focus",wake);document.removeEventListener("visibilitychange",visibility);refreshRequest.current=()=>{};};
  },[api,scopeKey,scope,merge]);
  const scopedTasks=React.useMemo(()=>tasks.filter(task=>radarTaskInScope(task,scope)),[tasks,scope]);
  const byItem=React.useMemo(()=>new Map(scopedTasks.map(task=>[task.ownerId,task])),[scopedTasks]);
  const enqueue=async(itemId:string)=>{
    if(pending.current.has(itemId)||!api.enqueueProjectUpgrades)return;
    const task=byItem.get(itemId);
    if(task && !["failed","blocked","cancelled","paused"].includes(task.status))return;
    if(!positioningVersionId){setNotice("请先在定位中心保存当前工作区定位，再升级为项目。");return;}
    pending.current.add(itemId);setSubmitting(new Set(pending.current));
    try{
      if(upgradeNeedsResultCheck(task)){
        const detail=await api.getItem(itemId);
        if(detail.transcript.status!=="done" || !detail.transcript.text?.trim()){
          setNotice("尚未取得完整转写结果。请打开这条作品补充逐字稿；原任务和已完成内容已保留，不会重复提交转写。");
          return;
        }
      }
      if(task && api.commandTask){
        await api.commandTask({taskId:task.id,command:task.status==="paused"?"resume":"retry",idempotencyKey:operationKey(`upgrade-${task.id}`)});
        if(mounted.current && currentScope.current===scopeKey)merge([{...task,status:"queued",errorCode:null,errorMessage:null}]);
      }else{
        const result=await api.enqueueProjectUpgrades({itemIds:[itemId],positioningVersionId,idempotencyKey:`radar-upgrade:${scopeKey}:${itemId}`});
        if(mounted.current && currentScope.current===scopeKey)merge(result.tasks);
      }
      if(mounted.current && currentScope.current===scopeKey){refreshRequest.current();setNotice("已加入项目升级队列，将依次转写、拆解选题和生成文案。可以继续添加其他作品。");}
    }catch(error){if(mounted.current && currentScope.current===scopeKey)setNotice(error instanceof Error?error.message:"加入队列失败，请重试。");}
    finally{pending.current.delete(itemId);if(mounted.current && currentScope.current===scopeKey)setSubmitting(new Set(pending.current));}
  };
  const cancel=async(task:ExecutionTaskResourceV2)=>{
    if(!api.commandTask)return;
    try{await api.commandTask({taskId:task.id,command:"cancel",idempotencyKey:operationKey(`upgrade-cancel-${task.id}`)});if(mounted.current && currentScope.current===scopeKey){refreshRequest.current();setNotice("已请求取消升级，已完成的内容会保留。");}}
    catch{if(mounted.current && currentScope.current===scopeKey)setNotice("取消未确认，请稍后重试。");}
  };
  return {tasks:scopedTasks,total:total.scopeKey===scopeKey?total.total:0,byItem,submitting,enqueue,cancel};
}

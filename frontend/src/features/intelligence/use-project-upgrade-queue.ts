"use client";
import * as React from "react";
import type {ExecutionTaskResourceV2} from "@creatoros/contract";
import type {RadarApi} from "./intelligence-workbench-types";
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

export function useProjectUpgradeQueue({api,accountId,positioningVersionId,setNotice}:{api:RadarApi;accountId:string;positioningVersionId:string|null;setNotice:(value:string|null)=>void}){
  const [tasks,setTasks]=React.useState<ExecutionTaskResourceV2[]>([]);
  const [submitting,setSubmitting]=React.useState<Set<string>>(new Set());
  const pending=React.useRef(new Set<string>());
  const mounted=React.useRef(true);
  const merge=React.useCallback((rows:ExecutionTaskResourceV2[])=>setTasks(old=>{
    const map=new Map(old.map(task=>[task.id,task]));
    for(const row of rows)if(row.accountId===accountId)map.set(row.id,row);
    return [...map.values()].sort((a,b)=>a.createdAt.localeCompare(b.createdAt));
  }),[accountId]);
  React.useEffect(()=>{
    mounted.current=true;
    let disposed=false,reading=false;
    const refresh=async()=>{
      if(disposed||reading||!api.listProjectUpgrades)return;
      reading=true;
      try{
        for(let page=1;;page++){
          const result=await api.listProjectUpgrades({accountId,page});
          if(disposed)return;
          merge(result.tasks);
          if(result.tasks.length===0 || page*100>=result.total)break;
        }
      }catch{/* 保留已有进度，下次轮询恢复。 */}finally{reading=false;}
    };
    void refresh();
    const timer=window.setInterval(()=>void refresh(),3000);
    window.addEventListener("focus",refresh);
    return()=>{disposed=true;mounted.current=false;window.clearInterval(timer);window.removeEventListener("focus",refresh);};
  },[api,accountId,merge]);
  const byItem=React.useMemo(()=>new Map(tasks.map(task=>[task.ownerId,task])),[tasks]);
  const enqueue=async(itemId:string)=>{
    if(pending.current.has(itemId)||!api.enqueueProjectUpgrades)return;
    const task=byItem.get(itemId);
    if(task && !["failed","blocked","cancelled","paused"].includes(task.status))return;
    if(!positioningVersionId){setNotice("请先在定位中心保存当前账号定位，再升级为项目。");return;}
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
        if(mounted.current)merge([{...task,status:"queued",errorCode:null,errorMessage:null}]);
      }else{
        const result=await api.enqueueProjectUpgrades({itemIds:[itemId],positioningVersionId,idempotencyKey:`radar-upgrade:${accountId}:${itemId}`});
        if(mounted.current)merge(result.tasks);
      }
      if(mounted.current)setNotice("已加入项目升级队列，将依次转写、拆解选题和生成文案。可以继续添加其他作品。");
    }catch(error){if(mounted.current)setNotice(error instanceof Error?error.message:"加入队列失败，请重试。");}
    finally{pending.current.delete(itemId);if(mounted.current)setSubmitting(new Set(pending.current));}
  };
  const cancel=async(task:ExecutionTaskResourceV2)=>{
    if(!api.commandTask)return;
    try{await api.commandTask({taskId:task.id,command:"cancel",idempotencyKey:operationKey(`upgrade-cancel-${task.id}`)});if(mounted.current)setNotice("已请求取消升级，已完成的内容会保留。");}
    catch{if(mounted.current)setNotice("取消未确认，请稍后重试。");}
  };
  return {tasks,byItem,submitting,enqueue,cancel};
}

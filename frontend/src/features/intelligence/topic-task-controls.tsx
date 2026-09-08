"use client";
import * as React from "react";
import {Button} from "@/components/ui/button";
import type {RadarApi,RadarItemDetail} from "./intelligence-workbench-types";
import {topicTaskStatus} from "./topic-task-state";
import {operationKey} from "./radar-operation-key";
/** 只向原执行 ID 发命令；界面离开不代表取消，未知结果不提供重跑。 */
export function TopicTaskControls({transform,itemId,api,onDetail}:{transform:RadarItemDetail["transforms"][number];itemId:string;api:RadarApi;onDetail:(detail:RadarItemDetail)=>void}){
 const [pending,setPending]=React.useState(false),[error,setError]=React.useState<string|null>(null);
 const inFlight=React.useRef(false),mounted=React.useRef(true);
 const commandKey=React.useRef<{command:string;key:string}|null>(null);
 React.useEffect(()=>{mounted.current=true;return ()=>{mounted.current=false;};},[]);
 const status=topicTaskStatus(transform),taskId=transform.executionTaskId;
 const resumable=status==="waiting_user"||status==="paused";
 const cancellable=["queued","running","retry_wait","waiting_user","paused","pause_requested","unknown_result"].includes(status??"");
 if(!resumable&&!cancellable)return null;
 async function command(action:"resume"|"cancel"){
  if(inFlight.current||!taskId||!api.commandTask)return;
  inFlight.current=true;setPending(true);setError(null);
  if(commandKey.current?.command!==action)commandKey.current={command:action,key:operationKey(`topic-${action}`)};
  try{
   await api.commandTask({taskId,command:action,idempotencyKey:commandKey.current.key});
   const detail=await api.getItem(itemId);
   if(mounted.current){onDetail(detail);commandKey.current=null;}
  }catch(caught){if(mounted.current)setError(caught instanceof Error?caught.message:"任务操作未确认，请刷新后重试。");}
  finally{inFlight.current=false;if(mounted.current)setPending(false);}
 }
 return <div className="mt-3 space-y-2 text-xs">
  {status==="unknown_result"?<p className="text-muted-foreground">提交结果待核对。结束只停止后续执行，不代表原调用没有发生；不会重新生成。</p>:null}
  {taskId&&api.commandTask?<div className="flex gap-2">
   {resumable?<Button size="sm" variant="outline" disabled={pending} onClick={()=>void command("resume")}>{pending?"正在处理…":"继续原任务"}</Button>:null}
   {cancellable?<Button size="sm" variant="outline" disabled={pending} onClick={()=>void command("cancel")}>{status==="unknown_result"?"结束任务":"取消任务"}</Button>:null}
  </div>:<p className="text-muted-foreground">原执行任务暂不可读取，请刷新状态后处理。</p>}
  {error?<p role="alert" className="text-destructive">{error}</p>:null}
 </div>;
}

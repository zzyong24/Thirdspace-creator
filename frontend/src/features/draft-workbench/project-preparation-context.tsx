"use client";

import * as React from "react";
import type {
  ProjectPreparationResource, ProjectPreparationStepName, ProjectPreparationCandidate,
  ProjectPreparationTranscriptInput, ProjectPreparationAcceptanceReceipt,
} from "@creatoros/contract";
import {createAiTaskAttemptId} from "@/lib/ai-task-attempt";
import {creationScopeKey, useCreationScope, useCreationWorkspace} from "@/lib/creation-workspace-scope";

interface PreparationContext {
  projectId: string;
  scopeKey: string;
  preparation: ProjectPreparationResource | null;
  error: string | null;
  busy: boolean;
  reload(): Promise<void>;
  start(step: ProjectPreparationStepName | null): Promise<void>;
  control(command: "pause" | "resume" | "cancel"): Promise<void>;
  provide(input: Omit<Extract<ProjectPreparationTranscriptInput,{inputMode:"paste"}>,"submissionKey">): Promise<void>;
  accept(candidate: ProjectPreparationCandidate): Promise<ProjectPreparationAcceptanceReceipt>;
}
const Context=React.createContext<PreparationContext|null>(null);
const errorText=(error:unknown)=>error instanceof Error?error.message:"状态暂时无法读取，请重新读取。";
type ControlObservation={projectId:string;scopeKey:string;taskId:string;deadlineAt:number};
const CONTROL_OBSERVATION_MS=120000;
const shouldObserveControlTask=(task:{status:string;runtimeStatus?:string})=>["pause_requested","cancel_requested","queued","running","retry_wait"].includes(task.runtimeStatus??task.status);
const mayHavePendingControl=(value:ProjectPreparationResource)=>value.registration==="registered"&&value.availableActions.length===1&&value.availableActions[0]==="start"&&value.steps.some(step=>step.status==="paused"||step.status==="cancelled")||value.registration==="registered"&&value.availableActions.includes("pause")&&value.steps.some(step=>["failed","paused","waiting_user"].includes(step.status));
const needsObservation=(value:ProjectPreparationResource)=>value.registration==="registered"&&value.steps.some(step=>["pending","queued","running"].includes(step.status));

/** 同一项目的面板和编导栏共用一个读取循环；切组仅结束前端观察。 */
export function ProjectPreparationProvider({projectId,initialPreparation=null,initialError=null,children,pollIntervalMs=4000}:{
  projectId:string;initialPreparation?:ProjectPreparationResource|null;initialError?:string|null;children:React.ReactNode;pollIntervalMs?:number;
}) {
  const scope=useCreationScope(),scopeKey=creationScopeKey(scope),workspace=useCreationWorkspace(scope);
  const [snapshot,setSnapshot]=React.useState({projectId,scopeKey,preparation:initialPreparation,error:initialError});
  const [busy,setBusy]=React.useState(false);
  const controlObservation=React.useRef<ControlObservation|null>(null);
  const [watchingControl,setWatchingControl]=React.useState(false);
  const flight=React.useRef<Promise<unknown>|null>(null),epoch=React.useRef(0);
  const keys=React.useRef(new Map<string,string>());
  const keyFor=React.useCallback((input:unknown)=>{const encoded=JSON.stringify(input);let key=keys.current.get(encoded);if(!key){key=createAiTaskAttemptId();keys.current.set(encoded,key);}return key;},[]);
  const current=React.useRef({projectId,scopeKey});
  React.useLayoutEffect(()=>{current.current={projectId,scopeKey};},[projectId,scopeKey]);
  const isCurrent=React.useCallback((turn:number)=>epoch.current===turn&&current.current.projectId===projectId&&current.current.scopeKey===scopeKey,[projectId,scopeKey]);
  const read=React.useCallback(async()=>{
    if(flight.current)return;
    const turn=epoch.current,operation=workspace.capture();
    const pending=(async()=>{
      try {
        const observed=controlObservation.current;
        const observation=observed?.projectId===projectId&&observed.scopeKey===scopeKey?observed:null;
        if(observation){
          if(Date.now()>=observation.deadlineAt){
            if(isCurrent(turn)){controlObservation.current=null;setWatchingControl(false);}
            throw Error("控制已提交，请重新读取原任务状态；不会重发控制或准备请求。");
          }
          const task=await operation.client.getExecutionTask({params:{taskId:observation.taskId},query:undefined,body:undefined});
          operation.assertCurrent();
          if(task.id!==observation.taskId)throw Error("控制回执不属于原准备任务，请重新读取。");
          if(isCurrent(turn)&&!shouldObserveControlTask(task)){controlObservation.current=null;setWatchingControl(false);}
        }
        const result=await operation.client.getProjectPreparation({params:{projectId},query:undefined,body:undefined});
        operation.assertCurrent();
        if(result.projectId!==projectId)throw Error("准备状态不属于当前项目，请重新读取。");
        // 刷新仅对停止中的投影核对一次父任务；已取消的终态不建立轮询。
        if(!observation&&result.registration==="registered"&&mayHavePendingControl(result)){
          const task=await operation.client.getExecutionTask({params:{taskId:result.preparationTaskId},query:undefined,body:undefined});
          operation.assertCurrent();
          if(task.id!==result.preparationTaskId)throw Error("控制回执不属于原准备任务，请重新读取。");
          if(isCurrent(turn)&&shouldObserveControlTask(task)){
            controlObservation.current={projectId,scopeKey,taskId:task.id,deadlineAt:Date.now()+CONTROL_OBSERVATION_MS};setWatchingControl(true);
          }
        }
        if(isCurrent(turn))setSnapshot({projectId,scopeKey,preparation:result,error:null});
      } catch(error) {
        if(isCurrent(turn))setSnapshot(previous=>({projectId,scopeKey,preparation:previous.projectId===projectId&&previous.scopeKey===scopeKey?previous.preparation:null,error:errorText(error)}));
      } finally {if(isCurrent(turn))setBusy(false);}
    })();
    flight.current=pending;setBusy(true);
    try{await pending;}finally{if(flight.current===pending)flight.current=null;}
  },[workspace,projectId,scopeKey,isCurrent]);
  React.useEffect(()=>{
    const invalidate=()=>{++epoch.current;};
    invalidate();
    // 旧工作区的未完成请求不占新工作区的槽，也不能将旧响应写回来。
    flight.current=null;controlObservation.current=null;setWatchingControl(false);
    void read();
    return invalidate;
  },[read]);
  const visible=snapshot.projectId===projectId&&snapshot.scopeKey===scopeKey?snapshot:null;
  React.useEffect(()=>{
    const observe=()=>{if(!document.hidden)void read();};
    window.addEventListener("focus",observe);document.addEventListener("visibilitychange",observe);
    return()=>{window.removeEventListener("focus",observe);document.removeEventListener("visibilitychange",observe);};
  },[read]);
  React.useEffect(()=>{
    if(busy||visible?.error||!visible?.preparation||(!needsObservation(visible.preparation)&&!watchingControl)||document.hidden)return;
    const timer=setTimeout(()=>{if(!document.hidden)void read();},pollIntervalMs);
    return()=>clearTimeout(timer);
  },[busy,visible,pollIntervalMs,read,watchingControl]);
  const mutate=React.useCallback(async<T,>(action:(operation:ReturnType<typeof workspace.capture>)=>Promise<T>,projectResponse:boolean):Promise<T>=>{
    if(flight.current)throw Error("原请求仍在处理中，请等待原回执。");
    const turn=epoch.current,operation=workspace.capture();operation.assertCurrent();
    const pending=action(operation);flight.current=pending;setBusy(true);
    try{
      const result=await pending;operation.assertCurrent();
      if(!isCurrent(turn))throw Error("工作区已切换，原操作回执保留，请回原项目核对。");
      if(projectResponse)setSnapshot({projectId,scopeKey,preparation:result as ProjectPreparationResource,error:null});
      return result;
    }finally{if(flight.current===pending)flight.current=null;if(isCurrent(turn))setBusy(false);}
  },[workspace,isCurrent,projectId,scopeKey]);
  const start=React.useCallback(async(step:ProjectPreparationStepName|null)=>{
    const requestedSteps=step?[step]:["transcript","source_draft","brief"] as ProjectPreparationStepName[];
    await mutate(operation=>operation.client.startProjectPreparation({params:{projectId},query:undefined,body:{idempotencyKey:keyFor(["start",projectId,visible?.preparation?.preparationTaskId,visible?.preparation?.revision,requestedSteps]),requestedSteps}}),true);
  },[mutate,projectId,keyFor,visible?.preparation]);
  const control=React.useCallback(async(command:"pause"|"resume"|"cancel")=>{
    const preparation=visible?.preparation;
    if(!preparation||preparation.registration!=="registered"||!preparation.preparationTaskId||!preparation.availableActions.includes(command))throw Error("当前准备任务不支持此操作，请重新读取状态。");
    const keyInput=["control",scopeKey,projectId,preparation.preparationTaskId,preparation.revision,command];
    let pendingControl=false;
    await mutate(async operation=>{
      const receipt=await operation.client.commandExecutionTasks({params:undefined,query:undefined,body:{taskIds:[preparation.preparationTaskId],command,idempotencyKey:keyFor(keyInput)}});
      operation.assertCurrent();
      const task=receipt.tasks.find(row=>row.id===preparation.preparationTaskId);
      if(!task)throw Error("控制回执缺少原准备任务，请重新读取。");
      pendingControl=shouldObserveControlTask(task);
      const result=await operation.client.getProjectPreparation({params:{projectId},query:undefined,body:undefined});
      if(result.projectId!==projectId)throw Error("准备状态不属于当前项目，请重新读取。");
      return result;
    },true);
    // 同一未确认意图保留幂等键；成功读取后，下一次显式操作是新意图。
    keys.current.delete(JSON.stringify(keyInput));
    if(pendingControl){controlObservation.current={projectId,scopeKey,taskId:preparation.preparationTaskId,deadlineAt:Date.now()+CONTROL_OBSERVATION_MS};setWatchingControl(true);}
  },[visible?.preparation,scopeKey,projectId,mutate,keyFor]);
  const provide=React.useCallback(async(input:Omit<Extract<ProjectPreparationTranscriptInput,{inputMode:"paste"}>,"submissionKey">)=>{
    await mutate(operation=>operation.client.provideProjectPreparationTranscript({params:{projectId},query:undefined,body:{...input,submissionKey:keyFor(["transcript",projectId,input])}}),true);
  },[mutate,projectId,keyFor]);
  const accept=React.useCallback(async(candidate:ProjectPreparationCandidate)=>{
    if(!candidate.content||!candidate.baseline||candidate.contentError||candidate.status!=="pending")throw Error("候选正文或采纳基线尚未确认，请重新读取。");
    const receipt=await mutate(operation=>operation.client.acceptProjectPreparationCandidate({params:{projectId,candidateId:candidate.id},query:undefined,body:{idempotencyKey:keyFor(["accept",projectId,candidate.id,candidate.sourceDigest,candidate.baseline]),candidateSourceDigest:candidate.sourceDigest,baseline:candidate.baseline!}}),false);
    setSnapshot(previous=>({...previous,preparation:previous.preparation?{...previous.preparation,candidates:previous.preparation.candidates.map(row=>row.id===candidate.id?{...row,status:"accepted" as const,acceptanceReceipt:receipt}:row)}:null}));
    return receipt;
  },[mutate,keyFor,projectId]);
  return <Context.Provider value={{projectId,scopeKey,preparation:visible?.preparation??null,error:visible?.error??null,busy,reload:read,start,control,provide,accept}}>{children}</Context.Provider>;
}

export function useProjectPreparation(){return React.useContext(Context);}

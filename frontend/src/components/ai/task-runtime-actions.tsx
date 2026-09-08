"use client";
import * as React from 'react';
import {client} from '@/lib/contract-client';
import {taskRuntimeStatus,type RuntimeTask} from '@/lib/ai-task-runtime';
export {taskRuntimeStatus,type RuntimeTask} from '@/lib/ai-task-runtime';
/** 已映射任务只发送原执行控制；未知结果仅供查看/取消，不能盲重跑。 */
export function TaskRuntimeActions({task,onUpdated}:{task:RuntimeTask;onUpdated:()=>void|Promise<void>}){
 const [busy,setBusy]=React.useState(false),[error,setError]=React.useState<string|null>(null);
 const key=React.useRef<{action:string;id:string}|null>(null),status=taskRuntimeStatus(task);
 if(!task.executionTaskId)return null;
 const action=['paused','waiting_user'].includes(status)?'resume':status==='failed'?'retry':null;
 const cancellable=['queued','running','retry_wait','paused','waiting_user','unknown_result','pause_requested'].includes(status);
 async function command(action:'resume'|'retry'|'cancel'){
  if(busy)return;setBusy(true);setError(null);
  if(key.current?.action!==action)key.current={action,id:crypto.randomUUID()};
  try{await client.commandExecutionTasks({params:undefined,query:undefined,body:{taskIds:[task.executionTaskId!],command:action,idempotencyKey:key.current.id}});key.current=null;await onUpdated();}
  catch(error){setError(error instanceof Error?error.message:'操作未确认，请刷新原任务查看');}finally{setBusy(false);}
 }
 return <div className="flex flex-wrap items-center gap-2 text-xs">
  {status==='unknown_result'?<span>调用结果待核对，请保留原任务。</span>:null}
  {action?<button type="button" disabled={busy} onClick={()=>void command(action)}>{action==='resume'?'继续原任务':'重试原任务'}</button>:null}
  {cancellable?<button type="button" disabled={busy} onClick={()=>void command('cancel')}>取消任务</button>:null}
  <button type="button" disabled={busy} onClick={()=>void onUpdated()}>刷新状态</button>
  {error?<span role="alert">{error}</span>:null}
 </div>;
}

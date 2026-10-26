import {AsyncLocalStorage} from 'node:async_hooks';
import {randomUUID} from 'node:crypto';

type ModelStreamEvent = {eventId:string;module:'worker';code:string;occurredAt:string;referenceId:string;stack:string;message:string};
const observation = new AsyncLocalStorage<{referenceId:string;emit:(event:ModelStreamEvent)=>void}>();

/** 沿原执行任务传递观察上下文；不持有模型凭据，也不创建任务或重试。 */
export function withModelStreamObservation<T>(referenceId:string,emit:(event:ModelStreamEvent)=>void,run:()=>T):T {
 return observation.run({referenceId,emit},run);
}

export function observeModelStreamFailure(facts:{message:string;statusCode?:number;output:boolean}):void {
 const scope=observation.getStore();
 if(!scope)return;
 // SEMANTIC_BOUNDARY_ALLOW: 只提取协议/连接诊断提示；原始上游文本永不进入 IPC 或日志。
 const status=Number.isInteger(facts.statusCode) && facts.statusCode!>=100 && facts.statusCode!<=599?facts.statusCode:undefined;
 const hint=status && status>=400?'http_rejected':/timeout|timed out|ETIMEDOUT/i.test(facts.message)?'timeout':/ECONN|ENOTFOUND|EAI_AGAIN|network|connection|fetch failed|socket|terminated/i.test(facts.message)?'transport':/JSON|parse|malformed|protocol/i.test(facts.message)?'protocol':'unknown';
 try{scope.emit({eventId:randomUUID(),module:'worker',code:'WORKER_MODEL_STREAM_INTERRUPTED',occurredAt:new Date().toISOString(),referenceId:scope.referenceId,stack:'',message:`status=${status??'unknown'} output=${facts.output} hint=${hint}`});}catch{/* 观察失败不能改变模型调用及账本结局。 */}
}

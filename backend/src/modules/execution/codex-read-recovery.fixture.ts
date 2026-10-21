// 只替换原生协议端点；真实 Worker/provider/IPC/后端账本与素材保存均保留。
export * from '../../../../ai-worker/src/execution/codex-app-server.js';
import {appendFileSync} from 'node:fs';
declare const __RECOVERY_AUDIT_PATH__:string;
export const recoveryImage='iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jL1sAAAAASUVORK5CYII=';
export async function createControlledCodexSession(){
 const rpc:any={close:async()=>{},request:async(method:string,params:any)=>{
  appendFileSync(__RECOVERY_AUDIT_PATH__,JSON.stringify({method,params})+'\n');
  if(method!=='thread/read')throw Error('RECOVERY_MUST_NOT_SUBMIT:'+method);
  const threadId=params.threadId;
  if(typeof threadId!=='string'||!threadId.startsWith('recovery-')||params.includeTurns!==true)throw Error('WRONG_ORIGINAL_THREAD');
  return {thread:{id:threadId,turns:[{id:threadId.replace('thread','turn'),status:threadId.includes('pending')?'inProgress':'completed',items:threadId.includes('image')?[{id:'original-image-item',type:'imageGeneration',status:'completed',result:recoveryImage}]:[{type:'agentMessage',text:threadId.includes('preparation-decomposition')?JSON.stringify({hook:'原来源开头',structureSteps:['事实','说明'],coreClaims:['原主张'],reusablePattern:'原结构',factRisks:[]}):threadId.includes('structured')?'{"oneLiner":"原节点候选"}':threadId.includes('script-draft')?'{"authorized":true,"startAnchor":"第一句正文。","endAnchor":"最后一句。"}':threadId.includes('hooks')?'[]':'原线程文本',phase:'final_answer'}]}]}};
 }};
 return {rpc,authenticated:true,mcpNames:[]};
}

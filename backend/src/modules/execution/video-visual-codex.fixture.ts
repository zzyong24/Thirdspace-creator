// 原生协议fixture：仅替换app-server会话，实际provider、图片投影、原turn与durable IPC不替换。
export * from '../../../../ai-worker/src/execution/codex-app-server.js';
export async function createControlledCodexSession(){
 const rpc:any={close:async()=>{},request:async(method:string,params:any)=>{
  if(method==='thread/start')return {thread:{id:'visual-fixture-thread'}};
  if(method==='mcpServerStatus/list')return {data:[]};
  if(method==='turn/start'){
   if(params.threadId!=='visual-fixture-thread'||params.input?.[1]?.type!=='image'||!params.input[1].url.startsWith('data:image/jpeg;base64,'))throw Error('FIXTURE_ORIGINAL_IMAGE_REQUIRED');
   setTimeout(async()=>{
    await rpc.onNotification?.('thread/tokenUsage/updated',{threadId:'visual-fixture-thread',turnId:'visual-fixture-turn',tokenUsage:{total:{inputTokens:2,outputTokens:3,totalTokens:5,cachedInputTokens:0,reasoningOutputTokens:0}}});
    await rpc.onNotification?.('turn/completed',{threadId:'visual-fixture-thread',turn:{id:'visual-fixture-turn',status:'completed',items:[{type:'agentMessage',text:'{"verdict":"pass","summary":"原Codex图片已审查","issues":[]}',phase:'final_answer'}]}});
   },25);return {turn:{id:'visual-fixture-turn'}};
  }
  if(method==='turn/interrupt')return {};
  throw Error('FIXTURE_UNEXPECTED_METHOD:'+method);
 }};
 return {rpc,authenticated:true,mcpNames:[]};
}

'use strict';
const fs=require('node:fs'),path=require('node:path'),readline=require('node:readline');
const root=process.argv[2],scenario=JSON.parse(fs.readFileSync(path.join(root,'scenario.json'),'utf8'));
const file=path.join(root,'rpc-state.json'),audit=path.join(root,'native-rpc.ndjson');
const state=()=>fs.existsSync(file)?JSON.parse(fs.readFileSync(file,'utf8')):{sequence:0,childStarts:0,threads:{}};
const store=x=>fs.writeFileSync(file,JSON.stringify(x));
const out=x=>process.stdout.write(JSON.stringify(x)+'\n');
const log=x=>fs.appendFileSync(audit,JSON.stringify({...x,pid:process.pid})+'\n');
let requestSeq=10000;const pending=new Map();
const valid={topics:[{title:'合成选题：把一次尝试记清楚',angle:'区分问题、尝试与观察',contentRole:'trust',source:'demand',predictedScore:60,reason:'仅受控中性材料',sourceComments:[]}]};
function complete(threadId,turnId,text,usage=true){
 if(usage)out({method:'thread/tokenUsage/updated',params:{threadId,turnId,tokenUsage:{total:{inputTokens:7,outputTokens:5,totalTokens:12,cachedInputTokens:0,reasoningOutputTokens:0}}}});
 const turn={id:turnId,status:'completed',itemsView:'full',items:[{id:'final-'+turnId,type:'agentMessage',phase:'final_answer',text}]};
 const s=state();s.threads[threadId].turn=turn;store(s);
 out({method:'item/completed',params:{threadId,turnId,item:turn.items[0]}});out({method:'turn/completed',params:{threadId,turn}});
}
async function handle(m){
 if(m.id!==undefined&&!m.method){const job=pending.get(m.id);if(job){pending.delete(m.id);log({method:'item/tool/call-reply',threadId:job.threadId,turnId:job.turnId,hasError:!!m.error,success:m.result?.success??null});complete(job.threadId,job.turnId,'受控候选已生成，等待采纳。');}return;}
 if(!m.method)return;
 log({method:m.method,...(m.params?.threadId?{threadId:m.params.threadId}:{}),...(m.params?.turnId?{turnId:m.params.turnId}:{}),...(m.method==='thread/start'?{toolNames:(m.params.dynamicTools??[]).map(t=>t.name)}:{})});
 let result={};
 if(m.method==='config/read'){
  const features={omit_app_server_notification_media:false};for(const x of ['apps','plugins','hooks','multi_agent','multi_agent_v2','image_generation','browser_use','computer_use','code_mode','code_mode_host','tool_suggest','shell_tool','unified_exec','view_image','skill_search','skill_mcp_dependency_install'])features[x]=false;
  const direct=process.argv.some(x=>x.includes('direct_only_tool_namespaces'));
  if(direct)features.code_mode={enabled:false,direct_only_tool_namespaces:['functions']};
  result={config:{web_search:'disabled',features,mcp_servers:{}}};
 }else if(m.method==='account/read')result={account:{type:'chatgpt',planType:'fixture'},requiresOpenaiAuth:false};
 else if(m.method==='model/list')result={data:[{id:'t1310-fixture-model',isDefault:true,inputModalities:['text','image']}]};
 else if(m.method==='mcpServerStatus/list')result={data:[],nextCursor:null};
 else if(m.method==='thread/start'){
  const s=state(),threadId='fixture-thread-'+(++s.sequence);s.threads[threadId]={root:(m.params.dynamicTools??[]).length>0,tools:m.params.dynamicTools??[]};store(s);result={thread:{id:threadId},model:'t1310-fixture-model',modelProvider:'synthetic'};
 }else if(m.method==='thread/read'){
  const s=state(),t=s.threads[m.params.threadId];if(!t?.turn)throw Error('FIXTURE_ORIGINAL_TURN_MISSING');log({method:'fixture-read-original-turn',threadId:m.params.threadId,turnId:t.turn.id,role:t.root?'root':'child',status:t.turn.status});result={thread:{id:m.params.threadId,turns:[t.turn]}};
 }else if(m.method==='turn/start'){
  const s=state(),threadId=m.params.threadId,t=s.threads[threadId],turnId='fixture-turn-'+threadId;if(!t)throw Error('FIXTURE_THREAD_MISSING');
  t.turn={id:turnId,status:'inProgress',itemsView:'full',items:[]};const childNumber=t.root?null:++s.childStarts;store(s);result={turn:{id:turnId,status:'inProgress',items:[]}};
  out({id:m.id,result});
  setImmediate(()=>{
   out({method:'turn/started',params:{threadId,turn:{id:turnId,status:'inProgress',items:[]}}});
   if(t.root){const name=t.tools.find(x=>x.name==='topic_generate')?.name;if(!name)throw Error('FIXTURE_REAL_TOPIC_TOOL_REQUIRED');const id=++requestSeq;pending.set(id,{threadId,turnId});out({id,method:'item/tool/call',params:{threadId,turnId,callId:'fixture-topic-tool',tool:name,namespace:null,arguments:{basis:'positioning'}}});}
   else{const invalid=scenario.kind==='partial'||scenario.kind==='repair'&&childNumber===1;complete(threadId,turnId,invalid?'not-json':JSON.stringify(valid),scenario.kind!=='missing-usage');}
  });return;
 }else if(m.method==='turn/interrupt')result={};
 else if(!['initialize','initialized'].includes(m.method))throw Error('FIXTURE_RPC_NOT_ALLOWED');
 if(m.id!==undefined)out({id:m.id,result});
}
readline.createInterface({input:process.stdin}).on('line',l=>{try{void handle(JSON.parse(l)).catch(()=>process.exit(2));}catch{process.exit(2);}});

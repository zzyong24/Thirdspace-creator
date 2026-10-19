'use strict';
// TEST ONLY：仅替代外部CLI传输；配置逐项来自产品实际argv，不声称真实供应商或模型视图。
const fs=require('node:fs'),path=require('node:path'),readline=require('node:readline'),assert=require('node:assert/strict');
const root=process.argv[2],scenario=JSON.parse(fs.readFileSync(path.join(root,'scenario.json'))),argv=process.argv.slice(3),config={features:{},mcp_servers:{}};
assert.equal(argv[0],'app-server');assert.equal(argv[1],'--stdio');
fs.appendFileSync(path.join(root,'native-rpc.ndjson'),JSON.stringify({at:new Date().toISOString(),pid:process.pid,method:'ACTUAL_CLI_ARGUMENTS_BEFORE_PARSE',argv,externalProvider:false})+'\n');
const pairs=[];
for(let i=2;i<argv.length;i+=2){assert.equal(argv[i],'-c');const value=argv[i+1];assert.equal(typeof value,'string');pairs.push(value);
 const m=value.match(/^features\.([a-z0-9_]+)=(.*)$/);
 if(m){if(m[1]==='code_mode'&&m[2].startsWith('{')){const p=m[2].match(/^\{enabled=false,direct_only_tool_namespaces=(\[.*\])\}$/);assert(p);config.features.code_mode={enabled:false,direct_only_tool_namespaces:JSON.parse(p[1])};}else{assert(['true','false'].includes(m[2]));config.features[m[1]]=m[2]==='true';}}
 else if(value.startsWith('web_search='))config.web_search=JSON.parse(value.slice('web_search='.length));
 else if(value==='mcp_servers={}')config.mcp_servers={};else throw Error('UNSUPPORTED_ACTUAL_CONFIGURATION '+value);
}
const audit=v=>fs.appendFileSync(path.join(root,'native-rpc.ndjson'),JSON.stringify({at:new Date().toISOString(),pid:process.pid,...v})+'\n');audit({method:'ACTUAL_CLI_CONFIGURATION',argv,pairs,config,externalProvider:false});
const direct=config.features.code_mode?.direct_only_tool_namespaces??[];
const visible=direct.includes('functions');let tools=[],current,seq=100,observation=0;const pending=new Map();
const out=v=>process.stdout.write(JSON.stringify(v)+'\n'),provider=name=>name.replace(/[^a-zA-Z0-9_-]/g,'_');
function request(originalName,args){assert(visible,'FUNCTIONS_NOT_DIRECTLY_VISIBLE');const name=provider(originalName);assert(tools.some(t=>t.name===name),'REGISTERED_TOOL_REQUIRED');const id=++seq,toolCallId='controlled-tool-'+id;pending.set(id,{originalName,name,toolCallId,args});audit({method:'registered-tool-request',name,originalName,toolCallId,args});out({id,method:'item/tool/call',params:{threadId:current.threadId,turnId:current.turnId,callId:toolCallId,tool:name,namespace:null,arguments:args}});}
function complete(){const item={id:'controlled-final',type:'agentMessage',phase:'final_answer',text:visible?'受控工具链已返回，等待正式业务结果核验。':'受控CLI配置未直接暴露functions，未发出工具请求。'};current.turn={id:current.turnId,status:'completed',itemsView:'full',items:[item]};out({method:'thread/tokenUsage/updated',params:{threadId:current.threadId,turnId:current.turnId,tokenUsage:{total:{inputTokens:7,outputTokens:5,totalTokens:12,cachedInputTokens:0,reasoningOutputTokens:0}}}});out({method:'item/completed',params:{threadId:current.threadId,turnId:current.turnId,item}});out({method:'turn/completed',params:{threadId:current.threadId,turn:current.turn}});}
async function handle(m){
 if(m.id!==undefined&&!m.method){const job=pending.get(m.id);assert(job,'UNKNOWN_CONTROLLED_RESPONSE');pending.delete(m.id);const text=m.result?.contentItems?.find(x=>x.type==='inputText')?.text,outcome=text?JSON.parse(text):null;audit({method:'registered-tool-reply',...job,success:m.result?.success??null,outcome,error:m.error??null});assert.equal(m.result?.success,true);assert(outcome&&['ok','partial'].includes(outcome.status)&&outcome.error===null&&outcome.sideEffect!=='unknown','REAL_TOOL_OUTCOME_REQUIRED');
 if(job.originalName==='collect.plan'){assert(outcome.data.targets.some(x=>x.id===scenario.sourceId));request('collect.run',{targetId:scenario.sourceId});}
 else if(job.originalName.startsWith('collect.')){if(outcome.data.ok===true)complete();else{assert(outcome.data.pending&&outcome.data.runId);assert(++observation<16,'ORIGINAL_CALL_BUDGET_NOT_EXTENDED');setTimeout(()=>request('collect.status',{targetId:scenario.sourceId,runId:outcome.data.runId,observation}),500);}}
 else if(job.originalName==='material.search'){assert(outcome.data.items.some(x=>x.id===scenario.assetId));request('material.organize',{assetIds:[scenario.assetId],tag:scenario.tag});}
 else if(job.originalName==='web.read'){const d=outcome.data;assert(d.evidenceRef&&d.snapshotId&&d.sourceUrl&&d.text);if(d.nextOffset!==null){request('web.read',{url:scenario.researchUrl,snapshotId:d.snapshotId,evidenceRef:d.evidenceRef,offset:d.nextOffset});}else request('knowledge.write',{title:'受控来源记录方法',note:'受控测试来源说明一次只改变一个条件，并把实际观察和解释分开；这不是公网新闻或真实供应商事实。',sourceNote:d.sourceUrl,evidenceRefs:[d.evidenceRef]});}
 else if(job.originalName==='material.organize'||job.originalName==='knowledge.write'){assert(outcome.data.proposal,'REAL_STAGED_PROPOSAL_REQUIRED');complete();}else throw Error('UNEXPECTED_CONTROLLED_TOOL');return;
 }
 if(!m.method)return;audit({method:m.method,params:m.params??null});let result={};
 if(m.method==='config/read')result={config};else if(m.method==='account/read')result={account:{type:'chatgpt',planType:'controlled-fixture'},requiresOpenaiAuth:false};else if(m.method==='mcpServerStatus/list')result={data:[],nextCursor:null};
 else if(m.method==='thread/start'){tools=m.params.dynamicTools??[];assert(tools.every(x=>/^[a-zA-Z0-9_-]+$/.test(x.name)));assert.equal(m.params.approvalPolicy,'never');assert.equal(m.params.sandbox,'read-only');assert.equal(m.params.ephemeral,true);current={threadId:'t1334-thread-'+scenario.kind,turnId:'t1334-turn-'+scenario.kind};result={thread:{id:current.threadId},model:'t1334-fixture-model',modelProvider:'synthetic-io'};}
 else if(m.method==='turn/start'){out({id:m.id,result:{turn:{id:current.turnId,status:'inProgress',items:[]}}});setImmediate(()=>{out({method:'turn/started',params:{threadId:current.threadId,turn:{id:current.turnId,status:'inProgress',items:[]}}});if(!visible)complete();else if(scenario.kind==='collect')request('collect.plan',{limit:20,offset:0});else if(scenario.kind==='material')request('material.search',{query:'T1334 中性素材',limit:20});else if(scenario.kind==='research')request('web.read',{url:scenario.researchUrl});else throw Error('UNBOUND_CASE');});return;}
 else if(m.method==='thread/read'){assert(current?.turn);result={thread:{id:current.threadId,turns:[current.turn]}};}else if(!['initialize','initialized','turn/interrupt'].includes(m.method))throw Error('RPC_NOT_ALLOWED '+m.method);
 if(m.id!==undefined)out({id:m.id,result});
}
readline.createInterface({input:process.stdin}).on('line',line=>{try{void handle(JSON.parse(line)).catch(e=>{audit({method:'CONTROLLED_IO_FAILURE',name:e.name,message:e.message});process.exit(2);});}catch(e){audit({method:'CONTROLLED_PARSE_FAILURE',name:e.name});process.exit(2);}});

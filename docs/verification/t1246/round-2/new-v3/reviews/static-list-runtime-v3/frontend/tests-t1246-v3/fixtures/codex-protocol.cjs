#!/usr/bin/env node
'use strict';
// 仅owned私有vendor新inode：真实ACP adapter和业务/Worker不替换；无任何官方转发或凭据读取。
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),readline=require('node:readline'),http=require('node:http');
if(process.argv.includes('--version')){process.stdout.write('codex-cli 0.159.3\n');process.exit(0);}
const markerPath=path.join(__dirname,'creatoros-t1246-fixture.json');
const marker=JSON.parse(fs.readFileSync(markerPath,'utf8'));
const root=fs.realpathSync(marker.runtimeRoot),stateRoot=fs.realpathSync(marker.stateRoot),binary=fs.realpathSync(__filename);
if(marker.profile!=='protocol'||!binary.startsWith(root+path.sep)||!stateRoot.startsWith(root+path.sep)||!root.startsWith(fs.realpathSync(require('node:os').tmpdir())+path.sep+'creatoros-playwright-t1246-protocol-')||marker.scenarioVersion!==1)throw Error('NOT_OWNED_PROTOCOL_FIXTURE');
const audit=path.join(stateRoot,'protocol-events.ndjson');
const emit=(method,detail={})=>fs.appendFileSync(audit,JSON.stringify({at:new Date().toISOString(),pid:process.pid,method,...detail})+'\n');
const reply=(id,result)=>process.stdout.write(JSON.stringify({jsonrpc:'2.0',id,result})+'\n');
const notify=(method,params)=>process.stdout.write(JSON.stringify({jsonrpc:'2.0',method,params})+'\n');
const fail=(id,message)=>process.stdout.write(JSON.stringify({jsonrpc:'2.0',id,error:{code:-32602,message}})+'\n');
const stateFile=id=>{if(!/^t1246-thread-[a-f0-9-]+$/.test(id))throw Error('FOREIGN_THREAD');return path.join(stateRoot,id+'.json');};
const write=s=>{const p=stateFile(s.threadId),tmp=p+'.'+process.pid+'.tmp';fs.writeFileSync(tmp,JSON.stringify(s,null,2)+'\n',{mode:0o600});fs.renameSync(tmp,p);};
const load=id=>JSON.parse(fs.readFileSync(stateFile(id),'utf8'));
const disabled=['apps','plugins','hooks','multi_agent','multi_agent_v2','image_generation','browser_use','computer_use','code_mode','code_mode_host','tool_suggest','shell_tool','unified_exec','view_image','skill_search','skill_mcp_dependency_install'];
let config={web_search:'disabled',features:{...Object.fromEntries(disabled.map(k=>[k,false])),omit_app_server_notification_media:false},mcp_servers:{}},mcp=null;
// 合成配置只遵原宿主args/adapter CODEX_CONFIG，不读取HOME或真实config/auth。
if(process.env.CODEX_CONFIG)config={...JSON.parse(process.env.CODEX_CONFIG)};
for(let i=0;i<process.argv.length-1;i++)if(process.argv[i]==='-c'){
 const v=process.argv[i+1];if(v==='features.image_generation=true')config.features.image_generation=true;
 if(v.startsWith('features.code_mode={'))config.features.code_mode={enabled:false,direct_only_tool_namespaces:['image_gen']};
}
const model={id:'fixture-codex',model:'fixture-codex',displayName:'明确合成协议模型',description:'仅协议夹具',isDefault:true,hidden:false,supportedReasoningEfforts:[{reasoningEffort:'medium',description:'Fixture'}],defaultReasoningEffort:'medium',inputModalities:['text','image'],supportsPersonality:false};
const thread=s=>({id:s.threadId,preview:'合成协议场景',ephemeral:false,model:'fixture-codex',modelProvider:'openai',createdAt:Math.floor(Date.now()/1000),updatedAt:Math.floor(Date.now()/1000),status:{type:'idle'},path:null,cwd:root,source:'appServer',cliVersion:'0.159.3',gitInfo:null,name:null,turns:[]});
async function mcpRequest(server,id,method,params){
 const u=new URL(server.url);if(u.hostname!=='127.0.0.1'||u.pathname!=='/mcp'||!u.port)throw Error('NON_OWNED_MCP_ADDRESS');
 const headers=server.http_headers??{};if(typeof headers.Authorization!=='string'||!headers.Authorization.startsWith('Bearer '))throw Error('MCP_HEADER_MISSING');
 const response=await fetch(u,{method:'POST',headers:{...headers,'content-type':'application/json',accept:'application/json, text/event-stream'},body:JSON.stringify({jsonrpc:'2.0',...(id==null?{}:{id}),method,...(params?{params}:{})}),signal:AbortSignal.timeout(120000)});
 const text=await response.text();if(!response.ok)throw Error('MCP_HTTP_'+response.status);if(id==null)return null;
 const obj=JSON.parse(text);if(obj.id!==id||obj.error)throw Error('MCP_RPC_REJECTED');return obj.result;
}
async function readProject(s,projectId,ordinal){
 if(!mcp)throw Error('ORIGINAL_MCP_NOT_PRESENT');
 await mcpRequest(mcp,`initialize-${s.turnId}-${ordinal}`,'initialize',{protocolVersion:'2025-03-26',capabilities:{},clientInfo:{name:'t1246-owned-protocol',version:'1'}});
 await mcpRequest(mcp,null,'notifications/initialized',{});
 const listed=await mcpRequest(mcp,`list-${s.turnId}-${ordinal}`,'tools/list',{});const tool=listed.tools?.find(t=>t.name==='context.project.detail');
 if(!tool||tool.inputSchema?.type!=='object'||!tool.inputSchema.properties?.projectId)throw Error('ORIGINAL_READ_TOOL_NOT_LISTED');
 const result=await mcpRequest(mcp,`read-${s.turnId}-${ordinal}`,'tools/call',{name:tool.name,arguments:{projectId}});
 if(result.isError===true)throw Error('ORIGINAL_READ_TOOL_ERROR');
 const outcome=JSON.parse(result.content?.find(c=>c.type==='text')?.text??'null');
 if(outcome?.status!=='ok'||outcome.sideEffect!=='none'||outcome.error!==null||outcome.data?.found!==true||outcome.data?.project?.id!==projectId)throw Error('ORIGINAL_READ_OUTCOME_MISMATCH');
 emit('mcp-read-ack',{threadId:s.threadId,turnId:s.turnId,projectId,ordinal,providerToolCallId:`read-${s.turnId}-${ordinal}`});s.mcpReads.push({ordinal,projectId,providerToolCallId:`read-${s.turnId}-${ordinal}`});write(s);
}
async function handle(q){
 if(q.id===undefined)return;emit('request',{methodName:q.method,threadId:q.params?.threadId??null});
 switch(q.method){
 case 'initialize':return reply(q.id,{userAgent:'t1246-owned-fixture/0.159.3',platformFamily:'unix',platformOs:'macos'});
 case 'config/read':return reply(q.id,{config,origins:{},layers:null});
 case 'account/read':return reply(q.id,{account:{type:'chatgpt',email:'fixture@example.invalid',planType:'plus'},requiresOpenaiAuth:false});
 case 'modelProvider/capabilities/read':return reply(q.id,{imageGeneration:true,namespaceTools:true});
 case 'model/list':return reply(q.id,{data:[model],nextCursor:null});
 case 'skills/list':return reply(q.id,{data:[],errors:[]});
 case 'mcpServerStatus/list':return reply(q.id,{data:Object.keys(config.mcp_servers??{}).map(name=>({name,runtimeStatus:'disabled',authStatus:'notLoggedIn',tools:{},resources:[],resourceTemplates:[]})),nextCursor:null});
 case 'thread/start':{
  const servers=q.params?.config?.mcp_servers??{};const entries=Object.entries(servers).filter(([name,s])=>/^creatoros-task-[A-Za-z0-9_-]{12}$/.test(name)&&s.url);if(entries.length>1)throw Error('MULTIPLE_MCP_BRIDGES');mcp=entries[0]?.[1]??null;
  if(q.params?.config)config={...config,...q.params.config};const s={schemaVersion:1,threadId:'t1246-thread-'+crypto.randomUUID(),turnId:null,scenario:null,startCount:0,readCount:0,mcpReads:[],usage:null,projectId:null,observedEof:false};write(s);
  return reply(q.id,{thread:thread(s),model:'fixture-codex',modelProvider:'openai',reasoningEffort:'medium',serviceTier:null,cwd:q.params.cwd,approvalPolicy:'on-request',approvalsReviewer:'user',sandbox:{type:'readOnly'},collaborationMode:null});
 }
 case 'turn/start':{
  const s=load(q.params.threadId);if(s.startCount!==0)throw Error('ORIGINAL_TURN_MUST_NOT_RESTART');const text=(q.params.input??[]).filter(x=>x.type==='text').map(x=>x.text).join('\n');const scenario=text.match(/T1246_PROTOCOL_SCENARIO=(text-null|text-usage|image|incomplete|missing-binding)/)?.[1],projectId=text.match(/T1246_PROTOCOL_PROJECT=([^\s]+)/)?.[1];if(!scenario||!projectId)throw Error('EXPLICIT_PROTOCOL_SCENARIO_REQUIRED');s.scenario=scenario;s.projectId=projectId;s.turnId='t1246-turn-'+crypto.randomUUID();s.startCount++;write(s);
  if(scenario!=='missing-binding')notify('turn/started',{threadId:s.threadId,turn:{id:s.turnId,status:'inProgress',items:[],error:null}});
  await readProject(s,projectId,1);
  if(scenario==='text-usage'){s.usage={inputTokens:11,outputTokens:7,totalTokens:18};notify('thread/tokenUsage/updated',{threadId:s.threadId,turnId:s.turnId,tokenUsage:{total:{...s.usage,cachedInputTokens:0,reasoningOutputTokens:0},last:{...s.usage,cachedInputTokens:0,reasoningOutputTokens:0},modelContextWindow:200000}});write(s);await readProject(s,projectId,2);}
  if(text.includes('T1246_PROTOCOL_GATE=1')){
   await new Promise((release,reject)=>{const control=http.createServer(async(req,res)=>{
    if(req.method!=='POST'||req.url!=='/release'||req.headers['x-t1246-control']!==marker.controlToken){res.writeHead(403).end();return;}
    let body='';for await(const x of req){body+=x;if(body.length>4096){res.writeHead(413).end();return;}}
    let value;try{value=JSON.parse(body);}catch{res.writeHead(400).end();return;}
    if(value.threadId!==s.threadId||value.turnId!==s.turnId||s.startCount!==1||!s.mcpReads.length||s.observedEof){res.writeHead(409).end();return;}
    // 测试控制只释放已真实inflight请求；不写身份、结果、usage或业务状态。
    emit('control-release',{threadId:s.threadId,turnId:s.turnId});res.writeHead(200,{'content-type':'application/json'}).end(JSON.stringify({released:true}),()=>{control.close(()=>release());});
   });control.requestTimeout=120000;control.headersTimeout=120000;control.once('error',reject);control.listen(0,'127.0.0.1',()=>{s.controlPort=control.address().port;write(s);emit('control-ready',{threadId:s.threadId,turnId:s.turnId,port:s.controlPort});});});
  }
  s.observedEof=true;write(s);emit('native-eof-before-turn-start-response' ,{threadId:s.threadId,turnId:s.turnId,scenario});
  // 本fixture从不响应turn/start或发turn/completed。真正退出让原RPC拒绝，不模拟宿主unknown。
  process.stdout.end(()=>process.exit(0));return;
 }
 case 'thread/read':{
  const s=load(q.params.threadId);if(!s.observedEof||q.params.includeTurns!==true)throw Error('RESTORE_REQUIRES_ORIGINAL_EOF');s.readCount++;write(s);const items=[{type:'agentMessage',id:'original-agent-'+s.turnId,phase:'final_answer',text:'这是合成协议夹具恢复的原回合结果，非官方模型生成。'}];
  if(s.scenario==='image')items.push({type:'imageGeneration',id:'original-image-'+s.turnId,status:'completed',result:'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6QmcAAAAASUVORK5CYII='});
  return reply(q.id,{thread:{...thread(s),turns:[{id:s.turnId,status:s.scenario==='incomplete'?'inProgress':'completed',items,error:null}]}});
 }
 default:return fail(q.id,'UNSUPPORTED_FIXTURE_METHOD:'+q.method);
 }
}
let chain=Promise.resolve();const lines=readline.createInterface({input:process.stdin});lines.on('line',line=>{chain=chain.then(async()=>{const q=JSON.parse(line);try{await handle(q);}catch(e){emit('fixture-rejected',{methodName:q.method,error:String(e.message)});if(q.id!==undefined)fail(q.id,String(e.message));}});});
process.stdin.on('end',()=>{void chain.finally(()=>process.exit(0));});

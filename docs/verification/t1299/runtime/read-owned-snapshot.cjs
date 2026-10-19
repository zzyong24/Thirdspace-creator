'use strict';
// T1299：仅读取已结束的T1298专用测试库副本；不载入应用、模型SDK或凭据。
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto');
const {createRequire}=require('node:module');
const root=path.resolve(__dirname,'../../../..');
const run=path.join(root,'docs/verification/t1298/browser/runs/prepared-78ec5dfefb16c9e9');
const binding=JSON.parse(fs.readFileSync(path.join(run,'binding.json'),'utf8'));
const marker=JSON.parse(fs.readFileSync(path.join(binding.ownedRoot,'owner.json'),'utf8'));
const closed=JSON.parse(fs.readFileSync(path.join(run,'strict-run-result.json'),'utf8'));
if(marker.uid!==process.getuid()||marker.task!=='T-1298'||closed.shutdown?.code!==0||closed.test?.code!==0||closed.ownedRoot!==binding.ownedRoot)throw Error('CLOSED_OWNED_TEST_ROOT_REQUIRED');
const markerSha=crypto.createHash('sha256').update(fs.readFileSync(path.join(binding.ownedRoot,'owner.json'))).digest('hex');
if(markerSha!==binding.markerSha256)throw Error('OWNER_MARKER_CHANGED');
const labels=['article-reorganize','article-correct','graphic-reorganize','graphic-correct'];
const ids=labels.map(label=>JSON.parse(fs.readFileSync(path.join(run,label+'-task.json'),'utf8')).task.id);
const scratch=fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()),'t1299-owned-snapshot-'));
fs.chmodSync(scratch,0o700);
const copy=path.join(scratch,'pglite');
fs.cpSync(path.join(binding.ownedRoot,'pglite'),copy,{recursive:true,errorOnExist:true,force:false});
const {PGlite}=createRequire(path.join(root,'backend/package.json'))('@electric-sql/pglite');
const bytes=x=>Buffer.byteLength(typeof x==='string'?x:JSON.stringify(x??null),'utf8');
async function bounded(work,label){let timer;try{return await Promise.race([work,new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error(label+'_OBSERVATION_ENDED')),120000);})]);}finally{clearTimeout(timer);}}
async function main(){
 const out={sourceRun:path.relative(root,run),sourceHead:binding.sourceHead,ownerVerified:true,shutdownVerified:true,originalDbOpened:false,scratch,readOnlyTransaction:false,taskIds:ids,rows:[]};
 const db=new PGlite(copy);
 try{
  await bounded(db.waitReady,'DB_OPEN');
  await bounded(db.exec('BEGIN READ ONLY'),'READ_ONLY_BEGIN');out.readOnlyTransaction=true;
  const tasks=(await bounded(db.query('SELECT id,owner_id,created_at,updated_at,payload FROM execution_tasks WHERE id = ANY($1::text[]) ORDER BY created_at',[ids]),'FOUR_TASKS_READ')).rows;
  for(const t of tasks){
   const input=t.payload.modelInput,tools=input.tools??[];
   const row={label:labels[ids.indexOf(t.id)],id:t.id,createdAt:t.created_at,updatedAt:t.updated_at,payloadUtf8Bytes:bytes(t.payload),input:{systemUtf8Bytes:bytes(input.system),systemCharacters:input.system?.length,messagesUtf8Bytes:bytes(input.messages),messageCount:input.messages?.length,toolsUtf8Bytes:bytes(tools),toolCount:tools.length,tools:tools.map(x=>({name:x.name,descriptionBytes:bytes(x.description),parametersBytes:bytes(x.parameters),totalBytes:bytes(x)})).sort((a,b)=>b.totalBytes-a.totalBytes),messageShape:input.messages.map(m=>({role:m.role,bytes:bytes(m),contentType:typeof m.content,partTypes:Array.isArray(m.content)?m.content.map(p=>p.type):[]})),contextPolicyVersion:input.contextPolicyVersion},calls:[],streamSummary:[],businessTiming:[]};
   const calls=(await bounded(db.query('SELECT id,sequence,kind,status,parent_call_id,created_at,updated_at,usage,total_tokens,result_text,provider_result FROM execution_calls WHERE execution_task_id=$1 ORDER BY sequence',[t.id]),'CALLS_READ')).rows;
   row.calls=calls.map(c=>({id:c.id,sequence:c.sequence,kind:c.kind,status:c.status,parentCallId:c.parent_call_id,createdAt:c.created_at,updatedAt:c.updated_at,usage:c.usage,totalTokens:c.total_tokens,resultUtf8Bytes:bytes(c.result_text),providerResultUtf8Bytes:bytes(c.provider_result),toolName:c.provider_result?.toolName??null,protocolKind:c.provider_result?.protocolKind??null,providerUsage:c.provider_result?.usage??null}));
   row.streamSummary=(await bounded(db.query("SELECT sequence,call_id,call_index,created_at,chunk->>'type' AS type,chunk->>'toolName' AS tool_name,octet_length(chunk::text) AS bytes FROM execution_stream_events WHERE execution_task_id=$1 ORDER BY sequence",[t.id]),'STREAM_READ')).rows;
   row.businessTiming=(await bounded(db.query('SELECT id,status,requested_at,started_at,model_call_started_at,completed_at FROM ai_tasks WHERE id=$1',[t.owner_id]),'BUSINESS_TIMING_READ')).rows;
   out.rows.push(row);
  }
  await bounded(db.exec('ROLLBACK'),'ROLLBACK');out.rolledBack=true;
 }catch(error){out.failure={name:error.name,message:error.message};throw error;}
 finally{
  try{await bounded(db.close(),'DB_CLOSE');out.closed=true;}finally{
   out.observedAt=new Date().toISOString();fs.writeFileSync(path.join(__dirname,'owned-snapshot-summary.json'),JSON.stringify(out,null,2)+'\n',{mode:0o600});
  }
 }
 console.log(JSON.stringify({readOnly:out.readOnlyTransaction,tasks:out.rows.length,closed:out.closed,output:'docs/verification/t1299/runtime/owned-snapshot-summary.json'}));
}
main().catch(error=>{console.error(error.message);process.exitCode=1;});

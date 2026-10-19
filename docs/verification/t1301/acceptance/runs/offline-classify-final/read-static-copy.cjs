'use strict';
// 仅恢复并读取已静止完整副本；原库143且未证flush，不载入应用/迁移/凭据。
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {createRequire}=require('node:module');
const repo=process.cwd(),outDir=__dirname;
const binding=JSON.parse(fs.readFileSync(path.join(outDir,'SNAPSHOT_BINDING.json'),'utf8'));
const closed=JSON.parse(fs.readFileSync(path.join(outDir,'SHUTDOWN_CHECK.json'),'utf8'));
if(!closed.allKnownProcessesEnded||!closed.listenerAbsent||!closed.allDatabaseHandlesAbsent||!binding.stableObservationsEqual||!binding.originalBeforeAfterCopyEqual||!binding.copyRoot.startsWith('/private/tmp/t1301-offline-')||binding.copyDb!==path.join(binding.copyRoot,'db')||binding.copyDb===binding.originalDb)throw Error('STATIC_OWNED_COPY_REQUIRED');
const {PGlite}=createRequire(path.join(repo,'backend/package.json'))('@electric-sql/pglite');
async function bounded(work,label){let timer;try{return await Promise.race([work,new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error(label+'_OBSERVATION_ENDED')),120000);})]);}finally{clearTimeout(timer);}}
const result={originalOpened:false,originalExit:143,originalGracefulFlushProven:false,mode:'静止副本自然恢复一致性取证',scope:binding.queryScope,queries:[],rows:{},readOnly:false,rolledBack:false,closed:false};
async function main(){
 const db=new PGlite(binding.copyDb);
 try{
  await bounded(db.waitReady,'COPY_RECOVERY');
  await bounded(db.exec('BEGIN READ ONLY'),'BEGIN_READ_ONLY');result.readOnly=true;
  const q=async(name,sql,args)=>{result.queries.push({name,sql,parameters:args});result.rows[name]=(await bounded(db.query(sql,args),name)).rows;};
  const s=binding.queryScope;
  await q('execution',`SELECT id,group_id,kind,owner_type,owner_id,status,attempt,last_error_code,created_at,updated_at,
   payload->'modelInput'->>'kind' AS input_kind,payload->'modelInput'->>'skillId' AS skill_id,payload->'modelInput'->>'capability' AS capability,
   payload->'executionRoute'->>'schemaVersion' AS route_schema,
   payload->'executionRoute'->'routes'->'vision:asset.classify'->>'source' AS vision_source,
   payload->'executionRoute'->'routes'->'vision:asset.classify'->'identity'->>'protocolKind' AS vision_protocol,
   payload->'executionRoute'->'routes'->'vision:asset.classify'->'identity'->>'runtimeVersion' AS vision_runtime,
   payload->'executionRoute'->'routes'->'vision:asset.classify'->'identity'->>'requestedModel' AS vision_requested_model,
   payload->'modelIdentity'->>'engine' AS pinned_engine,payload->'modelIdentity'->>'protocolKind' AS pinned_protocol,
   payload->'modelIdentity'->>'runtimeVersion' AS pinned_runtime,payload->'modelIdentity'->>'requestedModel' AS pinned_requested_model,
   payload->'modelIdentity'->>'capability' AS pinned_capability
   FROM execution_tasks WHERE id=$1 AND group_id=$2 AND owner_id=$3`,[s.execution,s.group,s.task]);
  await q('businessTask','SELECT id,execution_task_id,group_id,status,requested_at,started_at,model_call_started_at,completed_at FROM ai_tasks WHERE id=$1 AND execution_task_id=$2 AND group_id=$3',[s.task,s.execution,s.group]);
  await q('calls','SELECT id,sequence,kind,status,parent_call_id,rejection_code,total_tokens,created_at,updated_at FROM execution_calls WHERE execution_task_id=$1 ORDER BY sequence LIMIT 16',[s.execution]);
  await q('nativeCallIdentity',`SELECT c.id AS call_id,c.status AS call_status,n.value->>'threadId' AS thread_id,n.value->>'turnId' AS turn_id,
   n.value->'modelFacts'->>'model' AS actual_model,n.value->'modelFacts'->>'modelProvider' AS actual_provider
   FROM execution_tasks t CROSS JOIN LATERAL jsonb_each(COALESCE(t.payload->'codexCalls','{}'::jsonb)) n
   JOIN execution_calls c ON c.id=n.key AND c.execution_task_id=t.id
   WHERE t.id=$1 AND t.group_id=$2 ORDER BY c.sequence LIMIT 16`,[s.execution,s.group]);
  await q('assetFile',`SELECT a.id AS asset_id,a.group_id,a.current_file_id,a.description,f.id AS file_id,f.asset_id AS file_asset_id,f.checksum,f.mime_type,f.file_size,
   f.media_metadata->>'aiDescription' AS file_ai_description
   FROM assets a JOIN asset_files f ON f.asset_id=a.id AND f.id=a.current_file_id
   WHERE a.id=$1 AND f.id=$2 AND a.group_id=$3`,[s.asset,s.file,s.group]);
  await q('tags',`SELECT t.name,t.kind FROM entity_tags e JOIN tags t ON t.id=e.tag_id AND t.user_id=e.user_id
   JOIN assets a ON a.id=e.entity_id AND a.user_id=e.user_id
   WHERE e.entity_id=$1 AND a.group_id=$2 ORDER BY t.name`,[s.asset,s.group]);
  if(result.rows.execution.length!==1||result.rows.businessTask.length!==1||result.rows.assetFile.length!==1)throw Error('EXACT_BOUND_ROWS_REQUIRED');
  await bounded(db.exec('ROLLBACK'),'ROLLBACK');result.rolledBack=true;
 }catch(e){result.failure={name:e.name,message:e.message};throw e;}
 finally{try{await bounded(db.close(),'CLOSE_COPY');result.closed=true;}finally{result.observedAt=new Date().toISOString();fs.writeFileSync(path.join(outDir,'READ_ONLY_RESULT.json'),JSON.stringify(result,null,2)+'\n',{mode:0o600});}}
 console.log(JSON.stringify({readOnly:result.readOnly,rolledBack:result.rolledBack,closed:result.closed,rowCounts:Object.fromEntries(Object.entries(result.rows).map(([k,v])=>[k,v.length]))}));
}
main().catch(e=>{console.error(e.message);process.exitCode=1;});

import {createHash} from 'node:crypto';
import {and,eq,inArray,sql} from 'drizzle-orm';
import type {Db} from '../../db';
import type {RequestContext} from '@creatoros/contract';
import {accountGroups,accountGroupMigrations} from '../../schema/account-groups';
import {resourceAccessGrants,resourceAccessGrantUses} from '../../schema/resource-access';
import {OwnershipError,ConflictError,ValidationError} from './platform-account.errors';
type Tx=Parameters<Parameters<Db['transaction']>[0]>[0];
type Store=Db|Tx;type Row=Record<string,unknown>;
type RecordImage={table:string;row:Row};
export interface GroupMigrationSelection {fromGroupId:string;toGroupId:string;projectIds:string[];knowledgeIds:string[];conversationIds:string[];}
const digest=(value:unknown)=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const terminal=new Set(['succeeded','failed','cancelled','partial']);
const frozenTables=new Set(['ai_tasks','execution_tasks','scheduled_job','job_run','account_group_migrations','account_group_commands']);
const sorted=(ids:string[])=>[...new Set(ids)].sort();
// 这两张真实发布明细表没有id，必须用原生主键/唯一键定位，不能制造行ID。
const compositeKeys:Record<string,string[]>={publication_traffic:['publication_id'],publication_sync_state:['user_id','account_id','publication_id','capability']};
const rowKey=(table:string,row:Row)=>JSON.stringify((compositeKeys[table]??['id']).map(key=>row[key]));
const rowWhere=(table:string,row:Row)=>sql.join((compositeKeys[table]??['id']).map(key=>sql`${sql.identifier(key)}=${String(row[key])}`),sql` AND `);
const relations:Record<string,[string,string]>={
 project_stages:['project_id','projects'],project_target_platforms:['project_id','projects'],project_activities:['project_id','projects'],content_outputs:['project_id','projects'],tasks:['project_id','projects'],output_stages:['content_output_id','content_outputs'],material_links:['project_id','projects'],
 publications:['content_output_id','content_outputs'],publication_revisions:['publication_id','publications'],metric_snapshots:['publication_id','publications'],metric_values:['metric_snapshot_id','metric_snapshots'],audience_snapshots:['publication_id','publications'],retention_points:['publication_id','publications'],publication_traffic:['publication_id','publications'],publication_sync_state:['publication_id','publications'],topic_attributions:['publication_id','publications'],
 artifacts:['project_id','projects'],artifact_versions:['artifact_id','artifacts'],script_sections:['artifact_version_id','artifact_versions'],thesis_points:['artifact_version_id','artifact_versions'],evidence_items:['artifact_version_id','artifact_versions'],timeline_segments:['artifact_version_id','artifact_versions'],
 productions:['content_output_id','content_outputs'],production_segments:['production_id','productions'],segment_assets:['production_segment_id','production_segments'],export_records:['production_id','productions'],
 reviews:['project_id','projects'],review_insights:['review_id','reviews'],review_publications:['review_id','reviews'],learnings:['project_id','projects'],learning_applications:['learning_id','learnings'],
 calibration_results:['prediction_id','predictions'],knowledge_revisions:['knowledge_item_id','knowledge_items'],ai_messages:['conversation_id','ai_conversations'],
};
function strings(value:unknown,out:Set<string>){if(typeof value==='string')out.add(value);else if(Array.isArray(value))for(const x of value)strings(x,out);else if(value&&typeof value==='object')for(const x of Object.values(value))strings(x,out);}
function assertSourceContext(ctx:RequestContext,groupId:string){if(!ctx.groupId||ctx.groupId!==groupId)throw new OwnershipError('请在来源账号组中操作归组资料');}
// 只收集真实外键列、JSON中的协议ID；不解释标题/正文，也不做相似度判断。
function referenceIds(row:Row):Set<string>{const out=new Set<string>();for(const[key,value]of Object.entries(row)){if(key.endsWith('_id')&&typeof value==='string')out.add(value);else if(value&&typeof value==='object')strings(value,out);}return out;}
/** SEMANTIC_BOUNDARY_ALLOW: 仅按真实外键/ID构建用户明确选中的资料闭包与授权引用，不判断内容语义、不按昵称合组。 */
export function createGroupMigrationService({db,now,nextId,observePhase}:{db:Db;now:()=>string;nextId:(p:string)=>string;observePhase?:(phase:'apply:validated'|'undo:validated')=>Promise<void>}){
 async function group(store:Store,ctx:RequestContext,id:string){const [g]=await store.select().from(accountGroups).where(and(eq(accountGroups.id,id),eq(accountGroups.userId,ctx.userId)));if(!g)throw new OwnershipError('账号组不存在');return g;}
 async function catalog(store:Store){const r=await store.execute<{table_name:string;column_name:string}>(sql`SELECT table_name,column_name FROM information_schema.columns WHERE table_schema='public' ORDER BY table_name,ordinal_position`);const map=new Map<string,Set<string>>();for(const row of r.rows){if(!map.has(row.table_name))map.set(row.table_name,new Set());map.get(row.table_name)!.add(row.column_name);}return map;}
 async function rows(store:Store,table:string,field:string,ids:string[],owner?:string){if(!ids.length)return[];const r=await store.execute<{row:Row}>(sql`SELECT to_jsonb(t) AS row FROM ${sql.identifier(table)} t WHERE ${sql.identifier(field)} IN (${sql.join(ids.map(x=>sql`${x}`),sql`,`)}) ${owner?sql`AND user_id=${owner}`:sql``} ORDER BY to_jsonb(t)::text`);return r.rows.map(x=>x.row);}
 async function build(store:Store,ctx:RequestContext,selection:GroupMigrationSelection){
  assertSourceContext(ctx,selection.fromGroupId);
  const body={...selection,projectIds:sorted(selection.projectIds),knowledgeIds:sorted(selection.knowledgeIds),conversationIds:sorted(selection.conversationIds)};
  if(body.fromGroupId===body.toGroupId)throw new ValidationError('请选择另一个账号组');
  if(!body.projectIds.length&&!body.knowledgeIds.length&&!body.conversationIds.length)throw new ValidationError('请选择要归组的资料');
  const [from,to]=await Promise.all([group(store,ctx,body.fromGroupId),group(store,ctx,body.toGroupId)]);
  if(from.status!=='active'||to.status!=='active')throw new ValidationError('请先恢复账号组，再归组资料');
  const columns=await catalog(store);const selected=new Map<string,Row[]>();
  const requiredKnowledgeIds=new Set<string>();
  async function add(table:string,field:string,ids:string[]){if(!columns.has(table)||!columns.get(table)!.has(field))return false;const found=await rows(store,table,field,ids);if(found.some(row=>row.user_id!==undefined&&row.user_id!==ctx.userId))throw new OwnershipError('关联资料不属于当前用户');const old=selected.get(table)??[];const byId=new Map(old.map(r=>[rowKey(table,r),r]));for(const r of found)byId.set(rowKey(table,r),r);selected.set(table,[...byId.values()].sort((a,b)=>rowKey(table,a).localeCompare(rowKey(table,b))));return byId.size!==old.length;}
  for(const [table,ids]of [['projects',body.projectIds],['knowledge_items',body.knowledgeIds],['ai_conversations',body.conversationIds]] as const){await add(table,'id',ids);const found=selected.get(table)??[];if(found.length!==ids.length||found.some(r=>r.user_id!==ctx.userId||r.group_id!==from.id))throw new OwnershipError('资料不属于来源账号组');}
  // 知识目录是父授权链；移目录时所有原组知识必须显式补选，不能留断链。
  let folderIds=(selected.get('knowledge_items')??[]).flatMap(r=>typeof r.folder_id==='string'?[r.folder_id]:[]);
  while(folderIds.length){await add('knowledge_folders','id',folderIds);for(const id of folderIds)if(!(selected.get('knowledge_folders')??[]).some(r=>r.id===id))throw new OwnershipError('知识目录不存在或不属于当前用户');folderIds=(selected.get('knowledge_folders')??[]).flatMap(r=>typeof r.parent_id==='string'?[r.parent_id]:[]).filter(id=>!(selected.get('knowledge_folders')??[]).some(r=>r.id===id));}
  let folderChanged=true;while(folderChanged){folderChanged=await add('knowledge_folders','parent_id',(selected.get('knowledge_folders')??[]).map(r=>String(r.id)));}
  if((selected.get('knowledge_folders')??[]).some(r=>r.group_id!==from.id))throw new ConflictError('知识目录归属与来源账号组不一致，请先修复');
  const folderNotes=await rows(store,'knowledge_items','folder_id',(selected.get('knowledge_folders')??[]).map(r=>String(r.id)));
  for(const note of folderNotes){if(note.user_id!==ctx.userId)throw new OwnershipError('知识目录包含其它用户笔记');if(note.group_id!==from.id)throw new ConflictError('知识目录包含其它组笔记，请先修复归属');if(!body.knowledgeIds.includes(String(note.id)))requiredKnowledgeIds.add(String(note.id));}
  // 子表继承归属，不改ID；软外键通过同一闭包逐层展开。
  let changed=true;while(changed){changed=false;for(const[table,[field,parent]]of Object.entries(relations))changed=await add(table,field,(selected.get(parent)??[]).map(r=>String(r.id)))||changed;
   for(const field of ['source_artifact_id','target_artifact_id'])changed=await add('artifact_relations',field,(selected.get('artifacts')??[]).map(r=>String(r.id)))||changed;
   for(const field of ['source_knowledge_id','target_knowledge_id'])changed=await add('knowledge_relations',field,(selected.get('knowledge_items')??[]).map(r=>String(r.id)))||changed;
   const outputs=new Set((selected.get('content_outputs')??[]).map(r=>r.id));const pubs=new Set((selected.get('publications')??[]).map(r=>r.id));
   const subjects=[...outputs,...pubs].map(String);changed=await add('predictions','subject_id',subjects)||changed;
   // 已有project_id的相邻共享表继承项目；执行任务保持创建时冻结值。
   for(const[table,cols]of columns)if(cols.has('id')&&cols.has('project_id')&&!frozenTables.has(table))changed=await add(table,'project_id',body.projectIds)||changed;
  }
  const requiredProjects=new Set<string>();
  for(const rows of selected.values())for(const r of rows){if(typeof r.project_id==='string'&&!body.projectIds.includes(r.project_id))requiredProjects.add(r.project_id);}
  const relatedArtifacts=await rows(store,'artifacts','id',(selected.get('artifact_relations')??[]).flatMap(r=>[String(r.source_artifact_id),String(r.target_artifact_id)]));
  for(const r of relatedArtifacts){if(r.user_id!==ctx.userId)throw new OwnershipError('关联产物不属于当前用户');if(r.group_id===from.id&&!body.projectIds.includes(String(r.project_id)))requiredProjects.add(String(r.project_id));}
  const relatedKnowledge=await rows(store,'knowledge_items','id',(selected.get('knowledge_relations')??[]).flatMap(r=>[String(r.source_knowledge_id),String(r.target_knowledge_id)]));
  for(const r of relatedKnowledge){if(r.user_id!==ctx.userId)throw new OwnershipError('关联知识不属于当前用户');if(r.group_id===from.id&&!body.knowledgeIds.includes(String(r.id)))requiredKnowledgeIds.add(String(r.id));}
  // 复盘不可断开关联Publication；需要的另一项目进入预览，用户必须显式补选。
  // 复盘边可指向另一项目；publication是由对应project闭包进入，不能单独暗搬。
  const extraOutputs=await rows(store,'content_outputs','id',(selected.get('publications')??[]).map(r=>String(r.content_output_id)));
  for(const r of extraOutputs)if(!body.projectIds.includes(String(r.project_id)))requiredProjects.add(String(r.project_id));
  // execution_tasks用owner_id/payload，不存在project_id；经AI任务的执行映射也纳入。
  const entityIds=new Set([...selected.values()].flatMap(list=>list.flatMap(r=>typeof r.id==='string'?[r.id]:[])));
  const relatedAiIds=new Set<string>();
  if(columns.has('ai_tasks')){
   const ai=await store.execute<{row:Row}>(sql`SELECT to_jsonb(t) AS row FROM ai_tasks t WHERE user_id=${ctx.userId}`);
   const linked=await store.execute<{ai_task_id:string}>(sql`SELECT r.ai_task_id FROM ai_task_references r JOIN ai_tasks t ON t.id=r.ai_task_id WHERE t.user_id=${ctx.userId} AND r.entity_id IN (${sql.join([...entityIds].map(id=>sql`${id}`),sql`,`)})`);
   const linkedAiIds=new Set(linked.rows.map(r=>r.ai_task_id));
   for(const {row:task}of ai.rows)if(linkedAiIds.has(String(task.id))||[...referenceIds(task)].some(id=>entityIds.has(id))){relatedAiIds.add(String(task.id));if(!terminal.has(String(task.status)))throw new ConflictError('所选资料仍有在途AI任务，请完成或取消后再归组');}
  }
  if(columns.has('execution_tasks')){
   const execution=await store.execute<{row:Row}>(sql`SELECT to_jsonb(t) AS row FROM execution_tasks t WHERE user_id=${ctx.userId} AND status NOT IN ('succeeded','failed','cancelled','partial')`);
   for(const {row:task}of execution.rows)if(entityIds.has(String(task.owner_id))||relatedAiIds.has(String(task.owner_id))||[...referenceIds(task)].some(id=>entityIds.has(id)||relatedAiIds.has(id)))throw new ConflictError('所选资料仍有在途执行任务，请完成或取消后再归组');
  }
  const images:RecordImage[]=[];for(const[table,list]of [...selected].sort(([a],[b])=>a.localeCompare(b)))for(const row of list){if(row.user_id!==undefined&&row.user_id!==ctx.userId)throw new OwnershipError('资料包含其它用户引用');if(row.group_id!==undefined&&row.group_id!==null&&row.group_id!==from.id)throw new ConflictError('资料包含未选中的其它组依赖');images.push({table,row});}
  // SEMANTIC_BOUNDARY_ALLOW: 只检查数据库外键和公开结构协议的活引用；不解释任意正文string。
  // asset/knowledge由下面的显式grant处理，AI/采集run历史仅保留freeze，不重新归组。
  const imageIds=new Set(images.map(image=>`${image.table}:${String(image.row.id)}`));
  const checked=new Set<string>();
  async function live(table:string,id:unknown,label:string):Promise<void>{
   if(typeof id!=='string'||!id)return;
   const key=`${table}:${id}`;if(imageIds.has(key)||checked.has(key))return;checked.add(key);
   const [root]=await rows(store,table,'id',[id]);
   if(!root)throw new ConflictError(`关联${label}不存在，请先修复引用`);
   if(root.user_id!==undefined&&root.user_id!==ctx.userId)throw new OwnershipError(`关联${label}不属于当前用户`);
   // 项目附属根可以补选其来源项目；不能将另一项目的一个子项暗搬过来。
   const parentField:Record<string,[string,string]>={content_outputs:['project_id','projects'],artifacts:['project_id','projects'],reviews:['project_id','projects'],artifact_versions:['artifact_id','artifacts'],script_sections:['artifact_version_id','artifact_versions'],production_segments:['production_id','productions'],productions:['content_output_id','content_outputs'],publications:['content_output_id','content_outputs']};
   if(table==='projects'){
    if(root.group_id===body.toGroupId)return;
    if(root.group_id===body.fromGroupId){requiredProjects.add(id);return;}
    throw new ConflictError('关联项目仍属于其它账号组，请先修复依赖');
   }
   const parent=parentField[table];
   if(parent){await live(parent[1],root[parent[0]],'项目资料');return;}
   if(table==='learnings'&&typeof root.project_id==='string'){await live('projects',root.project_id,'经验来源项目');await live('reviews',root.review_id,'经验来源复盘');return;}
   // 独立共享根只能是同用户、已属目标组的真实可读根；不发放新的隐式授权。
   if(root.group_id!==body.toGroupId)throw new ConflictError(`关联${label}仍属于来源或其它账号组，目标组无法读取；请先处理该依赖`);
   if(table==='learnings')await live('reviews',root.review_id,'经验来源复盘');
   if(table==='candidates'){
    const card=root.card&&typeof root.card==='object'?root.card as Row:{};
    for(const reference of Array.isArray(card.sourceReferences)?card.sourceReferences:[])if(reference&&typeof reference==='object')await live('intelligence_items',(reference as Row).intelligenceItemId,'选题雷达作品');
    const draft=card.adaptedDraft&&typeof card.adaptedDraft==='object'?card.adaptedDraft as Row:{};await live('positioning_statements',draft.positioningVersionId,'选题定位版本');
   }
   if(table==='rubric_versions')await live('rubrics',root.rubric_id,'校准量表');
   if(table==='positioning_statements')await live('creator_profiles',root.profile_id,'定位母版');
   if(table==='intelligence_source_snapshots'){
    await live('intelligence_sources',root.source_id,'雷达来源');await live('intelligence_items',root.item_id,'雷达作品');
   }
   if(table==='intelligence_sources')await live('intelligence_collections',root.collection_id,'雷达分类');
   if(table==='intelligence_transforms'){
    await live('intelligence_items',root.item_id,'雷达作品');await live('intelligence_source_snapshots',root.source_snapshot_id,'雷达快照');await live('positioning_statements',root.positioning_version_id,'定位版本');await live('candidates',root.target_topic_id,'拆写选题');
   }
  }
  const liveFields:Record<string,Record<string,[string,string]>>={
   project_intelligence_references:{topic_id:['candidates','选题'],item_id:['intelligence_items','雷达作品'],source_snapshot_id:['intelligence_source_snapshots','雷达快照'],transform_id:['intelligence_transforms','雷达拆写']},
   predictions:{rubric_version_id:['rubric_versions','校准量表版本']},
   learning_applications:{learning_id:['learnings','经验']},learnings:{review_id:['reviews','经验来源复盘']},
   reviews:{report_artifact_id:['artifacts','复盘报告'],content_output_id:['content_outputs','复盘稿件']},
   artifacts:{content_output_id:['content_outputs','关联稿件']},production_segments:{script_section_id:['script_sections','脚本章节']},
   content_calendar_entries:{candidate_id:['candidates','排期选题'],content_output_id:['content_outputs','排期稿件']},
   topic_promotions:{candidate_id:['candidates','立项选题']},topic_proposal_feedback:{positioning_version_id:['positioning_statements','选题定位版本']},
   review_publications:{publication_id:['publications','复盘发布作品']},
  };
  const object=(value:unknown):Row=>value&&typeof value==='object'&&!Array.isArray(value)?value as Row:{};
  const activityTypes:Record<string,[string,string]>={project:['projects','项目'],content_output:['content_outputs','稿件'],artifact:['artifacts','产物'],artifact_version:['artifact_versions','产物版本'],review:['reviews','复盘'],learning:['learnings','经验'],candidate:['candidates','选题'],topic:['candidates','选题'],intelligence_item:['intelligence_items','雷达作品'],rubric:['rubrics','校准量表'],rubric_version:['rubric_versions','校准量表版本'],positioning_statement:['positioning_statements','定位版本']};
  for(const image of images){
   for(const[field,[table,label]]of Object.entries(liveFields[image.table]??{}))await live(table,image.row[field],label);
   if(image.table==='projects'){
    const evidence=object(object(image.row.brief_detail).contentRadarEvidence);
    await live('intelligence_source_snapshots',evidence.sourceSnapshotId,'雷达快照');
    await live('positioning_statements',evidence.positioningVersionId,'定位版本');
    await live('positioning_statements',object(evidence.adaptedDraftSeed).positioningVersionId,'定位版本');
    for(const reference of Array.isArray(evidence.sourceReferences)?evidence.sourceReferences:[])await live('intelligence_items',object(reference).intelligenceItemId,'雷达作品');
   }
   if(image.table==='project_activities'){
    const target=activityTypes[String(image.row.entity_type)];if(target)await live(target[0],image.row.entity_id,target[1]);
   }
  }
  // 待采纳校准建议是独立共享工作；不能随其来源经验搬走或留下不可读的活引用。
  const learningIds=(selected.get('learnings')??[]).map(row=>String(row.id));
  for(const suggestion of await rows(store,'calibration_rule_suggestions','learning_id',learningIds,ctx.userId))if(suggestion.status==='pending'){
   if(suggestion.group_id!==body.toGroupId)throw new ConflictError('来源经验仍有待采纳校准建议，请先处理该独立依赖');
   await live('rubrics',suggestion.rubric_id,'校准建议量表');
  }
  const literalIds=new Set<string>();for(const image of images)for(const id of referenceIds(image.row))literalIds.add(id);
  const files=[...await rows(store,'asset_files','id',[...literalIds]),...await rows(store,'asset_files','storage_key',[...literalIds])];
  for(const file of files)literalIds.add(String(file.asset_id));
  for(const revision of await rows(store,'knowledge_revisions','id',[...literalIds]))literalIds.add(String(revision.knowledge_item_id));
  const grants:Array<{resourceType:'asset'|'knowledge';resourceId:string;originGroupId:string}>=[];
  for(const[table,type]of [['assets','asset'],['knowledge_items','knowledge']] as const){const found=await rows(store,table,'id',[...literalIds]);for(const r of found){if(r.user_id!==ctx.userId)throw new OwnershipError('引用资源不属于当前用户');if(r.group_id===to.id)continue;if(selected.get(table)?.some(x=>x.id===r.id))continue;if(!r.group_id)throw new ConflictError('引用资源尚未完成旧数据归组');if(r.status==='deleted'||r.archived_at)throw new ConflictError('引用资源已删除或归档，请先修复引用');grants.push({resourceType:type,resourceId:String(r.id),originGroupId:String(r.group_id)});}}
  // 知识项带的资产也必须纳入明确授权，保持文件原storageKey。
  for(const item of selected.get('knowledge_items')??[])if(typeof item.asset_id==='string'){const [a]=await rows(store,'assets','id',[item.asset_id],ctx.userId);if(!a)throw new OwnershipError('知识引用素材不存在');if(!grants.some(g=>g.resourceType==='asset'&&g.resourceId===a.id)&&a.group_id!==to.id)grants.push({resourceType:'asset',resourceId:String(a.id),originGroupId:String(a.group_id)});}
  grants.sort((a,b)=>(a.resourceType+a.resourceId).localeCompare(b.resourceType+b.resourceId));
  const plan={body,fromVersion:from.version,toVersion:to.version,images,grants,requiredProjectIds:[...requiredProjects].sort(),requiredKnowledgeIds:[...requiredKnowledgeIds].sort()};
  return {...plan,digest:digest(plan)};
 }
 function view(plan:Awaited<ReturnType<typeof build>>){const counts:Record<string,number>={};for(const x of plan.images)counts[x.table]=(counts[x.table]??0)+1;return {fromGroupId:plan.body.fromGroupId,toGroupId:plan.body.toGroupId,digest:plan.digest,projects:plan.images.filter(x=>x.table==='projects').map(x=>({id:String(x.row.id),title:String(x.row.title)})),counts,grants:plan.grants,requiredProjectIds:plan.requiredProjectIds,requiredKnowledgeIds:plan.requiredKnowledgeIds,sourceVersion:plan.fromVersion,targetVersion:plan.toVersion};}
 async function lockGroups(tx:Tx,ctx:RequestContext,ids:string[]){await tx.select().from(accountGroups).where(and(eq(accountGroups.userId,ctx.userId),inArray(accountGroups.id,sorted(ids)))).orderBy(accountGroups.id).for('update');}
 // 父根在前，真实复合键在后；所有写入遵循group→parent的同事务锁顺序。
 function imageDepth(table:string,seen=new Set<string>()):number{if(seen.has(table))return 0;seen.add(table);const parent=relations[table]?.[1];return parent?1+imageDepth(parent,seen):0;}
 async function lockImages(tx:Tx,images:RecordImage[]){
  const ordered=[...images].sort((a,b)=>imageDepth(a.table)-imageDepth(b.table)||a.table.localeCompare(b.table)||rowKey(a.table,a.row).localeCompare(rowKey(b.table,b.row)));
  for(const x of ordered)await tx.execute(sql`SELECT 1 FROM ${sql.identifier(x.table)} WHERE ${rowWhere(x.table,x.row)} FOR UPDATE`);
 }
 async function lockedPlan(tx:Tx,ctx:RequestContext,body:GroupMigrationSelection){
  await lockImages(tx,[...body.projectIds.map(id=>({table:'projects',row:{id}})),...body.knowledgeIds.map(id=>({table:'knowledge_items',row:{id}})),...body.conversationIds.map(id=>({table:'ai_conversations',row:{id}}))]);
  let plan=await build(tx,ctx,body);const locked=new Set<string>();
  while(true){
   const fresh=plan.images.filter(x=>!locked.has(`${x.table}:${rowKey(x.table,x.row)}`));
   if(!fresh.length)return plan;
   await lockImages(tx,fresh);for(const x of fresh)locked.add(`${x.table}:${rowKey(x.table,x.row)}`);
   // READ COMMITTED等锁返回后重新读真正行、引用与digest；绝不复用锁前镜像。
   plan=await build(tx,ctx,body);
  }
 }
 async function reassign(tx:Tx,images:RecordImage[],groupId:string){for(const x of images)if(Object.hasOwn(x.row,'group_id'))await tx.execute(sql`UPDATE ${sql.identifier(x.table)} SET group_id=${groupId} WHERE ${rowWhere(x.table,x.row)}`);}
 const result=(r:typeof accountGroupMigrations.$inferSelect)=>({id:r.id,fromGroupId:r.fromGroupId,toGroupId:r.toGroupId,status:r.status as 'applied'|'undone',createdAt:r.createdAt,undoneAt:r.undoneAt});
 return {
  async preview(ctx:RequestContext,body:GroupMigrationSelection){return view(await build(db,ctx,body));},
  async apply(ctx:RequestContext,input:GroupMigrationSelection&{digest:string;idempotencyKey:string}){
   assertSourceContext(ctx,input.fromGroupId);
   const {digest:expected,idempotencyKey:key,...body}=input;const inputHash=digest(input);
   return db.transaction(async tx=>{
    await lockGroups(tx,ctx,[body.fromGroupId,body.toGroupId]);
    const [memo]=await tx.select().from(accountGroupMigrations).where(and(eq(accountGroupMigrations.userId,ctx.userId),eq(accountGroupMigrations.key,key)));
    if(memo){if(memo.inputHash!==inputHash)throw new ConflictError('同次提交内容已改变');return result(memo);}
    const plan=await lockedPlan(tx,ctx,body);if(plan.digest!==expected)throw new ConflictError('归组预览已过期，请重新预览');if(plan.requiredProjectIds.length||plan.requiredKnowledgeIds.length)throw new ConflictError('请先补选关联项目或知识笔记，保持完整资料闭包');
    await observePhase?.('apply:validated');
    const id=nextId('group_migration');await reassign(tx,plan.images,body.toGroupId);
    for(const g of plan.grants)await tx.insert(resourceAccessGrants).values({id:nextId('grant'),userId:ctx.userId,targetGroupId:body.toGroupId,resourceType:g.resourceType,resourceId:g.resourceId,originGroupId:g.originGroupId,migrationId:id,createdAt:now(),revokedAt:null}).onConflictDoNothing();
    // digest覆盖子项，后续增量不能被undo覆盖。before-image不导出给其它用户。
    const after=plan.images.map(x=>({table:x.table,row:Object.hasOwn(x.row,'group_id')?{...x.row,group_id:body.toGroupId}:x.row}));
    const [row]=await tx.insert(accountGroupMigrations).values({id,userId:ctx.userId,fromGroupId:body.fromGroupId,toGroupId:body.toGroupId,key,inputHash,status:'applied',beforeImage:plan,afterDigest:digest(after),createdAt:now(),undoneAt:null}).returning();return result(row!);
   });
  },
  async status(ctx:RequestContext,id:string){const [row]=await db.select().from(accountGroupMigrations).where(and(eq(accountGroupMigrations.id,id),eq(accountGroupMigrations.userId,ctx.userId)));if(!row||!ctx.groupId||![row.fromGroupId,row.toGroupId].includes(ctx.groupId))throw new OwnershipError('归组记录不存在');return result(row);},
  async undo(ctx:RequestContext,id:string){return db.transaction(async tx=>{
   const [identity]=await tx.select().from(accountGroupMigrations).where(and(eq(accountGroupMigrations.id,id),eq(accountGroupMigrations.userId,ctx.userId)));if(!identity||ctx.groupId!==identity.toGroupId)throw new OwnershipError('请在目标账号组撤回归组资料');
   await lockGroups(tx,ctx,[identity.fromGroupId,identity.toGroupId]);
   const [row]=await tx.select().from(accountGroupMigrations).where(and(eq(accountGroupMigrations.id,id),eq(accountGroupMigrations.userId,ctx.userId))).for('update');if(!row)throw new OwnershipError('归组记录不存在');if(row.status==='undone')return result(row);
   const old=row.beforeImage as Awaited<ReturnType<typeof build>>;
   await lockImages(tx,old.images);
   // 消费触发器取得同一grant的FOR SHARE；先锁grant，再重读ledger，两个顺序都串行。
   const ownGrants=await tx.select().from(resourceAccessGrants).where(and(eq(resourceAccessGrants.userId,ctx.userId),eq(resourceAccessGrants.migrationId,id))).orderBy(resourceAccessGrants.id).for('update');
   const current:RecordImage[]=[];for(const x of old.images){const found=await tx.execute<{row:Row}>(sql`SELECT to_jsonb(t) AS row FROM ${sql.identifier(x.table)} t WHERE ${rowWhere(x.table,x.row)}`);const r=found.rows[0]?.row;if(!r)throw new ConflictError('资料已有后续变化，无法撤回');current.push({table:x.table,row:r});}
   if(digest(current)!==row.afterDigest)throw new ConflictError('资料已有后续变化，无法撤回；请向前修复');
   // 再展开目标组闭包，新增子项、任务或发布均会触发冲突。
   const expanded=await lockedPlan(tx,ctx,{...old.body,fromGroupId:row.toGroupId,toGroupId:row.fromGroupId});
   if(digest(expanded.images)!==row.afterDigest||expanded.requiredProjectIds.length||expanded.requiredKnowledgeIds.length)throw new ConflictError('资料已有新增引用或发布，无法撤回');
   const originalEntities=new Set(old.images.map(x=>`${x.table}:${rowKey(x.table,x.row)}`));
   if(ownGrants.length){
    const uses=await tx.select().from(resourceAccessGrantUses).where(and(eq(resourceAccessGrantUses.userId,ctx.userId),inArray(resourceAccessGrantUses.grantId,ownGrants.map(g=>g.id))));
    // 任何已登记的新工作消费是不可撤回的审计事实；不因后来删引用丢失。
    if(uses.length)throw new ConflictError('授权资源已被后续工作消费，无法撤回；请向前修复');
    const columns=await catalog(tx),consumers=new Map<string,Row[]>();
    async function append(table:string,field:string,ids:string[]){if(!columns.get(table)?.has(field))return false;const found=await rows(tx,table,field,ids,columns.get(table)?.has('user_id')?ctx.userId:undefined);const previous=consumers.get(table)??[],map=new Map(previous.map(r=>[rowKey(table,r),r]));for(const row of found)map.set(rowKey(table,row),row);consumers.set(table,[...map.values()]);return map.size!==previous.length;}
    for(const[table,cols]of columns)if((cols.has('id')||compositeKeys[table])&&cols.has('user_id')&&cols.has('group_id')){const r=await tx.execute<{row:Row}>(sql`SELECT to_jsonb(t) AS row FROM ${sql.identifier(table)} t WHERE user_id=${ctx.userId} AND group_id=${row.toGroupId}`);consumers.set(table,r.rows.map(x=>x.row));}
    let changed=true;while(changed){changed=false;for(const[table,[field,parent]]of Object.entries(relations))changed=await append(table,field,(consumers.get(parent)??[]).map(r=>String(r.id)))||changed;}
    const resourceIds=new Set(ownGrants.map(g=>g.resourceId));
    for(const file of await rows(tx,'asset_files','asset_id',ownGrants.filter(g=>g.resourceType==='asset').map(g=>g.resourceId))){resourceIds.add(String(file.id));resourceIds.add(String(file.storage_key));}
    for(const revision of await rows(tx,'knowledge_revisions','knowledge_item_id',ownGrants.filter(g=>g.resourceType==='knowledge').map(g=>g.resourceId)))resourceIds.add(String(revision.id));
    for(const[table,list]of consumers)for(const consumer of list)if(!originalEntities.has(`${table}:${rowKey(table,consumer)}`)&&[...referenceIds(consumer)].some(ref=>resourceIds.has(ref)))throw new ConflictError('授权引用已有后续使用，无法撤回');
   }
   await observePhase?.('undo:validated');
   await reassign(tx,old.images,row.fromGroupId);await tx.update(resourceAccessGrants).set({revokedAt:now()}).where(and(eq(resourceAccessGrants.userId,ctx.userId),eq(resourceAccessGrants.migrationId,id)));
   const [updated]=await tx.update(accountGroupMigrations).set({status:'undone',undoneAt:now()}).where(eq(accountGroupMigrations.id,id)).returning();return result(updated!);
  });},
 };
}
export type GroupMigrationService=ReturnType<typeof createGroupMigrationService>;

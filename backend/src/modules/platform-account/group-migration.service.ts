import {createHash} from 'node:crypto';
import {and,eq,inArray,sql} from 'drizzle-orm';
import type {Db} from '../../db';
import type {RequestContext} from '@creatoros/contract';
import {accountGroups,accountGroupMigrations} from '../../schema/account-groups';
import {resourceAccessGrants} from '../../schema/resource-access';
import {OwnershipError,ConflictError,ValidationError} from './platform-account.errors';
type Tx=Parameters<Parameters<Db['transaction']>[0]>[0];
type Store=Db|Tx;type Row=Record<string,unknown>;
type RecordImage={table:string;row:Row};
export interface GroupMigrationSelection {fromGroupId:string;toGroupId:string;projectIds:string[];knowledgeIds:string[];conversationIds:string[];}
const digest=(value:unknown)=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const terminal=new Set(['succeeded','failed','cancelled','partial']);
const frozenTables=new Set(['ai_tasks','execution_tasks','scheduled_job','job_run','account_group_migrations','account_group_commands']);
const sorted=(ids:string[])=>[...new Set(ids)].sort();
const relations:Record<string,[string,string]>={
 project_stages:['project_id','projects'],project_target_platforms:['project_id','projects'],project_activities:['project_id','projects'],content_outputs:['project_id','projects'],tasks:['project_id','projects'],output_stages:['content_output_id','content_outputs'],material_links:['project_id','projects'],
 publications:['content_output_id','content_outputs'],publication_revisions:['publication_id','publications'],metric_snapshots:['publication_id','publications'],metric_values:['metric_snapshot_id','metric_snapshots'],audience_snapshots:['publication_id','publications'],publication_retention_snapshots:['publication_id','publications'],publication_traffic:['publication_id','publications'],
 artifacts:['project_id','projects'],artifact_versions:['artifact_id','artifacts'],script_sections:['artifact_version_id','artifact_versions'],thesis_points:['artifact_version_id','artifact_versions'],evidence_items:['artifact_version_id','artifact_versions'],timeline_segments:['artifact_version_id','artifact_versions'],
 reviews:['project_id','projects'],review_insights:['review_id','reviews'],review_publications:['review_id','reviews'],learnings:['project_id','projects'],learning_applications:['learning_id','learnings'],
 calibration_results:['prediction_id','predictions'],knowledge_revisions:['knowledge_item_id','knowledge_items'],ai_messages:['conversation_id','ai_conversations'],
};
function strings(value:unknown,out:Set<string>){if(typeof value==='string')out.add(value);else if(Array.isArray(value))for(const x of value)strings(x,out);else if(value&&typeof value==='object')for(const x of Object.values(value))strings(x,out);}
/** SEMANTIC_BOUNDARY_ALLOW: 仅按真实外键/ID构建用户明确选中的资料闭包与授权引用，不判断内容语义、不按昵称合组。 */
export function createGroupMigrationService({db,now,nextId}:{db:Db;now:()=>string;nextId:(p:string)=>string}){
 async function group(store:Store,ctx:RequestContext,id:string){const [g]=await store.select().from(accountGroups).where(and(eq(accountGroups.id,id),eq(accountGroups.userId,ctx.userId)));if(!g)throw new OwnershipError('账号组不存在');return g;}
 async function catalog(store:Store){const r=await store.execute<{table_name:string;column_name:string}>(sql`SELECT table_name,column_name FROM information_schema.columns WHERE table_schema='public' ORDER BY table_name,ordinal_position`);const map=new Map<string,Set<string>>();for(const row of r.rows){if(!map.has(row.table_name))map.set(row.table_name,new Set());map.get(row.table_name)!.add(row.column_name);}return map;}
 async function rows(store:Store,table:string,field:string,ids:string[],owner?:string){if(!ids.length)return[];const r=await store.execute<{row:Row}>(sql`SELECT to_jsonb(t) AS row FROM ${sql.identifier(table)} t WHERE ${sql.identifier(field)} IN (${sql.join(ids.map(x=>sql`${x}`),sql`,`)}) ${owner?sql`AND user_id=${owner}`:sql``} ORDER BY id`);return r.rows.map(x=>x.row);}
 async function build(store:Store,ctx:RequestContext,selection:GroupMigrationSelection){
  const body={...selection,projectIds:sorted(selection.projectIds),knowledgeIds:sorted(selection.knowledgeIds),conversationIds:sorted(selection.conversationIds)};
  if(body.fromGroupId===body.toGroupId)throw new ValidationError('请选择另一个账号组');
  if(!body.projectIds.length&&!body.knowledgeIds.length&&!body.conversationIds.length)throw new ValidationError('请选择要归组的资料');
  const [from,to]=await Promise.all([group(store,ctx,body.fromGroupId),group(store,ctx,body.toGroupId)]);
  if(from.status!=='active'||to.status!=='active')throw new ValidationError('请先恢复账号组，再归组资料');
  const columns=await catalog(store);const selected=new Map<string,Row[]>();
  async function add(table:string,field:string,ids:string[]){if(!columns.has(table)||!columns.get(table)!.has(field))return false;const found=await rows(store,table,field,ids,columns.get(table)!.has('user_id')?ctx.userId:undefined);const old=selected.get(table)??[];const byId=new Map(old.map(r=>[r.id,r]));for(const r of found)byId.set(r.id,r);selected.set(table,[...byId.values()].sort((a,b)=>String(a.id).localeCompare(String(b.id))));return byId.size!==old.length;}
  for(const [table,ids]of [['projects',body.projectIds],['knowledge_items',body.knowledgeIds],['ai_conversations',body.conversationIds]] as const){await add(table,'id',ids);const found=selected.get(table)??[];if(found.length!==ids.length||found.some(r=>r.user_id!==ctx.userId||r.group_id!==from.id))throw new OwnershipError('资料不属于来源账号组');}
  // 子表继承归属，不改ID；软外键通过同一闭包逐层展开。
  let changed=true;while(changed){changed=false;for(const[table,[field,parent]]of Object.entries(relations))changed=await add(table,field,(selected.get(parent)??[]).map(r=>String(r.id)))||changed;
   const outputs=new Set((selected.get('content_outputs')??[]).map(r=>r.id));const pubs=new Set((selected.get('publications')??[]).map(r=>r.id));
   const subjects=[...outputs,...pubs].map(String);changed=await add('predictions','subject_id',subjects)||changed;
   // 已有project_id的相邻共享表继承项目；执行任务保持创建时冻结值。
   for(const[table,cols]of columns)if(cols.has('id')&&cols.has('project_id')&&!frozenTables.has(table))changed=await add(table,'project_id',body.projectIds)||changed;
  }
  const requiredProjects=new Set<string>();
  for(const rows of selected.values())for(const r of rows){if(typeof r.project_id==='string'&&!body.projectIds.includes(r.project_id))requiredProjects.add(r.project_id);}
  // 复盘不可断开关联Publication；需要的另一项目进入预览，用户必须显式补选。
  const attached=(selected.get('review_publications')??[]).map(r=>String(r.publication_id));await add('publications','id',attached);
  const extraOutputs=await rows(store,'content_outputs','id',(selected.get('publications')??[]).map(r=>String(r.content_output_id)));
  for(const r of extraOutputs)if(!body.projectIds.includes(String(r.project_id)))requiredProjects.add(String(r.project_id));
  for(const table of ['ai_tasks','execution_tasks'])if(columns.get(table)?.has('project_id')){const tasks=await rows(store,table,'project_id',body.projectIds,ctx.userId);if(tasks.some(t=>!terminal.has(String(t.status))))throw new ConflictError('所选项目仍有在途任务，请完成或取消后再归组');}
  if(body.conversationIds.length&&columns.get('execution_tasks')?.has('conversation_id')){const tasks=await rows(store,'execution_tasks','conversation_id',body.conversationIds,ctx.userId);if(tasks.some(t=>!terminal.has(String(t.status))))throw new ConflictError('所选对话仍有在途任务');}
  const images:RecordImage[]=[];for(const[table,list]of [...selected].sort(([a],[b])=>a.localeCompare(b)))for(const row of list){if(row.user_id!==undefined&&row.user_id!==ctx.userId)throw new OwnershipError('资料包含其它用户引用');if(row.group_id!==undefined&&row.group_id!==null&&row.group_id!==from.id)throw new ConflictError('资料包含未选中的其它组依赖');images.push({table,row});}
  const literalIds=new Set<string>();for(const image of images)strings(image.row,literalIds);
  const grants:Array<{resourceType:'asset'|'knowledge';resourceId:string;originGroupId:string}>=[];
  for(const[table,type]of [['assets','asset'],['knowledge_items','knowledge']] as const){const found=await rows(store,table,'id',[...literalIds],ctx.userId);for(const r of found){if(selected.get(table)?.some(x=>x.id===r.id))continue;if(!r.group_id)throw new ConflictError('引用资源尚未完成旧数据归组');if(r.status==='deleted'||r.archived_at)throw new ConflictError('引用资源已删除或归档，请先修复引用');grants.push({resourceType:type,resourceId:String(r.id),originGroupId:String(r.group_id)});}}
  // 知识项带的资产也必须纳入明确授权，保持文件原storageKey。
  for(const item of selected.get('knowledge_items')??[])if(typeof item.asset_id==='string'){const [a]=await rows(store,'assets','id',[item.asset_id],ctx.userId);if(!a)throw new OwnershipError('知识引用素材不存在');if(!grants.some(g=>g.resourceType==='asset'&&g.resourceId===a.id)&&a.group_id!==to.id)grants.push({resourceType:'asset',resourceId:String(a.id),originGroupId:String(a.group_id)});}
  grants.sort((a,b)=>(a.resourceType+a.resourceId).localeCompare(b.resourceType+b.resourceId));
  const plan={body,fromVersion:from.version,toVersion:to.version,images,grants,requiredProjectIds:[...requiredProjects].sort()};
  return {...plan,digest:digest(plan)};
 }
 function view(plan:Awaited<ReturnType<typeof build>>){const counts:Record<string,number>={};for(const x of plan.images)counts[x.table]=(counts[x.table]??0)+1;return {fromGroupId:plan.body.fromGroupId,toGroupId:plan.body.toGroupId,digest:plan.digest,projects:plan.images.filter(x=>x.table==='projects').map(x=>({id:String(x.row.id),title:String(x.row.title)})),counts,grants:plan.grants,requiredProjectIds:plan.requiredProjectIds,sourceVersion:plan.fromVersion,targetVersion:plan.toVersion};}
 async function lockGroups(tx:Tx,ctx:RequestContext,ids:string[]){await tx.select().from(accountGroups).where(and(eq(accountGroups.userId,ctx.userId),inArray(accountGroups.id,sorted(ids)))).orderBy(accountGroups.id).for('update');}
 async function reassign(tx:Tx,images:RecordImage[],groupId:string){for(const x of images)if(Object.hasOwn(x.row,'group_id'))await tx.execute(sql`UPDATE ${sql.identifier(x.table)} SET group_id=${groupId} WHERE id=${String(x.row.id)}`);}
 const result=(r:typeof accountGroupMigrations.$inferSelect)=>({id:r.id,fromGroupId:r.fromGroupId,toGroupId:r.toGroupId,status:r.status as 'applied'|'undone',createdAt:r.createdAt,undoneAt:r.undoneAt});
 return {
  async preview(ctx:RequestContext,body:GroupMigrationSelection){return view(await build(db,ctx,body));},
  async apply(ctx:RequestContext,input:GroupMigrationSelection&{digest:string;idempotencyKey:string}){
   const {digest:expected,idempotencyKey:key,...body}=input;const inputHash=digest(input);
   return db.transaction(async tx=>{
    await lockGroups(tx,ctx,[body.fromGroupId,body.toGroupId]);
    const [memo]=await tx.select().from(accountGroupMigrations).where(and(eq(accountGroupMigrations.userId,ctx.userId),eq(accountGroupMigrations.key,key)));
    if(memo){if(memo.inputHash!==inputHash)throw new ConflictError('同次提交内容已改变');return result(memo);}
    const plan=await build(tx,ctx,body);if(plan.digest!==expected)throw new ConflictError('归组预览已过期，请重新预览');if(plan.requiredProjectIds.length)throw new ConflictError('请先补选关联项目，保持完整资料闭包');
    const id=nextId('group_migration');await reassign(tx,plan.images,body.toGroupId);
    for(const g of plan.grants)await tx.insert(resourceAccessGrants).values({id:nextId('grant'),userId:ctx.userId,targetGroupId:body.toGroupId,resourceType:g.resourceType,resourceId:g.resourceId,originGroupId:g.originGroupId,migrationId:id,createdAt:now(),revokedAt:null}).onConflictDoNothing();
    // digest覆盖子项，后续增量不能被undo覆盖。before-image不导出给其它用户。
    const after=plan.images.map(x=>({table:x.table,row:Object.hasOwn(x.row,'group_id')?{...x.row,group_id:body.toGroupId}:x.row}));
    const [row]=await tx.insert(accountGroupMigrations).values({id,userId:ctx.userId,fromGroupId:body.fromGroupId,toGroupId:body.toGroupId,key,inputHash,status:'applied',beforeImage:plan,afterDigest:digest(after),createdAt:now(),undoneAt:null}).returning();return result(row!);
   });
  },
  async status(ctx:RequestContext,id:string){const [row]=await db.select().from(accountGroupMigrations).where(and(eq(accountGroupMigrations.id,id),eq(accountGroupMigrations.userId,ctx.userId)));if(!row)throw new OwnershipError('归组记录不存在');return result(row);},
  async undo(ctx:RequestContext,id:string){return db.transaction(async tx=>{
   const [row]=await tx.select().from(accountGroupMigrations).where(and(eq(accountGroupMigrations.id,id),eq(accountGroupMigrations.userId,ctx.userId))).for('update');if(!row)throw new OwnershipError('归组记录不存在');if(row.status==='undone')return result(row);
   await lockGroups(tx,ctx,[row.fromGroupId,row.toGroupId]);const old=row.beforeImage as Awaited<ReturnType<typeof build>>;
   const current:RecordImage[]=[];for(const x of old.images){const [r]=await rows(tx,x.table,'id',[String(x.row.id)]);if(!r)throw new ConflictError('资料已有后续变化，无法撤回');current.push({table:x.table,row:r});}
   if(digest(current)!==row.afterDigest)throw new ConflictError('资料已有后续变化，无法撤回；请向前修复');
   // 再展开目标组闭包，新增子项、任务或发布均会触发冲突。
   const expanded=await build(tx,ctx,{...old.body,fromGroupId:row.toGroupId,toGroupId:row.fromGroupId});
   if(digest(expanded.images)!==row.afterDigest)throw new ConflictError('资料已有新增引用或发布，无法撤回');
   // 目标组后续项目可能已经消费grant，逐resource检查新的引用。
   for(const g of old.grants){const links=await rows(tx,'material_links','entity_id',[g.resourceId],ctx.userId);if(links.some(l=>!old.body.projectIds.includes(String(l.project_id))))throw new ConflictError('授权引用已有后续使用，无法撤回');}
   await reassign(tx,old.images,row.fromGroupId);await tx.update(resourceAccessGrants).set({revokedAt:now()}).where(and(eq(resourceAccessGrants.userId,ctx.userId),eq(resourceAccessGrants.migrationId,id)));
   const [updated]=await tx.update(accountGroupMigrations).set({status:'undone',undoneAt:now()}).where(eq(accountGroupMigrations.id,id)).returning();return result(updated!);
  });},
 };
}
export type GroupMigrationService=ReturnType<typeof createGroupMigrationService>;

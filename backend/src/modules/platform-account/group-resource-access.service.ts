import {createHash} from 'node:crypto';
import {sql,type Db,type RequestContext,OwnershipError,ConflictError} from '@creatoros/backend';
type Store=Pick<Db,'execute'>;
type Row=Record<string,any>;
const hash=(value:unknown)=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
async function query(store:Store,statement:ReturnType<typeof sql>):Promise<Row[]>{return (await store.execute<Row>(statement)).rows;}
// Same typed JSON protocol paths as 0121 record_workspace_grant_use(); no content-text scan.
function taskResourceReference(type:string,id:string){return sql`EXISTS (SELECT 1 FROM (
 SELECT 'asset' AS kind,jsonb_path_query(t.input_data,'$.**.assetId') AS v UNION ALL SELECT 'asset',jsonb_path_query(t.input_data,'$.**.assetIds[*]')
 UNION ALL SELECT 'knowledge',jsonb_path_query(t.input_data,'$.**.knowledgeId') UNION ALL SELECT 'knowledge',jsonb_path_query(t.input_data,'$.**.knowledgeIds[*]')
 UNION ALL SELECT 'knowledge',jsonb_path_query(t.input_data,'$.**.knowledgeItemId') UNION ALL SELECT 'knowledge',jsonb_path_query(t.input_data,'$.**.knowledgeItemIds[*]')
 ) refs WHERE kind=${type} AND jsonb_typeof(v)='string' AND v#>>'{}'=${id})`;}

/** SEMANTIC_BOUNDARY_ALLOW: 只追踪协议资源ID、所属组与真实引用；不分析内容文本或决定创作选择。 */
export function createGroupResourceAccessService({db,now}:{db:Db;now:()=>string}){
 async function group(store:Store,userId:string,id:string){const [row]=await query(store,sql`SELECT * FROM account_groups WHERE id=${id} AND user_id=${userId}`);if(!row)throw new OwnershipError('账号组不存在');return row;}
 async function grant(store:Store,ctx:RequestContext,id:string){const [row]=await query(store,sql`SELECT * FROM resource_access_grants WHERE id=${id} AND user_id=${ctx.userId}`);if(!row||!ctx.groupId||![row.origin_group_id,row.target_group_id].includes(ctx.groupId))throw new OwnershipError('共享资源授权不存在');return row;}
 async function resource(store:Store,userId:string,type:string,id:string){const table=type==='asset'?'assets':'knowledge_items';const [row]=await query(store,sql`SELECT * FROM ${sql.identifier(table)} WHERE id=${id} AND user_id=${userId}`);if(!row)throw new OwnershipError('共享资源不存在');return row;}
 async function references(store:Store,userId:string,type:string,id:string,targetGroupId?:string){
  const refRows=await query(store,sql`SELECT 'material_links' AS kind,l.id,p.group_id,p.id AS project_id,p.title,l.created_at AS updated_at FROM material_links l JOIN projects p ON p.id=l.project_id WHERE l.user_id=${userId} AND p.user_id=${userId} AND l.entity_type=${type} AND l.entity_id=${id}
  UNION ALL SELECT 'content_outputs',o.id,p.group_id,p.id,p.title,o.updated_at FROM content_outputs o JOIN projects p ON p.id=o.project_id WHERE ${type}='asset' AND p.user_id=${userId} AND o.primary_asset_id=${id}
  UNION ALL SELECT 'publication_revisions',r.id,p.group_id,NULL,r.title,r.created_at FROM publication_revisions r JOIN publications p ON p.id=r.publication_id WHERE ${type}='asset' AND r.user_id=${userId} AND p.user_id=${userId} AND r.cover_asset_id=${id}
  UNION ALL SELECT 'segment_assets',s.id,p.group_id,p.id,p.title,NULL FROM segment_assets s JOIN production_segments seg ON seg.id=s.production_segment_id JOIN productions prod ON prod.id=seg.production_id JOIN content_outputs o ON o.id=prod.content_output_id JOIN projects p ON p.id=o.project_id WHERE ${type}='asset' AND s.user_id=${userId} AND seg.user_id=${userId} AND prod.user_id=${userId} AND p.user_id=${userId} AND s.asset_id=${id}
  UNION ALL SELECT 'export_records',e.id,p.group_id,p.id,p.title,COALESCE(e.completed_at,e.created_at) FROM export_records e JOIN productions prod ON prod.id=e.production_id JOIN content_outputs o ON o.id=prod.content_output_id JOIN projects p ON p.id=o.project_id WHERE ${type}='asset' AND e.user_id=${userId} AND prod.user_id=${userId} AND p.user_id=${userId} AND e.result_asset_id=${id}
  UNION ALL SELECT 'knowledge_items',k.id,k.group_id,NULL,k.title,k.updated_at FROM knowledge_items k WHERE ${type}='asset' AND k.user_id=${userId} AND k.asset_id=${id}
  UNION ALL SELECT 'ai_messages',m.id,c.group_id,NULL,c.title,m.created_at FROM ai_messages m JOIN ai_conversations c ON c.id=m.conversation_id WHERE c.user_id=${userId} AND ${type}='asset' AND m.attachments @> jsonb_build_array(${id}::text)
  UNION ALL SELECT 'ai_tasks',t.id,t.group_id,t.project_id,t.task_type,t.requested_at FROM ai_tasks t WHERE t.user_id=${userId} AND ${taskResourceReference(type,id)}`);
  return refRows.filter(r=>!targetGroupId||r.group_id===targetGroupId);
 }
 async function historicalMetadata(store:Store,userId:string,groupId:string,kind:string,id:string){
  const statements:Record<string,ReturnType<typeof sql>>={
   material_links:sql`SELECT p.title,p.id AS project_id FROM material_links l JOIN projects p ON p.id=l.project_id WHERE l.id=${id} AND l.user_id=${userId} AND p.user_id=${userId} AND p.group_id=${groupId}`,
   content_outputs:sql`SELECT p.title,p.id AS project_id FROM content_outputs o JOIN projects p ON p.id=o.project_id WHERE o.id=${id} AND p.user_id=${userId} AND p.group_id=${groupId}`,
   publication_revisions:sql`SELECT r.title FROM publication_revisions r JOIN publications p ON p.id=r.publication_id WHERE r.id=${id} AND r.user_id=${userId} AND p.user_id=${userId} AND p.group_id=${groupId}`,
   segment_assets:sql`SELECT p.title,p.id AS project_id FROM segment_assets s JOIN production_segments seg ON seg.id=s.production_segment_id JOIN productions prod ON prod.id=seg.production_id JOIN content_outputs o ON o.id=prod.content_output_id JOIN projects p ON p.id=o.project_id WHERE s.id=${id} AND s.user_id=${userId} AND seg.user_id=${userId} AND prod.user_id=${userId} AND p.user_id=${userId} AND p.group_id=${groupId}`,
   export_records:sql`SELECT p.title,p.id AS project_id FROM export_records e JOIN productions prod ON prod.id=e.production_id JOIN content_outputs o ON o.id=prod.content_output_id JOIN projects p ON p.id=o.project_id WHERE e.id=${id} AND e.user_id=${userId} AND prod.user_id=${userId} AND p.user_id=${userId} AND p.group_id=${groupId}`,
   knowledge_items:sql`SELECT title FROM knowledge_items WHERE id=${id} AND user_id=${userId} AND group_id=${groupId}`,
   ai_messages:sql`SELECT c.title FROM ai_messages m JOIN ai_conversations c ON c.id=m.conversation_id WHERE m.id=${id} AND c.user_id=${userId} AND c.group_id=${groupId}`,
   ai_tasks:sql`SELECT task_type AS title,project_id FROM ai_tasks WHERE id=${id} AND user_id=${userId} AND group_id=${groupId}`,
  };const statement=statements[kind];return statement?(await query(store,statement))[0]:undefined;
 }
 async function view(store:Store,ctx:RequestContext,row:Row){
  const [origin,target,item]=await Promise.all([group(store,ctx.userId,row.origin_group_id),group(store,ctx.userId,row.target_group_id),resource(store,ctx.userId,row.resource_type,row.resource_id)]);
  if(item.group_id!==origin.id)throw new ConflictError('资源归属已变，请先核对共享授权');
  return {id:String(row.id),resourceType:row.resource_type as 'asset'|'knowledge',resourceId:String(row.resource_id),resourceTitle:String(item.name??item.title??row.resource_id),resourceStatus:String(item.status),originGroupId:String(origin.id),originGroupName:String(origin.name),targetGroupId:String(target.id),targetGroupName:String(target.name),migrationId:String(row.migration_id),createdAt:String(row.created_at),revokedAt:row.revoked_at as string|null,originStatus:String(origin.status),targetStatus:String(target.status),originVersion:Number(origin.version),targetVersion:Number(target.version),resourceDigest:hash(item),resourceUpdatedAt:item.updated_at as string|null};
 }
 async function impact(store:Store,ctx:RequestContext,row:Row){
  const info=await view(store,ctx,row),current=await references(store,ctx.userId,row.resource_type,row.resource_id,row.target_group_id);
  const ledger=await query(store,sql`SELECT consumer_type AS kind,consumer_id AS id,created_at AS updated_at FROM resource_access_grant_uses WHERE user_id=${ctx.userId} AND grant_id=${row.id} ORDER BY consumer_type,consumer_id`);
  const identities=new Map<string,Row>();for(const r of current)identities.set(`${r.kind}:${r.id}`,{...r,current:true,historical:false});for(const r of ledger){const key=`${r.kind}:${r.id}`,old=identities.get(key),metadata=old??await historicalMetadata(store,ctx.userId,info.targetGroupId,String(r.kind),String(r.id));identities.set(key,{...r,...metadata,...old,current:old?.current??false,historical:true});}
  const consumers=[...identities.values()].sort((a,b)=>(a.kind+':'+a.id).localeCompare(b.kind+':'+b.id)).map(r=>({consumerType:String(r.kind),id:String(r.id),title:String(r.title??'已记录的使用（当前对象无法回读）'),groupId:info.targetGroupId,groupName:info.targetGroupName,projectId:r.project_id as string|null??null,historical:Boolean(r.historical),current:Boolean(r.current),updatedAt:r.updated_at as string|null??null}));
  const reason=info.revokedAt?'授权已撤销':info.originStatus!=='active'?'原组已归档，请先恢复再撤销授权':info.resourceStatus!=='active'?'资源不可用，请先恢复资源再处理授权':consumers.length?'已有使用记录，保留引用权限；需在原组处理资料。':null;
  const preview={...info,consumers,canRevoke:!reason,reason};return {...preview,digest:hash(preview)};
 }
 return {
  async list(ctx:RequestContext){if(!ctx.groupId)throw new OwnershipError('请选择账号组');await group(db,ctx.userId,ctx.groupId);const rows=await query(db,sql`SELECT * FROM resource_access_grants WHERE user_id=${ctx.userId} AND (origin_group_id=${ctx.groupId} OR target_group_id=${ctx.groupId}) ORDER BY created_at,id`);return Promise.all(rows.map(r=>view(db,ctx,r)));},
  async previewRevoke(ctx:RequestContext,id:string){return impact(db,ctx,await grant(db,ctx,id));},
  async revoke(ctx:RequestContext,id:string,body:{digest:string;expectedOriginVersion:number;expectedTargetVersion:number}){
   return db.transaction(async tx=>{const initial=await grant(tx,ctx,id);if(ctx.groupId!==initial.origin_group_id)throw new OwnershipError('只能在资源原组撤销授权');
    await query(tx,sql`SELECT id FROM account_groups WHERE user_id=${ctx.userId} AND id IN (${initial.origin_group_id},${initial.target_group_id}) ORDER BY id FOR UPDATE`);
    const [locked]=await query(tx,sql`SELECT * FROM resource_access_grants WHERE id=${id} AND user_id=${ctx.userId} FOR UPDATE`);
    const origin=await group(tx,ctx.userId,initial.origin_group_id);if(origin.status!=='active')throw new ConflictError('请先恢复原组，再撤销共享授权');
    await query(tx,sql`SELECT id FROM ${sql.identifier(initial.resource_type==='asset'?'assets':'knowledge_items')} WHERE id=${initial.resource_id} AND user_id=${ctx.userId} FOR SHARE`);
    const preview=await impact(tx,ctx,locked!);if(preview.digest!==body.digest||preview.originVersion!==body.expectedOriginVersion||preview.targetVersion!==body.expectedTargetVersion)throw new ConflictError('资源或使用记录已变化，请重新预览');if(!preview.canRevoke)throw new ConflictError(preview.reason??'授权无法撤销');
    const [updated]=await query(tx,sql`UPDATE resource_access_grants SET revoked_at=${now()} WHERE id=${id} AND user_id=${ctx.userId} RETURNING *`);return view(tx,ctx,updated!);
   });
  },
  async previewDelete(ctx:RequestContext,assetId:string){const item=await resource(db,ctx.userId,'asset',assetId);if(ctx.groupId?item.group_id!==ctx.groupId:(!ctx.accountId||item.account_id!==ctx.accountId||(item.group_id!==null&&item.group_id!==`grp_legacy_${ctx.accountId}`)))throw new OwnershipError('素材不属于当前工作区');const rows=await query(db,sql`SELECT * FROM resource_access_grants WHERE user_id=${ctx.userId} AND resource_type='asset' AND resource_id=${assetId} AND revoked_at IS NULL ORDER BY id`);const grants=await Promise.all(rows.map(r=>impact(db,ctx,r)));const referencesNow=await references(db,ctx.userId,'asset',assetId);const groupRows=await query(db,sql`SELECT id,name FROM account_groups WHERE user_id=${ctx.userId}`),names=new Map(groupRows.map(r=>[r.id,r.name]));const consumers=referencesNow.map(r=>({consumerType:String(r.kind),id:String(r.id),title:String(r.title),groupId:r.group_id as string|null,groupName:r.group_id?String(names.get(r.group_id)??'组信息无法回读'):'旧账号工作区',projectId:r.project_id as string|null??null,historical:false,current:true,updatedAt:r.updated_at as string|null??null}));const sourceGroup=ctx.groupId?await group(db,ctx.userId,ctx.groupId):null;const reason=sourceGroup?.status==='archived'?'原组已归档，请先恢复账号组再删除素材。':grants.length?'素材仍有共享授权，请先查看并处理授权影响。':item.status!=='active'?'素材当前不在可移入回收站的状态。':null;const preview={assetId,resourceTitle:String(item.name),groupId:item.group_id as string|null,canDelete:!reason,reason,grants,consumers,consumerCount:consumers.length};return {...preview,digest:hash({preview,item,consumers})};},
 };
}
export type GroupResourceAccessService=ReturnType<typeof createGroupResourceAccessService>;

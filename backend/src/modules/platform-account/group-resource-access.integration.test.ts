import {readFileSync} from "node:fs";
import {beforeEach,afterEach,it,expect} from 'vitest';
import {sql,createDb,type RequestContext} from '@creatoros/backend';
import {createAssetsService,createAssetRepository,createMockObjectStorage} from '../assets';
const NOW='2026-10-04T00:00:00Z';const owner:RequestContext={userId:'user',groupId:'origin',requestId:'grants',source:'user'};
let store:Awaited<ReturnType<typeof createDb>>,n=0;
beforeEach(async()=>{store=await createDb();n=0;await store.client.exec(readFileSync(new URL('../../../drizzle/0121_group_resource_grant_locks.sql',import.meta.url),'utf8'));await store.client.exec(`INSERT INTO account_groups(id,user_id,name,created_at,updated_at) VALUES('origin','user','原组','${NOW}','${NOW}'),('target','user','目标组','${NOW}','${NOW}');
 INSERT INTO assets(id,user_id,group_id,asset_type,name,status,created_at,updated_at) VALUES('asset','user','origin','image','封面素材','active','${NOW}','${NOW}');
 INSERT INTO resource_access_grants(id,user_id,target_group_id,resource_type,resource_id,origin_group_id,migration_id,created_at) VALUES('grant','user','target','asset','asset','origin','migration','${NOW}');`);},30000);
afterEach(async()=>store?.client.close(),30000);
it('素材删除不能暗删有效共享授权资源，legacy 无授权删除保持可用',async()=>{
 const s=createAssetsService(createAssetRepository(store.db,{now:()=>NOW,nextId:p=>`${p}-${++n}`}),async()=>createMockObjectStorage({nextKey:()=>`key/${++n}`}),{now:()=>NOW,nextId:p=>`${p}-${++n}`});
 await expect(s.trashAsset(owner,'asset')).rejects.toMatchObject({code:'ConflictError'});await expect(s.trashAsset({...owner,groupId:'target'},'asset')).rejects.toMatchObject({code:'OwnershipError'});
 expect((await s.getAsset(owner,'asset')).status).toBe('active');
 await store.client.exec(`INSERT INTO assets(id,user_id,account_id,asset_type,name,status,created_at,updated_at) VALUES('legacy','user','real-account','image','旧素材','active','${NOW}','${NOW}')`);
 expect((await s.trashAsset({...owner,groupId:null,accountId:'real-account'},'legacy')).status).toBe('deleted');
});
async function grants(){return (await import('./group-resource-access.service')).createGroupResourceAccessService({db:store.db,now:()=>NOW});}
it('公开client按列表合同读取共享授权，分页与真实记录数量一致',async()=>{
 const {createAccountGroupService}=await import('./account-group.service'),{createAccountGroupTransport}=await import('./account-group.transport'),{ENDPOINTS,createClient,requestListWithMeta}=await import('@creatoros/contract');
 const service=await grants();const transport=createAccountGroupTransport(()=>createAccountGroupService({db:store.db,now:()=>NOW,nextId:p=>`${p}-${++n}`}),undefined,()=>service);
 const client=createClient(ENDPOINTS,transport,owner);const input={params:undefined,query:undefined,body:undefined};
 expect(await client.listGroupResourceGrants(input)).toHaveLength(1);
 expect((await requestListWithMeta(transport,ENDPOINTS.listGroupResourceGrants,input,owner)).meta).toEqual({requestId:owner.requestId,page:1,pageSize:1,total:1});
});
it('只读范围限origin/target与同user，原组归档仍可预览，target不能撤销',async()=>{
 const s=await grants(),target={...owner,groupId:'target'};expect((await s.list(target))[0]?.resourceTitle).toBe('封面素材');
 await expect(s.previewRevoke({...owner,userId:'other'},'grant')).rejects.toMatchObject({code:'OwnershipError'});await expect(s.previewRevoke({...owner,groupId:'unrelated'},'grant')).rejects.toMatchObject({code:'OwnershipError'});
 const p=await s.previewRevoke(target,'grant');await expect(s.revoke(target,'grant',{digest:p.digest,expectedOriginVersion:p.originVersion,expectedTargetVersion:p.targetVersion})).rejects.toMatchObject({code:'OwnershipError'});
 await store.client.exec("UPDATE account_groups SET status='archived' WHERE id='origin'");expect((await s.previewRevoke(target,'grant')).canRevoke).toBe(false);
});
it('未使用授权版本digest复验后可撤销；目标版本变化拒绝过期确认',async()=>{
 const s=await grants(),p=await s.previewRevoke(owner,'grant');await store.client.exec("UPDATE account_groups SET version=2 WHERE id='target'");await expect(s.revoke(owner,'grant',{digest:p.digest,expectedOriginVersion:p.originVersion,expectedTargetVersion:p.targetVersion})).rejects.toMatchObject({code:'ConflictError'});
 const fresh=await s.previewRevoke(owner,'grant');expect((await s.revoke(owner,'grant',{digest:fresh.digest,expectedOriginVersion:fresh.originVersion,expectedTargetVersion:fresh.targetVersion})).revokedAt).toBe(NOW);
});
it('既有项目真实引用即使没有ledger也阻止撤销，删除影响指明目标与资源',async()=>{
 await store.client.exec(`INSERT INTO projects(id,user_id,group_id,title,status,current_stage,creation_mode,started_at,created_at,updated_at) VALUES('project','user','target','合法项目','active','ideation','manual','${NOW}','${NOW}','${NOW}'); INSERT INTO material_links(id,user_id,project_id,entity_type,entity_id,role,created_at) VALUES('link','user','project','asset','asset','reference','${NOW}')`);
 await store.client.exec("DELETE FROM resource_access_grant_uses WHERE grant_id='grant'");const s=await grants(),p=await s.previewRevoke(owner,'grant');expect(p.canRevoke).toBe(false);expect(p.consumers[0]?.title).toBe('合法项目');expect(p.targetGroupName).toBe('目标组');await expect(s.revoke(owner,'grant',{digest:p.digest,expectedOriginVersion:p.originVersion,expectedTargetVersion:p.targetVersion})).rejects.toMatchObject({code:'ConflictError'});expect((await s.previewDelete(owner,'asset')).canDelete).toBe(false);
});

it('撤销先提交后消费者真实事务不能落断链引用，正文中ID不误算资源',async()=>{
 const s=await grants(),p=await s.previewRevoke(owner,'grant');await s.revoke(owner,'grant',{digest:p.digest,expectedOriginVersion:p.originVersion,expectedTargetVersion:p.targetVersion});
 await store.client.exec(`INSERT INTO projects(id,user_id,group_id,title,status,current_stage,creation_mode,started_at,created_at,updated_at) VALUES('p-after','user','target','后续项目','active','ideation','manual','${NOW}','${NOW}','${NOW}')`);
 await expect(store.db.transaction(tx=>tx.execute(sql`INSERT INTO material_links(id,user_id,project_id,entity_type,entity_id,created_at) VALUES('blocked','user','p-after','asset','asset',${NOW})`))).rejects.toMatchObject({code:'40001',message:expect.stringContaining('GROUP_RESOURCE_SCOPE_CONFLICT:')});
 expect((await store.client.query<{count:number}>("SELECT COUNT(*)::int AS count FROM material_links WHERE id='blocked'")).rows[0]?.count).toBe(0);
 await store.client.exec(`INSERT INTO ai_tasks(id,user_id,group_id,task_type,input_data,idempotency_key,requested_at) VALUES('text-only','user','target','write','{"body":"正文提到asset"}','text-only','${NOW}')`);
});

it('消费者先提交则撤销拒绝，真实公共项目和用料链仍可读取，ledger不删',async()=>{
 const {createProjectsService,createProjectRepository}=await import('../projects');const {createMaterialLinksService}=await import('../material-links');const deps={now:()=>NOW,nextId:(p:string)=>`${p}-${++n}`};const projects=createProjectsService(createProjectRepository(store.db),deps);const target={...owner,groupId:'target'};const project=await projects.createProject(target,{title:'真实共享项目',creationMode:'manual'});
 const assets=createAssetsService(createAssetRepository(store.db,deps),async()=>createMockObjectStorage({nextKey:()=>`key/${++n}`}),deps);const links=createMaterialLinksService({...deps,db:store.db,assertProjectOwned:(ctx,id)=>projects.getProject(ctx,id),assertAssetOwned:(ctx,id)=>assets.getAsset(ctx,id)});
 const s=await grants(),p=await s.previewRevoke(owner,'grant');const link=await links.create(target,{projectId:project.id,entityType:'asset',entityId:'asset'});
 await expect(s.revoke(owner,'grant',{digest:p.digest,expectedOriginVersion:p.originVersion,expectedTargetVersion:p.targetVersion})).rejects.toMatchObject({code:'ConflictError'});expect((await links.list(target,{projectId:project.id,page:1,pageSize:20})).rows[0]?.id).toBe(link.id);expect((await s.previewRevoke(owner,'grant')).consumers[0]?.title).toBe('真实共享项目');expect((await store.client.query<{count:number}>("SELECT COUNT(*)::int AS count FROM resource_access_grant_uses WHERE grant_id='grant'")).rows[0]?.count).toBe(1);
});
it('AI正文提及资源ID不消费授权；明确协议assetId会消费，同组资源无需授权',async()=>{
 await store.client.exec(`INSERT INTO ai_tasks(id,user_id,group_id,task_type,input_data,idempotency_key,requested_at) VALUES('mention','user','target','write','{"body":"asset"}','mention','${NOW}')`);
 const s=await grants();expect((await s.previewRevoke(owner,'grant')).canRevoke).toBe(true);
 await store.client.exec(`INSERT INTO ai_tasks(id,user_id,group_id,task_type,input_data,idempotency_key,requested_at) VALUES('use','user','target','write','{"assetId":"asset"}','use','${NOW}'),('own-use','user','origin','write','{"assetId":"asset"}','own-use','${NOW}')`);
 expect((await s.previewRevoke(owner,'grant')).consumers).toHaveLength(1);
});
it('公开transport预览与撤销共享同一权限和digest契约，SQL可重复执行',async()=>{
 const {createAccountGroupService}=await import('./account-group.service'),{createAccountGroupTransport}=await import('./account-group.transport'),{ENDPOINTS}=await import('@creatoros/contract');const s=await grants();const transport=createAccountGroupTransport(()=>createAccountGroupService({db:store.db,now:()=>NOW,nextId:p=>`${p}-${++n}`}),undefined,()=>s);
 const read=await transport.request(ENDPOINTS.listGroupResourceGrants,{params:undefined,query:undefined,body:undefined},owner) as {data:unknown};expect(read.data).toHaveLength(1);const result=await transport.request(ENDPOINTS.previewGroupResourceGrantRevoke,{params:{grantId:'grant'},query:undefined,body:undefined},owner) as {data:unknown},p=ENDPOINTS.previewGroupResourceGrantRevoke.response.parse(result.data);await transport.request(ENDPOINTS.revokeGroupResourceGrant,{params:{grantId:'grant'},query:undefined,body:{digest:p.digest,expectedOriginVersion:p.originVersion,expectedTargetVersion:p.targetVersion}},owner);expect((await s.previewRevoke(owner,'grant')).revokedAt).toBe(NOW);const sqlText=readFileSync(new URL('../../../drizzle/0121_group_resource_grant_locks.sql',import.meta.url),'utf8');await store.client.exec(sqlText);await store.client.exec(sqlText);
});
it('历史导出已有共享成片即使无ledger也阻止撤销',async()=>{
 await store.client.exec(`INSERT INTO projects(id,user_id,group_id,title,status,current_stage,creation_mode,started_at,created_at,updated_at) VALUES('export-project','user','target','成片项目','active','production','manual','${NOW}','${NOW}','${NOW}'); INSERT INTO content_outputs(id,project_id,title,content_type,status,created_at,updated_at) VALUES('export-output','export-project','成片','video','active','${NOW}','${NOW}'); INSERT INTO productions(id,user_id,content_output_id,updated_at) VALUES('production','user','export-output','${NOW}'); INSERT INTO export_records(id,user_id,production_id,result_asset_id,format,resolution,aspect_ratio,created_at) VALUES('export','user','production','asset','mp4','1080p','16:9','${NOW}'); DELETE FROM resource_access_grant_uses WHERE grant_id='grant'`);
 const p=await (await grants()).previewRevoke(owner,'grant');expect(p.canRevoke).toBe(false);expect(p.consumers.find(row=>row.id==='export')?.title).toBe('成片项目');
});
it('撤销后制作片段与导出成片两种typed消费者均在事务内拒绝',async()=>{
 await store.client.exec(`INSERT INTO projects(id,user_id,group_id,title,status,current_stage,creation_mode,started_at,created_at,updated_at) VALUES('typed-project','user','target','制作项目','active','production','manual','${NOW}','${NOW}','${NOW}'); INSERT INTO content_outputs(id,project_id,title,content_type,status,created_at,updated_at) VALUES('typed-output','typed-project','成片','video','active','${NOW}','${NOW}'); INSERT INTO productions(id,user_id,content_output_id,updated_at) VALUES('typed-production','user','typed-output','${NOW}'); INSERT INTO production_segments(id,user_id,production_id,title) VALUES('segment','user','typed-production','片段')`);
 const s=await grants(),p=await s.previewRevoke(owner,'grant');await s.revoke(owner,'grant',{digest:p.digest,expectedOriginVersion:p.originVersion,expectedTargetVersion:p.targetVersion});
 await expect(store.db.transaction(tx=>tx.execute(sql`INSERT INTO segment_assets(id,user_id,production_segment_id,asset_id,usage_type) VALUES('blocked-segment','user','segment','asset','visual')`))).rejects.toMatchObject({code:'40001'});
 await expect(store.db.transaction(tx=>tx.execute(sql`INSERT INTO export_records(id,user_id,production_id,result_asset_id,format,resolution,aspect_ratio,created_at) VALUES('blocked-export','user','typed-production','asset','mp4','1080p','16:9',${NOW})`))).rejects.toMatchObject({code:'40001'});
});

it('旧账号入口不能预览新组素材，归档原组删除预览明确只读',async()=>{
 const s=await grants();await store.client.exec(`INSERT INTO assets(id,user_id,group_id,account_id,asset_type,name,status,created_at,updated_at) VALUES('new-group-asset','user','target','actual-account','image','新组素材','active','${NOW}','${NOW}')`);
 await expect(s.previewDelete({...owner,groupId:null,accountId:'actual-account'},'new-group-asset')).rejects.toMatchObject({code:'OwnershipError'});
 await store.client.exec("UPDATE account_groups SET status='archived' WHERE id='origin'");const preview=await s.previewDelete(owner,'asset');expect(preview.canDelete).toBe(false);expect(preview.reason).toContain('归档');
});
it('历史AI嵌套协议素材与知识引用即使没有ledger仍准确显示当前引用，正文提及不算',async()=>{
 await store.client.exec(`INSERT INTO knowledge_items(id,user_id,group_id,current_revision_id,title,status,created_at,updated_at) VALUES('knowledge','user','origin','revision','共享知识','active','${NOW}','${NOW}'); INSERT INTO resource_access_grants(id,user_id,target_group_id,resource_type,resource_id,origin_group_id,migration_id,created_at) VALUES('knowledge-grant','user','target','knowledge','knowledge','origin','migration','${NOW}'); INSERT INTO ai_tasks(id,user_id,group_id,task_type,input_data,idempotency_key,requested_at) VALUES('nested-task','user','target','write','{"references":{"assetIds":["asset"],"knowledgeItemId":"knowledge"}}','nested-task','${NOW}'),('text-task','user','target','write','{"body":"asset knowledge"}','text-task','${NOW}'); DELETE FROM resource_access_grant_uses`);
 const s=await grants();for(const id of ['grant','knowledge-grant']){const p=await s.previewRevoke(owner,id);expect(p.canRevoke).toBe(false);expect(p.consumers.map(c=>({id:c.id,current:c.current,historical:c.historical}))).toEqual([{id:'nested-task',current:true,historical:false}]);}
 expect((await s.previewDelete(owner,'asset')).consumers.some(c=>c.id==='nested-task')).toBe(true);
});
it('六种typedJSON路径的新ledger和当前引用一致，任意JSON正文不消费授权',async()=>{
 await store.client.exec(`INSERT INTO knowledge_items(id,user_id,group_id,current_revision_id,title,status,created_at,updated_at) VALUES('k','user','origin','rk','知识','active','${NOW}','${NOW}'); INSERT INTO resource_access_grants(id,user_id,target_group_id,resource_type,resource_id,origin_group_id,migration_id,created_at) VALUES('kg','user','target','knowledge','k','origin','migration','${NOW}')`);
 for(const [key,value] of Object.entries({assetId:'asset',assetIds:['asset'],knowledgeId:'k',knowledgeIds:['k'],knowledgeItemId:'k',knowledgeItemIds:['k']})){await store.client.query('INSERT INTO ai_tasks(id,user_id,group_id,task_type,input_data,idempotency_key,requested_at) VALUES($1,$2,$3,$4,$5,$1,$6)',[key,'user','target','write',JSON.stringify({nested:{[key]:value}}),NOW]);}
 for(const id of ['grant','kg']){const p=await (await grants()).previewRevoke(owner,id);expect(p.consumers).toHaveLength(id==='grant'?2:4);expect(p.consumers.every(c=>c.current&&c.historical)).toBe(true);expect(p.reason).toContain('保留引用权限');}
});

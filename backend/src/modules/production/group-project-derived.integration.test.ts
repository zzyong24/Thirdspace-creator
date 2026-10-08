import {beforeEach,afterEach,it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import {createDb,OwnershipError,type RequestContext} from '@creatoros/backend';
import {createProductionService} from './production.service';
import {createMaterialLinksService} from '../material-links/material-links.service';
const NOW='2026-10-04T00:00:00Z',a:RequestContext={userId:'owner',groupId:'ga',accountId:null,requestId:'derived',source:'user'};
let store:Awaited<ReturnType<typeof createDb>>,n=0;
function services(){
 const assertProjectOwned=async(ctx:RequestContext,id:string)=>{const q=await store.client.query('SELECT group_id AS "groupId",account_id AS "accountId" FROM projects WHERE id=$1 AND user_id=$2 AND group_id=$3',[id,ctx.userId,ctx.groupId]);if(!q.rows[0])throw new OwnershipError('项目不存在');return q.rows[0];};
 const assertOutputOwned=async(ctx:RequestContext,id:string)=>{const q=await store.client.query('SELECT project_id FROM content_outputs WHERE id=$1',[id]);if(!q.rows[0])throw new OwnershipError('产出不存在');return assertProjectOwned(ctx,(q.rows[0] as {project_id:string}).project_id);};
 const assertAssetOwned=async(ctx:RequestContext,id:string)=>{if(ctx.groupId!=='ga'||id!=='asset')throw new OwnershipError('素材不存在');};
 const deps={db:store.db,now:()=>NOW,nextId:(p:string)=>`${p}-${++n}`,assertProjectOwned,assertOutputOwned,assertAssetOwned,assertKnowledgeOwned:async(ctx:RequestContext,id:string)=>{if(ctx.groupId!=='ga'||id!=='knowledge')throw new OwnershipError('知识不存在');},resolveOutputProjectId:async(ctx:RequestContext,id:string)=>{await assertOutputOwned(ctx,id);return 'project';}};
 return {production:createProductionService(deps as any),links:createMaterialLinksService(deps)};
}
beforeEach(async()=>{
 store=await createDb();n=0;
 try{await store.client.exec(readFileSync(new URL('../../../drizzle/0117_group_project_derived.sql',import.meta.url),'utf8'));}catch(e){if((e as NodeJS.ErrnoException).code!=='ENOENT')throw e;}
 await store.client.exec(`INSERT INTO account_groups(id,user_id,name,created_at,updated_at) VALUES('ga','owner','甲','${NOW}','${NOW}'),('gb','owner','乙','${NOW}','${NOW}');
 INSERT INTO projects(id,user_id,group_id,title,brief,creation_mode,status,current_stage,started_at,created_at,updated_at) VALUES('project','owner','ga','项目','简介','guided','active','production','${NOW}','${NOW}','${NOW}');
 INSERT INTO content_outputs(id,project_id,title,content_type,status,created_at,updated_at) VALUES('output','project','产出','video','drafting','${NOW}','${NOW}');
 INSERT INTO assets(id,user_id,group_id,asset_type,name,status,created_at,updated_at) VALUES('asset','owner','ga','video','真实成片','active','${NOW}','${NOW}');
 INSERT INTO knowledge_items(id,user_id,group_id,current_revision_id,title,status,created_at,updated_at) VALUES('knowledge','owner','ga','revision','真实知识','active','${NOW}','${NOW}');`);
});
afterEach(async()=>store.client.close());
it('无真实平台账号也能制作共享output，同组切平台可读，跨组所有子项拒绝',async()=>{
 const {production}=services(),p=await production.getProduction(a,'output');
 expect((await production.getProduction({...a,accountId:'other-platform-filter'},'output')).id).toBe(p.id);
 await production.createSegment(a,p.id,{title:'片段',position:0,startMs:0,endMs:100});
 const e=await production.requestExport(a,p.id,{format:'mp4',resolution:'1080p',aspectRatio:'16:9'});
 const foreign={...a,groupId:'gb'};
 await expect(production.getProduction(foreign,'output')).rejects.toMatchObject({name:'OwnershipError'});
 await expect(production.listSegments(foreign,p.id)).rejects.toMatchObject({name:'OwnershipError'});
 await expect(production.completeExport(foreign,e.id,{resultAssetId:'asset'})).rejects.toMatchObject({name:'OwnershipError'});
 await expect(production.completeExport(a,e.id,{resultAssetId:'foreign-asset'})).rejects.toMatchObject({name:'OwnershipError'});
 expect((await production.completeExport(a,e.id,{resultAssetId:'asset'})).status).toBe('ready');
});
it('用料链全量查询和删除以真实父项目/组隔离，引用跨组实体拒绝',async()=>{
 const {links}=services(),link=await links.create(a,{projectId:'project',contentOutputId:'output',entityType:'asset',entityId:'asset'});
 expect((await links.list({...a,accountId:'other-filter'},{page:1,pageSize:100})).rows[0]?.id).toBe(link.id);
 expect((await links.list({...a,groupId:'gb'},{page:1,pageSize:100})).rows).toHaveLength(0);
 await expect(links.delete({...a,groupId:'gb'},link.id)).rejects.toMatchObject({name:'OwnershipError'});
 await expect(links.create(a,{projectId:'project',entityType:'asset',entityId:'foreign-asset'})).rejects.toMatchObject({name:'OwnershipError'});
 expect((await links.delete(a,link.id)).id).toBe(link.id);
});
it('归档工作区可读制作记录但拒绝制作/用料写',async()=>{
 const {production,links}=services(),p=await production.getProduction(a,'output');
 const link=await links.create(a,{projectId:'project',entityType:'knowledge',entityId:'knowledge'});
 await store.client.exec("UPDATE account_groups SET status='archived' WHERE id='ga'");
 expect((await production.getProduction(a,'output')).id).toBe(p.id);
 await expect(production.createSegment(a,p.id,{title:'新片段',position:0,startMs:0,endMs:100})).rejects.toThrow();
 await expect(links.delete(a,link.id)).rejects.toThrow();
});

it('缺少真实父项校验端口时组写拒绝，migration重复应用不改变父组',async()=>{
 const deps={db:store.db,now:()=>NOW,nextId:(p:string)=>`${p}-${++n}`};
 await expect(createProductionService(deps).getProduction(a,'output')).rejects.toMatchObject({name:'OwnershipError'});
 await expect(createMaterialLinksService(deps).create(a,{projectId:'project',entityType:'asset',entityId:'asset'})).rejects.toMatchObject({name:'OwnershipError'});
 const sql=readFileSync(new URL('../../../drizzle/0117_group_project_derived.sql',import.meta.url),'utf8');await store.client.exec(sql);await store.client.exec(sql);
 const {links}=services(),item=await links.create(a,{projectId:'project',entityType:'asset',entityId:'asset'});
 expect((await store.client.query('SELECT group_id,account_id FROM material_links WHERE id=$1',[item.id])).rows).toEqual([{group_id:'ga',account_id:null}]);
});

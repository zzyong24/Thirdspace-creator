import {readFileSync} from "node:fs";
import {afterEach,beforeEach,it,expect} from 'vitest';
import {createDb,OwnershipError,type RequestContext} from '@creatoros/backend';
import {createProjectsService,createProjectRepository} from '../projects';
import {createArtifactsService} from '../artifacts';
import {createKnowledgeService,createKnowledgeRepository} from '../knowledge';
import {createAssetsService,createAssetRepository,createMockObjectStorage} from '../assets';
import {createLearningsService} from '../learnings';
import {createPublishingService} from '../publishing';
import {createTaxonomyRepository} from './taxonomy.repository';
import {createTaxonomyService} from './taxonomy.service';
import {createAssetTagProposalService} from './asset-tag-proposal.service';
const NOW='2026-10-04T00:00:00Z',ctx:RequestContext={userId:'user',groupId:'ga',accountId:null,requestId:'tag',source:'user'};
let store:Awaited<ReturnType<typeof createDb>>,serial=0;
const deps={now:()=>NOW,nextId:(p:string)=>`${p}-${++serial}`};
beforeEach(async()=>{store=await createDb();serial=0;await store.client.exec(readFileSync(new URL("../../../drizzle/0122_group_asset_tag_adoption.sql",import.meta.url),"utf8"));await store.client.exec(`INSERT INTO account_groups(id,user_id,name,created_at,updated_at) VALUES('ga','user','甲','${NOW}','${NOW}'),('gb','user','乙','${NOW}','${NOW}'); INSERT INTO projects(id,user_id,group_id,title,status,current_stage,creation_mode,started_at,created_at,updated_at) VALUES('pa','user','ga','甲项目','active','ideation','manual','${NOW}','${NOW}','${NOW}'),('pb','user','gb','乙项目','active','ideation','manual','${NOW}','${NOW}','${NOW}'); INSERT INTO assets(id,user_id,group_id,asset_type,name,status,created_at,updated_at) VALUES('aa','user','ga','image','甲素材','active','${NOW}','${NOW}'),('ab','user','gb','image','乙素材','active','${NOW}','${NOW}');`);},30000);
afterEach(async()=>store.client.close(),30000);
function access(database=store.db){
 const projects=createProjectsService(createProjectRepository(database),deps);
 const artifacts=createArtifactsService({...deps,db:database,assertProjectOwned:(c,id)=>projects.getProject(c,id)});
 const knowledge=createKnowledgeService(createKnowledgeRepository(database,deps));
 const assets=createAssetsService(createAssetRepository(database,deps),async()=>createMockObjectStorage({nextKey:()=>`key/${++serial}`}),deps);
 const learnings=createLearningsService({...deps,db:database,projects:{assertOwnsProject:async(c,id)=>{await projects.getProject(c,id);},recordActivity:async()=>{}}});
 const publishing=createPublishingService({...deps,db:database});
 const check=async(c:RequestContext,type:string,id:string):Promise<unknown>=>{switch(type){
  case 'project':return projects.getProject(c,id);
  case 'artifact':{const row=await artifacts.getArtifact(c,id);await projects.getProject(c,row.projectId);return row;}
  case 'knowledge':return knowledge.getKnowledge(c,id);
  case 'asset':return assets.getAsset(c,id);
  case 'learning':return learnings.getLearning(c,id);
  case 'publication':return publishing.getPublication(c,id);
  default:throw new OwnershipError('实体不存在');
 }};
 return {assertEntityReadable:check,assertEntityWritable:async(c:RequestContext,type:string,id:string,transaction?:import("@creatoros/backend").Db):Promise<unknown>=>{if(transaction)return access(transaction).assertEntityWritable(c,type,id);const row=await check(c,type,id);if(type==='asset'||type==='knowledge'){const owned=row as {groupId?:string|null;accountId?:string|null};if(c.groupId?owned.groupId!==c.groupId:owned.accountId!==c.accountId)throw new OwnershipError('原资源只读');}return row;}};
}
function service(){return createTaxonomyService(createTaxonomyRepository(store.db,deps),access());}
it('组入口跨组实体不能打标或读取关联，同组平台筛选不改变创作范围',async()=>{const s=service(),tag=await s.createTag(ctx,{name:'共用字典'});await expect(s.assignTags(ctx,{entityType:'project',entityId:'pb',tagIds:[tag.id]})).rejects.toMatchObject({code:'OwnershipError'});await s.assignTags(ctx,{entityType:'project',entityId:'pa',tagIds:[tag.id]});expect(await s.listTagsForEntity({...ctx,accountId:'real-platform-filter'},{entityType:'project',entityId:'pa'})).toHaveLength(1);await expect(s.listTagsForEntity({...ctx,groupId:'gb'},{entityType:'project',entityId:'pa'})).rejects.toMatchObject({code:'OwnershipError'});});
it('user级标签字典的实体列表只回当前组可见实体，移除不能跨组',async()=>{const s=service(),tag=await s.createTag(ctx,{name:'同名标签'});await s.assignTags(ctx,{entityType:'project',entityId:'pa',tagIds:[tag.id]});await s.assignTags({...ctx,groupId:'gb'},{entityType:'project',entityId:'pb',tagIds:[tag.id]});expect((await s.listEntitiesForTag(ctx,tag.id,{})).map(r=>r.entityId)).toEqual(['pa']);await expect(s.removeTag(ctx,{entityType:'project',entityId:'pb',tagId:tag.id})).rejects.toMatchObject({code:'OwnershipError'});});
it('空组账号素材可人工打标和AI准备采纳，回执随组而非平台筛选冻结',async()=>{const s=service(),tag=await s.createTag(ctx,{name:'人工'});await s.assignTags(ctx,{entityType:'asset',entityId:'aa',tagIds:[tag.id]});const ai=createAssetTagProposalService(store.db,deps),proposal={proposalId:'p',targets:await ai.prepare(ctx,['aa']),tag:'模型建议'};const first=await ai.adopt(ctx,proposal);expect(await ai.adopt({...ctx,accountId:'other-real-filter'},proposal)).toEqual(first);await expect(ai.prepare({...ctx,groupId:'gb'},['aa'])).rejects.toMatchObject({code:'OwnershipError'});});

it('六种实体公共父服务均拒绝别组与别user，grant只可读取原资源标签',async()=>{
 await store.client.exec(`INSERT INTO content_outputs(id,project_id,title,content_type,status,created_at,updated_at) VALUES('oa','pa','输出','video','active','${NOW}','${NOW}'),('ob','pb','输出','video','active','${NOW}','${NOW}');
 INSERT INTO artifacts(id,user_id,group_id,project_id,stage,artifact_type,title,created_at,updated_at) VALUES('fa','user','ga','pa','script','script','脚本','${NOW}','${NOW}'),('fb','user','gb','pb','script','script','脚本','${NOW}','${NOW}');
 INSERT INTO knowledge_items(id,user_id,group_id,current_revision_id,title,status,created_at,updated_at) VALUES('ka','user','ga','rka','知识甲','active','${NOW}','${NOW}'),('kb','user','gb','rkb','知识乙','active','${NOW}','${NOW}');
 INSERT INTO learnings(id,user_id,group_id,title,created_at,updated_at) VALUES('la','user','ga','经验甲','${NOW}','${NOW}'),('lb','user','gb','经验乙','${NOW}','${NOW}');
 INSERT INTO publications(id,user_id,group_id,account_id,content_output_id,platform,account_reference,created_at,updated_at) VALUES('ua','user','ga','actual-a','oa','douyin','账号甲','${NOW}','${NOW}'),('ub','user','gb','actual-b','ob','douyin','账号乙','${NOW}','${NOW}');`);
 const s=service(),tag=await s.createTag(ctx,{name:'六实体'});
 for(const [entityType,entityId,foreignId] of [['project','pa','pb'],['artifact','fa','fb'],['knowledge','ka','kb'],['asset','aa','ab'],['learning','la','lb'],['publication','ua','ub']]){
  await s.assignTags(ctx,{entityType:entityType!,entityId:entityId!,tagIds:[tag.id]});
  await expect(s.assignTags(ctx,{entityType:entityType!,entityId:foreignId!,tagIds:[tag.id]})).rejects.toMatchObject({code:'OwnershipError'});
  await expect(s.listTagsForEntity({...ctx,userId:'other'},{entityType:entityType!,entityId:entityId!})).rejects.toMatchObject({code:'OwnershipError'});
 }
 await store.client.exec(`INSERT INTO resource_access_grants(id,user_id,target_group_id,resource_type,resource_id,origin_group_id,migration_id,created_at) VALUES('asset-grant','user','gb','asset','aa','ga','migration','${NOW}'),('knowledge-grant','user','gb','knowledge','ka','ga','migration','${NOW}')`);
 for(const [entityType,entityId] of [['asset','aa'],['knowledge','ka']]){expect(await s.listTagsForEntity({...ctx,groupId:'gb'},{entityType:entityType!,entityId:entityId!})).toHaveLength(1);await expect(s.assignTags({...ctx,groupId:'gb'},{entityType:entityType!,entityId:entityId!,tagIds:[tag.id]})).rejects.toMatchObject({code:'OwnershipError'});await expect(s.removeTag({...ctx,groupId:'gb'},{entityType:entityType!,entityId:entityId!,tagId:tag.id})).rejects.toMatchObject({code:'OwnershipError'});}
});
it('归档组保留标签读取但拒绝人工与AI标签写，没有实体端口不放宽为全user',async()=>{const s=service(),tag=await s.createTag(ctx,{name:'归档'});await s.assignTags(ctx,{entityType:'project',entityId:'pa',tagIds:[tag.id]});await store.client.exec("UPDATE account_groups SET status='archived' WHERE id='ga'");expect(await s.listTagsForEntity(ctx,{entityType:'project',entityId:'pa'})).toHaveLength(1);await expect(s.removeTag(ctx,{entityType:'project',entityId:'pa',tagId:tag.id})).rejects.toMatchObject({code:'OwnershipError'});const ai=createAssetTagProposalService(store.db,deps),targets=await ai.prepare(ctx,['aa']);expect(targets).toHaveLength(1);await expect(ai.adopt(ctx,{proposalId:'archived',targets,tag:'新标签'})).rejects.toMatchObject({code:'OwnershipError'});await expect(createTaxonomyService(createTaxonomyRepository(store.db,deps)).listTagsForEntity(ctx,{entityType:'project',entityId:'pa'})).rejects.toMatchObject({code:'OwnershipError'});});
it('旧账号真实隔离与组回执独立，SQL重复迁移不会重属已有回执',async()=>{await store.client.exec(`INSERT INTO assets(id,user_id,account_id,asset_type,name,status,created_at,updated_at) VALUES('old','user','legacy-real','image','旧素材','active','${NOW}','${NOW}')`);const ai=createAssetTagProposalService(store.db,deps),legacy={...ctx,groupId:null,accountId:'legacy-real'},proposal={proposalId:'same',targets:await ai.prepare(legacy,['old']),tag:'旧采纳'};const receipt=await ai.adopt(legacy,proposal);await expect(ai.prepare({...legacy,accountId:'another-real'},['old'])).rejects.toMatchObject({code:'OwnershipError'});const text=readFileSync(new URL('../../../drizzle/0122_group_asset_tag_adoption.sql',import.meta.url),'utf8');await store.client.exec(text);await store.client.exec(text);expect(await ai.adopt(legacy,proposal)).toEqual(receipt);const group=await ai.adopt(ctx,{proposalId:'same',targets:await ai.prepare(ctx,['aa']),tag:'组采纳'});expect(group.assetIds).toEqual(['aa']);expect((await store.client.query<{group_id:string|null;account_id:string|null}>('SELECT group_id,account_id FROM asset_tag_adoptions ORDER BY group_id NULLS LAST')).rows).toEqual([{group_id:'ga',account_id:null},{group_id:null,account_id:'legacy-real'}]);});
it('瞬时父实体校验后转组，事务锁组后的实际父服务复验阻止旧组写',async()=>{const base=access();let first=true;const s=createTaxonomyService(createTaxonomyRepository(store.db,deps),{...base,assertEntityWritable:async(c,type,id,tx)=>{const row=await base.assertEntityWritable(c,type,id,tx);if(first){first=false;await store.client.exec("UPDATE projects SET group_id='gb' WHERE id='pa'");}return row;}}),tag=await s.createTag(ctx,{name:'并发归属'});await expect(s.assignTags(ctx,{entityType:'project',entityId:'pa',tagIds:[tag.id]})).rejects.toMatchObject({code:'OwnershipError'});expect((await store.client.query<{count:number}>('SELECT COUNT(*)::int AS count FROM entity_tags WHERE entity_id=$1',['pa'])).rows[0]?.count).toBe(0);expect((await s.listTags(ctx,{}))[0]?.usageCount).toBe(0);});

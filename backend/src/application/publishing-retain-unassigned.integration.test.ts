import {afterAll,beforeAll,expect,it} from 'vitest';
import {createDb,eq,artifactVersions,artifacts} from '../index';
import {createAccountGroupService} from '../modules/platform-account';
import {createProjectsService,createProjectRepository} from '../modules/projects';
import {createUnassignedDraftRetainer} from './publishing-retain-unassigned';
let store:Awaited<ReturnType<typeof createDb>>;let seq=0;const now=()=>new Date().toISOString(),nextId=(prefix:string)=>prefix+'-unassigned-'+ ++seq;
beforeAll(async()=>{store=await createDb();});afterAll(async()=>store?.client.close());
it('空组采纳保留完整可编辑平台物料，重复请求同回执且跨组拒绝',async()=>{
 const base={userId:'unassigned-owner',requestId:'adopt',source:'user' as const};const groups=createAccountGroupService({db:store.db,now,nextId});const a=await groups.create(base,{name:'主品牌',idempotencyKey:'a'}),b=await groups.create(base,{name:'其它品牌',idempotencyKey:'b'});const ctx={...base,groupId:a.id};
 const projects=createProjectsService(createProjectRepository(store.db),{now,nextId});const project=await projects.createProject(ctx,{title:'一期内容'});const output=await projects.createOutput(ctx,project.id,{title:'主稿'});
 const input={outputId:output.id,adoptionKey:'candidate-adoption-1',platform:'wechatOfficial',title:'文章标题',description:'完整文章正文',platformTags:['创作']};const retain=createUnassignedDraftRetainer({db:store.db,now,nextId});
 const first=await retain(ctx,input);const second=await retain(ctx,input);expect(second.id).toBe(first.id);
 const rows=await store.db.select().from(artifacts);expect(rows).toHaveLength(1);expect(rows[0]).toMatchObject({groupId:a.id,accountId:null,artifactType:'platform_copy'});
 const versions=await store.db.select().from(artifactVersions).where(eq(artifactVersions.artifactId,rows[0]!.id));expect(versions.filter(v=>v.adoptionKey===input.adoptionKey)).toHaveLength(1);expect(versions.find(v=>v.adoptionKey===input.adoptionKey)?.contentData).toEqual({...input,needsTarget:true});
 await expect(retain(ctx,{...input,description:'同来源改正文'})).rejects.toMatchObject({code:'ConflictError'});await expect(retain({...ctx,groupId:b.id},input)).rejects.toMatchObject({code:'OwnershipError'});
});

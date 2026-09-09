import {beforeEach,afterEach,it,expect} from 'vitest';
import {readFile} from 'node:fs/promises';
import {createDb,creatorProfiles,eq,type Db} from '@creatoros/backend';
import type {RequestContext} from '@creatoros/contract';
import {createPositioningService} from './positioning.service';
import {createPositioningRepository} from './positioning.repository';
const ctx:RequestContext={userId:'fixture-user',accountId:'fixture-account',requestId:'r',source:'user'};
const profile={persona:'作者',field:'工程',audience:'开发者',differentiation:'实践',capabilities:['实测'],facets:{contentScope:'工程',avoid:'假数据',corePain:'落地',coreValue:'可复现',tone:'直白',statusNote:''},downstreamRules:{topicRule:'真实',scriptRule:'因果',projectRule:'可执行',forbidRule:'造假',expressionRule:'口语'}};
const statement=(oneLiner:string)=>({oneLiner,keywords:['工程','实践','复现'],productAnchorIds:[]});
let db:Db,client:Awaited<ReturnType<typeof createDb>>['client'],service:ReturnType<typeof createPositioningService>,repo:ReturnType<typeof createPositioningRepository>;
beforeEach(async()=>{({db,client}=await createDb());let n=0;const deps={now:()=>new Date().toISOString(),nextId:(p:string)=>`${p}-${++n}`};service=createPositioningService({db,...deps,projects:{getProjectSubject:async()=>({title:'工程实践',brief:'复现'})}});repo=createPositioningRepository(db,{...deps,userId:ctx.userId,accountId:ctx.accountId!});});
afterEach(async()=>{await client.close();});
async function two(){await service.upsertProfile(ctx,profile);const v1=await service.createStatementVersion(ctx,statement('原定位'));await service.upsertProfile(ctx,{...profile,persona:'新作者'});const v2=await service.createStatementVersion(ctx,statement('新定位'));return {v1,v2};}
it('反复恢复低版本不增加任何历史；原文不变；下一次真实创建保持全历史max+1',async()=>{
 const {v1,v2}=await two();const before=(await service.listStatements(ctx,{limit:20,offset:0})).rows;
 for(let i=0;i<3;i++){const restored=await service.restoreMaster(ctx,v1.id);expect(restored.statement.id).toBe(v1.id);expect((await service.getPositioningCenter(ctx)).currentStatement?.id).toBe(v1.id);}
 expect((await service.listStatements(ctx,{limit:20,offset:0})).rows).toEqual(before);expect((await service.getProfile(ctx))?.persona).toBe('作者');
 const v3=await service.createStatementVersion(ctx,statement('真正的新定位'));expect(v3.versionNumber).toBe(v2.versionNumber+1);expect((await service.getPositioningCenter(ctx)).currentStatement?.id).toBe(v3.id);
});
it('0093可重复迁移旧库且不新增历史；null保留旧最新选择；坏指针不偷选别版',async()=>{
 const {v2}=await two();await client.exec('ALTER TABLE creator_profiles DROP COLUMN current_statement_id');
 const migration=await readFile(new URL('../../../drizzle/0093_positioning_current_statement.sql',import.meta.url),'utf8');await client.exec(migration);await client.exec(migration);
 expect((await service.getPositioningCenter(ctx)).currentStatement?.id).toBe(v2.id);expect((await service.listStatements(ctx,{limit:20,offset:0})).total).toBe(2);
 const row=(await repo.getProfile())!;await db.update(creatorProfiles).set({currentStatementId:'not-owned-or-missing'}).where(eq(creatorProfiles.id,row.id));
 expect((await service.getPositioningCenter(ctx)).currentStatement).toBeNull();
});
it('reset floor仍隐藏旧陈述，显式恢复可选floor以下原版本；跨账号拒绝',async()=>{
 const {v1}=await two();const row=(await repo.getProfile())!;await repo.archiveAndResetProfileRow(row.id,{...profile,persona:'新作者'});
 expect((await service.getPositioningCenter(ctx)).currentStatement).toBeNull();
 await expect(service.restoreMaster({...ctx,accountId:'another-account'},v1.id)).rejects.toThrow();
 await service.restoreMaster(ctx,v1.id);expect((await service.getPositioningCenter(ctx)).currentStatement?.id).toBe(v1.id);
});
it('采纳CAS按选中的旧ID核对，拒绝旧页面最大版本；采纳只追加一个新版本并切换',async()=>{
 const {v1,v2}=await two();const session=await service.startDiscovery(ctx,'optimize');await service.restoreMaster(ctx,v1.id);
 const input={sessionId:session.id,candidateId:'fixture-candidate',candidateRevision:session.revision,expectedCurrentStatementId:v2.id,idempotencyKey:'adopt-fixture',proposal:{...profile,...statement('采纳的新方向')}};
 await expect(service.confirmDiscovery(ctx,input)).rejects.toThrow('已经变化');
 const adopted=await service.confirmDiscovery(ctx,{...input,expectedCurrentStatementId:v1.id});expect(adopted.statement.versionNumber).toBe(3);expect((await service.getPositioningCenter(ctx)).currentStatement?.id).toBe(adopted.statement.id);
 expect((await service.confirmDiscovery(ctx,{...input,expectedCurrentStatementId:v1.id})).statement.id).toBe(adopted.statement.id);
});

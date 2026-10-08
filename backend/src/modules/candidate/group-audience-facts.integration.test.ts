import {beforeEach,afterEach,it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import {createDb,OwnershipError,type RequestContext} from '@creatoros/backend';
import {createCandidateService} from './candidate.service';
import {createPublishingService} from '../publishing/publishing.service';
import {createMembershipLockService} from '../platform-account/membership-lock.service';
const NOW='2026-10-04T00:00:00Z',a:RequestContext={userId:'owner',groupId:'ga',accountId:'account',requestId:'signals',source:'ingestion',ingestionRunId:'run'};
let store:Awaited<ReturnType<typeof createDb>>,n=0;
function service(){const publishing=createPublishingService({db:store.db,now:()=>NOW,nextId:(p:string)=>`${p}-${++n}`,membership:createMembershipLockService(store.db),assertTargetAccount:async(ctx:RequestContext,target:{accountId:string;platform:string})=>{const q=await store.client.query('SELECT id FROM platform_accounts WHERE id=$1 AND user_id=$2 AND platform=$3',[target.accountId,ctx.userId,target.platform]);if(!q.rows.length)throw new OwnershipError('真实账号平台不匹配');}} as any);return createCandidateService({db:store.db,now:()=>NOW,nextId:(p:string)=>`${p}-${++n}`,projects:{createProject:async()=>({id:'project'})},ingestion:{assertRunExists:async(ctx:RequestContext,id:string)=>{const q=await store.client.query('SELECT id FROM ingestion_runs WHERE id=$1 AND user_id=$2 AND group_id=$3 AND account_id=$4',[id,ctx.userId,ctx.groupId,ctx.accountId]);if(!q.rows.length)throw new OwnershipError('采集任务不存在');}},resolveCollectedPublication:(ctx:RequestContext,id:string)=>publishing.resolveCollectedPublicationById(ctx,id)} as any);}
beforeEach(async()=>{store=await createDb();n=0;try{await store.client.exec(readFileSync(new URL('../../../drizzle/0118_group_audience_facts.sql',import.meta.url),'utf8'));}catch(e){if((e as NodeJS.ErrnoException).code!=='ENOENT')throw e;}
 await store.client.exec(`INSERT INTO account_groups(id,user_id,name,created_at,updated_at) VALUES('ga','owner','甲','${NOW}','${NOW}'),('gb','owner','乙','${NOW}','${NOW}');
 INSERT INTO platform_accounts(id,user_id,platform,account_handle,created_at,updated_at) VALUES('account','owner','douyin','真实账号','${NOW}','${NOW}');
 INSERT INTO account_group_memberships(id,user_id,group_id,platform_account_id,joined_at) VALUES('member','owner','ga','account','${NOW}');
 INSERT INTO publications(id,user_id,group_id,account_id,content_output_id,platform,account_reference,status,created_at,updated_at) VALUES('pub','owner','ga','account','output','douyin','真实账号','published','${NOW}','${NOW}');
 INSERT INTO external_sources(id,user_id,account_id,source_type,name,created_at) VALUES('source','owner','account','douyin','评论采集','${NOW}');
 INSERT INTO ingestion_runs(id,user_id,group_id,account_id,external_source_id,run_type,idempotency_key,status,started_at) VALUES('run','owner','ga','account','source','comments','first','running','${NOW}');`);
});
afterEach(async()=>store.client.close());
it('真实账号转组后评论仍由Publication冻结原组，重复ID不新建、不用新run覆盖原事实',async()=>{
 const s=service();await store.client.exec(`INSERT INTO candidates(id,user_id,group_id,title,source,created_at,updated_at) VALUES('candidate-a','owner','ga','原组候选','idea','${NOW}','${NOW}')`);const record={source:'comment',rawText:'用户问题',publicationId:'pub',externalId:'comment',linkedCandidateRef:'candidate-a'};
 const first=await s.ingestAudienceSignal(a,record);
 await store.client.exec("UPDATE account_group_memberships SET group_id='gb',version=2 WHERE id='member'; UPDATE ingestion_runs SET status='completed' WHERE id='run'; INSERT INTO ingestion_runs(id,user_id,group_id,account_id,external_source_id,run_type,idempotency_key,status,started_at) VALUES('run-next','owner','gb','account','source','comments','next','running','2026-10-04T00:00:00Z'); UPDATE account_groups SET status='archived' WHERE id='ga'");
 const collector={...a,groupId:'gb',ingestionRunId:'run-next'},again=await s.ingestAudienceSignal(collector,record),next=await s.ingestAudienceSignal(collector,{...record,externalId:'comment-next'});
 expect(again.id).toBe(first.id);expect(again.inserted).toBe(false);expect((await store.client.query<{group_id:string}>('SELECT group_id FROM audience_signals WHERE id=$1',[next.id])).rows[0]?.group_id).toBe('ga');expect((await store.client.query<{account_id:string;ingestion_run_id:string}>('SELECT account_id,ingestion_run_id FROM audience_signals WHERE id=$1',[next.id])).rows[0]).toMatchObject({account_id:'account',ingestion_run_id:'run-next'});expect((await store.client.query<{ingestion_run_id:string}>('SELECT ingestion_run_id FROM audience_signals WHERE id=$1',[first.id])).rows[0]?.ingestion_run_id).toBe('run');
 expect((await s.listSignals({...a,accountId:null},{limit:100,offset:0})).total).toBe(2);
 expect((await s.listSignals({...collector,accountId:null},{limit:100,offset:0})).total).toBe(0);expect((await s.getCandidate({...a,accountId:null},'candidate-a')).demandCount).toBe(2);
});
it('跨user/真实account Publication拒绝；引用外组候选拒绝',async()=>{
 const s=service();
 await store.client.exec(`INSERT INTO publications(id,user_id,group_id,account_id,content_output_id,platform,account_reference,status,created_at,updated_at) VALUES('foreign','foreign','ga','account','foreign','douyin','','published','${NOW}','${NOW}');
 INSERT INTO publications(id,user_id,group_id,account_id,content_output_id,platform,account_reference,status,created_at,updated_at) VALUES('other-account-pub','owner','ga','other-real-account','foreign','douyin','','published','${NOW}','${NOW}');
 INSERT INTO candidates(id,user_id,group_id,title,source,created_at,updated_at) VALUES('other-candidate','owner','gb','其他组候选','idea','${NOW}','${NOW}');`);
 await expect(s.ingestAudienceSignal(a,{source:'comment',rawText:'伪造',publicationId:'foreign'})).rejects.toMatchObject({name:'OwnershipError'});await expect(s.ingestAudienceSignal(a,{source:'comment',rawText:'伪造',publicationId:'other-account-pub'})).rejects.toMatchObject({name:'OwnershipError'});
 await expect(s.ingestAudienceSignal(a,{source:'comment',rawText:'伪造',publicationId:'pub',linkedCandidateRef:'other-candidate'})).rejects.toMatchObject({name:'OwnershipError'});
});

it('内部历史发布 resolver 拒绝公开来源和过期成员，迁移可重复执行',async()=>{
 const publishing=createPublishingService({db:store.db,now:()=>NOW,nextId:(p:string)=>`${p}-${++n}`,membership:createMembershipLockService(store.db),assertTargetAccount:async()=>{}} as any);
 await expect(publishing.resolveCollectedPublicationById({...a,source:'user'},'pub')).rejects.toMatchObject({name:'OwnershipError'});
 await store.client.exec("UPDATE account_group_memberships SET group_id='gb',version=2 WHERE id='member'");
 await expect(publishing.resolveCollectedPublicationById(a,'pub')).rejects.toThrow();
 await store.client.exec(`DROP TRIGGER t1022_audience_publication_group ON audience_signals; INSERT INTO audience_signals(id,user_id,group_id,account_id,source,raw_text,publication_id,created_at) VALUES('wrong-old','owner','gb','account','comment','旧迁移错归','pub','${NOW}')`);const sql=readFileSync(new URL('../../../drizzle/0118_group_audience_facts.sql',import.meta.url),'utf8');await store.client.exec(sql);await store.client.exec(sql);expect((await store.client.query<{group_id:string}>("SELECT group_id FROM audience_signals WHERE id='wrong-old'")).rows[0]?.group_id).toBe('ga');await store.client.exec(`INSERT INTO audience_signals(id,user_id,group_id,account_id,source,raw_text,publication_id,created_at) VALUES('wrong-new','owner','gb','account','comment','新采集事实','pub','${NOW}')`);expect((await store.client.query<{group_id:string}>("SELECT group_id FROM audience_signals WHERE id='wrong-new'")).rows[0]?.group_id).toBe('ga');
});
it('评论事实支持同组真实账号筛选，候选 demandCount 汇总组内全部评论',async()=>{
 const s=service();await store.client.exec(`INSERT INTO candidates(id,user_id,group_id,title,source,created_at,updated_at) VALUES('all-comments','owner','ga','候选','idea','${NOW}','${NOW}');
 INSERT INTO audience_signals(id,user_id,group_id,account_id,source,raw_text,linked_candidate_id,created_at) VALUES('other-signal','owner','ga','other-real-account','comment','另一真实号评论','all-comments','${NOW}');`);
 await s.ingestAudienceSignal(a,{source:'comment',rawText:'当前号评论',publicationId:'pub',linkedCandidateRef:'all-comments'});
 expect((await s.listSignals(a,{limit:100,offset:0})).total).toBe(1);
 expect((await s.listSignals({...a,accountId:null},{limit:100,offset:0})).total).toBe(2);
 expect((await s.getCandidate(a,'all-comments')).demandCount).toBe(2);
});

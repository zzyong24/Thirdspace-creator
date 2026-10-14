import {beforeAll,afterAll,it,expect} from 'vitest';
import {createHash} from 'node:crypto';
import {accountGroups} from '../../schema/account-groups';
import {createDb,eq,intelligenceSources,intelligenceSyncRuns,intelligenceItems,sourceSnapshots,itemTranscripts,intelligenceTransforms,executionTasks,executionCalls} from '../../index';
import {ENDPOINTS} from '@creatoros/contract';
import {createPersistentTaskService} from '../execution/persistent-task.service';
import {createIntelligenceService} from './intelligence.service';
import {createIntelligenceTransport} from './intelligence.transport';
// 公共transport→完整真实service→隔离真实PGlite。topics.create只替外部选题存储；model receipt为明确机械协议fixture，不调用模型。
const ctx={userId:'fixture-user',groupId:'fixture-group-A',accountId:null,requestId:'fixture-request',source:'user'} as const;
const other={...ctx,groupId:'fixture-group-B'},TEXT='用户明确提供的中性整理说明',DRAFT='模型协议fixture已保存的中性改写正文';
const H=(s:string)=>'sha256:'+createHash('sha256').update(s).digest('hex');
let db:any,client:any,sequence=0;const stamp=()=>new Date().toISOString();
beforeAll(async()=>{const c=await createDb({}); // no dataDir: owned memory-only PGlite, never PG/HOME
db=c.db;client=c.client;for(const id of [ctx.groupId,other.groupId])await db.insert(accountGroups).values({id,userId:ctx.userId,name:id,status:'active',createdAt:stamp(),updatedAt:stamp()});},120000);
afterAll(async()=>{await client?.close();},120000);
async function setup(options:any={}){
 const tag='fixture-'+(++sequence),sourceId=tag+'-source',runId=tag+'-run',itemId=tag+'-item',snapshotId=tag+'-snapshot',taskId=tag+'-task',transformId=tag+'-transform',time=stamp(),own={userId:ctx.userId,accountId:null,groupId:ctx.groupId},url='https://example.com/'+tag;
 await db.insert(intelligenceSources).values({...own,id:sourceId,type:'rss',platform:'example.com',displayName:'来源storage fixture',canonicalUrl:url,externalKey:tag,status:'active',createdAt:time,updatedAt:time});
 await db.insert(intelligenceSyncRuns).values({...own,id:runId,sourceId,executionTaskId:taskId,trigger:'manual',status:'succeeded_with_items',createdAt:time,updatedAt:time});
 await db.insert(intelligenceItems).values({...own,id:itemId,type:'article',platform:'example.com',canonicalUrl:url,canonicalUrlHash:tag,title:'来源fixture真实保存标题',capturedAt:time,createdAt:time,updatedAt:time});
 await db.insert(sourceSnapshots).values({...own,id:snapshotId,sourceId,runId,itemId,capturedAt:time,finalUrl:url,title:'来源fixture标题',contentHash:tag+'-hash',privacyClass:'public'});
 await db.insert(itemTranscripts).values({...own,itemId,status:'done',text:TEXT,source:'manual',completedAt:time,updatedAt:time});
 await db.insert(executionTasks).values({...own,id:taskId,kind:'topic_preview',ownerType:'transform',ownerId:itemId,status:options.failed?'failed':'succeeded',idempotencyKey:tag+'-task',createdAt:time,updatedAt:time});
 if(!options.noCall)await db.insert(executionCalls).values({id:tag+'-call',executionTaskId:taskId,sequence:1,operationKey:'fixture-only/no-model-execution',kind:'model',inputDigest:'sha256:fixture',status:'settled',reservedTokens:0,providerResult:{fixture:'仅外部模型完成回执的机械存储夹具，未执行官方模型'},createdAt:time,updatedAt:time});
 const strategy={keep:['来源'],replace:[],add:[],avoid:[]};
 const draft={contentText:options.empty?'':DRAFT,generatedFromTranscriptHash:options.badHash?H('错误来源'):H(TEXT),templateVersion:'fixture-template-v1'};
 const output=options.legacy?{adaptedDraft:{...draft,strategyHash:H(JSON.stringify(strategy))}}:{generationMode:'rewrite_only',personalizationStatus:'not_applied',adaptedDraft:{...draft,generationMode:'rewrite_only',sourceSnapshotId:snapshotId,personalizationStatus:'not_applied',aiTaskId:taskId}};
 await db.insert(intelligenceTransforms).values({...own,id:transformId,itemId,sourceSnapshotId:snapshotId,kind:'topic',positioningVersionId:null,aiTaskId:taskId,idempotencyKey:tag+'-preview',status:'candidate',outputSnapshot:output,createdAt:time,updatedAt:time});
 const created:any[]=[];const topics={create:async(context:any,input:any)=>{expect(context.groupId).toBe(ctx.groupId);created.push(input);return {id:tag+'-topic',adoptedTitle:input.title,adoptedDraftContentText:input.card.adaptedDraft.contentText};}};
 const service=createIntelligenceService(db,{now:stamp,nextId:(p:string)=>p+'-'+(++sequence),tasks:createPersistentTaskService(db),topics} as any),transport=createIntelligenceTransport(()=>service);
 const call=async(body:any,scope:any=ctx)=>{const parsed=ENDPOINTS.confirmIntelligenceTopic.body.parse(body);const res:any=await transport.request(ENDPOINTS.confirmIntelligenceTopic,{params:{transformId},query:undefined,body:parsed},scope);return ENDPOINTS.confirmIntelligenceTopic.response.parse(res.data);};
 const row=async()=> (await db.select().from(intelligenceTransforms).where(eq(intelligenceTransforms.id,transformId)))[0];
 return {call,row,created,transformId,itemId,snapshotId,taskId,strategy};
}
it('合法key-only rewrite_only经公开transport采纳服务已存原稿（原RED目标）',async()=>{const f=await setup();const x=await f.call({idempotencyKey:'original-key'});expect(x.provenance).toEqual({itemId:f.itemId,sourceSnapshotId:f.snapshotId,positioningVersionId:null});expect(f.created).toHaveLength(1);expect(f.created[0].card.adaptedDraft.contentText).toBe(DRAFT);expect((await f.row()).status).toBe('confirmed');expect(x.topicId).toBe((await f.row()).targetTopicId);});
{ // 所有回归常态执行；历史RED另已保存，不以env跳过保护用例。
 it('显式用户编辑正文保持真实来源和原task',async()=>{const f=await setup();await f.call({idempotencyKey:'edited-key',editedDraftContentText:'用户明确编辑的完整正文'});expect(f.created[0].card.adaptedDraft).toMatchObject({contentText:'用户明确编辑的完整正文',sourceSnapshotId:f.snapshotId,generatedFromTranscriptHash:H(TEXT),aiTaskId:f.taskId});});
 it('旧strategy-backed完整editedCandidate仍可采纳',async()=>{const f=await setup({legacy:true});await f.call({idempotencyKey:'legacy-key',editedCandidate:{title:'旧完整选题',angle:'旧角度',differentiation:'',sourceSummary:'',targetAudience:'',audiencePain:'',coreConflict:'',format:'',adaptationStrategy:f.strategy}});expect(f.created).toHaveLength(1);expect(f.created[0].title).toBe('旧完整选题');expect(f.created[0].card.adaptedDraft.strategyHash).toBe(H(JSON.stringify(f.strategy)));});
 it('旧strategy-backed key-only仍由真实service拒绝，不放松原完整卡片',async()=>{const f=await setup({legacy:true});await expect(f.call({idempotencyKey:'not-legacy'})).rejects.toThrow('旧版选题候选字段缺失');expect(f.created).toHaveLength(0);});
 for(const [name,opt,error]of [['空原稿',{empty:true},'REWRITE_DRAFT_NOT_READY'],['未成功模型任务',{failed:true},'REWRITE_TASK_NOT_SUCCEEDED'],['无完成模型回执',{noCall:true},'MODEL_CALL_RECEIPT_MISSING'],['错正文hash',{badHash:true},'TRANSCRIPT_CHANGED_AFTER_REWRITE']] as const){
  it(name+'不得因transport校准绕过service guard',async()=>{const f=await setup(opt);await expect(f.call({idempotencyKey:'reject-'+name})).rejects.toThrow(error);expect(f.created).toHaveLength(0);expect((await f.row()).status).toBe('candidate');});
 }
 it('错组沿真实ownership拒绝且原组状态不变',async()=>{const f=await setup();await expect(f.call({idempotencyKey:'wrong-group',editedDraftContentText:DRAFT},other)).rejects.toThrow();expect(f.created).toHaveLength(0);expect((await f.row()).targetTopicId).toBeNull();});
 it('原key和新key重复确认都返回同原topic，仅一次存储创建',async()=>{const f=await setup();const a=await f.call({idempotencyKey:'same-key'}),b=await f.call({idempotencyKey:'same-key'}),c=await f.call({idempotencyKey:'another-key'});expect(b.topicId).toBe(a.topicId);expect(c.topicId).toBe(a.topicId);expect(f.created).toHaveLength(1);});
 it('当前来源文案改变仍拒绝采纳旧稿，不伪provenance',async()=>{const f=await setup();await db.update(itemTranscripts).set({text:'后来改变的来源'}).where(eq(itemTranscripts.itemId,f.itemId));await expect(f.call({idempotencyKey:'changed-source'})).rejects.toThrow('TRANSCRIPT_CHANGED_AFTER_REWRITE');expect(f.created).toHaveLength(0);});
 it('公开strict schema仍拒空编辑与客户端伪provenance',async()=>{const f=await setup();await expect(f.call({idempotencyKey:'invalid',editedDraftContentText:'   '})).rejects.toThrow();await expect(f.call({idempotencyKey:'invalid',sourceSnapshotId:'fake'})).rejects.toThrow();expect(f.created).toHaveLength(0);});
}

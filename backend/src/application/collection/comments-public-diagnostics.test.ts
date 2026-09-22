import {expect,it,vi} from 'vitest';
import {createCommentsCollector} from './comments';
import {formatCommentReadDiagnostics,type CommentReadDiagnostics} from './comment-read-diagnostics';
import type {CommentRecord} from './comment-ingestion';
import {runScheduledCollection} from '../../modules/ai-runtime/scheduled-collection-runner';
import {ScheduledFlywheelSuspended} from '../../modules/ai-runtime/scheduled-flywheel-suspension';

// 仅替换存储端口；真实 collector → ingestComments → runner → 公开 steps 文本，不连接用户数据库。
vi.mock('../../modules/ingestion',async importOriginal=>({...await importOriginal<object>(),createIngestionRepository:()=>({recordExists:async()=>false,markRecordResult:async()=>{}})}));
const ctx={userId:'u',accountId:'a',requestId:'r',source:'ingestion' as const};
const task={id:'original-task',taskType:'scheduled.comments',inputData:{jobId:'job',jobRunId:'run',target:{}}};
const diagnostics=(complete:boolean):CommentReadDiagnostics=>({matchedResponses:complete?1:0,validResponses:complete?1:0,invalidResponses:0,parsedComments:0,pendingResponses:0,reason:complete?'stable_end':'no_matching_response'});
type Work={awemeId:string;records:CommentRecord[];complete?:boolean;diagnostics?:CommentReadDiagnostics};
type CollectorPorts=Parameters<typeof createCommentsCollector>[0];
function setup(works:Work[],options:{truncated?:boolean;inserted?:boolean;total?:number}={}){
 const pubs=Array.from({length:options.total??works.length},(_,i)=>({id:`p${i}`,externalId:`v${i}`,platform:'douyin',status:'published',hiddenAt:null}));
 const failed=new Set<string>();
 const settled=new Set<string>(),settle=vi.fn(async(_ctx:unknown,id:string,_capability:string,result:{success:boolean})=>{settled.add(id);if(result.success)failed.delete(id);else failed.add(id);}),ingestSignal=vi.fn(async()=>({inserted:options.inserted??true}));
 const readCommentsForWorks:CollectorPorts['readCommentsForWorks']=async(_ctx,ids,readOptions)=>{
  const selected=works.filter(work=>ids.includes(work.awemeId));
  for(const [index,work] of selected.entries())await readOptions.onWorkComplete(work,{processed:index+1,total:ids.length});
  return {works:selected,truncated:options.truncated??false,cooldownRemainMs:options.truncated?60000:0};
 };
 // 存储服务仅返回本调用链读取的字段；抓取端口仍按真实 CollectorPorts 校验。
 const collector=createCommentsCollector({db:{} as never,deps:{now:()=>new Date().toISOString(),nextId:()=>''},checkScheduledSignal:()=>{},
  sync:{due:async(_ctx:unknown,id:string)=>!settled.has(id),settle,failures:async()=>failed.size},
  ingestionService:{ensureDouyinSource:async()=> 'src',createRun:async()=>({id:'ingestion-run'}),completeRun:async()=>({})},
  candidateService:{listCommentsForPublication:async()=>[],ingestAudienceSignal:ingestSignal},
  publishingService:{getRecentPublicationsWithTitle:async(_ctx:unknown,page:{offset:number;limit:number})=>pubs.slice(page.offset,page.offset+page.limit),resolvePublication:async(_ctx:unknown,p:{externalId:string})=>({id:p.externalId})},
  analyticsService:{getPublicationAnalytics:async()=>({rows:[]})},
  readComments:async()=>[],
  readCommentsForWorks,
 } as unknown as CollectorPorts);
 const steps:Array<{text:string}>=[],runs:unknown[]=[];
 const ai={markRunning:vi.fn(async()=>{}),markSucceeded:vi.fn(async()=>{}),markFailed:vi.fn(async()=>{}),
  recordStep:vi.fn(async(_ctx:unknown,_id:string,step:{text:string})=>{steps.push(step);}),
  deferCollection:vi.fn(async()=>{throw new ScheduledFlywheelSuspended('original-task','queued');})};
 const run=()=>runScheduledCollection(ctx,task,{ai,collectors:{comments:collector},runs:{updateRun:async(_ctx,_id,patch)=>{runs.push(patch);return {};}},isNotLoggedInError:()=>false,now:()=>new Date().toISOString()});
 const detail=(index=steps.length-1)=>JSON.parse(steps[index]!.text.split('评论抓取诊断：')[1]!.slice(0,-1));
 return {run,steps,runs,ai,detail,settle,ingestSignal};
}
const emptyWorks=(n:number,complete:boolean):Work[]=>Array.from({length:n},(_,i)=>({awemeId:`v${i}`,records:[],complete,diagnostics:diagnostics(complete)}));

it('被动页面证据沿真实collector/runner公开且仅投影固定字段',async()=>{
 const detail={...diagnostics(false),pageEvidence:{finalRoute:'creator_home',navigationStatus:200,readyState:'complete',pageClosed:false,observation:'observed',cookieEvidence:'cookie_present_only',loginVisible:null,captchaVisible:null,scroll:{attempts:3,evaluateErrors:1,wheelErrors:0},network:{totalResponses:2,commentList:0,creatorOther:1,other:1,unknown:0,status2xx:1,status3xx:0,status4xx:1,status5xx:0,statusOther:0,statusUnknown:0},url:'SECRET_QUERY',body:'SECRET_BODY',error:'SECRET_ERROR'} as const};
 const f=setup([{awemeId:'v0',complete:false,records:[],diagnostics:detail}]);await f.run();
 expect(f.detail().works[0].pageEvidence).toMatchObject({finalRoute:'creator_home',navigationStatus:200,cookieEvidence:'cookie_present_only',loginVisible:null,captchaVisible:null,network:{totalResponses:2}});
 expect(JSON.stringify(f.steps)).not.toContain('SECRET');
 expect(f.ai.markSucceeded).not.toHaveBeenCalled();expect(f.settle.mock.calls[0]![3].success).toBe(false);
});

it('旧端口无页面证据为null；拒绝自由文本/异常数值和未验证登录结论',()=>{
 const work={awemeId:'v0',diagnostics:{...diagnostics(false),pageEvidence:{finalRoute:'SECRET_URL',navigationStatus:999,readyState:'SECRET_BODY',pageClosed:'SECRET',observation:'SECRET_ERROR',cookieEvidence:'authenticated',loginVisible:true,captchaVisible:true,scroll:{attempts:-1},network:{totalResponses:Infinity}}}};
 const publicText=formatCommentReadDiagnostics([work as unknown as Work,{awemeId:'v1',diagnostics:diagnostics(false)}],{receivedComments:0,writtenComments:0,skippedComments:0});
 const values=JSON.parse(publicText).works;
 expect(values[0].pageEvidence).toMatchObject({finalRoute:'unknown',navigationStatus:null,readyState:null,pageClosed:null,observation:'unavailable',cookieEvidence:null,loginVisible:null,captchaVisible:null,scroll:{attempts:null},network:{totalResponses:null}});
 expect(values[1].pageEvidence).toBeNull();expect(publicText).not.toContain('SECRET');
});

it('复现 20/20/20/9 四批零新增：公开步骤保存有效响应/解析/未完成原因，最终不冒充成功',async()=>{
 const f=setup(emptyWorks(69,false));
 for(let i=0;i<3;i++)await expect(f.run()).rejects.toBeInstanceOf(ScheduledFlywheelSuspended);
 await f.run();
 expect(f.steps).toHaveLength(4);expect(f.ai.markSucceeded).not.toHaveBeenCalled();expect(f.ai.markFailed).toHaveBeenCalledOnce();
 for(const [index,n] of [20,20,20,9].entries()){
  expect(f.steps[index]!.text).not.toContain('全量完成');
  expect(f.steps[index]!.text).toContain(`确认完成 0 个，未完成 ${n} 个`);
  expect(f.detail(index)).toMatchObject({matchedResponses:0,validResponses:0,parsedComments:0,receivedComments:0,writtenComments:0,skippedComments:0,reasons:{no_matching_response:n},omittedWorks:0});
 }
 expect(f.runs.at(-1)).toMatchObject({status:'failed',itemsNew:0,error:expect.not.stringContaining('全量完成')});
 expect(f.settle.mock.calls.every(call=>call[3].success===false)).toBe(true);
});

it('明确完整空列表成功；公开诊断证明收到有效响应，0 新增不等于缺少证据',async()=>{
 const f=setup(emptyWorks(9,true));await f.run();
 expect(f.ai.markSucceeded).toHaveBeenCalledOnce();expect(f.ai.markFailed).not.toHaveBeenCalled();
 expect(f.detail()).toMatchObject({validResponses:9,parsedComments:0,receivedComments:0,reasons:{stable_end:9}});
 expect(f.steps[0]!.text).toContain('确认完成 9 个，未完成 0 个');
});

it('前20个失败进入backoff，后9个完整不能覆盖之前失败；无due作品也不能报成功',async()=>{
 const works=emptyWorks(29,true).map((work,index)=>index<20?{...work,complete:false,diagnostics:diagnostics(false)}:work);
 const f=setup(works);await expect(f.run()).rejects.toBeInstanceOf(ScheduledFlywheelSuspended);
 await f.run();
 expect(f.ai.markSucceeded).not.toHaveBeenCalled();expect(f.ai.markFailed).toHaveBeenCalledOnce();
 expect(f.steps[1]!.text).not.toContain('全量完成');
 expect(f.detail(1)).toMatchObject({unresolvedSyncFailures:{count:20,scope:'account.comments',source:'publicationSyncService.failures'}});
 await f.run();
 expect(f.ai.markSucceeded).not.toHaveBeenCalled();expect(f.ai.markFailed).toHaveBeenCalledTimes(2);
});

it('缺少complete不伪造已确认完成，不推进成功水位',async()=>{
 const f=setup([{awemeId:'v0',records:[]}]);await f.run();
 expect(f.ai.markSucceeded).not.toHaveBeenCalled();
 expect(f.steps[0]!.text).toContain('确认完成 0 个，未完成 1 个');
 expect(f.detail()).toMatchObject({validResponses:null,reasons:{unavailable:1}});
 expect(f.settle.mock.calls[0]![3].success).toBe(false);
});

it('零新增可来自去重：解析/收到/跳过计数保留，公开诊断不含正文',async()=>{
 const record={commentId:'cid',awemeId:'v0',text:'PRIVATE_COMMENT_BODY',userId:'private-user',userName:'private-name'} as CommentRecord;
 const f=setup([{awemeId:'v0',complete:true,records:[record],diagnostics:{...diagnostics(true),parsedComments:1,reason:'watermark_reached'}}],{inserted:false});
 await f.run();
 expect(f.detail()).toMatchObject({parsedComments:1,receivedComments:1,writtenComments:0,skippedComments:1,reasons:{watermark_reached:1}});
 expect(JSON.stringify(f.steps)).not.toContain('PRIVATE_COMMENT_BODY');
 expect(f.ingestSignal).toHaveBeenCalledWith(expect.objectContaining({userId:'u',accountId:'a',source:'ingestion',ingestionRunId:'ingestion-run'}),expect.objectContaining({rawText:'PRIVATE_COMMENT_BODY',externalId:'douyin:comment:cid'}));
});

it('额度截断先保存有界诊断，再交回原任务等待；未访问作品不计已完成',async()=>{
 const f=setup(emptyWorks(1,true),{total:3,truncated:true});await expect(f.run()).rejects.toBeInstanceOf(ScheduledFlywheelSuspended);
 expect(f.ai.markFailed).not.toHaveBeenCalled();expect(f.ai.markSucceeded).not.toHaveBeenCalled();
 expect(f.steps[0]!.text).toContain('额度截断:已处理 1/3 个作品，确认完成 1 个，未完成 2 个');
 expect(f.detail()).toMatchObject({validResponses:1,reasons:{stable_end:1}});
 expect(f.ai.deferCollection).toHaveBeenCalledWith(ctx,task.id,60000,expect.stringContaining('评论抓取诊断'));
});

it('翻页未完成仍保留已收到的数据，公开计数与最终失败状态一致',async()=>{
 const record={commentId:'partial-cid',awemeId:'v0',text:'PRIVATE_PARTIAL_BODY',userId:'private-user',userName:'private-name'} as CommentRecord;
 const f=setup([{awemeId:'v0',complete:false,records:[record],diagnostics:{...diagnostics(true),parsedComments:1,reason:'page_limit'}}]);
 await f.run();
 expect(f.ingestSignal).toHaveBeenCalledOnce();
 expect(f.ai.markSucceeded).not.toHaveBeenCalled();expect(f.ai.markFailed).toHaveBeenCalledOnce();
 expect(f.detail()).toMatchObject({parsedComments:1,receivedComments:1,writtenComments:1,skippedComments:0,reasons:{page_limit:1}});
 expect(f.steps[0]!.text).toContain('确认完成 0 个，未完成 1 个');
 expect(JSON.stringify(f.steps)).not.toContain('PRIVATE_PARTIAL_BODY');
 expect(f.settle.mock.calls[0]![3].success).toBe(false);
});

it('旧端口缺诊断明确为不可用；大批明细有界且不透传额外字段',()=>{
 const absent=JSON.parse(formatCommentReadDiagnostics([{awemeId:'old'}],{receivedComments:0,writtenComments:0,skippedComments:0}));
 expect(absent).toMatchObject({validResponses:null,reasons:{unavailable:1}});
 const works=Array.from({length:1005},()=>({awemeId:'\u0001'.repeat(2000),complete:false,diagnostics:{...diagnostics(false),privateBody:'NEVER_EXPOSE'}}));
 const text=formatCommentReadDiagnostics(works,{receivedComments:0,writtenComments:0,skippedComments:0}),data=JSON.parse(text);
 expect(data.works).toHaveLength(20);expect(data.omittedWorks).toBe(985);expect(text.length).toBeLessThanOrEqual(16000);expect(text).not.toContain('NEVER_EXPOSE');
});

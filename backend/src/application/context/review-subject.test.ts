import {afterEach,expect,it,vi} from 'vitest';
import {createDb} from '@creatoros/backend';
import type {RequestContext,TrafficSourcePayload} from '@creatoros/contract';
import {publications} from '../../schema/publishing';
import {createTrafficService} from '../../modules/analytics/traffic.service';
import {createReviewSubjectContext} from './review-subject';
import {prepareReviewContext} from '../../modules/ai-runtime/review-context';
import {createChatBusinessGenerationPreparation} from '../../modules/ai-runtime/chat-business-generation-preparation';
const ctx:RequestContext={userId:'user',accountId:'account',requestId:'test',source:'user'};
const stamp='2026-09-11T00:00:00.000Z';const closers:Array<()=>Promise<unknown>>=[];
afterEach(async()=>{for(const close of closers.splice(0))await close();});
async function fixture(){
 const f=await createDb();closers.push(()=>f.client.close());
 const publication={id:'publication',userId:'user',accountId:'account',contentOutputId:'output',externalId:'video',platform:'douyin',hiddenAt:null,status:'published',accountReference:'account',createdAt:stamp,updatedAt:stamp};
 await f.db.insert(publications).values(publication);
 const publishing={getPublication:async()=>publication,listPublicationIdsByProject:async()=>['publication'],listPublicationsForUser:async()=>[publication]};
 const trafficService=createTrafficService(f.db,{now:()=>stamp,publishing:publishing as never});
 const payload:TrafficSourcePayload={app:'抖音 App',windowLabel:null,complete:false,entries:[{label:'推荐页',percentage:0},{label:'新来源',percentage:null},{label:'搜索',percentage:12.3}]};
 await trafficService.enqueueProject(ctx,'project');await trafficService.settle(ctx,(await trafficService.pending(ctx))[0]!,{data:payload},'task');
 const getTraffic=vi.fn(trafficService.getProject);
 const ports={trafficService:{getProject:getTraffic},projectsService:{getProject:async()=>({title:'当前作品'}),listOutputIdsByProject:async()=>['output']},publishingService:{listPublications:async()=>[publication]},analyticsService:{getPublicationAnalytics:vi.fn(async()=>({rows:[{capturedAt:stamp,rawMetrics:{views:100,plays:100,likes:0}}]}))},candidateService:{listCommentsForPublication:async()=>[]},artifactsService:{listProjectArtifacts:async()=>[],listVersions:async()=>[]},selectReadableProjectScriptArtifact:()=>null,readProjectRadarDraftSeed:async()=>'先展示当前演示，再解释操作。'};
 const reader=createReviewSubjectContext(ports as never);
 return {reader,ports,getTraffic};
}
it('真实流量service回读进入复盘上下文，保留窗口未知、未完整展开、真零、缺值与来源名称',async()=>{
 const f=await fixture();const summary=await f.reader.getMetricsSummary(ctx,'project');
 expect(f.getTraffic).toHaveBeenCalledWith(ctx,'project');
 for(const fragment of ['播放：100','点赞：0','作品 video','统计窗口：平台未说明',stamp,'未展开完整','推荐页 0%','新来源 暂无','搜索 12.3%','投放数据未知','占比不是曝光数'])expect(summary).toContain(fragment);
 expect(summary.match(/播放：/g)).toHaveLength(1);
});
it('可选流量读取失败仍保留基本数据；基础为空时仍保留真实流量',async()=>{
 const f=await fixture();f.getTraffic.mockRejectedValueOnce(new Error('traffic offline'));
 expect(await f.reader.getMetricsSummary(ctx,'project')).toBe('播放：100 · 点赞：0');
 f.ports.analyticsService.getPublicationAnalytics.mockResolvedValue({rows:[]});
 expect(await f.reader.getMetricsSummary(ctx,'project')).toContain('推荐页 0%');
});
it('同一reader的真实来源口径进入持久复盘与聊天生成facets，未调用模型',async()=>{
 const f=await fixture();const deps={reviewSubject:f.reader,positioning:{getPositioningCenter:async()=>({profile:null,currentStatement:null})},assertProject:vi.fn(async()=>{}),readTrend:async()=>({brief:'',sourceCount:0,signalCount:0,note:null})};
 const persistent=await prepareReviewContext(ctx,{projectId:'project',inputData:{}},deps as never);
 const chat=await createChatBusinessGenerationPreparation(deps as never).prepareReview(ctx,{projectId:'project'});
 expect(chat.facets.reviewMetricsBlock).toBe(persistent.reviewMetricsBlock);
 expect(chat.facets.reviewMetricsBlock).toContain('新来源 暂无');expect(chat.facets.reviewMetricsBlock).toContain('统计窗口：平台未说明');
 expect(deps.assertProject).toHaveBeenCalledWith(ctx,'project');
});
it('聊天无指标有稿仍可准备内容诊断；无稿与越权仍拒绝',async()=>{
 const f=await fixture();const reader={...f.reader,getMetricsSummary:async()=>'',getComments:async()=>[],getScript:vi.fn(async()=>'真实稿件')};
 const assertProject=vi.fn(async()=>{});const deps={reviewSubject:reader,positioning:{getPositioningCenter:async()=>({profile:null,currentStatement:null})},assertProject,readTrend:async()=>({brief:'',sourceCount:0,signalCount:0,note:null})};
 const chat=createChatBusinessGenerationPreparation(deps as never);
 expect((await chat.prepareReview(ctx,{projectId:'project'})).facets).toMatchObject({reviewScriptBlock:'\n【本次复盘作品·文案】\n真实稿件\n',reviewMetricsBlock:''});
 reader.getScript.mockResolvedValue('');await expect(chat.prepareReview(ctx,{projectId:'project'})).rejects.toThrow('真实逐字稿');
 reader.getScript.mockClear();assertProject.mockRejectedValueOnce(new Error('not owned'));await expect(chat.prepareReview(ctx,{projectId:'foreign'})).rejects.toThrow('not owned');expect(reader.getScript).not.toHaveBeenCalled();
});

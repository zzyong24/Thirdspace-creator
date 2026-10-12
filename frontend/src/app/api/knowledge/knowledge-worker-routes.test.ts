import {beforeEach,describe,it,expect,vi} from 'vitest';
import {KnowledgeGenerationPendingError} from '@creatoros/backend/modules/ai-runtime';
import {AuthenticationError,OwnershipError} from '@creatoros/backend/modules/identity';
const ports=vi.hoisted(()=>({resolveRequestContext:vi.fn(),runKnowledgeGeneration:vi.fn(),resolveModelSpec:vi.fn(),listKnowledge:vi.fn(),listAudienceSignals:vi.fn()}));
vi.mock('@/lib/request-context.server',async original=>({...await original<typeof import('@/lib/request-context.server')>(),resolveRequestContext:ports.resolveRequestContext}));
vi.mock('@/server/persistence-client',()=>({getChatRuntime:async()=>({runKnowledgeGeneration:ports.runKnowledgeGeneration,resolveModelSpec:ports.resolveModelSpec,runWithEffectiveSkills:async(_ctx:unknown,_ids:unknown,execute:()=>Promise<unknown>)=>execute()})}));
vi.mock('@/lib/contract-client.server',()=>({createServerClient:()=>({listKnowledge:ports.listKnowledge,listAudienceSignals:ports.listAudienceSignals})}));
import {POST as classify} from './classify/route';
import {POST as distill} from './distill/route';
import {POST as relate} from './relate/route';
import {POST as sift} from './comment-sift/route';
const ctx={userId:'u1',accountId:'a1',requestId:'knowledge-public',source:'user'};
const atoms=[{id:'k1',knowledgeType:'claim',title:'当前观点',sourceNote:null,status:'active'},{id:'k2',knowledgeType:'evidence',title:'真实证据',sourceNote:null,status:'active'},{id:'archived',knowledgeType:'claim',title:'已归档',sourceNote:null,status:'archived'}];
const signals=[{id:'s1',rawText:'本地部署需要多大的显存才能正常运行？',likeCount:57,externalId:'native-comment-1',createdAt:'2026-10-11T00:00:00.000Z'}];
const output={
 'knowledge.classify':{knowledgeType:'note',title:'一条笔记',tags:['知识'],summary:'摘要'},
 'knowledge.distill':{atoms:[{type:'claim',title:'真实观点',note:'',sourceNote:''}],suggestedTags:['知识'],coverage:{inputChars:4,processedChars:4,truncatedChars:0,chunkCount:1}},
 'knowledge.relate':{candidates:[{sourceId:'k1',targetId:'k2',relationType:'supports',reason:'实际证据支持'}]},
 'comment.qa-sift':{candidates:[{title:'本地部署需要多少显存？',note:'',sourceNote:'抖音评论,赞 57',signalIds:['s1']}]},
};
const routes=[['classify','knowledge.classify',classify],['distill','knowledge.distill',distill],['relate','knowledge.relate',relate],['comment-sift','comment.qa-sift',sift]] as const;
function request(path:string,headers:Record<string,string>={'x-account-id':'a1'}){return new Request(`http://localhost/api/knowledge/${path}`,{method:'POST',headers:{'content-type':'application/json',...headers},body:JSON.stringify({content:' 原文文本 ',atoms:[{id:'fake-client-id',title:'伪造'}],comments:[{signalId:'fake',rawText:'伪造'}]})});}
beforeEach(()=>{for(const port of Object.values(ports))port.mockReset();ports.resolveRequestContext.mockResolvedValue(ctx);ports.resolveModelSpec.mockImplementation(()=>{throw Error('HOST_API_FORBIDDEN');});ports.listKnowledge.mockResolvedValue(atoms);ports.listAudienceSignals.mockResolvedValue(signals);ports.runKnowledgeGeneration.mockImplementation(async(_ctx,{skillId})=>output[skillId as keyof typeof output]);vi.spyOn(console,'error').mockImplementation(()=>{});});
describe('T-1238 四类知识真实公共路由和原runner合同',()=>{
 it.each(routes)('%s 进入原Worker候选端口，无文本API配置调用',{timeout:120_000,retry:0},async(path,skill,route)=>{
  const req=request(path),response=await route(req);expect(response.status).toBe(200);const body=await response.json();expect(ports.runKnowledgeGeneration).toHaveBeenCalledWith(ctx,expect.objectContaining({skillId:skill}),req.signal);expect(ports.resolveModelSpec).not.toHaveBeenCalled();
  if(path==='classify')expect(body).toEqual({classification:output[skill]});if(path==='distill')expect(body).toEqual(output[skill]);if(path==='relate'){expect(body).toEqual(output[skill]);expect(ports.runKnowledgeGeneration.mock.calls[0][1].inputData.atoms.map((atom:{id:string})=>atom.id)).toEqual(['k1','k2']);}
  if(path==='comment-sift'){expect(body).toMatchObject({signalsTotal:1,prefiltered:1,candidates:[{signalIds:['s1'],signalExternalIds:['native-comment-1'],supportingComments:[{id:'s1',rawText:signals[0].rawText,likeCount:57}]}]});expect(ports.runKnowledgeGeneration.mock.calls[0][1].inputData.comments[0].signalId).toBe('s1');}
 });
 it.each(routes)('%s Codex未知结果/观察终止保留原任务ID与真实状态',{timeout:120_000,retry:0},async(path,_skill,route)=>{
  ports.runKnowledgeGeneration.mockRejectedValue(new KnowledgeGenerationPendingError('original-ai-task','original-execution','unknown_result','CODEX_TURN_RESULT_UNKNOWN','本地 Codex 原回合待核对'));const response=await route(request(path));expect(response.status).toBe(400);expect(await response.json()).toMatchObject({taskId:'original-ai-task',executionTaskId:'original-execution',runtimeStatus:'unknown_result',errorCode:'CODEX_TURN_RESULT_UNKNOWN'});expect(ports.resolveModelSpec).not.toHaveBeenCalled();
 });
 it('评论零采集诚实返回0，无假候选或模型任务',{timeout:120_000,retry:0},async()=>{
  ports.listAudienceSignals.mockResolvedValue([]);const response=await sift(request('comment-sift'));expect(await response.json()).toEqual({signalsTotal:0,prefiltered:0,droppedNoise:0,droppedBackflowed:0,candidates:[]});expect(ports.runKnowledgeGeneration).not.toHaveBeenCalled();
 });
 it.each(routes)('%s 只传group header也交给原Context，不强加账号选择',{timeout:120_000,retry:0},async(path,skill,route)=>{
  const groupCtx={...ctx,accountId:undefined,groupId:'actual-group'};ports.resolveRequestContext.mockResolvedValue(groupCtx);
  const req=request(path,{'x-group-id':'actual-group'}),response=await route(req);
  expect(response.status).toBe(200);expect(ports.resolveRequestContext).toHaveBeenCalledWith(null,null,{rejectInvalidToken:true,groupId:'actual-group'});
  expect(ports.runKnowledgeGeneration).toHaveBeenCalledWith(groupCtx,expect.objectContaining({skillId:skill}),req.signal);expect(ports.resolveModelSpec).not.toHaveBeenCalled();
 });
 it.each(routes)('%s 跨组拒绝先消费group header且不读数据或提交候选',{timeout:120_000,retry:0},async(path,_skill,route)=>{
  ports.resolveRequestContext.mockRejectedValue(new OwnershipError('账号组不可访问'));
  const response=await route(request(path,{'x-group-id':'another-owner-group'}));
  expect(response.status).toBe(404);expect(ports.resolveRequestContext).toHaveBeenCalledWith(null,null,{rejectInvalidToken:true,groupId:'another-owner-group'});
  expect(ports.listKnowledge).not.toHaveBeenCalled();expect(ports.listAudienceSignals).not.toHaveBeenCalled();expect(ports.runKnowledgeGeneration).not.toHaveBeenCalled();expect(ports.resolveModelSpec).not.toHaveBeenCalled();
 });
 it.each(routes)('%s 鉴权/跨账号拒绝在提交任务前发生',{timeout:120_000,retry:0},async(path,_skill,route)=>{
  ports.resolveRequestContext.mockRejectedValueOnce(new AuthenticationError('未登录'));expect((await route(request(path))).status).toBe(401);ports.resolveRequestContext.mockRejectedValueOnce(new OwnershipError('不属于当前账号'));expect((await route(request(path))).status).toBe(404);expect(ports.runKnowledgeGeneration).not.toHaveBeenCalled();expect(ports.resolveModelSpec).not.toHaveBeenCalled();
 });
});

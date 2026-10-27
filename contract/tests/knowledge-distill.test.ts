import {expect,it} from 'vitest';
import {ENDPOINTS,getCliOperationPolicy,knowledgeDistillAdoptInput,knowledgeDistillReceipt} from '../src';
const source={conversationId:'conversation',sourceMessageId:'message',toolCallId:'tool'};
it('蒸馏回执是只读操作；采纳是服务端原生幂等的独立写操作',()=>{
 expect(getCliOperationPolicy('knowledge.distill.receipt')).toMatchObject({effect:'read',idempotency:'not_applicable'});
 expect(getCliOperationPolicy('knowledge.distill.adopt')).toMatchObject({effect:'write',idempotency:'native'});
 expect(ENDPOINTS.getKnowledgeDistillReceipt.body!.parse({source})).toEqual({source});
});
it('只接受真实位置+编辑过的原子选择，不接受客户端伪造原文/来源证明',()=>{
 const request={source,atoms:[{index:0,type:'claim',title:'标题',note:'',sourceNote:''}],archiveOriginal:true};
 expect(knowledgeDistillAdoptInput.parse(request)).toEqual(request);
 expect(knowledgeDistillAdoptInput.safeParse({...request,originalText:'伪造'}).success).toBe(false);
 expect(knowledgeDistillAdoptInput.safeParse({...request,source:{...source,taskId:'伪造'}}).success).toBe(false);
});
it('持久回执具有真实任务/调用/原子/原文ID；旧共享规则确认字段是显式可选布尔',()=>{
 expect(knowledgeDistillReceipt.safeParse({source,taskId:'task',callId:'call',knowledgeIds:['knowledge'],atomCount:1,archiveKnowledgeId:null,createdAt:'2026-10-25'}).success).toBe(true);
 expect(ENDPOINTS.patchReviewRule.body!.parse({note:'旧调用'})).toEqual({note:'旧调用'});
 expect(ENDPOINTS.deleteReviewRule.body!.parse({confirmSharedImpact:true})).toEqual({confirmSharedImpact:true});
});

import {expect,it} from "vitest";
import {chatWorkerInputSchema} from "./internal/chat-worker";
import {assistantActionInputSchema,assistantProposalSourceSchema,canvasCreateProposalInputSchema,assistantReadRequestSchema} from "./resources/assistant-system";
const legacy={kind:"chat.run",operationKey:"chat:old",capability:"copilot.assist",userId:"u",accountId:"a",conversationId:"c",sourceMessageId:"m",system:"旧方法",messages:[{role:"user",content:"旧问题"}],maxSteps:6,maxOutputTokens:128,tools:[]};
it("旧冻结聊天不被补默认展示版本，新任务显式冻结版本且未知版拒绝",()=>{
 expect(chatWorkerInputSchema.parse(legacy)).toEqual(legacy);
 expect(chatWorkerInputSchema.parse({...legacy,toolOutcomeProjectionVersion:1})).toMatchObject({toolOutcomeProjectionVersion:1});
 expect(chatWorkerInputSchema.safeParse({...legacy,toolOutcomeProjectionVersion:2}).success).toBe(false);
});
it("有限动作合同拒绝自由操作、正式来源、密钥和模型提供的请求key",()=>{
 for(const extra of [{userId:"other"},{source:{callId:"invented"}},{operationId:"projects.delete"},{clientRequestId:"invented"},{secretReference:"private"},{source:"imported"},{platformRef:{id:"fake"}}])expect(assistantActionInputSchema.safeParse({kind:"project.create",title:"真实候选",...extra}).success).toBe(false);
 expect(assistantActionInputSchema.parse({kind:"project.create",title:"真实候选"})).toEqual({kind:"project.create",title:"真实候选",brief:""});
 expect(assistantActionInputSchema.safeParse({kind:"knowledge.create",title:"笔记",note:"原始正文",sourceMetadata:{fake:true}}).success).toBe(false);
 expect(assistantActionInputSchema.parse({kind:"knowledge.create",title:"笔记",note:"原始正文"})).toMatchObject({note:"原始正文"});
 expect(assistantActionInputSchema.safeParse({kind:"preferences.update"}).success).toBe(false);
 expect(assistantActionInputSchema.safeParse({kind:"automation.createDraft",name:"采集",schedule:"0 8 * * *",sourceKind:"self.metrics",targetAccountId:null}).success).toBe(false);
 expect(assistantActionInputSchema.safeParse({kind:"automation.createDraft",name:"采集",schedule:"0 8 * * *",sourceKind:"topic.daily",targetAccountId:null,enabled:true}).success).toBe(false);
});
it("画布候选保持原严格文档，采纳合同只有四项真实来源",()=>{
 const input={title:"中性画布",document:{schemaVersion:1,viewport:{x:0,y:0,zoom:1},nodes:[],edges:[]}};
 expect(canvasCreateProposalInputSchema.parse(input)).toEqual(input);
 expect(canvasCreateProposalInputSchema.safeParse({...input,canvasId:"invented"}).success).toBe(false);
 const source={taskId:"t",callId:"c",toolCallId:"model-c",candidateDigest:"sha256:"+"a".repeat(64)};
 expect(assistantProposalSourceSchema.parse(source)).toEqual(source);
 expect(assistantProposalSourceSchema.safeParse({...source,document:input.document}).success).toBe(false);
});

it('系统列表原pageSize和limit均最多50，分页字段保留原查询形态',()=>{
 for(const kind of ['projects.list','knowledge.list','candidates.list']){
  expect(assistantReadRequestSchema.safeParse({kind,query:{page:2,pageSize:100}}).success).toBe(false);
  expect(assistantReadRequestSchema.parse({kind,query:{page:2,pageSize:1}})).toMatchObject({query:{page:2,pageSize:1}});
 }
 expect(assistantReadRequestSchema.safeParse({kind:'assets.search',query:{query:'中性',limit:51}}).success).toBe(false);
 expect(assistantReadRequestSchema.parse({kind:'assets.search',query:{query:'中性',limit:50,cursor:'original-cursor'}})).toMatchObject({query:{query:'中性',limit:50,cursor:'original-cursor'}});
});

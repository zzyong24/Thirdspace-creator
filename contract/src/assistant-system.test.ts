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


import {z} from 'zod';
import * as assistantContract from './resources/assistant-system';
const nodeFsSpecifier:string='node:fs';
const {readFileSync}=await import(nodeFsSpecifier);
const v1Golden=JSON.parse(readFileSync(new URL('../../docs/verification/t1086/system-read-v1.definition.json',import.meta.url),'utf8'));
it('T1086 新 GET 只接受原 outputId，不开放写操作或模型自报归属',()=>{
 const input={request:{kind:'outputs.production.editor.get',params:{outputId:'真实作品'}}};
 expect(assistantContract.assistantReadInputSchema.safeParse(input).success).toBe(true);
 for(const params of [{outputId:'真实作品',projectId:'伪父'},{outputId:'真实作品',userId:'伪用户'},{outputId:'真实作品',accountId:'伪账号'},{id:'真实作品'}])expect(assistantContract.assistantReadInputSchema.safeParse({request:{kind:'outputs.production.editor.get',params}}).success).toBe(false);
 for(const kind of ['outputs.production.editor.save','outputs.production.editor.render','outputs.production.editor.versions.get','unknown.get'])expect(assistantContract.assistantReadInputSchema.safeParse({request:{kind,params:{outputId:'真实作品'}}}).success).toBe(false);
});
it('T1086 原生工程首读/续窗 revision 严格分类，零 revision 也是真实版本',()=>{
 const request={kind:'outputs.production.editor.get',params:{outputId:'真实作品'}},parse=(window:unknown)=>assistantContract.assistantReadInputSchema.safeParse({request,window}).success;
 expect(parse({offsetUtf16:0,lengthUtf16:20})).toBe(true);
 expect(parse({offsetUtf16:20,lengthUtf16:20,expectedRevision:0})).toBe(true);
 for(const window of [{offsetUtf16:20},{offsetUtf16:0,expectedRevision:1},{expectedRevision:1},{offsetUtf16:20,expectedRevision:-1},{offsetUtf16:20,expectedRevision:1.5}])expect(parse(window)).toBe(false);
 expect(assistantContract.assistantReadInputSchema.safeParse({request:{kind:'projects.get',params:{projectId:'真实项目'}},window:{offsetUtf16:20,expectedRevision:1}}).success).toBe(false);
});
it('T1086 V1 JSON schema 与产品改动前实际捕获的完整 definition 一致',()=>{
 const legacy=(assistantContract as unknown as {assistantReadInputSchemaV1:z.ZodType}).assistantReadInputSchemaV1;
 expect(legacy).toBeDefined();
 expect(z.toJSONSchema(legacy,{target:'draft-7',io:'input'})).toEqual(v1Golden.parameters);
 expect(legacy.safeParse({request:{kind:'projects.outputs.list',params:{projectId:'原项目'}}}).success).toBe(true);
 expect(legacy.safeParse({request:{kind:'outputs.production.editor.get',params:{outputId:'真实作品'}}}).success).toBe(false);
 expect(legacy.safeParse({request:{kind:'projects.get',params:{projectId:'原项目'}},window:{offsetUtf16:1,expectedRevision:1}}).success).toBe(false);
 expect(assistantContract.assistantReadEndpoints['outputs.production.editor.get']?.method).toBe('GET');
 expect(Object.keys(assistantContract.assistantReadEndpoints)).toEqual([...v1Golden.parameters.properties.request.oneOf.map((branch:{properties:{kind:{const?:string;enum?:string[]}}})=>branch.properties.kind.const??branch.properties.kind.enum![0]),'outputs.production.editor.get']);
});

it('T1248 固定旧偏好候选schema只准原六字段并保其它refinements',()=>{
 const old=(assistantContract as unknown as {assistantActionProposeInputSchemaV1:z.ZodType}).assistantActionProposeInputSchemaV1;
 expect(old).toBeDefined();
 const golden=JSON.parse(readFileSync(new URL('../../docs/verification/t1248/system-action-v1.definition.json',import.meta.url),'utf8'));
 const raw=z.toJSONSchema(old,{target:'draft-7',io:'input'}) as unknown as {properties:{action:{oneOf:Array<{properties:{kind:{const:string}}}>}}};
 const branch=raw.properties.action.oneOf.find(value=>value.properties.kind.const==='preferences.update');
 expect(branch).toEqual(golden.parameters.properties.action.oneOf.find((value:{properties:{kind:{const:string}}})=>value.properties.kind.const==='preferences.update'));
 // 全tool definition含已审JSON schema规范化，backend golden测试另外逐字段比较；此处核原严格偏好分支。
 expect(old.parse({action:{kind:'preferences.update',autosaveEnabled:false}})).toEqual({action:{kind:'preferences.update',autosaveEnabled:false}});
 for(const extra of [{assistantExecutionEngine:'codex'},{initializeAssistantExecutionEngine:true},{unknown:true}])expect(old.safeParse({action:{kind:'preferences.update',autosaveEnabled:false,...extra}}).success).toBe(false);
 expect(old.safeParse({action:{kind:'preferences.update'}}).success).toBe(false);
 expect(old.safeParse({action:{kind:'automation.createDraft',name:'采集',schedule:'0 8 * * *',sourceKind:'self.metrics',targetAccountId:null}}).success).toBe(false);
 expect(assistantContract.assistantActionProposeInputSchema.safeParse({action:{kind:'preferences.update',assistantExecutionEngine:'codex'}}).success).toBe(true);
});

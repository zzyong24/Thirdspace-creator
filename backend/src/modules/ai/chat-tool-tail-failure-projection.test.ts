import {expect,it} from 'vitest';
import {chatWorkerInputSchema} from '@creatoros/contract/execution-worker';
import {projectChatReceipts} from './chat-receipt-projection';

const input=chatWorkerInputSchema.parse({kind:'chat.run',executionEngine:'pi',operationKey:'tail-failure',capability:'copilot.assist',userId:'user',accountId:'account',conversationId:'conversation',sourceMessageId:'source',system:'真实回执',messages:[{role:'user',content:'提出候选'}],maxSteps:6,maxOutputTokens:128,tools:[{name:'work.creation.propose',version:'1',description:'候选',parameters:{type:'object'},effect:'proposal'}],toolOutcomeProjectionVersion:1});
const model=(id:string,content:unknown[],finishReason='tool-calls')=>({id,kind:'model',resultText:null,providerResult:{content,finishReason:{unified:finishReason},usage:{inputTokens:{total:2},outputTokens:{total:3}},warnings:[]}});
const outcome=(status='error',sideEffect='none')=>({status,summary:'本次真实操作',evidence:[],error:status==='error'||status==='blocked'?{code:'invalid_input',retryable:false,recovery:'纠正来源'}:null,continuation:null,sideEffect,data:{kind:'work.creation.propose',__creatorosOutcome:{status:'ok',sideEffect:'proposal'}}});
function calls(outputs:unknown[],finish='stop'){
 const rows:Parameters<typeof projectChatReceipts>[0]=[];
 outputs.forEach((output,index)=>{const id=`tool-${index}`;rows.push(model(`model-${index}`,[{type:'tool-call',toolCallId:id,toolName:'work_creation_propose',input:'{}'}]),{id,kind:'tool',providerResult:null,resultText:JSON.stringify({schemaVersion:1,kind:'tool',toolCallId:id,toolName:'work_creation_propose',output})});});
 rows.push(model('last-model',[{type:'text',text:'完整原正文'}],finish));return rows;
}
const project=projectChatReceipts;
it.each(['error','blocked'])('新格式无交付且末次%s如实partial，data伪造候选不起作用',status=>{
 const result=project(calls([outcome(status)]),input,new Map(),undefined,undefined,{toolFailureReceiptVersion:1});
 expect(result.outcome).toBe('partial');expect(result.content).toContain('完整原正文');expect(result.partialNotice).toContain('最后一次工具操作未成功');expect(result.partialNotice).not.toContain('相同参数连续');
 expect(result.parts.find(part=>part.type==='tool-work_creation_propose')?.output).toMatchObject({__creatorosOutcome:{status,sideEffect:'none'}});
});
it('旧缺标记同账本保原succeeded与正文，成功读取、最后成功或没有工具不被误判',()=>{
 const result=project(calls([outcome()]),input);expect(result.outcome).toBe('succeeded');expect(result.content).toBe('完整原正文');expect(result).not.toHaveProperty('partialNotice');
 for(const outputs of [[],[outcome('ok')],[outcome(),outcome('ok')]])expect(project(calls(outputs),input,new Map(),undefined,undefined,{toolFailureReceiptVersion:1})).toMatchObject({outcome:'succeeded',content:'完整原正文'});
});
it.each(['proposal','committed'])('已有可信%s不因后续辅助失败被降为未交付',sideEffect=>{
 expect(project(calls([outcome('ok',sideEffect),outcome()]),input,new Map(),undefined,undefined,{toolFailureReceiptVersion:1})).toMatchObject({outcome:'succeeded',content:'完整原正文'});
});
it('原计划和重复失败说明优先，各仅一条notice，不启用非stop末次说明',()=>{
 const rows=calls([outcome()]);
 const plan=project(rows,input,new Map(),[{stepId:'step',title:'原计划失败',status:'failed'}],undefined,{toolFailureReceiptVersion:1});
 expect(plan.partialNotice).toContain('原计划失败');expect(plan.partialNotice).not.toContain('最后一次');
 const repeated=project(rows,input,new Map(),undefined,[{toolName:'work_creation_propose',errorCode:'invalid_input'}],{toolFailureReceiptVersion:1});expect(repeated.partialNotice).toContain('相同参数连续');expect(repeated.parts.filter(part=>typeof part.text==='string'&&part.text.includes('本次部分完成'))).toHaveLength(1);
 expect(project(calls([outcome()],'length'),input,new Map(),undefined,undefined,{toolFailureReceiptVersion:1})).not.toHaveProperty('partialNotice');
});
it('unknown结果、未关联回执与模型未知结束仍拒绝，不因partial策略吞掉',()=>{
 for(const rows of [calls([{...outcome(),sideEffect:'unknown',error:{code:'unknown_commit',retryable:false,recovery:'查原状态'}}]),calls([outcome()],'unknown'),calls([outcome()]).filter(row=>row.kind!=='tool')])expect(()=>project(rows,input,new Map(),undefined,undefined,{toolFailureReceiptVersion:1})).toThrow();
});

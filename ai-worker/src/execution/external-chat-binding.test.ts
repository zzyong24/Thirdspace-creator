import {expect,it} from 'vitest';
import {chatWorkerInputSchema,externalChatReceiptSchema} from '@creatoros/contract/execution-worker';
const binding={protocolKind:'acp',clientCommit:'27efb1b57b9de22105a91e9154b1d29b51ede8cb',adapterVersion:'2.1.1',runtimeVersion:'0.159.3',policy:'creatoros-acp-readonly-v1'};
const input={executionEngine:'codex',kind:'chat.run',operationKey:'chat:one',capability:'copilot.assist',userId:'u',accountId:'a',conversationId:'c',sourceMessageId:'m',system:'',messages:[{role:'user',content:'hi'}],maxSteps:2,maxOutputTokens:128,tools:[]};
it('新绑定纳入冻结载荷，旧载荷仍保留缺字段而不套默认',()=>{
 expect(chatWorkerInputSchema.parse({...input,externalAgentBinding:binding})).toHaveProperty('externalAgentBinding',binding);
 expect(chatWorkerInputSchema.parse(input)).not.toHaveProperty('externalAgentBinding');
 expect(chatWorkerInputSchema.safeParse({...input,externalAgentBinding:{...binding,runtimeVersion:'future'}}).success).toBe(false);
});
it('真实图片候选允许纯图回执，空正文和空候选仍拒绝',()=>{
 const receipt={schemaVersion:1,engine:'codex',protocolKind:'acp',protocolVersion:1,sessionId:'s',turnId:'call',stopReason:'end_turn',text:'',usage:null};
 const image={toolCallId:'provider-image',imageIndex:0,assetId:'asset',fileId:'file',assetType:'image',name:'生成图片',checksum:'a'.repeat(64),byteLength:10,committedAt:'2026-10-04T00:00:00Z'};
 expect(externalChatReceiptSchema.safeParse({...receipt,images:[image]}).success).toBe(true);
 expect(externalChatReceiptSchema.safeParse({...receipt,images:[]}).success).toBe(false);
});

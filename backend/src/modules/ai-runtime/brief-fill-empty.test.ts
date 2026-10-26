import {z} from 'zod';
import {expect,it,vi} from 'vitest';
import type {RequestContext} from '@creatoros/contract';
import {buildChatTools,type ChatToolDeps} from './chat-tools';
import {createChatHostToolAdapter} from './chat-host-tool-adapter';

async function fixture(){
 const read=vi.fn(async()=>({coreMessage:'保留已有信息',targetPlatforms:['douyin']}));
 const tools=buildChatTools(['brief.fill'],{getProjectBrief:read,humanizeError:()=>null} as unknown as ChatToolDeps);
 const ports=await createChatHostToolAdapter(tools,async()=>tools,{'brief.fill':'proposal'},{toolFailureReceiptVersion:1});
 const ctx:RequestContext={userId:'brief-empty-user',groupId:'brief-empty-group',accountId:null,source:'user',requestId:'brief-empty'};
 const scope={aiTaskId:'brief-empty-business',callId:'brief-empty-call',toolCallId:'brief-empty-provider-tool',execution:{executionTaskId:'brief-empty-execution',attempt:1,fenceToken:'brief-empty-fence'},signal:new AbortController().signal};
 return {run:(input:unknown)=>ports['brief.fill']!.execute!(ctx,z.json().parse(input),scope),read};
}

it.each([{}, {targetAudience:'  ',coreMessage:'\n'}])('T1406 空brief候选以合法非可重试输入错误收口，不标proposal %j',async input=>{
 const f=await fixture(),out=await f.run(input);
 expect(out).toMatchObject({status:'error',sideEffect:'none',error:{code:'invalid_input',retryable:false}});
 expect(out.summary).toContain('资料');
});
it('T1406 非空合法字段仍是人工采纳候选，不作语义质量硬门',async()=>{
 const f=await fixture(),out=await f.run({coreMessage:'a'});
 expect(out).toMatchObject({status:'ok',sideEffect:'proposal',data:{kind:'brief.fill',suggestion:{coreMessage:'a'},current:{coreMessage:'保留已有信息',targetPlatforms:['douyin']}}});
 expect(f.read).toHaveBeenCalledOnce();
});

// @vitest-environment node
import {it,expect,vi} from 'vitest';
import {chatExecutionResponse} from './chat-execution-stream';
import {humanizeAiErrorMessage} from '@/lib/ai-error-humanize';

it('未知执行结果保留原回执并向页面发稳定状态码，不伪装失败重试',async()=>{
 const subscribe=vi.fn(async function*(_ctx:unknown,_taskId:string,_signal:AbortSignal){yield {events:[],hasMore:false,status:'unknown_result'};});
 const runtime={subscribe,get:vi.fn()} as unknown as Parameters<typeof chatExecutionResponse>[0];
 const response=chatExecutionResponse(runtime,{userId:'u',accountId:'a',requestId:'r',source:'user'},
 {executionTaskId:'original-execution',sourceMessageId:'original-message',conversationId:'original-conversation'},new AbortController().signal);
 const body=await response.text();
 expect(subscribe).toHaveBeenCalledOnce();
 expect(subscribe.mock.calls[0]?.[1]).toBe('original-execution');
 expect(response.headers.get('x-execution-task-id')).toBe('original-execution');
 const error=body.split('\n').filter(s=>s.startsWith('data: {')).map(s=>JSON.parse(s.slice(6))).find(s=>s.type==='error');
 expect(humanizeAiErrorMessage(error.errorText)?.code).toBe('result_unconfirmed');
 expect(body).toContain('[DONE]');
 expect(body).not.toContain('请重试');
});

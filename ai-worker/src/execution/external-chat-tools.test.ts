import {describe,it,expect,vi} from 'vitest';
import {createExternalChatToolConsumer} from './external-chat-tools';
import {chatToolProviderName} from '@creatoros/contract/execution-worker';
const mocks=vi.hoisted(()=>({generation:vi.fn(),text:vi.fn(),model:vi.fn(),web:vi.fn(),redfox:vi.fn(),webClose:vi.fn()}));
vi.mock('./chat-generation-worker',()=>({runChatGenerationInWorker:mocks.generation}));
vi.mock('./chat-text-node-worker',()=>({runChatTextNodeInWorker:mocks.text}));
vi.mock('./chat-web-read-resources',()=>({createChatWebReadResources:()=>({run:mocks.web,close:mocks.webClose})}));
vi.mock('./chat-redfox-worker',()=>({runChatRedfoxInWorker:mocks.redfox}));
vi.mock('../runtime/provider-factory',()=>({modelFor:mocks.model}));
const output={status:'ok',summary:'候选已生成',evidence:[],data:{kind:'topic.enrich',draft:{}},error:null,continuation:null,sideEffect:'proposal'};
function fixture(execution='worker.structured-node',name='topic.enrich'){
 const calls:Array<[string,any]>=[];let saved=false;
 const call=vi.fn(async(port:string,data:any)=>{calls.push([port,data]);if(port==='recordCodexToolCall')return {};if(port==='checkChatToolApproval')return {status:'not-applicable'};if(port==='reserveAgenticTool')return {callId:'ordinary',toolName:chatToolProviderName(name),input:{query:'宿主规范化'},status:saved?'settled':'reserved',...(saved?{receipt:{schemaVersion:1,kind:'tool',toolCallId:'actual-tool',toolName:chatToolProviderName(name),output}}:{})};if(port==='startAgenticTool')return {callId:'ordinary',status:'started'};if(port==='settleAgenticTool'){saved=data.status==='settled';return {callId:'ordinary',status:data.status};}throw Error(port);});
 mocks.generation.mockResolvedValue(output);mocks.text.mockResolvedValue(output);mocks.model.mockReturnValue({id:'native'});mocks.web.mockResolvedValue(output);mocks.redfox.mockResolvedValue(output);
 const consumer=createExternalChatToolConsumer({executionEngine:'codex',tools:[{name,execution,effect:execution==='host'||execution==='worker.web-read'||execution==='worker.redfox'?'committed':'proposal'}]} as any,'root',new AbortController().signal,call as any);
 return {consumer,call,calls};
}
describe('Codex外部聊天实际Worker工具消费',()=>{
 it('真实toolID先绑定原external根，再运行原结构化消费者',async()=>{const f=fixture();expect((await f.consumer.run('actual-tool','topic.enrich',{query:'原始参数'})).status).toBe('settled');expect(f.calls[0]).toEqual(['recordCodexToolCall',{callId:'root',toolCallId:'actual-tool',toolName:chatToolProviderName('topic.enrich'),input:JSON.stringify({query:'原始参数'})}]);expect(mocks.generation).toHaveBeenCalledWith('ordinary',expect.anything(),f.call);await f.consumer.close();});
 it('已settled只回放原回执，不再次生成',async()=>{mocks.generation.mockClear();const f=fixture();await f.consumer.run('actual-tool','topic.enrich',{});await f.consumer.run('actual-tool','topic.enrich',{});expect(mocks.generation).toHaveBeenCalledTimes(1);});
 it('hooks只装配Codex模型规格',async()=>{const f=fixture('worker.script-hooks','script.hooks');await f.consumer.run('actual-tool','script.hooks',{});expect(mocks.model).toHaveBeenCalledWith(expect.objectContaining({engine:'codex'}));expect(mocks.text).toHaveBeenCalledWith('ordinary',{id:'native'},expect.anything(),f.call,'hooks');});
 it('需用户审批时不启动工具及子模型',async()=>{const f=fixture();f.call.mockImplementation(async(port:string)=>port==='recordCodexToolCall'?{}:port==='checkChatToolApproval'?{status:'user-approval'}:Promise.reject(Error(port)));await expect(f.consumer.run('actual-tool','topic.enrich',{})).rejects.toMatchObject({errorCode:'CHAT_TOOL_REQUIRES_USER'});expect(f.call.mock.calls.some(([port])=>port==='startAgenticTool')).toBe(false);});
});

it.each([['web.read','worker.web-read'],['redfox.query','worker.redfox']])('Codex %s真实provider事实调用原专用worker',async(name,execution)=>{const f=fixture(execution!,name!);await f.consumer.run('actual-tool',name!,{});expect(name==='web.read'?mocks.web:mocks.redfox).toHaveBeenCalledWith('ordinary',expect.anything(),...(name==='redfox.query'?[f.call]:[]));await f.consumer.close();if(name==='web.read')expect(mocks.webClose).toHaveBeenCalled();});
it('已审Host提交走原executeAgenticTool与账本，回放不再次执行',async()=>{
 const f=fixture('host','material.screenshot'),original=f.call.getMockImplementation()!;f.call.mockImplementation(async(port,data)=>port==='executeAgenticTool'?{...output,sideEffect:'committed'}:original(port,data));
 expect(await f.consumer.run('actual-tool','material.screenshot',{url:'https://example.com'})).toMatchObject({outcome:{sideEffect:'committed'}});
 // 宿主返回已结算回执；此测试只核Consumer端口，不冒称截图真机。
 expect(f.call.mock.calls.filter(([p])=>p==='executeAgenticTool')).toHaveLength(1);
});
it('未登记Host写入不会被当作Codex新工具消费',()=>{const f=fixture('host','unknown.host.write');expect(f.consumer.handles('unknown.host.write')).toBe(false);});

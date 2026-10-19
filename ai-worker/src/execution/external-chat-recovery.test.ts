import {expect,it,vi} from 'vitest';
const generation=vi.hoisted(()=>vi.fn());
const textNode=vi.hoisted(()=>vi.fn());
const model=vi.hoisted(()=>({provider:'codex-app-server'}));
vi.mock('./chat-generation-worker',()=>({runChatGenerationInWorker:generation}));
vi.mock('./chat-text-node-worker',()=>({runChatTextNodeInWorker:textNode}));
vi.mock('../runtime/provider-factory',()=>({modelFor:vi.fn(spec=>{expect(spec).toMatchObject({engine:'codex'});return model;})}));
import {recoverExternalChatChildren} from './external-chat-recovery';
it('仅后端strict proof名单依次restore原父生成再读取原结果，不自行猜未知tool',async()=>{
 const order:string[]=[],signal=new AbortController().signal,call=vi.fn(async(port,data:any)=>{order.push(`${port}:${data.callId??''}`);if(port==='readCheckpoint')return {replayableGenerationToolCallIds:['original-parent'],pendingCalls:[{callId:'unknown-root',status:'unknown'},{callId:'other-unknown',status:'unknown'}]};return {callId:data.callId,status:'started'};});
 generation.mockImplementation(async id=>{order.push(`原child:${id}`);});await recoverExternalChatChildren(signal,call);expect(order).toEqual(['readCheckpoint:','restoreChatGeneration:original-parent','原child:original-parent']);expect(generation).toHaveBeenCalledWith('original-parent',signal,call);
});
it('旧无已审恢复名单不重发任何child',async()=>{generation.mockClear();await recoverExternalChatChildren(new AbortController().signal,async()=>({pendingCalls:[{callId:'unknown',status:'unknown'}]}));expect(generation).not.toHaveBeenCalled();});
it('原hooks/draft严格名单先恢复全部原父再消费原Codex节点，完成hooks不重复生成',async()=>{
 const order:string[]=[],signal=new AbortController().signal,call=vi.fn(async(port,data:any)=>{order.push(`${port}:${data.callId??''}`);if(port==='readCheckpoint')return {completableToolCallIds:['completed-hooks'],resumableToolCallIds:['original-hooks'],replayableScriptDraftToolCallIds:['original-draft'],pendingCalls:[{callId:'unproven',status:'unknown'}]};if(port==='completeChatHooks')return {status:'ok',summary:'原候选',evidence:[],data:{},error:null,continuation:null,sideEffect:'proposal'};return {callId:data.callId,status:'started'};});
 textNode.mockImplementation(async(id,_model,_signal,_call,node)=>{order.push(`${node}:${id}`);});
 await recoverExternalChatChildren(signal,call);
 expect(order).toEqual(['readCheckpoint:','completeChatHooks:completed-hooks','restoreChatHooks:original-hooks','restoreChatScriptDraft:original-draft','hooks:original-hooks','script-draft:original-draft']);
 expect(textNode).toHaveBeenCalledWith('original-hooks',model,signal,call,'hooks');expect(textNode).toHaveBeenCalledWith('original-draft',model,signal,call,'script-draft');
});
it('恢复ACK属于外来call不能运行原节点',async()=>{
 generation.mockClear();await expect(recoverExternalChatChildren(new AbortController().signal,async port=>port==='readCheckpoint'?{replayableGenerationToolCallIds:['original-parent']}:{callId:'foreign',status:'started'})).rejects.toMatchObject({outcome:'unknown_result'});expect(generation).not.toHaveBeenCalled();
});

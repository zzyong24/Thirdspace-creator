import {it,expect,vi} from 'vitest';
import {buildChatTools,type ChatToolDeps} from './chat-tools';
import {prepareChatToolDefinitions} from './chat-tool-definitions';
import {createChatCoverTaskHost} from './chat-cover-task-host';
import type {createChatHostContextReader} from '../ai/chat-host-context.service';
type Restored=Awaited<ReturnType<ReturnType<typeof createChatHostContextReader>['read']>>;
async function fixture(kind:string|null='cover.publication_reference'){
 const context={userId:'cover-user',accountId:'cover-account',groupId:'cover-group',requestId:'test',source:'user' as const};
 const execution={executionTaskId:'chat-execution',attempt:1,fenceToken:'fence'},signal=new AbortController().signal;
 const definitions=(await prepareChatToolDefinitions(buildChatTools(['cover.generate'],{} as ChatToolDeps),{atomicCoverGenerate:true})).definitions;
 const restored={context:structuredClone(context),modelInput:{tools:definitions},hostContext:{chatContext:{surface:'project',projectId:'project'},mediaRoute:kind?{kind}:null}} as unknown as Restored;
 const read=vi.fn(async()=>structuredClone(restored)),getArtifactText=vi.fn(async()=>({fullText:'当前稿原文'}));
 const prepareTaskCommit=vi.fn(async(_ctx:unknown,_input:{inputData?:Record<string,unknown>})=>({} as never)),wakeTask=vi.fn(async()=>{});
 const resolve=createChatCoverTaskHost({read},{getArtifactText} as never,{prepareTaskCommit,wakeTask});
 const tool=(await resolve(context,restored.modelInput,execution,signal))['cover.generate']!;
 const scope={execution,callId:'tool-call',attemptId:'tool-attempt',signal};
 return {context,restored,tool,scope,prepareTaskCommit,getArtifactText};
}
it.each(['cover.publication_reference','cover.reference'])('T1413 %s缺参考ID零提交，原路线要求不能丢失',async kind=>{
 const f=await fixture(kind);
 await expect(f.tool.prepareTask!(f.context,{projectId:'project'},f.scope)).rejects.toThrow('参考');
 expect(f.prepareTaskCommit).not.toHaveBeenCalled();expect(f.getArtifactText).not.toHaveBeenCalled();
});
it('T1413可信路线由宿主冻结必需标记并保留原稿与attempt',async()=>{
 const f=await fixture();await f.tool.prepareTask!(f.context,{referenceAssetId:' real-asset '},f.scope);
 expect(f.prepareTaskCommit).toHaveBeenCalledWith(f.context,{taskType:'cover.generate',attemptId:'tool-attempt',inputData:{projectId:'project',referenceAssetId:'real-asset',scriptSnapshot:{fullText:'当前稿原文'},__coverReferenceRequired:true}});
});
it('T1413普通旧请求不要求参考，模型自报标记不能取得可信路线',async()=>{
 const f=await fixture(null);await f.tool.prepareTask!(f.context,{},f.scope);
 expect(f.prepareTaskCommit.mock.calls[0]![1].inputData).not.toHaveProperty('__coverReferenceRequired');
 const forged=await Promise.allSettled([f.tool.prepareTask!(f.context,{referenceAssetId:'asset',__coverReferenceRequired:true},f.scope)]);
 if(forged[0]!.status==='fulfilled')expect(f.prepareTaskCommit.mock.calls.at(-1)![1].inputData).not.toHaveProperty('__coverReferenceRequired');
});
it.each(['account','group','project','definition'])('T1413封面准备拒绝%s变化且零提交',async field=>{
 const f=await fixture();let input={referenceAssetId:'asset'} as {referenceAssetId:string;projectId?:string};
 if(field==='account')f.restored.context.accountId='other';
 if(field==='group')f.restored.context.groupId='other';
 if(field==='project')input.projectId='other-project';
 if(field==='definition')f.restored.modelInput.tools[0]!.version='changed';
 await expect(f.tool.prepareTask!(f.context,input,f.scope)).rejects.toThrow();expect(f.prepareTaskCommit).not.toHaveBeenCalled();
});

import {expect,it,vi} from 'vitest';
import type {ChatToolDeps} from './chat-tools';
import {buildChatTools} from './chat-tools';
import {prepareChatToolDefinitions} from './chat-tool-definitions';
import {createChatWorkCreationToolHost} from './chat-work-creation-tool-host';

const ctx={userId:'neutral-user',accountId:null,groupId:'neutral-group',requestId:'neutral-request',source:'user' as const};
const target={schemaVersion:1,clientRequestId:'neutral-creation-request',projectId:'project-1',compositionId:'composition-1',compositionRevision:3,scriptSourceRef:{kind:'project_script',id:'script-1',versionId:'script-version-1'},scriptConfirmation:{confirmedBy:'user',source:'current-click'},articleMember:{kind:'article',outputId:'article-1',artifactId:'article-artifact',baseVersionId:'article-version'},graphicMember:{kind:'image',outputId:'graphic-1',artifactId:'graphic-artifact',baseVersionId:'graphic-version'}};
const ref={executionTaskId:'task-1',attempt:1,fenceToken:'fence-1'};
const signal=new AbortController().signal;
async function fixture(){
 const ports={read:vi.fn(),propose:vi.fn()};
 const prototypes=buildChatTools(['work.creation.read','work.creation.propose'],{humanizeError:()=>null,creationTarget:target,readWorkCreation:ports.read,proposeWorkCreation:ports.propose} as unknown as ChatToolDeps);
 const definitions=(await prepareChatToolDefinitions(prototypes)).definitions;
 const frozen={context:ctx,hostContext:{chatContext:{surface:'project',projectId:target.projectId,creationTarget:target}},modelInput:{tools:definitions}};
 const reader={read:vi.fn(async()=>structuredClone(frozen))};
 const host=createChatWorkCreationToolHost(reader as never,ports);
 return {ports,definitions,frozen,reader,host};
}
it('只恢复原冻结的两个真实短host工具，装配不会执行读取、提案、模型或写入',async()=>{
 const f=await fixture(),tools=await f.host(ctx,{} as never,ref,signal);
 expect(Object.keys(tools)).toEqual(['work.creation.read','work.creation.propose']);
 expect(tools['work.creation.read']!.effect).toBe('none');
 expect(tools['work.creation.propose']!.effect).toBe('proposal');
 expect(f.reader.read).toHaveBeenCalledWith(ref);
 expect(f.ports.read).not.toHaveBeenCalled();expect(f.ports.propose).not.toHaveBeenCalled();
});
it.each([{userId:'other-user'},{accountId:'invented-account'},{groupId:'other-group'}])('冻结三维身份不能被请求覆盖 %j',async change=>{
 const f=await fixture();await expect(f.host({...ctx,...change},{} as never,ref,signal)).rejects.toThrow('账号组不符');
});
it.each(['version','effect'] as const)('执行时完整定义变化 %s 不沿用原任务',async field=>{
 const f=await fixture();(f.frozen.modelInput.tools[0]! as unknown as Record<string,unknown>)[field]=field==='version'?'unknown-version':'committed';
 await expect(f.host(ctx,{} as never,ref,signal)).rejects.toThrow('定义已变化');
});
it('无本工具时保持旧聊天兼容；有工具却缺真target不能猜当前首份脚本',async()=>{
 const f=await fixture();f.frozen.modelInput.tools=[];expect(await f.host(ctx,{} as never,ref,signal)).toEqual({});
 f.frozen.modelInput.tools=f.definitions;f.frozen.hostContext.chatContext.projectId='other-project';
 await expect(f.host(ctx,{} as never,ref,signal)).rejects.toThrow('未绑定');
});
it('已取消的装配不调用读取，不产生新的执行',async()=>{
 const f=await fixture(),controller=new AbortController();controller.abort();
 await expect(f.host(ctx,{} as never,ref,controller.signal)).rejects.toThrow();expect(f.reader.read).not.toHaveBeenCalled();
});

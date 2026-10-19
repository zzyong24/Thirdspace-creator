import {readFileSync} from 'node:fs';
import {createWorkWritingContext} from '../../application/generation/work-writing-context';
import {resolveWorkCreationProtocol} from './chat-work-creation-protocol';
import {expect,it,vi} from 'vitest';
import type {ChatToolDeps} from './chat-tools';
import {buildChatTools} from './chat-tools';
import {prepareChatToolDefinitions} from './chat-tool-definitions';
import {createChatWorkCreationToolHost} from './chat-work-creation-tool-host';

const ctx={userId:'neutral-user',accountId:null,groupId:'neutral-group',requestId:'neutral-request',source:'user' as const};
const target={schemaVersion:1,clientRequestId:'neutral-creation-request',projectId:'project-1',compositionId:'composition-1',compositionRevision:3,scriptSourceRef:{kind:'project_script',id:'script-1',versionId:'script-version-1'},scriptConfirmation:{confirmedBy:'user',source:'current-click'},articleMember:{kind:'article',outputId:'article-1',artifactId:'article-artifact',baseVersionId:'article-version'},graphicMember:{kind:'image',outputId:'graphic-1',artifactId:'graphic-artifact',baseVersionId:'graphic-version'}};
const ref={executionTaskId:'task-1',attempt:1,fenceToken:'fence-1'};
const signal=new AbortController().signal;
async function fixture(version:1|2=1){
 const actualTarget=structuredClone(target) as import("@creatoros/contract").WorkCreationTarget;
 const resolvedWritingContext=version===2?await createWorkWritingContext({assertProject:async()=>({}),readDocument:vi.fn(),readCenter:vi.fn(),readStatement:vi.fn()}).resolve(ctx,target.projectId,{schemaVersion:1,brandProfileVersionId:null,sourceAssets:[]}):undefined;
 if(resolvedWritingContext)actualTarget.writingContext=resolvedWritingContext.selection;
 const ports={read:vi.fn(),propose:vi.fn()};
 const prototypes=buildChatTools(['work.creation.read','work.creation.propose'],{humanizeError:()=>null,creationTarget:actualTarget,readWorkCreation:ports.read,proposeWorkCreation:ports.propose} as unknown as ChatToolDeps);
 const definitions=(await prepareChatToolDefinitions(prototypes,{workWritingContext:version===2})).definitions;
 const frozen={context:ctx,hostContext:{...(resolvedWritingContext?{resolvedWritingContext}:{}),chatContext:{surface:'project',projectId:target.projectId,creationTarget:actualTarget}},modelInput:{tools:definitions}};
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

it.each([1,2] as const)('冻结v%s完整定义与修复前快照逐字相等，外层及current保原版本',async version=>{
 const f=await fixture(version),before=JSON.parse(readFileSync(new URL('../../../../docs/verification/t1300/creation-repair/runtime/creation-definitions-before.json',import.meta.url),'utf8')).find((row:{version:number})=>row.version===version);
 expect(JSON.stringify(f.definitions)).toBe(JSON.stringify(before.definitions));
 const tools=await f.host(ctx,{} as never,ref,signal);
 for(const definition of f.definitions)expect(tools[definition.name]!.version).toBe(definition.version);
 f.ports.read.mockResolvedValue({kind:'work.creation.read',targetDigest:'a'.repeat(64)} as never);
 const scope={execution:ref,aiTaskId:'task-1',callId:'call-1',modelCallId:'model-1',toolCallId:'tool-call-1',signal};
 expect(await tools['work.creation.read']!.approve(ctx,{},scope)).toEqual({status:'not-applicable'});
 expect(await tools['work.creation.read']!.execute!(ctx,{},scope)).toMatchObject({status:'ok',sideEffect:'none',data:{kind:'work.creation.read'}});
 expect(f.ports.read).toHaveBeenCalledOnce();
});
it.each([1,2] as const)('冻结v%s允许仅propose合法子集',async version=>{
 const f=await fixture(version);f.frozen.modelInput.tools=f.definitions.filter(row=>row.name==='work.creation.propose');
 const tools=await f.host(ctx,{} as never,ref,signal);expect(Object.keys(tools)).toEqual(['work.creation.propose']);expect(tools['work.creation.propose']!.version).toBe(f.definitions[1]!.version);
});
it.each(['mixed','duplicate','unknown','hash','description','parameters','effect','execution'] as const)('冻结creation拒绝%s，不覆盖或重签',async kind=>{
 const f=await fixture(2);const first=f.frozen.modelInput.tools[0]!;
 if(kind==='mixed')first.version=first.version.replace('director-v2:','director-v1:');
 else if(kind==='duplicate')f.frozen.modelInput.tools.push(structuredClone(first));
 else if(kind==='unknown')first.version='untrusted:'+ 'a'.repeat(64);
 else if(kind==='hash')first.version='chat-tools-work-director-v2:'+ 'a'.repeat(64);
 else if(kind==='description')first.description+='篡改';
 else if(kind==='parameters')first.parameters={type:'object',properties:{invented:{type:'string'}}};
 else if(kind==='effect')first.effect='committed';
 else first.execution='host';
 await expect(f.host(ctx,{} as never,ref,signal)).rejects.toThrow();expect(f.ports.read).not.toHaveBeenCalled();expect(f.ports.propose).not.toHaveBeenCalled();
});
it.each(['missing-selection','missing-resolved','digest','selection','project','v1-with-context'] as const)('冻结写作上下文%s拒绝，不能删合法selection绕行',async kind=>{
 const f=await fixture(2),host=f.frozen.hostContext;
 if(kind==='missing-selection')delete host.chatContext.creationTarget.writingContext;
 else if(kind==='missing-resolved')delete host.resolvedWritingContext;
 else if(kind==='digest')host.resolvedWritingContext!.digest='sha256:'+'0'.repeat(64);
 else if(kind==='selection')host.chatContext.creationTarget.writingContext={schemaVersion:1,brandProfileVersionId:'another-brand',sourceAssets:[]};
 else if(kind==='project')host.resolvedWritingContext!.projectId='another-project';
 else for(const def of f.frozen.modelInput.tools)def.version=def.version.replace('director-v2:','director-v1:');
 await expect(f.host(ctx,{} as never,ref,signal)).rejects.toThrow();
});
it('无creation定义不干预editor族协议',()=>{
 expect(resolveWorkCreationProtocol([{name:'work.editor.propose',version:'chat-tools-work-director-v2:'+'a'.repeat(64)}])).toEqual({});
});

it('真实非空资料选择经原构造器解析，creation v2外层/current仍可读取',async()=>{
 const f=await fixture(2),selection={schemaVersion:1 as const,brandProfileVersionId:null,sourceAssets:[{assetId:'owned-document',assetFileId:'owned-file-v1'}]};
 const readDocument=vi.fn(async(owner:typeof ctx,projectId:string,assetId:string,fileId:string)=>{
  expect(owner).toEqual(ctx);expect(projectId).toBe(target.projectId);expect(assetId).toBe('owned-document');expect(fileId).toBe('owned-file-v1');return {label:'本轮选中资料',text:'仅以实际笔记说明先记录问题，再核对方法。'};
 });
 const resolved=await createWorkWritingContext({assertProject:async(owner,id)=>{expect(owner).toEqual(ctx);expect(id).toBe(target.projectId);},readDocument,readCenter:vi.fn(),readStatement:vi.fn()}).resolve(ctx,target.projectId,selection);
 f.frozen.hostContext.chatContext.creationTarget.writingContext=selection;f.frozen.hostContext.resolvedWritingContext=resolved;
 f.ports.read.mockResolvedValue({kind:'work.creation.read',targetDigest:'a'.repeat(64)} as never);
 const tools=await f.host(ctx,{} as never,ref,signal),scope={execution:ref,aiTaskId:'task-1',callId:'call-1',modelCallId:'model-1',toolCallId:'tool-1',signal};
 expect(await tools['work.creation.read']!.approve(ctx,{},scope)).toEqual({status:'not-applicable'});
 const result=await tools['work.creation.read']!.execute!(ctx,{},scope);
 expect(result).toMatchObject({status:'ok',sideEffect:'none',data:{resolvedWritingContext:resolved}});expect(readDocument).toHaveBeenCalledOnce();
});

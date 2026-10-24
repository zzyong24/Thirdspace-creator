// @vitest-environment node
import {expect,it,vi} from 'vitest';
import {mkdtemp,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import type {Db} from '@creatoros/backend';
import {canonicalDataset} from '@/fixtures/canonical';
import type {Endpoint,RequestContext} from '@creatoros/contract';
const owned=vi.hoisted(()=>({db:null as Db|null,close:null as null|(()=>Promise<void>)}));
vi.mock('@creatoros/backend',async original=>{
 const actual=await original<typeof import('@creatoros/backend')>();
 return {...actual,createConfiguredDb:async(...args:Parameters<typeof actual.createConfiguredDb>)=>{
   const result=await actual.createConfiguredDb(...args);owned.db=result.db;owned.close=result.dispose;return result;
 }};
});
import {readChatTurnSnapshot} from '../../../../backend/src/modules/ai/chat-turn-submission.service';
import {getChatRuntime,compositeTransport,__resetPersistenceForTests} from '../persistence-client';
import {prepareChatReply} from '../prepare-chat-reply';

it('T1405 真实组合根用对话绑定组而非当前界面选择；不同用户不能读取组',async()=>{
 const root=await mkdtemp(join(tmpdir(),'t1405-workspace-'));
 vi.stubEnv('DATABASE_URL','');vi.stubEnv('PGLITE_DATA_DIR',join(root,'db'));vi.stubEnv('CREATOROS_MEDIA_ROOT',join(root,'media'));
 vi.stubEnv('CREATOROS_STORAGE','local');vi.stubEnv('CREATOROS_DISABLE_BACKGROUND_DRIVERS','1');vi.stubEnv('CREATOROS_DISABLE_SCHEDULER','1');vi.stubEnv('CREATOROS_CLIENT_CONFIG_PULL_ENABLED','0');
 __resetPersistenceForTests();
 try{
  const user:RequestContext={userId:canonicalDataset.user.id,requestId:'t1405-workspace',source:'user',accountId:null};
  const create=async(name:string)=>(await compositeTransport.request({id:'accountGroups.create'} as Endpoint,{body:{name,idempotencyKey:`t1405:${name}`}} as never,user) as {data:{id:string;name:string}}).data;
  const a=await create('明确选中的空组'),b=await create('另一个可见组');
  const ctx={...user,groupId:a.id},runtime=await getChatRuntime();
  expect(await runtime.contextReaders.getCurrentGroup?.(ctx)).toEqual({id:a.id,name:a.name});
  expect(await runtime.contextReaders.getCurrentGroup?.({...ctx,groupId:b.id})).toEqual({id:b.id,name:b.name});
  await expect(runtime.contextReaders.getCurrentGroup!({...ctx,userId:'another-user'})).rejects.toThrow();
  const conversation=await runtime.ai.createConversation(ctx,{title:'隔离组对话',scope:'assistant'});
  const message=await runtime.ai.createMessage(ctx,conversation.id,{content:'当前对话属于哪个账号组？'});
  const snapshot=await readChatTurnSnapshot(owned.db!,ctx,{conversationId:conversation.id,sourceMessageId:message.id});
  // 本例只验证真实上下文装配；主模型路由未运行、不调用模型或读取实际安装配置。
  const prepared=await prepareChatReply({...runtime,prepareChatRouting:undefined},ctx,snapshot,{executionEngine:'pi'});
  expect(prepared.system).toContain('本次对话所属账号组');
  expect(prepared.system).toContain(a.name);expect(prepared.system).not.toContain(b.name);
  expect(prepared.system).toContain(JSON.stringify({request:{kind:'accountGroups.get',params:{groupId:a.id}}}));
  expect(prepared.tools.some(tool=>tool.name==='system.read')).toBe(true);
 }finally{
  await (globalThis as {__creatorosStopExecutionWorker?:()=>Promise<void>}).__creatorosStopExecutionWorker?.();
  __resetPersistenceForTests();await owned.close?.();vi.unstubAllEnvs();await rm(root,{recursive:true,force:true});
 }
},180_000);

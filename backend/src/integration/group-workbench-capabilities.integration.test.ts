import {beforeAll,afterAll,describe,it,expect,vi} from 'vitest';
import {createDb,type Db,projects,contentOutputs,aiTasks,executionTasks,platformAccounts} from '@creatoros/backend';
import {ENDPOINTS,getCliOperationPolicy,type RequestContext,type Endpoint,type EndpointInput} from '@creatoros/contract';
import {accountGroups} from '../schema/account-groups';
import {cliInvocations,cliInvocationResults} from '../schema/cli-invocations';
import {createCliInvocationService} from '../modules/cli-invocations/cli-invocations.service';
import {createWorkbenchPublicTransport} from '../modules/execution/workbench-public.transport';
import {createWorkbenchPublicService} from '../modules/execution/workbench-public.service';
import {createExecutionStreamService} from '../modules/execution/execution-stream.service';

describe('纯组工作台目录的正式 CLI gateway 与 transport 组合',()=>{
 let db:Db,close:()=>Promise<void>,gateway:ReturnType<typeof createCliInvocationService>,transport:ReturnType<typeof createWorkbenchPublicTransport>;
 let sequence=0;
 const group:RequestContext={userId:'catalog-user',groupId:'catalog-group',accountId:null,requestId:'catalog-request',source:'user'};
 // 显式安装配置替身；归属、审计、transport、response 校验均走原真实实现。
 const installedCatalog={platform:'macos' as const,capabilities:[],builtins:[],dependencyLock:{}};
 const capabilities=vi.fn(()=>installedCatalog);
 const emptyInput={params:undefined,query:undefined,body:undefined};
 const noFileOperation=vi.fn(async()=>{throw Error('目录读取不得调用文件业务');});
 async function businessSnapshot(){return {groups:await db.select().from(accountGroups),projects:await db.select().from(projects),outputs:await db.select().from(contentOutputs),aiTasks:await db.select().from(aiTasks),executionTasks:await db.select().from(executionTasks)};}
 beforeAll(async()=>{
  const opened=await createDb();db=opened.db;close=()=>opened.client.close();const stamp=new Date().toISOString();
  await db.insert(accountGroups).values([
   {id:'catalog-group',userId:group.userId,name:'空平台组',status:'active',createdAt:stamp,updatedAt:stamp},
   {id:'catalog-archived',userId:group.userId,name:'原归档组',status:'archived',createdAt:stamp,updatedAt:stamp},
   {id:'catalog-foreign',userId:'another-user',name:'其它用户组',status:'active',createdAt:stamp,updatedAt:stamp},
  ]);
  await db.insert(platformAccounts).values({id:'catalog-legacy-account',userId:group.userId,platform:'douyin',accountHandle:'@isolated-catalog',status:'active',createdAt:stamp,updatedAt:stamp});
  await db.insert(projects).values({id:'catalog-project',userId:group.userId,groupId:group.groupId,accountId:null,title:'原项目',creationMode:'script',status:'active',currentStage:'planning',startedAt:stamp,createdAt:stamp,updatedAt:stamp});
  await db.insert(contentOutputs).values({id:'catalog-output',groupId:group.groupId,projectId:'catalog-project',contentType:'article',status:'draft',title:'原稿',createdAt:stamp,updatedAt:stamp});
  await db.insert(aiTasks).values({id:'catalog-original-task',userId:group.userId,groupId:group.groupId,accountId:null,taskType:'script.draft',idempotencyKey:'catalog-original-key',requestedAt:stamp});
  await db.insert(executionTasks).values({id:'catalog-original-execution',userId:group.userId,groupId:group.groupId,accountId:null,kind:'ai_task',ownerType:'ai_task',ownerId:'catalog-original-task',status:'queued',idempotencyKey:'catalog-execution-key',payload:{},createdAt:stamp,updatedAt:stamp});
  gateway=createCliInvocationService({db,masterKey:Buffer.alloc(32,9),now:()=>stamp,nextId:prefix=>`${prefix}-${++sequence}`});
  transport=createWorkbenchPublicTransport({tasks:createWorkbenchPublicService(db),stream:createExecutionStreamService(db),artifacts:{} as Parameters<typeof createWorkbenchPublicTransport>[0]['artifacts'],capabilities,render:noFileOperation,reconcile:noFileOperation});
 },120000);
 afterAll(async()=>close?.(),120000);
 async function read(ctx:RequestContext){
  const endpoint=ENDPOINTS.listWorkbenchCapabilities,policy=getCliOperationPolicy(endpoint.id)!;
  const begin=await gateway.begin(ctx,{operation:endpoint.id,effect:policy.effect,clientId:'isolated-cli',idempotencyKey:null,inputHash:'sha256:catalog-read',targetRefs:[]});
  if(begin.kind!=='execute')throw Error('预期正式读取审计');
  const result=await transport.request(endpoint,emptyInput,ctx);await gateway.succeed(begin.invocationId,result);return endpoint.response.parse((result as {data:unknown}).data);
 }
 it.each(['catalog-group','catalog-archived'])('合法 %s 可读取真实目录，原业务对象逐字不变',async groupId=>{
  const before=await businessSnapshot(),auditBefore=await db.select().from(cliInvocations),cacheBefore=await db.select().from(cliInvocationResults);
  expect(await read({...group,groupId})).toEqual(installedCatalog);
  expect(await businessSnapshot()).toEqual(before);
  const audit=await db.select().from(cliInvocations);expect(audit).toHaveLength(auditBefore.length+1);
  const receipt=audit.find(row=>!auditBefore.some(previous=>previous.id===row.id));
  expect(receipt).toMatchObject({accountId:null,accountScope:`group:${groupId}`,operation:'workbench.capabilities.list',effect:'read',status:'succeeded'});
  const cache=await db.select().from(cliInvocationResults);expect(cache).toHaveLength(cacheBefore.length+1);
  expect(cache.find(row=>row.invocationId===receipt!.id)?.resultEncrypted).toMatch(/^enc:v1:/);expect(noFileOperation).not.toHaveBeenCalled();
 });
 it('旧真实账号入口仍成功，原任务与业务数据不变',async()=>{
  const before=await businessSnapshot();expect(await read({...group,groupId:null,accountId:'catalog-legacy-account'})).toEqual(installedCatalog);expect(await businessSnapshot()).toEqual(before);
 });
 it.each([
  {label:'错误用户',ctx:{...group,userId:'another-user'}},
  {label:'不存在的组',ctx:{...group,groupId:'missing-group'}},
  {label:'非属主组',ctx:{...group,groupId:'catalog-foreign'}},
  {label:'错误用户归档组',ctx:{...group,userId:'another-user',groupId:'catalog-archived'}},
 ])('$label 在真实 gateway 拒绝，目录端口及审计不被触达',async({ctx})=>{
  const before=await businessSnapshot(),audit=await db.select().from(cliInvocations),calls=capabilities.mock.calls.length;
  await expect(read(ctx)).rejects.toThrow();expect(capabilities.mock.calls).toHaveLength(calls);expect(await db.select().from(cliInvocations)).toEqual(audit);expect(await businessSnapshot()).toEqual(before);
 });
 it('无工作区与无认证拒绝，不伪装成空目录',async()=>{
  const ctx={...group,groupId:null,accountId:null},calls=capabilities.mock.calls.length;
  await expect(read(ctx)).rejects.toThrow();await expect(transport.request(ENDPOINTS.listWorkbenchCapabilities,emptyInput,ctx)).rejects.toThrow();
  await expect(transport.request(ENDPOINTS.listWorkbenchCapabilities,emptyInput,undefined)).rejects.toThrow();expect(capabilities.mock.calls).toHaveLength(calls);
 });
 function guardedEndpoint<E extends Endpoint>(endpoint:E,input:EndpointInput<E>){
  return {endpoint,input,request:(ctx:RequestContext)=>transport.request(endpoint,input,ctx)};
 }
 it.each([
  guardedEndpoint(ENDPOINTS.listWorkbenchArtifacts,{params:{conversationId:'catalog-conversation'},query:{limit:50},body:undefined}),
  guardedEndpoint(ENDPOINTS.readWorkbenchArtifact,{params:{taskId:'catalog-original-task',artifactId:'catalog-artifact',version:1},query:{offset:0,limit:128000},body:undefined}),
  guardedEndpoint(ENDPOINTS.renderWorkbenchArtifact,{params:{taskId:'catalog-original-task',artifactId:'catalog-artifact',version:1},query:{format:'preview'},body:undefined}),
  guardedEndpoint(ENDPOINTS.reconcileWorkbenchArtifact,{params:{conversationId:'catalog-conversation'},query:undefined,body:{operationId:'catalog-guard-operation'}}),
  guardedEndpoint(ENDPOINTS.reconcileWorkbenchFile,{params:{taskId:'catalog-original-task'},query:undefined,body:{operationId:'catalog-guard-operation'}}),
 ])('其它入口 $endpoint.id 仍要求真实平台账号',async({endpoint,input,request})=>{
  const calls=capabilities.mock.calls.length,audit=await db.select().from(cliInvocations);
  endpoint.params?.parse(input.params);endpoint.query?.parse(input.query);endpoint.body?.parse(input.body);
  await expect(gateway.begin(group,{operation:endpoint.id,effect:getCliOperationPolicy(endpoint.id)!.effect,clientId:'isolated-cli',idempotencyKey:null,inputHash:'sha256:guard',targetRefs:[]})).rejects.toThrow('AccountRequiredError');
  await expect(request(group)).rejects.toThrow('当前账号不存在');expect(capabilities.mock.calls).toHaveLength(calls);expect(await db.select().from(cliInvocations)).toEqual(audit);expect(noFileOperation).not.toHaveBeenCalled();
 });
 it.each([
  guardedEndpoint(ENDPOINTS.inspectWorkbenchTask,{params:{taskId:'catalog-original-execution'},query:{afterSequence:0,limit:50},body:undefined}),
  guardedEndpoint(ENDPOINTS.readWorkbenchEvents,{params:{taskId:'catalog-original-execution'},query:{afterSequence:0,limit:64},body:undefined}),
 ])('T1427 $endpoint.id CLI与公开读取支持真实纯组任务，跨组归属仍拒绝',async({endpoint,request})=>{
  const before=await businessSnapshot(),audit=await db.select().from(cliInvocations),calls=capabilities.mock.calls.length;
  const begun=await gateway.begin(group,{operation:endpoint.id,effect:getCliOperationPolicy(endpoint.id)!.effect,clientId:'isolated-cli',idempotencyKey:null,inputHash:'sha256:group-task-read',targetRefs:[]});
  expect(begun.kind).toBe('execute');if(begun.kind!=='execute')throw Error('诊断读取应创建真实审计');
  const result=await request(group) as {data:unknown};
  await gateway.succeed(begun.invocationId,result);
  if(endpoint.id==='workbench.tasks.inspect')expect(result.data).toMatchObject({task:{id:'catalog-original-execution',groupId:group.groupId,accountId:null},calls:[]});
  else expect(result.data).toMatchObject({events:[],nextSequence:0});
  for(const ctx of [{...group,userId:'another-user'},{...group,groupId:'catalog-foreign'}])await expect(request(ctx)).rejects.toThrow();
  expect(await businessSnapshot()).toEqual(before);const after=await db.select().from(cliInvocations);expect(after).toHaveLength(audit.length+1);expect(after.find(row=>row.id===begun.invocationId)).toMatchObject({accountScope:`group:${group.groupId}`,accountId:null,effect:'read',status:'succeeded'});expect(capabilities.mock.calls).toHaveLength(calls);expect(noFileOperation).not.toHaveBeenCalled();
 });
});

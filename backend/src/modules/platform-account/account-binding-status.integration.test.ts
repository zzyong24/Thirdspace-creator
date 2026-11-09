import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {createDb,executionTasks} from '@creatoros/backend';
import {eq} from 'drizzle-orm';
import type {RequestContext} from '@creatoros/contract';
import {createAccountGroupService} from './account-group.service';
import {createPlatformAccountService} from './platform-account.service';
import {createPersistentTaskService} from '../execution';
import * as owner from './index';

let store:Awaited<ReturnType<typeof createDb>>,groups:ReturnType<typeof createAccountGroupService>,accounts:ReturnType<typeof createPlatformAccountService>;
let seq=0,clock='2026-11-09T04:30:00.000Z',ctx:RequestContext,groupId:string;
const now=()=>clock,nextId=(prefix:string)=>`${prefix}-status-${++seq}`;
beforeEach(async()=>{
 store=await createDb();seq=0;clock='2026-11-09T04:30:00.000Z';const deps={db:store.db,now,nextId};groups=createAccountGroupService(deps);accounts=createPlatformAccountService(deps);
 const group=await groups.create({userId:'status-owner',requestId:'read',source:'user'},{name:'状态验收',idempotencyKey:'group'});groupId=group.id;ctx={userId:'status-owner',groupId,accountId:null,requestId:'read',source:'user'};
});
afterEach(async()=>{await store?.client.close();});
async function makeAccount(name='真实账号',verified=true){return accounts.createAccount(ctx,{platform:'douyin',accountHandle:name,secretReference:'private-reference',...(verified?{externalAccountId:`identity-${name}`}:{})});}
function service(readCollectionObservations=vi.fn(async()=>[] as any[])){
 const factory=(owner as Record<string,any>).createAccountBindingStatusService;expect(factory,'状态读取必须接真实backend服务').toBeTypeOf('function');
 return factory({db:store.db,now,readGroup:groups.get,readCollectionObservations});
}
async function saveProof(account:{id:string;externalAccountId:string|null},at='2026-11-09T04:22:22.419Z'){
 const before=clock;clock=at;
 try{
  const tasks=createPersistentTaskService(store.db,{now,nextId});const group=await groups.get(ctx,groupId);
  const task=await tasks.enqueue(ctx,{kind:'account_binding',ownerType:'account_binding',ownerId:nextId('binding'),idempotencyKey:nextId('proof'),payload:{groupId,platform:'douyin',expectedGroupVersion:group.version,idempotencyKey:nextId('intent')},maxAttempts:1});
  const claim=await tasks.claimTask({taskId:task.id,workerId:'proof-worker',leaseSeconds:60});expect(claim).toBeTruthy();
  const tuple={taskId:task.id,workerId:'proof-worker',attempt:claim!.lease.attempt};
  await tasks.saveCheckpoint({...tuple,checkpoint:{phase:'finalizing',accountId:account.id,externalAccountId:account.externalAccountId,stagingKey:'never-return-profile-data'}});
  await tasks.finish({...tuple,fenceToken:claim!.lease.fenceToken,status:'succeeded'});return task.id;
 }finally{clock=before;}
}
it('T1447 成功扫码回执按真实账号与组投影，重复只读不改库、不泄露凭据',async()=>{
 const a=await makeAccount();await saveProof(a);const before=await store.db.select().from(executionTasks);
 const result=await service().read(ctx,groupId);
 expect(result).toMatchObject({groupId,accounts:[{accountId:a.id,bindingState:'bound',loginState:'verified',checkedAt:'2026-11-09T04:22:22.419Z',reasonCode:null}]});
 expect(JSON.stringify(result)).not.toMatch(/private-reference|identity-真实账号|never-return-profile-data|secretReference|checkpoint/);
 expect(await service().read(ctx,groupId)).toEqual(result);expect(await store.db.select().from(executionTasks)).toEqual(before);
});
it('T1447 同平台多账号独立显示：active和稳定身份不等于登录有效',async()=>{
 const a=await makeAccount('一号'),b=await makeAccount('二号'),manual=await makeAccount('仅登记',false);await saveProof(a);
 const result=await service().read(ctx,groupId);
 expect(result.accounts).toEqual(expect.arrayContaining([
  expect.objectContaining({accountId:a.id,loginState:'verified'}),expect.objectContaining({accountId:b.id,bindingState:'bound',loginState:'unknown',checkedAt:null}),expect.objectContaining({accountId:manual.id,bindingState:'unverified',loginState:'unknown'}),
 ]));
});
it('T1447 更新的needsAuth覆盖旧成功，新扫码覆盖旧失效；同一时间失效优先',async()=>{
 const a=await makeAccount();await saveProof(a);
 const read=vi.fn(async()=>[{accountId:a.id,loginState:'needs_login',checkedAt:'2026-11-09T04:25:00.000Z',reasonCode:'needs_auth'}]);
 expect((await service(read).read(ctx,groupId)).accounts[0]).toMatchObject({loginState:'needs_login',reasonCode:'needs_auth'});
 await saveProof(a,'2026-11-09T04:26:00.000Z');expect((await service(read).read(ctx,groupId)).accounts[0]).toMatchObject({loginState:'verified',checkedAt:'2026-11-09T04:26:00.000Z'});
 read.mockResolvedValue([{accountId:a.id,loginState:'needs_login',checkedAt:'2026-11-09T04:26:00.000Z',reasonCode:'expired'}]);
 expect((await service(read).read(ctx,groupId)).accounts[0].loginState).toBe('needs_login');
});
it('T1447 空组、另一自有组及归属守卫均真实，转出账号不留在旧状态中',async()=>{
 const a=await makeAccount();await saveProof(a);const other=await groups.create(ctx,{name:'另一个组',idempotencyKey:'other'}),read=vi.fn(async()=>[]);
 expect(await service(read).read(ctx,other.id)).toEqual({groupId:other.id,accounts:[]});expect(read).not.toHaveBeenCalled();
 await expect(service().read({...ctx,userId:'not-owner'},groupId)).rejects.toMatchObject({code:'OwnershipError'});
 const preview=await groups.previewTransfer(ctx,{accountId:a.id,toGroupId:other.id});await groups.transfer(ctx,{...preview,idempotencyKey:'transfer'});
 expect((await service().read(ctx,groupId)).accounts).toHaveLength(0);
 expect((await service().read(ctx,other.id)).accounts[0]).toMatchObject({accountId:a.id,loginState:'unknown'});
});
it('T1447 隐藏账号不探测，其他组/未来时间/损坏证据不能制造有效状态',async()=>{
 const a=await makeAccount();const read=vi.fn(async()=>[{accountId:a.id,loginState:'verified',checkedAt:'2099-01-01T00:00:00.000Z',reasonCode:null},{accountId:'other-account',loginState:'verified',checkedAt:'2026-11-09T04:20:00.000Z',reasonCode:null}]);
 expect((await service(read).read(ctx,groupId)).accounts[0].loginState).toBe('unknown');
 await accounts.updateAccount(ctx,a.id,{status:'archived'});read.mockClear();
 expect((await service(read).read(ctx,groupId)).accounts[0]).toMatchObject({bindingState:'hidden',loginState:'unknown'});expect(read).not.toHaveBeenCalled();
});

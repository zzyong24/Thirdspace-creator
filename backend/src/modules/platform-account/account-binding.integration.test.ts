import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {createDb,type Db} from '@creatoros/backend';
import type {RequestContext} from '@creatoros/contract';
import {createAccountGroupService} from './account-group.service';
import {createPlatformAccountService} from './platform-account.service';
import {createAccountBindingService,type AccountBindingStagePort} from './account-binding.service';
let store:Awaited<ReturnType<typeof createDb>>,service:ReturnType<typeof createAccountBindingService>,groups:ReturnType<typeof createAccountGroupService>,ctx:RequestContext,seq=0;
const now=()=>new Date().toISOString();const nextId=(p:string)=>`${p}-${++seq}`;
let stage:AccountBindingStagePort;
const control={signal:new AbortController().signal,shouldStop:()=>false};
beforeEach(async()=>{store=await createDb();groups=createAccountGroupService({db:store.db,now,nextId});const group=await groups.create({userId:'u',requestId:'t',source:'user'},{name:'目标组',idempotencyKey:'g'});ctx={userId:'u',accountId:null,groupId:group.id,requestId:'t',source:'user'};stage={createStaging:vi.fn(async()=>({stagingKey:'real-owned-stage'})),login:vi.fn(async()=>true),identity:vi.fn(async()=>({externalAccountId:'real-external-id',accountHandle:'真实扫码身份'})),discard:vi.fn(async()=>{}),commit:vi.fn(async(c,input,tx)=>{const account=await createPlatformAccountService({db:tx as unknown as Db,now,nextId}).createAccount(c,{platform:'douyin',accountHandle:input.identity.accountHandle,externalAccountId:input.identity.externalAccountId});return {accountId:account.id};})};service=createAccountBindingService({db:store.db,now,nextId,stage,capabilities:async()=>[{platform:'douyin',bind:{available:true,method:'qr',reason:'真实端口'}}]});});
afterEach(async()=>{stage.discard=async()=>{};await service?.stop();await store?.client.close();});
const input=(key='bind')=>({groupId:ctx.groupId!,platform:'douyin' as const,expectedGroupVersion:1,idempotencyKey:key});
it('启动幂等返回同run，未运行不建假成员，跨用户status不可读',async()=>{const a=await service.start(ctx,input());const b=await service.start(ctx,input());expect(a.runId).toBe(b.runId);expect(a.status).toBe('queued');expect((await groups.get(ctx,ctx.groupId!)).members).toHaveLength(0);await expect(service.status({...ctx,userId:'other'},a.runId)).rejects.toThrow();expect(stage.login).not.toHaveBeenCalled();});
it('唯一执行任务完成真实身份登记，status读回真实accountID',async()=>{const run=await service.start(ctx,input());await service.drainAccountBindingQueue(control,{waitForCompletion:true});const result=await service.status(ctx,run.runId);expect(result.status).toBe('succeeded');expect(result.accountId).toBeTruthy();expect((await groups.get(ctx,ctx.groupId!)).members[0]?.accountId).toBe(result.accountId);expect(stage.commit).toHaveBeenCalledTimes(1);});
it('取消需等待扫码停止与清理证明，cleanup未完成不能显示cancelled',async()=>{let cleaned!:()=>void;stage.login=vi.fn(async(_c,{signal})=>new Promise<boolean>((_resolve,reject)=>signal.addEventListener('abort',()=>reject(signal.reason),{once:true})));stage.discard=vi.fn(async()=>new Promise<void>(resolve=>{cleaned=resolve;}));const run=await service.start(ctx,input());await service.drainAccountBindingQueue(control);await vi.waitFor(()=>expect(stage.login).toHaveBeenCalled());expect((await service.cancel(ctx,run.runId)).status).toBe('cancel_requested');await vi.waitFor(()=>expect(stage.discard).toHaveBeenCalled());expect((await service.status(ctx,run.runId)).status).toBe('cancel_requested');cleaned();await vi.waitFor(async()=>expect((await service.status(ctx,run.runId)).status).toBe('cancelled'));expect(stage.commit).not.toHaveBeenCalled();});
it('组版本或可用状态在扫码期间改变时，不归入新的或已归档组',async()=>{let finish!:(value:boolean)=>void;stage.login=vi.fn(async()=>new Promise<boolean>(resolve=>{finish=resolve;}));const run=await service.start(ctx,input());await service.drainAccountBindingQueue(control);await vi.waitFor(()=>expect(stage.login).toHaveBeenCalled());await groups.update(ctx,ctx.groupId!,{name:'已修改',expectedVersion:1});finish(true);await vi.waitFor(async()=>expect((await service.status(ctx,run.runId)).status).toBe('failed'));expect(stage.commit).not.toHaveBeenCalled();expect(stage.discard).toHaveBeenCalled();});
it('真实身份缺失不能伪造扫码完成成员，旧同步入口不受该新任务规则影响',async()=>{stage.identity=vi.fn(async()=>null);const run=await service.start(ctx,input());await service.drainAccountBindingQueue(control,{waitForCompletion:true});expect((await service.status(ctx,run.runId)).status).toBe('failed');expect(stage.commit).not.toHaveBeenCalled();expect(stage.discard).toHaveBeenCalled();});
it('重复drain不并行启动同run，queued取消不创建临时环境',async()=>{const run=await service.start(ctx,input());expect((await service.cancel(ctx,run.runId)).status).toBe('cancelled');await Promise.all([service.drainAccountBindingQueue(control),service.drainAccountBindingQueue(control)]);expect(stage.createStaging).not.toHaveBeenCalled();});
it('通用租约恢复不能把尚未停止的绑定直接改为已取消，专属恢复完成清理后才确认',async()=>{
 const {createPersistentTaskService}=await import('../execution');
 stage.login=vi.fn(async(_c,{signal})=>new Promise<boolean>((_resolve,reject)=>signal.addEventListener('abort',()=>reject(signal.reason),{once:true})));
 stage.discard=vi.fn(async()=>{throw Error('窗口仍占用身份租约');});
 const run=await service.start(ctx,input());await service.drainAccountBindingQueue(control);await vi.waitFor(()=>expect(stage.login).toHaveBeenCalled());await service.cancel(ctx,run.runId);
 await vi.waitFor(async()=>expect((await service.status(ctx,run.runId)).error).toContain('停止尚未确认'));
 await createPersistentTaskService(store.db,{now,nextId}).recoverExpiredLeases();expect((await service.status(ctx,run.runId)).status).toBe('cancel_requested');
 stage.discard=vi.fn(async()=>{});await service.drainAccountBindingQueue(control,{waitForCompletion:true});expect((await service.status(ctx,run.runId)).status).toBe('cancelled');expect(stage.commit).not.toHaveBeenCalled();
});
it('绑定事务失败时恢复原profile并回滚真实成员，不能留下假成功账号',async()=>{
 const rollback=vi.fn(async()=>{}),finalize=vi.fn(async()=>{});
 stage.commit=vi.fn(async(c,input,tx)=>{await createPlatformAccountService({db:tx as unknown as Db,now,nextId}).createAccount(c,{platform:'douyin',accountHandle:input.identity.accountHandle,externalAccountId:input.identity.externalAccountId});return {accountId:'',rollbackProfile:rollback,finalizeProfile:finalize};});
 const run=await service.start(ctx,input());await service.drainAccountBindingQueue(control,{waitForCompletion:true});expect((await service.status(ctx,run.runId)).status).toBe('failed');expect((await groups.get(ctx,ctx.groupId!)).members).toHaveLength(0);expect(rollback).toHaveBeenCalledOnce();expect(finalize).not.toHaveBeenCalled();expect(stage.discard).toHaveBeenCalledOnce();
});
it('应用停止必须等待本run真实扫码停止和清理，仍未确认不能吞掉失败',async()=>{
 stage.login=vi.fn(async(_c,{signal})=>new Promise<boolean>((_resolve,reject)=>signal.addEventListener('abort',()=>reject(signal.reason),{once:true})));
 stage.discard=vi.fn(async()=>{throw Error('OS进程尚未停止');});
 const run=await service.start(ctx,input());await service.drainAccountBindingQueue(control);await vi.waitFor(()=>expect(stage.login).toHaveBeenCalled());await expect(service.stop()).rejects.toMatchObject({resourceStopUnconfirmed:true});expect((await service.status(ctx,run.runId)).status).not.toBe('cancelled');
 // 新进程恢复同一持久任务；旧服务不能宣称已经安全停止。
 stage.discard=vi.fn(async()=>{});service=createAccountBindingService({db:store.db,now:()=>new Date(Date.now()+400000).toISOString(),nextId,stage,capabilities:async()=>[]});await service.drainAccountBindingQueue(control,{waitForCompletion:true});expect((await service.status(ctx,run.runId)).status).toBe('failed');
});
it('真实绑定能力缺失时不创建执行任务，跨组请求也不能偷改目标组',async()=>{
 const unavailable=createAccountBindingService({db:store.db,now,nextId,stage,capabilities:async()=>[{platform:'douyin',bind:{available:false,method:'none',reason:'绑定端口未装配'}}]});await expect(unavailable.start(ctx,input())).rejects.toThrow('绑定端口未装配');await expect(service.start({...ctx,groupId:'another'},input())).rejects.toThrow('请先进入');await unavailable.stop();expect(stage.createStaging).not.toHaveBeenCalled();
});
it('已成功保存的账号不会因备份清理诊断失败被恢复成旧profile或误报浏览器未停',async()=>{
 const rollback=vi.fn(async()=>{}),commit=stage.commit;stage.commit=vi.fn(async(c,input,tx)=>({...await commit(c,input,tx),rollbackProfile:rollback,finalizeProfile:async()=>{throw Error('备份清理待重试');}}));service=createAccountBindingService({db:store.db,now,nextId,stage,capabilities:async()=>[{platform:'douyin',bind:{available:true,method:'qr',reason:'真实端口'}}],onProfileCleanupError:()=>{throw Error('诊断上报暂不可用');}});const run=await service.start(ctx,input());await service.drainAccountBindingQueue(control,{waitForCompletion:true});expect((await service.status(ctx,run.runId)).status).toBe('succeeded');expect(rollback).not.toHaveBeenCalled();expect(stage.discard).not.toHaveBeenCalled();await service.stop();
});
it('公共绑定transport按真实ctx校验身份与归组，伪造body拒绝',async()=>{
 const {createAccountBindingTransport}=await import('./account-binding.transport');const {ENDPOINTS,createClient}=await import('@creatoros/contract');const transport=createAccountBindingTransport(()=>service),client=createClient(ENDPOINTS,transport,ctx);
 await expect(createClient(ENDPOINTS,transport).startAccountBinding({params:undefined,query:undefined,body:input()})).rejects.toThrow();
 // 外部HTTP输入可能损坏；这里专门验证runtime schema，不伪装为合法类型。
 await expect(transport.request(ENDPOINTS.startAccountBinding,{params:undefined,query:undefined,body:{platform:'douyin'} as unknown as ReturnType<typeof input>},ctx)).rejects.toThrow();
 const run=await client.startAccountBinding({params:undefined,query:undefined,body:input()});
 await expect(createClient(ENDPOINTS,transport,{...ctx,groupId:'other'}).getAccountBinding({params:{runId:run.runId},query:undefined,body:undefined})).rejects.toThrow();
 expect(await client.cancelAccountBinding({params:{runId:run.runId},query:undefined,body:undefined})).toMatchObject({status:'cancelled'});
});
it('取消响应丢失后重复请求同run仍返回停止中，不重复创建执行权或误报失败',async()=>{
 let cleaned!:()=>void;stage.login=vi.fn(async(_c,{signal})=>new Promise<boolean>((_resolve,reject)=>signal.addEventListener('abort',()=>reject(signal.reason),{once:true})));stage.discard=vi.fn(async()=>new Promise<void>(resolve=>{cleaned=resolve;}));const run=await service.start(ctx,input());await service.drainAccountBindingQueue(control);await vi.waitFor(()=>expect(stage.login).toHaveBeenCalled());await service.cancel(ctx,run.runId);await vi.waitFor(()=>expect(stage.discard).toHaveBeenCalled());try{await expect(service.cancel(ctx,run.runId)).resolves.toMatchObject({status:'cancel_requested'});}finally{cleaned();await vi.waitFor(async()=>expect((await service.status(ctx,run.runId)).status).toBe('cancelled'));}
});
it('公共execution控制对绑定仅允许取消，暂停继续重试必须明确拒绝且不改变run',async()=>{
 const {createPersistentTaskService}=await import('../execution');const tasks=createPersistentTaskService(store.db,{now,nextId});const run=await service.start(ctx,input());for(const command of ['pause','resume','retry'] as const)await expect(tasks.command(ctx,{taskIds:[run.runId],command,idempotencyKey:`reject-${command}`})).rejects.toMatchObject({code:'ValidationError'});expect((await service.status(ctx,run.runId)).status).toBe('queued');expect((await service.cancel(ctx,run.runId)).status).toBe('cancelled');
});
it('prepareCommit事务外等待期间组版本改变，不能持组锁等待宿主也不能继续commit',async()=>{
 let prepared!:()=>void;stage.prepareCommit=vi.fn(async()=>new Promise<void>(resolve=>{prepared=resolve;}));const run=await service.start(ctx,input());await service.drainAccountBindingQueue(control);await vi.waitFor(()=>expect(stage.prepareCommit).toHaveBeenCalled());await groups.update(ctx,ctx.groupId!,{name:'准备期间已更新',expectedVersion:1});prepared();await vi.waitFor(async()=>expect((await service.status(ctx,run.runId)).status).toBe('failed'));expect(stage.commit).not.toHaveBeenCalled();expect(stage.discard).toHaveBeenCalledWith(expect.objectContaining({groupId:ctx.groupId}),expect.objectContaining({runId:run.runId,stagingKey:'real-owned-stage'}));
});
it('prepareCommit等待时取消传实际signal，宿主停止清理未确认前不能返回cancelled',async()=>{
 let cleaned!:()=>void;stage.prepareCommit=vi.fn(async(_c,{signal})=>new Promise<void>((_resolve,reject)=>signal.addEventListener('abort',()=>reject(signal.reason),{once:true})));stage.discard=vi.fn(async()=>new Promise<void>(resolve=>{cleaned=resolve;}));const run=await service.start(ctx,input());await service.drainAccountBindingQueue(control);await vi.waitFor(()=>expect(stage.prepareCommit).toHaveBeenCalled());await service.cancel(ctx,run.runId);await vi.waitFor(()=>expect(stage.discard).toHaveBeenCalled());try{expect((await service.status(ctx,run.runId)).status).toBe('cancel_requested');expect(stage.commit).not.toHaveBeenCalled();}finally{cleaned();}await vi.waitFor(async()=>expect((await service.status(ctx,run.runId)).status).toBe('cancelled'));
});
it('prepareCommit租约准备失败只清理本run，不登记账号或搬移生产profile',async()=>{stage.prepareCommit=vi.fn(async()=>{throw Error('宿主租约暂不可用');});const run=await service.start(ctx,input());await service.drainAccountBindingQueue(control,{waitForCompletion:true});expect(await service.status(ctx,run.runId)).toMatchObject({status:'failed',accountId:null,error:'宿主租约暂不可用'});expect(stage.commit).not.toHaveBeenCalled();expect(stage.discard).toHaveBeenCalledOnce();expect((await groups.get(ctx,ctx.groupId!)).members).toHaveLength(0);});

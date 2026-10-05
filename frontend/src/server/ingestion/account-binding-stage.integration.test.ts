// @vitest-environment node
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {mkdtemp,mkdir,writeFile,readFile,readdir,rm,realpath} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {createDb,sql} from '@creatoros/backend';
import type {RequestContext} from '@creatoros/contract';
import {createAccountGroupService,createAccountBindingService,createBrowserProfileAuthority,createPlatformAccountService} from '@creatoros/backend/modules/platform-account';
import {prepareDouyinStagingAdoption,douyinStagingDirFor} from './douyin-auth-staging';
import {createPersistentTaskService,createHostBrowserProfileLifecycle} from '@creatoros/backend/modules/execution';
import {createDouyinAccountBindingStage} from './account-binding-stage';
let store:Awaited<ReturnType<typeof createDb>>,base:string,ctx:RequestContext,seq=0;
let service:ReturnType<typeof createAccountBindingService>,lifecycle:ReturnType<typeof createHostBrowserProfileLifecycle>,stage:ReturnType<typeof createDouyinAccountBindingStage>;
const now=()=>new Date().toISOString(),nextId=(prefix:string)=>`${prefix}-stage-${++seq}`;
let loginBlocked=false,loginStarted=false,confirmBrowserStopped:(()=>void)|undefined;
const control={signal:new AbortController().signal,shouldStop:()=>false};
beforeEach(async()=>{
 store=await createDb();base=await realpath(await mkdtemp(path.join(os.tmpdir(),'creator-binding-')));loginBlocked=false;loginStarted=false;confirmBrowserStopped=undefined;
 const group=await createAccountGroupService({db:store.db,now,nextId}).create({userId:'stage-user',requestId:'test',source:'user'},{name:'目标组',idempotencyKey:'group'});ctx={userId:'stage-user',requestId:'test',source:'user',accountId:null,groupId:group.id};
 const authority=createBrowserProfileAuthority(store.db,base);lifecycle=createHostBrowserProfileLifecycle(store.db,{resolveProfile:authority.resolveProfile,waitTimeoutMs:1000,pollIntervalMs:10});
 // 仅替换浏览器驱动；目录授权、宿主租约、持久任务、事务与文件搬移都走生产实现。
 const cdp={loginDouyin:async({authDir,signal}:{authDir:string;signal:AbortSignal})=>{const owner=await lifecycle.acquire(authDir,signal);try{await mkdir(authDir,{recursive:true});await writeFile(path.join(authDir,'profile.txt'),'new-login');loginStarted=true;if(loginBlocked)await new Promise<void>((resolve,reject)=>{signal.addEventListener('abort',()=>{confirmBrowserStopped=()=>reject(signal.reason);},{once:true});});return true;}finally{await owner.onStopped();}},fetchDouyinIdentity:async({authDir,signal}:{authDir:string;signal:AbortSignal})=>{const owner=await lifecycle.acquire(authDir,signal);try{return {secUid:'stable-real-test-id',nickname:'扫码身份',followerCount:42};}finally{await owner.onStopped();}}};
 stage=createDouyinAccountBindingStage({db:store.db,base,authority,lifecycle,now,nextId,loadCdp:async()=>cdp as unknown as typeof import('./douyin-cdp')});
 service=createAccountBindingService({db:store.db,now,nextId,stage,capabilities:async()=>[{platform:'douyin',bind:{available:true,method:'qr',reason:'测试浏览器端口'}}]});
});
afterEach(async()=>{confirmBrowserStopped?.();await service?.stop();await store?.client.close();await rm(base,{recursive:true,force:true});});
async function start(){const group=await createAccountGroupService({db:store.db,now,nextId}).get(ctx,ctx.groupId!);return service.start(ctx,{groupId:ctx.groupId!,platform:'douyin',expectedGroupVersion:group.version,idempotencyKey:`intent-${++seq}`});}
it('生产公共链在PGlite事务外预留宿主租约，新账号真实登记并完成目录采用',async()=>{
 expect(stage.prepareCommit,'必须在提交事务前准备宿主租约').toBeTypeOf('function');
 const run=await start();await service.drainAccountBindingQueue(control,{waitForCompletion:true});const result=await service.status(ctx,run.runId);expect(result).toMatchObject({status:'succeeded'});expect(result.accountId).toBeTruthy();expect(await readFile(path.join(base,result.accountId!,'profile.txt'),'utf8')).toBe('new-login');expect(await readdir(base)).toEqual([result.accountId]);const held=await lifecycle.acquire(path.join(base,result.accountId!));await held.onStopped();
});
it('已有真实账号采用新登录态，保留ID并清除旧备份且不重复成员',async()=>{
 expect(stage.prepareCommit).toBeTypeOf('function');const account=await createPlatformAccountService({db:store.db,now,nextId}).createAccount(ctx,{platform:'douyin',accountHandle:'旧身份',externalAccountId:'stable-real-test-id'});await mkdir(path.join(base,account.id));await writeFile(path.join(base,account.id,'profile.txt'),'old-login');const run=await start();await service.drainAccountBindingQueue(control,{waitForCompletion:true});expect(await service.status(ctx,run.runId)).toMatchObject({status:'succeeded',accountId:account.id});expect(await readFile(path.join(base,account.id,'profile.txt'),'utf8')).toBe('new-login');expect(await readdir(base)).toEqual([account.id]);expect((await createAccountGroupService({db:store.db,now,nextId}).get(ctx,ctx.groupId!)).members).toHaveLength(1);
});
it('取消等待真实浏览器停止与宿主租约释放，清理后才确认cancelled',async()=>{
 loginBlocked=true;const run=await start();await service.drainAccountBindingQueue(control);await vi.waitFor(()=>expect(loginStarted).toBe(true));await service.cancel(ctx,run.runId);await vi.waitFor(()=>expect(confirmBrowserStopped).toBeTypeOf('function'));expect(await service.status(ctx,run.runId)).toMatchObject({status:'cancel_requested'});expect((await readdir(base)).some(name=>name.startsWith('_staging-'))).toBe(true);confirmBrowserStopped!();await vi.waitFor(async()=>expect(await service.status(ctx,run.runId)).toMatchObject({status:'cancelled'}),{timeout:3000});expect(await readdir(base)).toEqual([]);
});
it('另一组真实身份准备失败，清理扫码目录且不暗转账号',async()=>{
 expect(stage.prepareCommit).toBeTypeOf('function');const groups=createAccountGroupService({db:store.db,now,nextId});const other=await groups.create(ctx,{name:'其它组',idempotencyKey:'other'});const account=await createPlatformAccountService({db:store.db,now,nextId}).createAccount({...ctx,groupId:other.id},{platform:'douyin',accountHandle:'已有账号',externalAccountId:'stable-real-test-id'});const run=await start();await service.drainAccountBindingQueue(control,{waitForCompletion:true});expect(await service.status(ctx,run.runId)).toMatchObject({status:'failed',accountId:null});expect((await groups.forAccount(ctx,account.id)).groupId).toBe(other.id);expect(await readdir(base)).toEqual([]);
});

it('等待目标租约期间组可更新，随后清理已持预租约而不自我等待',async()=>{
 const groups=createAccountGroupService({db:store.db,now,nextId});const account=await createPlatformAccountService({db:store.db,now,nextId}).createAccount(ctx,{platform:'douyin',accountHandle:'原身份',externalAccountId:'stable-real-test-id'});await mkdir(path.join(base,account.id));await writeFile(path.join(base,account.id,'profile.txt'),'old-login');
 const blocker=await lifecycle.acquire(path.join(base,account.id));const run=await start();await service.drainAccountBindingQueue(control);
 try{await vi.waitFor(async()=>expect(await service.status(ctx,run.runId)).toMatchObject({status:'finalizing'}));const group=await groups.get(ctx,ctx.groupId!);await groups.update(ctx,ctx.groupId!,{name:'准备期间改名',expectedVersion:group.version});}finally{await blocker.onStopped();}
 await vi.waitFor(async()=>expect(await service.status(ctx,run.runId)).toMatchObject({status:'failed'}),{timeout:3000});expect(await readFile(path.join(base,account.id,'profile.txt'),'utf8')).toBe('old-login');expect(await readdir(base)).toEqual([account.id]);const held=await lifecycle.acquire(path.join(base,account.id));await held.onStopped();
});
it('真实数据库事务拒绝成功状态时恢复旧登录目录与真实账号，租约最终释放',async()=>{
 const account=await createPlatformAccountService({db:store.db,now,nextId}).createAccount(ctx,{platform:'douyin',accountHandle:'原身份',externalAccountId:'stable-real-test-id'});await mkdir(path.join(base,account.id));await writeFile(path.join(base,account.id,'profile.txt'),'old-login');
 // 测试库触发器模拟提交拒绝；未替换服务、FS或租约实现。
 await store.db.execute(sql.raw("CREATE FUNCTION reject_binding_success() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.kind='account_binding' AND NEW.status='succeeded' THEN RAISE EXCEPTION 'test commit rejected'; END IF; RETURN NEW; END $$"));
 await store.db.execute(sql.raw('CREATE TRIGGER reject_binding_success BEFORE UPDATE ON execution_tasks FOR EACH ROW EXECUTE FUNCTION reject_binding_success()'));
 const run=await start();await service.drainAccountBindingQueue(control,{waitForCompletion:true});expect(await service.status(ctx,run.runId)).toMatchObject({status:'failed',accountId:null});expect(await readFile(path.join(base,account.id,'profile.txt'),'utf8')).toBe('old-login');expect(await readdir(base)).toEqual([account.id]);expect((await createPlatformAccountService({db:store.db,now,nextId}).getAccount(ctx,account.id)).accountHandle).toBe('原身份');const held=await lifecycle.acquire(path.join(base,account.id));await held.onStopped();
});

it('重启没有内存Map时依据持久run与采用marker恢复旧目录，再确认中断失败',async()=>{
 const account=await createPlatformAccountService({db:store.db,now,nextId}).createAccount(ctx,{platform:'douyin',accountHandle:'原身份',externalAccountId:'stable-real-test-id'});const target=path.join(base,account.id);await mkdir(target);await writeFile(path.join(target,'profile.txt'),'old-login');
 const run=await start(),tasks=createPersistentTaskService(store.db,{now,nextId});const claim=await tasks.claimTask({taskId:run.runId,workerId:'previous-process',leaseSeconds:1});expect(claim).toBeTruthy();
 const {stagingKey}=await stage.createStaging(ctx,run.runId);await tasks.saveCheckpoint({taskId:run.runId,workerId:'previous-process',attempt:claim!.lease.attempt,checkpoint:{stagingKey,phase:'finalizing'}});await stage.login(ctx,{stagingKey,signal:control.signal});
 // 浏览器已停止；模拟旧进程在FS采用后、DB成功前中断，持久marker保留。
 await prepareDouyinStagingAdoption(douyinStagingDirFor(base,stagingKey),target,{userId:ctx.userId,runId:run.runId});
 await service.stop();const authority=createBrowserProfileAuthority(store.db,base),restartedLifecycle=createHostBrowserProfileLifecycle(store.db,{resolveProfile:authority.resolveProfile,waitTimeoutMs:1000,pollIntervalMs:10});
 const restartedStage=createDouyinAccountBindingStage({db:store.db,base,authority,lifecycle:restartedLifecycle,now,nextId,loadCdp:async()=>{throw Error('恢复不应再开扫码');}});
 service=createAccountBindingService({db:store.db,now:()=>new Date(Date.now()+400000).toISOString(),nextId,stage:restartedStage,capabilities:async()=>[]});await service.drainAccountBindingQueue(control,{waitForCompletion:true});expect(await service.status(ctx,run.runId)).toMatchObject({status:'failed'});expect(await readFile(path.join(target,'profile.txt'),'utf8')).toBe('old-login');expect(await readdir(base)).toEqual([account.id]);
});
it('目标租约等待期间取消会释放预留资源，只清理本run且保留原账号目录',async()=>{
 const account=await createPlatformAccountService({db:store.db,now,nextId}).createAccount(ctx,{platform:'douyin',accountHandle:'原身份',externalAccountId:'stable-real-test-id'});const target=path.join(base,account.id);await mkdir(target);await writeFile(path.join(target,'profile.txt'),'old-login');const blocker=await lifecycle.acquire(target);
 try{const run=await start();await service.drainAccountBindingQueue(control);await vi.waitFor(async()=>expect(await service.status(ctx,run.runId)).toMatchObject({status:'finalizing'}));await service.cancel(ctx,run.runId);await vi.waitFor(async()=>expect(await service.status(ctx,run.runId)).toMatchObject({status:'cancelled'}),{timeout:3000});expect(await readFile(path.join(target,'profile.txt'),'utf8')).toBe('old-login');expect(await readdir(base)).toEqual([account.id]);}finally{await blocker.onStopped();}
 const held=await lifecycle.acquire(target);await held.onStopped();
});

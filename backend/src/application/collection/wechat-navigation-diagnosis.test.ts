import {afterEach,describe,expect,it,vi} from 'vitest';
import {mkdir,mkdtemp,realpath,readdir,readFile,chmod,symlink,rm,writeFile} from 'node:fs/promises';
import path from 'node:path';
import type {RequestContext} from '@creatoros/contract';
import {createWechatNavigationDiagnosis,WECHAT_NAVIGATION_BUDGET_MS,type WechatNavigationDiagnosisPorts} from './wechat-navigation-diagnosis';
const roots:string[]=[];
afterEach(async()=>{vi.useRealTimers();await Promise.all(roots.splice(0).map(directory=>rm(directory,{recursive:true,force:true})));});
const ctx:RequestContext={userId:'owner',groupId:'group',requestId:'synthetic',source:'user'};
async function fixture(){
 const root=await realpath(await mkdtemp('/tmp/t1364-backend-'));roots.push(root);
 const account={id:'account',userId:'owner',platform:'wechatVideo',externalAccountId:'stable',status:'active',updatedAt:'2026-10-19T00:00:00.000Z'};
 const group={id:'group',userId:'owner',status:'active',version:1};
 const member={id:'member',userId:'owner',groupId:'group',accountId:'account',version:1,leftAt:null as string|null};
 const release=vi.fn(async()=>{}),observe=vi.fn<WechatNavigationDiagnosisPorts['observeNavigation']>(async(_directory,_expected,controls)=>{
  await controls.assertScopeFresh();controls.onBrowserOpened?.('2026-10-19T00:00:00.100Z');controls.onContextCloseStarted?.('2026-10-19T00:00:00.200Z');controls.onPhysicalStopped?.('2026-10-19T00:00:00.300Z');await controls.onStopped?.();
  return {diagnosticRunId:controls.diagnosticRunId,identityMatched:true,observationStartedAt:'2026-10-19T00:00:00.100Z',observationEndedAt:'2026-10-19T00:02:00.100Z',sampleCount:2,snapshots:[],samples:[]};
 });
 const ports:WechatNavigationDiagnosisPorts={configuration:{authorizationId:'one',groupId:'group',accountId:'account',privateRoot:root,sourceSha:'a'.repeat(40)},
 assertOwnedAccount:vi.fn(async(c,id,platform)=>{if(c.userId!==account.userId||id!==account.id||platform!==account.platform||account.status!=='active')throw Error('owned account refused');}),readAccount:vi.fn(async()=>({...account})),readGroup:vi.fn(async()=>({...group})),readMembership:vi.fn(async()=>({...member})),authorizeProfile:vi.fn(async()=>({authDir:'/synthetic-owned-profile'})),acquireProfile:vi.fn(async()=>({authDir:'/synthetic-owned-profile',onStopped:release,auditReceipt:{leaseId:'real-lease',hostOperationId:'real-operation'}})),observeNavigation:observe,onStopUnconfirmed:vi.fn()};
 const controller=new AbortController();const controls={signal:controller.signal,trustedInvocationId:'invocation'};
 return {root,account,group,member,ports,release,observe,controller,controls,service:createWechatNavigationDiagnosis(ports)};
}
describe('T1364 backend诊断边界（合成ports，不代签真浏览器）',()=>{
 it('完整总预算冻结，真实停止和释放分时刻，manifest保存真实auditReceipt',async()=>{
  const f=await fixture(),result=await f.service.diagnose(ctx,'account',f.controls);
  expect(Date.parse(result.deadlineAt)-Date.parse(result.startedAt)).toBe(WECHAT_NAVIGATION_BUDGET_MS);
  expect(result).toMatchObject({status:'completed',stop:{physicalStoppedAt:'2026-10-19T00:00:00.300Z',hostLeaseReleaseConfirmed:true,stopPending:false}});
  const directory=(await readdir(f.root)).find(name=>name.startsWith('run-'))!;
  const manifest=JSON.parse(await readFile(path.join(f.root,directory,'manifest.json'),'utf8'));
  expect(manifest.auditReceipt).toEqual({leaseId:'real-lease',hostOperationId:'real-operation'});expect(f.release).toHaveBeenCalledOnce();
  expect(JSON.stringify(result)).not.toContain('stable');expect(JSON.stringify(result)).not.toContain('/synthetic');
 });
 it('无可信invocation、已取消和缺group均不launch/不消耗授权',async()=>{
  const f=await fixture();await expect(f.service.diagnose(ctx,'account')).rejects.toThrow('TRUSTED_CLI');
  await expect(f.service.diagnose({...ctx,groupId:undefined},'account',f.controls)).rejects.toThrow('SCOPE');
  f.controller.abort();await expect(f.service.diagnose(ctx,'account',f.controls)).rejects.toThrow();expect(f.observe).not.toHaveBeenCalled();expect(await readdir(f.root)).toEqual([]);
 });
 it.each(['user','group','platform','account-status','group-status','membership'] as const)('当前%s不合格在authority/launch前拒绝',async(field)=>{
  const f=await fixture();if(field==='user')f.account.userId='other';if(field==='group')f.member.groupId='other';if(field==='platform')f.account.platform='douyin';if(field==='account-status')f.account.status='archived';if(field==='group-status')f.group.status='archived';if(field==='membership')f.member.leftAt='2026-10-19T00:00:00Z';
  await expect(f.service.diagnose(ctx,'account',f.controls)).rejects.toThrow();expect(f.ports.authorizeProfile).not.toHaveBeenCalled();expect(f.observe).not.toHaveBeenCalled();
 });
 it('排队后成员A-B-A新version拒绝首次导航，合法释放未启动租约但不冒实close',async()=>{
  const f=await fixture();f.ports.acquireProfile=vi.fn(async()=>{f.member.version+=2;return {authDir:'/synthetic',onStopped:f.release,auditReceipt:{leaseId:'lease',hostOperationId:'op'}};});
  const result=await createWechatNavigationDiagnosis(f.ports).diagnose(ctx,'account',f.controls);
  expect(result).toMatchObject({status:'failed',reasonCode:'WECHAT_NAVIGATION_SCOPE_CHANGED',screenshots:[],stop:{browserOpened:false,physicalStopConfirmed:false,hostLeaseReleaseConfirmed:true}});expect(f.observe).not.toHaveBeenCalled();expect(f.release).toHaveBeenCalledOnce();
 });
 it('取证中成员变化中断并隔离，不发布旧索引',async()=>{
  const f=await fixture();f.observe.mockImplementation(async(_dir,_id,c)=>{c.onBrowserOpened?.('2026-10-19T00:00:00Z');f.member.version++;try{await c.assertScopeFresh();}finally{c.onPhysicalStopped?.('2026-10-19T00:00:01Z');await c.onStopped?.();}throw Error('unreachable');});
  const result=await f.service.diagnose(ctx,'account',f.controls);expect(result).toMatchObject({status:'failed',reasonCode:'WECHAT_NAVIGATION_SCOPE_CHANGED',screenshots:[]});await expect(f.service.assertCachedScope(ctx,'account',result)).rejects.toThrow('SCOPE_CHANGED');
 });
 it('跨service重启同invocation回读不launch，不同invocation消费后拒绝',async()=>{
  const f=await fixture();const result=await f.service.diagnose(ctx,'account',f.controls);const restarted=createWechatNavigationDiagnosis(f.ports);
  expect(await restarted.diagnose(ctx,'account',f.controls)).toEqual(result);expect(f.observe).toHaveBeenCalledOnce();
  await expect(restarted.diagnose(ctx,'account',{...f.controls,trustedInvocationId:'other'})).rejects.toThrow('CONSUMED');expect(f.observe).toHaveBeenCalledOnce();
 });
 it('同invocation运行中不重开；成功缓存当前组version变更拒绝',async()=>{
  const f=await fixture();let finish!:()=>void;f.observe.mockImplementation(async(_d,_i,c)=>{await new Promise<void>(r=>{finish=r;});c.onBrowserOpened?.('2026-10-19T00:00:00Z');c.onPhysicalStopped?.('2026-10-19T00:00:01Z');await c.onStopped?.();return {diagnosticRunId:c.diagnosticRunId,identityMatched:true,observationStartedAt:'2026-10-19T00:00:00Z',observationEndedAt:'2026-10-19T00:02:00Z',sampleCount:1,snapshots:[],samples:[]};});
  const run=f.service.diagnose(ctx,'account',f.controls);await vi.waitFor(()=>expect(f.observe).toHaveBeenCalledOnce(),{timeout:120000});
  await expect(createWechatNavigationDiagnosis(f.ports).diagnose(ctx,'account',f.controls)).rejects.toThrow('OUTCOME_UNKNOWN');finish();const result=await run;f.group.version++;await expect(f.service.assertCachedScope(ctx,'account',result)).rejects.toThrow('SCOPE_CHANGED');expect(f.observe).toHaveBeenCalledOnce();
 });
 it('真实未停回执缺失不因auditReceipt存在或observer抛错提前释放',async()=>{
  const f=await fixture();f.observe.mockImplementation(async(_d,_i,c)=>{c.onBrowserOpened?.('2026-10-19T00:00:00Z');c.onStopUnconfirmed?.(async()=>{});throw Error('late context still alive');});
  const result=await f.service.diagnose(ctx,'account',f.controls);expect(result).toMatchObject({status:'unknown',stop:{physicalStopConfirmed:false,hostLeaseReleaseConfirmed:false,stopPending:true}});expect(f.release).not.toHaveBeenCalled();
 });
 it('实停后的释放失败保持pending，原同invocation不二启',async()=>{
  const f=await fixture();f.release.mockRejectedValue(Error('db release failed'));
  const result=await f.service.diagnose(ctx,'account',f.controls);expect(result).toMatchObject({status:'unknown',stop:{physicalStopConfirmed:true,hostLeaseReleaseConfirmed:false,stopPending:true}});expect(await f.service.diagnose(ctx,'account',f.controls)).toEqual(result);expect(f.observe).toHaveBeenCalledOnce();
 });
 it('损坏marker与私有目录symlink/权限拒绝，不删除授权或启动',async()=>{
  const f=await fixture();await f.service.diagnose(ctx,'account',f.controls);const marker=(await readdir(f.root)).find(name=>name.startsWith('authorization-'))!;await writeFile(path.join(f.root,marker),'{broken',{mode:0o600});
  await expect(f.service.diagnose(ctx,'account',f.controls)).rejects.toThrow();expect(f.observe).toHaveBeenCalledOnce();
  const g=await fixture();await chmod(g.root,0o755);await expect(g.service.diagnose(ctx,'account',g.controls)).rejects.toThrow('PRIVATE_ROOT');expect(g.observe).not.toHaveBeenCalled();
  const h=await fixture();const linked=path.join(h.root,'linked');await symlink(g.root,linked);h.ports.configuration={authorizationId:'one',groupId:'group',accountId:'account',privateRoot:linked,sourceSha:'a'.repeat(40)};await expect(createWechatNavigationDiagnosis(h.ports).diagnose(ctx,'account',h.controls)).rejects.toThrow('PRIVATE_ROOT');expect(h.observe).not.toHaveBeenCalled();
 });
 it('无配置默认off，坏配置只在此op拒绝',async()=>{
  const f=await fixture();delete f.ports.configuration;await expect(createWechatNavigationDiagnosis(f.ports).diagnose(ctx,'account',f.controls)).rejects.toThrow('DISABLED');f.ports.configuration='{broken';await expect(createWechatNavigationDiagnosis(f.ports).diagnose(ctx,'account',f.controls)).rejects.toThrow('CONFIG_INVALID');expect(f.observe).not.toHaveBeenCalled();
 });
});
it('T1364缓存run目录被替换symlink拒绝，不跟随读取旧索引',async()=>{
 const f=await fixture(),result=await f.service.diagnose(ctx,'account',f.controls),run=(await readdir(f.root)).find(name=>name.startsWith('run-'))!;
 const target=path.join(f.root,'moved');const {rename}=await import('node:fs/promises');await rename(path.join(f.root,run),target);await symlink(target,path.join(f.root,run));
 await expect(f.service.assertCachedScope(ctx,'account',result)).rejects.toThrow('PRIVATE_ROOT');expect(f.observe).toHaveBeenCalledOnce();
});
it('T1364未到启动的scope读取受同一冻结执行截止约束，不等晚读完成再launch',async()=>{
 const f=await fixture();vi.useFakeTimers();f.ports.readMembership=vi.fn(async()=>new Promise<never>(()=>{}));
 const run=createWechatNavigationDiagnosis(f.ports).diagnose(ctx,'account',f.controls);const outcome=expect(run).rejects.toThrow('DEADLINE_EXCEEDED');
 await vi.advanceTimersByTimeAsync(2450001);await outcome;expect(f.observe).not.toHaveBeenCalled();expect(await readdir(f.root)).toEqual([]);
});

it('T1364两帧结束后close等待时取消：实停释放可证，晚observation只隔离而无公开图索引',async()=>{
 const f=await fixture();f.observe.mockImplementation(async(_directory,_identity,c)=>{
  c.onBrowserOpened?.('2026-10-19T00:00:00Z');c.onContextCloseStarted?.('2026-10-19T00:02:00Z');f.controller.abort(Error('disconnect-during-close'));
  c.onPhysicalStopped?.('2026-10-19T00:02:01Z');await c.onStopped?.();
  return {diagnosticRunId:c.diagnosticRunId,identityMatched:true,observationStartedAt:'2026-10-19T00:00:00Z',observationEndedAt:'2026-10-19T00:02:00Z',sampleCount:2,samples:[],snapshots:[{phase:'identity_verified',observedAt:'2026-10-19T00:00:00Z',routeClass:'platform_home',roots:[],menuCandidates:[],closedShadowUnknownCount:0,truncated:false,screenshot:{status:'captured',artifactId:'opaque',sha256:'a'.repeat(64)}}]};
 });
 const result=await f.service.diagnose(ctx,'account',f.controls);expect(result).toMatchObject({status:'cancelled',screenshots:[],stop:{physicalStopConfirmed:true,hostLeaseReleaseConfirmed:true}});
 const run=(await readdir(f.root)).find(name=>name.startsWith('run-'))!,manifest=JSON.parse(await readFile(path.join(f.root,run,'manifest.json'),'utf8'));expect(manifest.quarantined).toBe(true);expect(manifest.observation.snapshots).toHaveLength(1);await expect(f.service.assertCachedScope(ctx,'account',result)).resolves.toBeUndefined();
});

it('T1364最终私有IO准备后取消，提交点只生成无图隔离安全索引',async()=>{
 const f=await fixture();const baseRead=f.ports.readMembership,baseObserve=f.observe.getMockImplementation()!;
 f.observe.mockImplementation(async(...args)=>({...await baseObserve(...args),snapshots:[{phase:'identity_verified',observedAt:'2026-10-19T00:00:00Z',routeClass:'platform_home',roots:[],menuCandidates:[],closedShadowUnknownCount:0,truncated:false,screenshot:{status:'captured',artifactId:'opaque-prepared',sha256:'a'.repeat(64)}}]}));
 f.ports.readMembership=vi.fn(async(c,id)=>{
  const run=(await readdir(f.root)).find(name=>name.startsWith('run-'));
  if(run&&(await readdir(path.join(f.root,run))).includes('result.prepared.json'))f.controller.abort(Error('abort-after-private-io'));
  return baseRead(c,id);
 });
 const result=await createWechatNavigationDiagnosis(f.ports).diagnose(ctx,'account',f.controls);
 expect(result).toMatchObject({status:'cancelled',screenshots:[],reasonCode:'WECHAT_NAVIGATION_CANCELLED'});
 const directory=(await readdir(f.root)).find(name=>name.startsWith('run-'))!,index=JSON.parse(await readFile(path.join(f.root,directory,'result.json'),'utf8'));
 expect(index).toEqual({result,quarantined:true});expect(f.observe).toHaveBeenCalledOnce();
});

it('T1364临时归属读取失败只记未核实，不冒真实转组且不泄漏底层路径',async()=>{
 const f=await fixture(),read=f.ports.readMembership;let broken=false;
 f.ports.readMembership=async(c,id)=>{if(broken)throw Error('ENOENT /private/tmp/T1364_PRIVATE_SENTINEL');return read(c,id);};
 f.observe.mockImplementation(async(_directory,_identity,c)=>{c.onBrowserOpened?.('2026-10-19T00:00:00Z');broken=true;try{await c.assertScopeFresh();}finally{c.onPhysicalStopped?.('2026-10-19T00:00:01Z');await c.onStopped?.();}throw Error('unreachable');});
 const service=createWechatNavigationDiagnosis(f.ports),result=await service.diagnose(ctx,'account',f.controls);
 expect(result).toMatchObject({status:'unknown',reasonCode:'WECHAT_NAVIGATION_SCOPE_UNVERIFIED',screenshots:[]});
 expect(JSON.stringify(result)).not.toContain('T1364_PRIVATE');await expect(service.assertCachedScope(ctx,'account',result)).rejects.toThrow('WECHAT_NAVIGATION_SCOPE_UNVERIFIED');
});

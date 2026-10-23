import {act,cleanup,render,screen} from '@testing-library/react';
import {StrictMode} from 'react';
import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
const f=vi.hoisted(()=>({ensure:vi.fn(),invalidate:vi.fn(),read:vi.fn(),refresh:vi.fn(),fresh:vi.fn(),invoke:vi.fn(),last:vi.fn(),subscribe:vi.fn(),unsubscribe:vi.fn(),desktop:true,ready:true,group:'group-a',onDecision:null as null|((decision:{licensed:boolean;revoked:boolean})=>void)}));
vi.mock('next/navigation',()=>({useRouter:()=>({refresh:f.refresh})}));
vi.mock('@tauri-apps/api/core',()=>({invoke:f.invoke}));
vi.mock('@/lib/desktop-updater',()=>({isDesktopRuntimeClient:()=>f.desktop}));
vi.mock('@/lib/shell-license',()=>({fetchLastShellDecision:f.last,subscribeShellDecision:f.subscribe}));
vi.mock('@/lib/automatic-license-upgrade',async original=>({...await original<typeof import('@/lib/automatic-license-upgrade')>(),ensureAutomaticLicenseUpgrade:f.ensure,invalidateAutomaticLicenseUpgradeScope:f.invalidate,readAutomaticLicenseUpgrade:f.read}));
vi.mock('./workspace-initialization',()=>({useWorkspaceInitialization:()=>({ready:f.ready})}));
vi.mock('@/lib/creation-workspace-scope',async original=>({...await original<typeof import('@/lib/creation-workspace-scope')>(),useCreationScope:()=>({groupId:f.group,accountId:null})}));
vi.mock('@/features/copilot/assistant-engine',()=>({refreshModelRoutingAfterUpgrade:f.fresh}));
import {ChannelConfigBootstrap} from './channel-config-bootstrap';
const flush=()=>act(async()=>{for(let i=0;i<20;i++)await Promise.resolve();});
beforeEach(()=>{vi.useFakeTimers();f.ensure.mockReset().mockResolvedValue(undefined);f.invalidate.mockReset();f.read.mockReset().mockReturnValue({scopeKey:'group:group-a',status:'pending',phase:'proof',reasonCode:'UPGRADE_SERVICE_UNAVAILABLE'});f.refresh.mockReset();f.fresh.mockReset().mockResolvedValue(undefined);f.invoke.mockReset();f.last.mockReset().mockResolvedValue({licensed:true,revoked:false});f.unsubscribe.mockReset();f.subscribe.mockReset().mockImplementation(async cb=>{f.onDecision=cb;return f.unsubscribe;});f.desktop=true;f.ready=true;f.group='group-a';f.onDecision=null;sessionStorage.clear();localStorage.clear();vi.stubGlobal('fetch',vi.fn().mockRejectedValue(Error('controlled no ordinary configuration')));});
afterEach(()=>{cleanup();vi.useRealTimers();vi.unstubAllGlobals();});
describe('ChannelConfigBootstrap无感启动（原后台保护迁移）',()=>{
 it('首次进入自动后台唤醒真实协调器，不导航、不要求设置按钮或传原码',async()=>{
  render(<ChannelConfigBootstrap/>);await flush();expect(f.ensure.mock.calls).toEqual([[{groupId:'group-a',accountId:null}]]);expect(f.invoke).not.toHaveBeenCalled();expect(f.refresh).not.toHaveBeenCalled();expect(screen.queryByRole('button')).toBeNull();
 });
 it('重挂只重新订阅/唤醒共享flight，不取消业务或整页刷新',async()=>{
  const first=render(<ChannelConfigBootstrap/>);await flush();first.unmount();render(<ChannelConfigBootstrap/>);await flush();expect(f.ensure).toHaveBeenCalledTimes(2);expect(f.invalidate).not.toHaveBeenCalled();expect(f.unsubscribe).toHaveBeenCalledTimes(1);expect(f.refresh).not.toHaveBeenCalled();
 });
 it('旧永久布尔bootstrap标记不阻止新版自动能力核对',async()=>{
  sessionStorage.setItem('creatoros:client-config-bootstrap-completed','1');render(<ChannelConfigBootstrap/>);await flush();expect(f.ensure).toHaveBeenCalledTimes(1);expect(f.refresh).not.toHaveBeenCalled();
 });
 it('旧新鲜/过期标记都不是经济真相，统一交由共享owner而非重复副作用',async()=>{
  for(const age of [0,6*60000]){sessionStorage.setItem('creatoros:client-config-bootstrap-completed',String(Date.now()-age));const mounted=render(<ChannelConfigBootstrap/>);await flush();mounted.unmount();}
  expect(f.ensure).toHaveBeenCalledTimes(2);expect(f.invalidate).not.toHaveBeenCalled();
 });
 it('临时失败不在宿主另起定时重试/新owner，有限同token退避归协调器',async()=>{
  f.ensure.mockRejectedValue(Error('controlled pending'));render(<ChannelConfigBootstrap/>);await flush();await act(async()=>{await vi.advanceTimersByTimeAsync(30000);});expect(f.ensure).toHaveBeenCalledTimes(1);expect(f.refresh).not.toHaveBeenCalled();
 });
 it('失败只留设置状态，不在所有业务页面常驻alert或恢复按钮',async()=>{
  f.ensure.mockResolvedValue(undefined);render(<ChannelConfigBootstrap/>);await flush();expect(screen.queryByRole('alert')).toBeNull();expect(screen.queryByRole('button')).toBeNull();expect(f.refresh).not.toHaveBeenCalled();
 });
 it('workspace未ready不启动，ready后自动开始',async()=>{
  f.ready=false;const mounted=render(<ChannelConfigBootstrap/>);await flush();expect(f.ensure).not.toHaveBeenCalled();f.ready=true;mounted.rerender(<ChannelConfigBootstrap/>);await flush();expect(f.ensure).toHaveBeenCalledTimes(1);
 });
 it.each([{licensed:false,revoked:false},{licensed:true,revoked:true},null])('最近许可%s不符合不自动升级',async decision=>{
  f.last.mockResolvedValue(decision);render(<ChannelConfigBootstrap/>);await flush();expect(f.ensure).not.toHaveBeenCalled();expect(f.invoke).not.toHaveBeenCalled();
 });
 it('先订阅再补读recent decision；后续合法事件唤醒，自己事件仍由共享flight去重',async()=>{
  f.last.mockResolvedValue(null);render(<ChannelConfigBootstrap/>);await flush();expect(f.ensure).not.toHaveBeenCalled();await act(async()=>f.onDecision?.({licensed:true,revoked:false}));expect(f.ensure).toHaveBeenCalledTimes(1);await act(async()=>f.onDecision?.({licensed:true,revoked:false}));expect(f.ensure).toHaveBeenCalledTimes(2);expect(f.subscribe.mock.invocationCallOrder[0]).toBeLessThan(f.last.mock.invocationCallOrder[0]);
 });
 it('切scope停原观察，新的真实scope ready后才开始，卸载不冒充scope切换',async()=>{
  const mounted=render(<ChannelConfigBootstrap/>);await flush();f.group='group-b';f.ready=false;mounted.rerender(<ChannelConfigBootstrap/>);await flush();expect(f.invalidate).toHaveBeenCalledWith({groupId:'group-a',accountId:null});expect(f.ensure).toHaveBeenCalledTimes(1);f.ready=true;mounted.rerender(<ChannelConfigBootstrap/>);await flush();expect(f.ensure).toHaveBeenLastCalledWith({groupId:'group-b',accountId:null});
 });
 it('许可事件撤销立即停止当前观察，不轮询license_check',async()=>{
  render(<ChannelConfigBootstrap/>);await flush();await act(async()=>f.onDecision?.({licensed:false,revoked:true}));expect(f.invalidate).toHaveBeenCalledWith({groupId:'group-a',accountId:null});expect(f.invoke).not.toHaveBeenCalled();
 });
 it('web/SSR宿主无Tauri订阅、读取或网络副作用',async()=>{
  f.desktop=false;render(<ChannelConfigBootstrap/>);await flush();expect(f.subscribe).not.toHaveBeenCalled();expect(f.last).not.toHaveBeenCalled();expect(f.ensure).not.toHaveBeenCalled();
 });
 it('卸载先于异步订阅完成，迟到订阅被回收且不发起升级',async()=>{
  let finish!:(fn:()=>void)=>void;f.subscribe.mockImplementation(()=>new Promise(r=>{finish=r}));const mounted=render(<ChannelConfigBootstrap/>);mounted.unmount();await act(async()=>finish(f.unsubscribe));expect(f.unsubscribe).toHaveBeenCalledTimes(1);expect(f.ensure).not.toHaveBeenCalled();
 });
 it('真实宿主接真实coordinator：StrictMode无需按钮即probe/sync并局部广播',async()=>{
  const actual=await vi.importActual<typeof import('@/lib/automatic-license-upgrade')>('@/lib/automatic-license-upgrade');
  localStorage.setItem('creatoros:current-group','group-a');f.ensure.mockImplementation(actual.ensureAutomaticLicenseUpgrade);f.read.mockImplementation(actual.readAutomaticLicenseUpgrade);
  const calls:string[]=[],token='enc:v1:'+btoa('public-integration-observation-token');
  vi.stubGlobal('fetch',vi.fn(async(_url:RequestInfo|URL,init:RequestInit)=>{const headers=new Headers(init.headers),action=headers.get('x-creatoros-upgrade-action');calls.push(action!);expect(headers.get('x-creatoros-upgrade-mode')).toBe('automatic');return Response.json({contractVersion:'creatoros-legacy-model-upgrade-v1',action,phase:action==='probe'?'credentials':'configuration',outcome:'ready',reasonCode:'UPGRADE_READY',bindingStatus:'verified',entitlementStatus:'ready',configurationStatus:action==='sync'?'ready':'not_started',retryable:false},{headers:{'x-creatoros-upgrade-observation':token}});}));
  const synced=vi.fn();window.addEventListener('creatoros:client-config-synced',synced);render(<StrictMode><ChannelConfigBootstrap/></StrictMode>);await flush();await act(async()=>{await Promise.all(f.ensure.mock.results.map(row=>row.value));});
  expect(calls).toEqual(['probe','sync']);expect(actual.readAutomaticLicenseUpgrade()).toMatchObject({status:'ready',scopeKey:'group:group-a',successRevision:1});expect(f.fresh).toHaveBeenCalledTimes(1);expect(f.refresh).not.toHaveBeenCalled();expect(synced).toHaveBeenCalledTimes(1);window.removeEventListener('creatoros:client-config-synced',synced);
 });
 it('automatic不适用后仍保旧渠道只读bootstrap，原4次有限退避与成功广播',async()=>{
  const fetch=vi.fn().mockResolvedValueOnce(Response.json({retryable:true},{status:503})).mockResolvedValueOnce(Response.json({retryable:true},{status:503})).mockResolvedValueOnce(Response.json({retryable:true},{status:503})).mockResolvedValueOnce(Response.json({outcome:'configured'}));vi.stubGlobal('fetch',fetch);const synced=vi.fn();window.addEventListener('creatoros:client-config-synced',synced);
  render(<ChannelConfigBootstrap/>);await flush();await act(async()=>{await vi.advanceTimersByTimeAsync(14000);});expect(fetch).toHaveBeenCalledTimes(4);for(const call of fetch.mock.calls){const init=(call as unknown as [string,RequestInit])[1];expect(new Headers(init.headers).get('x-creatoros-config-trigger')).toBe('bootstrap');expect(new Headers(init.headers).get('x-creatoros-upgrade-mode')).toBeNull();expect(init.body).toBeUndefined();}expect(synced).toHaveBeenCalledTimes(1);expect(f.refresh).not.toHaveBeenCalled();window.removeEventListener('creatoros:client-config-synced',synced);
 });
 it('普通bootstrap成功后5分钟窗口节流，旧布尔/过期标记不能永久挡同步',async()=>{
  const fetch=vi.fn().mockImplementation(async()=>Response.json({outcome:'configured'}));vi.stubGlobal('fetch',fetch);sessionStorage.setItem('creatoros:client-config-bootstrap-completed','1');const first=render(<ChannelConfigBootstrap/>);await flush();first.unmount();render(<ChannelConfigBootstrap/>);await flush();expect(fetch).toHaveBeenCalledTimes(1);cleanup();sessionStorage.setItem('creatoros:client-config-bootstrap-completed',String(Date.now()-6*60000));render(<ChannelConfigBootstrap/>);await flush();expect(fetch).toHaveBeenCalledTimes(2);
 });
 it('普通读取等automatic真实收尾；native未知不能以普通bootstrap绕过禁sync',async()=>{
  let finish!:()=>void;f.ensure.mockImplementation(()=>new Promise<void>(r=>{finish=r}));const fetch=vi.fn().mockResolvedValue(Response.json({outcome:'configured'}));vi.stubGlobal('fetch',fetch);render(<ChannelConfigBootstrap/>);await flush();expect(fetch).not.toHaveBeenCalled();f.read.mockReturnValue({status:'pending',phase:'binding',reasonCode:'RESTORE_STORAGE_UNCONFIRMED'});await act(async()=>finish());expect(fetch).not.toHaveBeenCalled();
 });
});

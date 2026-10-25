import {act,cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react';
import {afterEach,beforeEach,describe,it,expect,vi} from 'vitest';
import '@testing-library/jest-dom/vitest';
import type {AutomaticLicenseUpgradeState} from '@/lib/automatic-license-upgrade';
const f=vi.hoisted(()=>({
  fetch:vi.fn(),open:vi.fn(),fresh:vi.fn(),refresh:vi.fn(),group:'group-a',account:'acct-a',
  listeners:new Set<()=>void>(),state:null as AutomaticLicenseUpgradeState|null,
  idle:{scopeKey:'',status:'idle' as const,phase:null,reasonCode:null,entitlementReady:false,configurationReady:false,successRevision:0},
}));
vi.mock('next/navigation',()=>({useRouter:()=>({refresh:f.refresh})}));
vi.mock('@/lib/http-transport',async original=>({...await original<typeof import('@/lib/http-transport')>(),fetchCreatorApi:f.fetch,readCurrentGroupId:()=>f.group,readCurrentAccountId:()=>f.account}));
vi.mock('@/lib/open-ai-credit-center',async original=>({...await original<typeof import('@/lib/open-ai-credit-center')>(),openAiCreditCenter:f.open}));
vi.mock('@/features/copilot/assistant-engine',()=>({refreshModelRoutingAfterUpgrade:f.fresh,loadModelRouting:vi.fn()}));
vi.mock('@/lib/automatic-license-upgrade',()=>({
 AUTOMATIC_UPGRADE_SERVER_STATE:f.idle,
 automaticUpgradeScopeKey:(scope:{groupId:string|null;accountId:string|null})=>scope.groupId?`group:${scope.groupId}`:`account:${scope.accountId??'missing'}`,
 readAutomaticLicenseUpgrade:()=>f.state??f.idle,
 subscribeAutomaticLicenseUpgrade:(listener:()=>void)=>{f.listeners.add(listener);return()=>f.listeners.delete(listener);},
}));
import {AiCreditCenterCard} from './channel-model-configuration';
const publish=(patch:Partial<AutomaticLicenseUpgradeState>)=>act(()=>{
 f.state={...f.idle,scopeKey:'group:group-a',...patch};for(const listener of f.listeners)listener();
});
const ready=(revision=1)=>publish({status:'ready',phase:'routing',reasonCode:'UPGRADE_READY',entitlementReady:true,configurationReady:true,successRevision:revision});
const open=()=>fireEvent.click(screen.getByRole('button',{name:'查看 AI 额度与消耗'}));
beforeEach(()=>{f.fetch.mockReset();f.open.mockReset();f.fresh.mockReset();f.refresh.mockReset();f.group='group-a';f.account='acct-a';f.state=null;f.listeners.clear();});
afterEach(()=>cleanup());
describe('T1402无感升级状态与额度卡（协调链守卫迁入automatic-license-upgrade.test.ts）',()=>{
 it('T1402无感入口：额度卡不再要求点击升级或继续核对',()=>{
  render(<AiCreditCenterCard/>);
  expect(screen.queryByRole('button',{name:/升级原激活码|继续核对|取消等待/})).toBeNull();
  expect(screen.getByText(/模型权益会随原授权自动核对/)).toBeInTheDocument();
  expect(f.fetch).not.toHaveBeenCalled();expect(f.open).not.toHaveBeenCalled();
 });
 it('设置只是订阅，后台核对不阻止查看额度，卸载不触发或取消升级',()=>{
  const view=render(<AiCreditCenterCard/>);publish({status:'checking',phase:'proof'});
  expect(screen.getByRole('status')).toHaveTextContent('正在后台核对');expect(screen.getByRole('button',{name:'查看 AI 额度与消耗'})).toBeEnabled();
  view.unmount();expect(f.listeners.size).toBe(0);expect(f.fetch).not.toHaveBeenCalled();
 });
 it('完整成功局部展示，不打开额度、不写个人路由、不整页刷新',()=>{
  render(<AiCreditCenterCard/>);ready();expect(screen.getByRole('status')).toHaveTextContent('模型权益已就绪');
  expect(f.open).not.toHaveBeenCalled();expect(f.fetch).not.toHaveBeenCalled();expect(f.fresh).not.toHaveBeenCalled();expect(f.refresh).not.toHaveBeenCalled();
 });
 it('未知/部分成功保留准确状态，不提供重复领取按钮',()=>{
  render(<AiCreditCenterCard/>);publish({status:'pending',entitlementReady:true,phase:'configuration'});
  expect(screen.getByRole('status')).toHaveTextContent('原模型权益已就绪，配置仍待核对');
  expect(screen.queryByRole('button',{name:/升级|继续核对/})).toBeNull();
 });
 it('有效设备冲突有准确说明，不能标就绪',()=>{
  render(<AiCreditCenterCard/>);publish({status:'blocked',reasonCode:'RESTORE_ACTIVE_BINDING_CONFLICT'});
  expect(screen.getByRole('status')).toHaveTextContent('原授权存在有效设备绑定');expect(screen.getByRole('status')).not.toHaveTextContent('已就绪');
 });
 it('同scope的新成功清除已经失效的旧额度错误',async()=>{
  f.open.mockRejectedValueOnce(Error('AI 额度服务暂时不可用，请稍后重试'));render(<AiCreditCenterCard/>);open();
  await screen.findByText('AI 额度服务暂时不可用，请稍后重试');ready();
  expect(screen.queryByText('AI 额度服务暂时不可用，请稍后重试')).toBeNull();expect(f.open).toHaveBeenCalledTimes(1);
 });
 it('已成功之后产生的新额度错误不能被旧revision清掉',async()=>{
  ready();f.open.mockRejectedValueOnce(Error('新的额度中心连接错误'));render(<AiCreditCenterCard/>);open();
  await screen.findByText('新的额度中心连接错误');ready();expect(screen.getByText('新的额度中心连接错误')).toBeInTheDocument();
 });
 it('额度中心在途期间后台成功，后来产生的新错误保持可见',async()=>{
  let reject!:(error:Error)=>void;f.open.mockImplementation(()=>new Promise((_resolve,r)=>{reject=r;}));render(<AiCreditCenterCard/>);open();ready();
  await act(async()=>reject(Error('本次打开额度失败')));expect(screen.getByText('本次打开额度失败')).toBeInTheDocument();
  ready();expect(screen.getByText('本次打开额度失败')).toBeInTheDocument();
 });
 it('另一scope迟到成功不显示、不清当前额度错误',async()=>{
  f.open.mockRejectedValueOnce(Error('当前组额度错误'));render(<AiCreditCenterCard/>);open();await screen.findByText('当前组额度错误');
  publish({scopeKey:'group:group-b',status:'ready',successRevision:10,entitlementReady:true,configurationReady:true});
  expect(screen.getByText('当前组额度错误')).toBeInTheDocument();expect(screen.queryByRole('status')).toBeNull();
 });
 it('切组撤掉旧成功和旧错误，组内平台筛选不丢升级状态',async()=>{
  ready();render(<AiCreditCenterCard/>);act(()=>{f.account='acct-b';window.dispatchEvent(new Event('creatoros:accounts-changed'));});
  expect(screen.getByRole('status')).toHaveTextContent('模型权益已就绪');
  act(()=>{f.group='group-b';window.dispatchEvent(new Event('creatoros:accounts-changed'));});expect(screen.queryByRole('status')).toBeNull();
 });
 it('同组筛选变化保留新额度错误，真实切组才清理',async()=>{
  ready();f.open.mockRejectedValueOnce(Error('当前组新额度错误'));render(<AiCreditCenterCard/>);open();
  await screen.findByText('当前组新额度错误');
  act(()=>{f.account='acct-b';window.dispatchEvent(new Event('creatoros:accounts-changed'));});
  expect(screen.getByText('当前组新额度错误')).toBeInTheDocument();
  act(()=>{f.group='group-b';window.dispatchEvent(new Event('creatoros:accounts-changed'));});
  expect(screen.queryByText('当前组新额度错误')).toBeNull();
 });
 it('同组筛选变化不取消在途额度打开，真实切组才取消',async()=>{
  let resolve!:()=>void;
  f.open.mockImplementation(()=>new Promise<void>(r=>{resolve=r;}));render(<AiCreditCenterCard/>);open();
  const signal=f.open.mock.calls[0][0].signal as AbortSignal;
  act(()=>{f.account='acct-b';window.dispatchEvent(new Event('creatoros:accounts-changed'));});
  expect(signal.aborted).toBe(false);
  act(()=>{f.group='group-b';window.dispatchEvent(new Event('creatoros:accounts-changed'));});
  expect(signal.aborted).toBe(true);await act(async()=>resolve());
 });
 it('只有用户查看额度才打开链接；升级就绪本身不会自动充值',async()=>{
  f.open.mockResolvedValue(undefined);render(<AiCreditCenterCard/>);ready();expect(f.open).not.toHaveBeenCalled();open();
  await waitFor(()=>expect(f.open).toHaveBeenCalledTimes(1));expect(f.fetch).not.toHaveBeenCalled();
 });
});

it('自动启用成功使旧not_configured页面立即可查看额度，无需整页刷新',()=>{
 render(<AiCreditCenterCard accountStatus="not_configured"/>);
 expect(screen.queryByRole('button',{name:'查看 AI 额度与消耗'})).toBeNull();ready();
 expect(screen.getByRole('button',{name:'查看 AI 额度与消耗'})).toBeEnabled();
 expect(f.open).not.toHaveBeenCalled();expect(f.refresh).not.toHaveBeenCalled();
});

import {act,cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react';
import {afterEach,beforeEach,describe,it,expect,vi} from 'vitest';
import '@testing-library/jest-dom/vitest';
const f=vi.hoisted(()=>({fetch:vi.fn(),invoke:vi.fn(),fresh:vi.fn(),refresh:vi.fn(),group:'group-a',account:'acct-a'}));
vi.mock('next/navigation',()=>({useRouter:()=>({refresh:f.refresh})}));
vi.mock('@/lib/http-transport',async original=>({...await original<typeof import('@/lib/http-transport')>(),fetchCreatorApi:f.fetch,readCurrentGroupId:()=>f.group,readCurrentAccountId:()=>f.account}));
vi.mock('@tauri-apps/api/core',()=>({invoke:f.invoke}));
vi.mock('@/features/copilot/assistant-engine',()=>({refreshModelRoutingAfterUpgrade:f.fresh,loadModelRouting:vi.fn()}));
import {AiCreditCenterCard} from './channel-model-configuration';
const syntheticObservation='enc:v1:'+btoa('public-controlled-observation-token-not-a-key');
const reply=(action:string,patch:Record<string,unknown>={})=>Response.json({contractVersion:'creatoros-legacy-model-upgrade-v1',action,phase:action==='probe'?'credentials':action==='fulfill'?'fulfillment':'configuration',outcome:'ready',reasonCode:'UPGRADE_READY',bindingStatus:'verified',entitlementStatus:'ready',configurationStatus:action==='sync'?'ready':'not_started',retryable:false,...patch},{headers:{'x-creatoros-upgrade-observation':syntheticObservation}});
const absent=()=>reply('probe',{outcome:'pending',reasonCode:'UPGRADE_ENTITLEMENT_NOT_READY',entitlementStatus:'unknown',retryable:true});
const unknown=(action='probe')=>reply(action,{outcome:'unknown',reasonCode:'UPGRADE_ENTITLEMENT_UNKNOWN',entitlementStatus:'unknown',retryable:true});
const binding=()=>reply('probe',{phase:'proof',outcome:'restore_required',reasonCode:'UPGRADE_BINDING_RECHECK_REQUIRED',bindingStatus:'unverified',entitlementStatus:'not_started'});
const actions=()=>f.fetch.mock.calls.map(call=>new Headers(call[1]?.headers).get('x-creatoros-upgrade-action'));
const start=()=>fireEvent.click(screen.getByRole('button',{name:'升级原激活码，启用模型权益'}));
beforeEach(()=>{f.fetch.mockReset();f.invoke.mockReset();f.fresh.mockReset().mockResolvedValue(undefined);f.refresh.mockReset();f.group='group-a';f.account='acct-a';});
afterEach(()=>{cleanup();vi.useRealTimers();});
describe('T1402真实设置卡的一键受控旅程（非桌面/生产验收）',()=>{
 it('已有钱包仍有入口，ready只读同步及新store，不重复fulfill',async()=>{
  f.fetch.mockResolvedValueOnce(reply('probe')).mockResolvedValueOnce(reply('sync'));render(<AiCreditCenterCard accountStatus="ready"/>);start();
  await screen.findByText('原激活码已升级，模型权益与配置已核对，个人模型来源保持不变');expect(actions()).toEqual(['probe','sync']);expect(f.invoke).not.toHaveBeenCalled();expect(f.fresh).toHaveBeenCalledTimes(1);
 });
 it('初次明确升级遇404不假定未开户，但沿同权益fulfill后sync',async()=>{
  f.fetch.mockResolvedValueOnce(absent()).mockResolvedValueOnce(reply('fulfill')).mockResolvedValueOnce(reply('sync'));render(<AiCreditCenterCard/>);start();
  await screen.findByText('原激活码已升级，模型权益与配置已核对，个人模型来源保持不变');expect(actions()).toEqual(['probe','fulfill','sync']);expect(f.invoke).not.toHaveBeenCalled();
 });
 it('绑定缺失只提交一次仅opaque参数native，确认后freshprobe与原钱包复用',async()=>{
  f.fetch.mockResolvedValueOnce(binding()).mockResolvedValueOnce(reply('probe')).mockResolvedValueOnce(reply('sync'));
  f.invoke.mockResolvedValue({contractVersion:'creatoros-license-restore-result-v1',status:'ready',reasonCode:'RESTORE_READY',bindingStatus:'verified',persistence:'confirmed',retryable:false});render(<AiCreditCenterCard/>);start();
  await screen.findByText('原激活码已升级，模型权益与配置已核对，个人模型来源保持不变');expect(f.invoke.mock.calls).toEqual([['license_restore_saved',{observationToken:syntheticObservation}]]);expect(actions()).toEqual(['probe','probe','sync']);
 });
 it('nativeunknown仍缺失停止，不盲restore；用户继续才新inspect',async()=>{
  f.fetch.mockImplementation(async()=>binding());f.invoke.mockResolvedValue({contractVersion:'creatoros-license-restore-result-v1',status:'unknown',reasonCode:'RESTORE_CONTINUE_REQUIRED',bindingStatus:'unverified',persistence:'unchanged',retryable:true});render(<AiCreditCenterCard/>);start();
  await screen.findByRole('button',{name:'继续核对'});expect(f.invoke).toHaveBeenCalledTimes(1);expect(actions().every(a=>a==='probe')).toBe(true);
  fireEvent.click(screen.getByRole('button',{name:'继续核对'}));await waitFor(()=>expect(f.invoke).toHaveBeenCalledTimes(2));
 });
 it('恢复续查缺token不会占用尚未发出的native guard，下一次明确观察仍可恢复',async()=>{
  f.fetch.mockResolvedValueOnce(binding()).mockResolvedValueOnce(binding());
  f.invoke.mockResolvedValue({contractVersion:'creatoros-license-restore-result-v1',status:'unknown',reasonCode:'RESTORE_CONTINUE_REQUIRED',bindingStatus:'unverified',persistence:'unchanged',retryable:true});
  render(<AiCreditCenterCard/>);start();await screen.findByRole('button',{name:'继续核对'});
  f.fetch.mockResolvedValueOnce(Response.json({contractVersion:'creatoros-legacy-model-upgrade-v1',action:'probe',phase:'proof',outcome:'unknown',reasonCode:'UPGRADE_SERVICE_UNAVAILABLE',bindingStatus:'unverified',entitlementStatus:'not_started',configurationStatus:'not_started',retryable:true}));
  fireEvent.click(screen.getByRole('button',{name:'继续核对'}));await waitFor(()=>expect(screen.getByRole('status')).toHaveTextContent('升级结果尚未确认'));expect(f.invoke).toHaveBeenCalledTimes(1);
  f.fetch.mockResolvedValueOnce(binding()).mockResolvedValueOnce(binding());fireEvent.click(screen.getByRole('button',{name:'继续核对'}));await waitFor(()=>expect(f.invoke).toHaveBeenCalledTimes(2));
 });
 it('409明确经济unknown先停止；明确继续后404才恢复原预约',async()=>{
  f.fetch.mockResolvedValueOnce(unknown());render(<AiCreditCenterCard/>);start();await screen.findByRole('button',{name:'继续核对'});expect(actions()).toEqual(['probe']);
  f.fetch.mockResolvedValueOnce(absent()).mockResolvedValueOnce(reply('fulfill')).mockResolvedValueOnce(reply('sync'));fireEvent.click(screen.getByRole('button',{name:'继续核对'}));await screen.findByText('原激活码已升级，模型权益与配置已核对，个人模型来源保持不变');expect(actions()).toEqual(['probe','probe','fulfill','sync']);
 });
 it('fulfill丢响应先只读，仍未知停止，不能同观察再发款',async()=>{
  f.fetch.mockResolvedValueOnce(absent()).mockResolvedValueOnce(unknown('fulfill')).mockResolvedValueOnce(absent());render(<AiCreditCenterCard/>);start();await screen.findByRole('button',{name:'继续核对'});
  expect(actions()).toEqual(['probe','fulfill','probe']);expect(f.invoke).not.toHaveBeenCalled();
 });
 it('已知权益ready而sync失败，继续只sync；store失败也不报完整成功',async()=>{
  f.fetch.mockResolvedValueOnce(reply('probe')).mockResolvedValueOnce(reply('sync',{outcome:'pending',reasonCode:'UPGRADE_CONFIGURATION_PENDING',configurationStatus:'pending',retryable:true}));render(<AiCreditCenterCard/>);start();
  await screen.findByText('原模型权益已就绪，配置仍待核对；不会重复领取原权益');f.fetch.mockResolvedValueOnce(reply('sync'));f.fresh.mockRejectedValueOnce(Error('controlled GET failure'));fireEvent.click(screen.getByRole('button',{name:'继续核对'}));await screen.findByText('原模型权益已就绪，界面配置尚未读回，请继续核对');expect(actions()).toEqual(['probe','sync','sync']);expect(f.refresh).not.toHaveBeenCalled();
 });
 it('双击共享本次观察，取消后迟到native不发后续请求或假称撤销',async()=>{
  let finish!:(v:unknown)=>void;f.fetch.mockResolvedValue(binding());f.invoke.mockImplementation(()=>new Promise(r=>{finish=r}));render(<AiCreditCenterCard/>);start();await waitFor(()=>expect(f.invoke).toHaveBeenCalledTimes(1));
  fireEvent.click(screen.getByRole('button',{name:'正在核对原权益…'}));fireEvent.click(screen.getByRole('button',{name:'取消等待'}));await screen.findByRole('button',{name:'继续核对'});
  await act(async()=>finish({contractVersion:'creatoros-license-restore-result-v1',status:'ready',reasonCode:'RESTORE_READY',bindingStatus:'verified',persistence:'confirmed',retryable:false}));expect(f.fetch).toHaveBeenCalledTimes(1);expect(f.invoke).toHaveBeenCalledTimes(1);expect(screen.getByRole('status')).toHaveTextContent('停止等待');
 });
 it('切组后原生迟到结果不污染新scope，也不发新组fulfill',async()=>{
  let finish!:(v:unknown)=>void;f.fetch.mockResolvedValue(binding());f.invoke.mockImplementation(()=>new Promise(r=>{finish=r}));render(<AiCreditCenterCard/>);start();await waitFor(()=>expect(f.invoke).toHaveBeenCalledTimes(1));
  act(()=>{f.group='group-b';window.dispatchEvent(new Event('creatoros:accounts-changed'));});await act(async()=>finish({contractVersion:'creatoros-license-restore-result-v1',status:'ready',reasonCode:'RESTORE_READY',bindingStatus:'verified',persistence:'confirmed',retryable:false}));expect(f.fetch).toHaveBeenCalledTimes(1);expect(screen.queryByRole('status')).toBeNull();
 });
 it('父730000从最初点击起覆盖原生等待，不因进入恢复而续期',async()=>{
  vi.useFakeTimers();let finish!:(v:Response)=>void;f.fetch.mockImplementationOnce(()=>new Promise(r=>{finish=r}));f.invoke.mockImplementation(()=>new Promise(()=>{}));render(<AiCreditCenterCard/>);start();
  await act(async()=>{await vi.advanceTimersByTimeAsync(600000);finish(binding());});await act(async()=>{await vi.advanceTimersByTimeAsync(130000);});
  expect(screen.getByRole('status')).toHaveTextContent('停止等待');expect(f.invoke).toHaveBeenCalledTimes(1);expect(f.fetch).toHaveBeenCalledTimes(1);
 });
 it('config继续保最初父截止，729秒后续读挂起只剩1秒；过期不偷偷新观察',async()=>{
  vi.useFakeTimers();f.fetch.mockResolvedValueOnce(reply('probe')).mockResolvedValueOnce(reply('sync',{outcome:'pending',reasonCode:'UPGRADE_CONFIGURATION_PENDING',configurationStatus:'pending',retryable:true}));render(<AiCreditCenterCard/>);start();
  await act(async()=>{await vi.advanceTimersByTimeAsync(0);});expect(screen.getByRole('button',{name:'继续核对'})).toBeEnabled();
  await act(async()=>{await vi.advanceTimersByTimeAsync(729000);});f.fetch.mockImplementationOnce(()=>new Promise(()=>{}));fireEvent.click(screen.getByRole('button',{name:'继续核对'}));
  await act(async()=>{await vi.advanceTimersByTimeAsync(1000);});expect(screen.getByRole('status')).toHaveTextContent('停止等待');expect(actions()).toEqual(['probe','sync','sync']);
  fireEvent.click(screen.getByRole('button',{name:'继续核对'}));expect(screen.getByRole('status')).toHaveTextContent('重新点击升级入口');expect(actions()).toEqual(['probe','sync','sync']);
 });
 it('矛盾native已存但runtime拒绝不继续经济链',async()=>{
  f.fetch.mockResolvedValue(binding());f.invoke.mockResolvedValue({contractVersion:'creatoros-license-restore-result-v1',status:'blocked',reasonCode:'RESTORE_RESPONSE_UNVERIFIED',bindingStatus:'verified',persistence:'confirmed',retryable:false});render(<AiCreditCenterCard/>);start();
  await screen.findByText('当前授权无法安全核对，原有工作已保留，请稍后再试');expect(actions()).toEqual(['probe']);expect(f.fresh).not.toHaveBeenCalled();
 });
});

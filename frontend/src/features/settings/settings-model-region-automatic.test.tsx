import * as React from 'react';
import {act,cleanup,render,screen} from '@testing-library/react';
import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import type {AutomaticLicenseUpgradeState} from '@/lib/automatic-license-upgrade';
import type {ModelAuthorityState,SettingsViewModel} from './settings-page';

const f=vi.hoisted(()=>({
 scope:{groupId:'group-a',accountId:null as string|null},
 auto:{scopeKey:'group:group-a',status:'ready',phase:'configuration',reasonCode:'UPGRADE_READY',entitlementReady:true,configurationReady:true,successRevision:1} as AutomaticLicenseUpgradeState,
 listeners:new Set<()=>void>(),family:'text' as 'text'|'audio',
 routing:{ready:true,resource:{capabilities:[{capability:'default',mode:'structured',source:'official' as string|null,status:'ready'}]}},
 refresh:vi.fn(),fetch:vi.fn(),
}));
vi.mock('next/navigation',()=>({useRouter:()=>({refresh:f.refresh})}));
vi.mock('@/features/copilot/use-assistant-engine',()=>({useAssistantEngine:()=>({routing:f.routing})}));
vi.mock('@/lib/creation-workspace-scope',async importOriginal=>({...await importOriginal<typeof import('@/lib/creation-workspace-scope')>(),useCreationScope:()=>f.scope}));
vi.mock('@/lib/automatic-license-upgrade',async importOriginal=>({...await importOriginal<typeof import('@/lib/automatic-license-upgrade')>(),readAutomaticLicenseUpgrade:()=>f.auto,subscribeAutomaticLicenseUpgrade:(listener:()=>void)=>{f.listeners.add(listener);return()=>f.listeners.delete(listener)}}));
// 保留真实scope过滤hook、完整官方卡及连接按钮，仅替换本测试无关的大卡。
vi.mock('./channel-model-configuration',async importOriginal=>({...await importOriginal<typeof import('./channel-model-configuration')>(),AiCreditCenterCard:()=>null,ChannelServiceCredentialCard:()=>null}));
vi.mock('./model-capability-source',()=>({ModelCapabilitySource:({renderConfiguration}:{renderConfiguration:(family:'text'|'audio',source:'official')=>React.ReactNode})=><>{renderConfiguration(f.family,'official')}</>}));
vi.mock('./model-config-transfer-card',()=>({ModelConfigTransferCard:()=>null}));
vi.mock('./multimodal-model-configuration',()=>({MultimodalModelCard:()=>null}));
vi.mock('./text-model-configuration',()=>({ModelConfigurationCard:()=>null}));
vi.mock('./redfox-configuration',()=>({RedfoxConfiguration:()=>null}));
vi.mock('./model-configuration-manual',()=>({ModelConfigurationManual:()=>null}));
vi.mock('@/components/shell/channel-config-bootstrap',()=>({ChannelConfigRetryButton:()=>null}));

import {SettingsModelRegion} from './settings-model-region';
const message='官方模型已自动同步，可直接使用，无需填写密钥';
const model:SettingsViewModel['model']={capability:'default',provider:'openai',modelName:'synthetic-self-model',baseUrl:'https://self.invalid',apiFormat:'openai_chat',hasSecret:false,temperature:0.6};
// 其它大卡被隔离替换，真实Region读取的model保持完整类型。
const viewModel={model,multimodalModels:{}} as SettingsViewModel;
function authority(hasSecret=false):ModelAuthorityState{return{authority:'channel',outcome:'configured',action:'fixture',capabilities:{default:{capability:'default',authority:'channel',serviceId:'synthetic-service',serviceName:'synthetic',provider:'openai',modelName:'synthetic-official-model',baseUrl:null,hasSecret,optionId:'a',modelOptions:[{id:'a',name:'原模型A',model:'model-a'},{id:'b',name:'原模型B',model:'model-b'}]}}};}
function mount(modelAuthority:ModelAuthorityState={authority:'local',outcome:'security_error',action:'旧SSR错误'}){return render(<SettingsModelRegion viewModel={viewModel} modelAuthority={modelAuthority} highlight={null}/>);}
beforeEach(()=>{
 f.scope={groupId:'group-a',accountId:null};f.auto={scopeKey:'group:group-a',status:'ready',phase:'configuration',reasonCode:'UPGRADE_READY',entitlementReady:true,configurationReady:true,successRevision:1};
 f.family='text';f.routing={ready:true,resource:{capabilities:[{capability:'default',mode:'structured',source:'official',status:'ready'}]}};f.refresh.mockReset();f.fetch.mockReset();vi.stubGlobal('fetch',f.fetch);
});
afterEach(()=>{cleanup();f.listeners.clear();vi.unstubAllGlobals()});

describe('T1402 Region自动同步局部状态',()=>{
 it('旧SSR local/security_error不覆盖当前官方就绪，恢复真实连接入口且不主动请求',()=>{
  mount();expect(screen.getByText(message)).toBeInTheDocument();expect(screen.queryByText(/当前官方配置尚未取得/)).toBeNull();expect(screen.getByRole('button',{name:'测试连接'})).toBeEnabled();expect(f.fetch).not.toHaveBeenCalled();expect(f.refresh).not.toHaveBeenCalled();
 });
 it('旧SSR channel hasSecretfalse不再把当前已就绪连接入口禁用',()=>{
  mount(authority(false));expect(screen.getByText(message)).toBeInTheDocument();expect(screen.getByRole('button',{name:'测试连接'})).toBeEnabled();expect(screen.queryByText('模型正在准备，请重新同步配置')).toBeNull();expect(screen.queryByRole('combobox')).toBeNull();
 });
 it('真实hook拒绝其它scope的ready，不以未过滤假hook签通过',()=>{
  f.auto={...f.auto,scopeKey:'group:other-group'};mount(authority(false));expect(screen.queryByText(message)).toBeNull();expect(screen.getByRole('button',{name:'测试连接'})).toBeDisabled();
 });
 it.each(['self','codex','local',null])('其它来源%s已就绪也不能冒充official草稿已同步',source=>{
  f.routing.resource.capabilities[0]!.source=source;mount(authority(false));expect(screen.queryByText(message)).toBeNull();expect(screen.getByRole('button',{name:'测试连接'})).toBeDisabled();
 });
 it('另一能力ready不能解锁本default能力',()=>{
  f.routing.resource.capabilities[0]!.capability='image.generate';mount(authority(false));expect(screen.queryByText(message)).toBeNull();expect(screen.getByRole('button',{name:'测试连接'})).toBeDisabled();
 });
 it.each(['idle','checking','pending','blocked'] as const)('自动状态%s尚未ready不能补造能力就绪',status=>{
  f.auto={...f.auto,status};mount(authority(false));expect(screen.queryByText(message)).toBeNull();expect(screen.getByRole('button',{name:'测试连接'})).toBeDisabled();
 });
 it.each(['not_configured','unverified','unavailable'])('对应能力%s不能用auto总体ready解锁',status=>{
  f.routing.resource.capabilities[0]!.status=status;mount(authority(false));expect(screen.queryByText(message)).toBeNull();expect(screen.getByRole('button',{name:'测试连接'})).toBeDisabled();
 });
 it('routing未ready时即使保有旧resource也不能显示已同步',()=>{
  f.routing.ready=false;mount(authority(false));expect(screen.queryByText(message)).toBeNull();expect(screen.getByRole('button',{name:'测试连接'})).toBeDisabled();
 });
 it('原SSR完整channel且hasSecrettrue保原卡及多模型选择，不降级成摘要',()=>{
  mount(authority(true));expect(screen.queryByText(message)).toBeNull();expect(screen.getByText('synthetic-official-model')).toBeInTheDocument();expect(screen.getByRole('combobox')).toHaveValue('a');expect(screen.getByRole('option',{name:'原模型B'})).toBeInTheDocument();expect(screen.getByRole('button',{name:'测试连接'})).toBeEnabled();
 });
 it('transcribe沿原规则不新增连接按钮或自动模型调用',()=>{
  f.family='audio';f.routing.resource.capabilities[0]!.capability='transcribe.audio';f.routing.resource.capabilities[0]!.mode='asr';mount();expect(screen.getByText(message)).toBeInTheDocument();expect(screen.queryByRole('button',{name:'测试连接'})).toBeNull();expect(f.fetch).not.toHaveBeenCalled();
 });
 it('同scope成功store通知局部更新，切scope后旧成功不会继续显示',async()=>{
  f.auto={...f.auto,status:'checking'};const view=mount(authority(false));expect(screen.queryByText(message)).toBeNull();
  await act(async()=>{f.auto={...f.auto,status:'ready'};for(const notify of f.listeners)notify()});expect(screen.getByText(message)).toBeInTheDocument();
  f.scope={groupId:'group-b',accountId:null};view.rerender(<SettingsModelRegion viewModel={viewModel} modelAuthority={authority(false)} highlight={null}/>);expect(screen.queryByText(message)).toBeNull();expect(f.refresh).not.toHaveBeenCalled();expect(f.fetch).not.toHaveBeenCalled();
 });
});

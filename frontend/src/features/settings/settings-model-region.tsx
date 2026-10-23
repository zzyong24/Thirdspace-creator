"use client";
import * as React from 'react';
import {SectionCard} from '@/components/project/section-card';
import {ChannelConfigRetryButton} from '@/components/shell/channel-config-bootstrap';
import type {ModelAuthorityState,SettingsViewModel,ModelAuthorityCapability} from './settings-page';
import {AiCreditCenterCard,ChannelManagedModelCard,ChannelServiceCredentialCard,useAutomaticUpgradeState} from './channel-model-configuration';
import {ModelCapabilitySource} from './model-capability-source';
import {ModelConfigTransferCard} from './model-config-transfer-card';
import {MultimodalModelCard} from './multimodal-model-configuration';
import {ModelConfigurationCard} from './text-model-configuration';
import {RedfoxConfiguration} from './redfox-configuration';
import {ModelConfigurationManual} from './model-configuration-manual';
import {modelConfigurationIdentity,useModelConnectionTest,TestConnectionButton} from './model-connection-test';
import {useAssistantEngine} from '@/features/copilot/use-assistant-engine';
import type {ModelRoutingChoices} from '@creatoros/contract';
export function SettingsModelRegion({viewModel,modelAuthority,highlight}:{viewModel:SettingsViewModel;modelAuthority?:ModelAuthorityState;highlight:string|null}){
 const {routing}=useAssistantEngine();
 const automatic=useAutomaticUpgradeState();
 const probe=useModelConnectionTest('default',modelConfigurationIdentity(viewModel.model),routing.ready);
 const labels={text:'文本创作与结构化',vision:'图片理解',image:'图片生成与编辑',video:'视频生成',audio:'语音转文字',embed:'检索向量'};
 const capabilities:Record<keyof ModelRoutingChoices,ModelAuthorityCapability[]>={text:['default'],vision:['asset.classify'],image:['image.generate','image.edit'],video:['video.generate'],audio:['transcribe.audio'],embed:['knowledge.search.embed']};
 const missing={capability:'image.edit' as const,provider:'',modelName:'',baseUrl:'',hasSecret:false};
 const singleConfiguration=(family:keyof ModelRoutingChoices,source:ModelRoutingChoices[keyof ModelRoutingChoices]):React.ReactNode=>{
  if(source==='self'){
   if(family==='text')return <div className="flex flex-col gap-card-gap"><ModelConfigurationManual/><ModelConfigurationCard key={[viewModel.model.provider,viewModel.model.modelName,viewModel.model.baseUrl,viewModel.model.apiFormat,viewModel.model.hasSecret,viewModel.model.temperature].join(':')} model={viewModel.model} testSession={probe}/></div>;
   if(family==='image')return <div className="flex flex-col gap-card-gap"><MultimodalModelCard key={`image:${JSON.stringify(viewModel.multimodalModels.image)}`} kind="image" state={viewModel.multimodalModels.image}/><p className="text-sm text-muted-foreground">图片编辑沿用图片生成配置，实际支持情况以本用途状态为准。</p><IndependentImageEdit key={`imageEdit:${JSON.stringify(viewModel.multimodalModels.imageEdit??missing)}`} state={viewModel.multimodalModels.imageEdit??missing}/></div>;
   return <MultimodalModelCard key={`${family}:${JSON.stringify(viewModel.multimodalModels[family])}`} kind={family} state={viewModel.multimodalModels[family]}/>;
  }
  if(source==='official')return <div className="flex flex-col gap-card-gap">{capabilities[family].map(capability=>{
   const state=modelAuthority?.capabilities?.[capability];
   if(!(state?.authority==='channel'&&state.hasSecret)&&automatic.status==='ready'&&routing.ready&&routing.resource?.capabilities.some(row=>row.capability===capability&&row.source==='official'&&row.status==='ready'))
    return <SectionCard key={capability} title={capability==='image.edit'?'参考图编辑':labels[family]}><div data-slot="channel-model-automatic-ready" data-capability={capability} className="flex flex-col gap-3"><p className="text-sm text-muted-foreground">官方模型已自动同步，可直接使用，无需填写密钥</p>{capability==='transcribe.audio'?null:<TestConnectionButton capability={capability} slotPrefix={`channel-${capability.replaceAll('.','-')}`}/>}</div></SectionCard>;
   return state?.authority==='channel'?<ChannelManagedModelCard key={capability} state={state} title={capability==='image.edit'?'参考图编辑':labels[family]} highlight={capability}/>:<SectionCard key={capability} title={capability==='image.edit'?'参考图编辑':labels[family]}><p className="text-sm text-muted-foreground">当前官方配置尚未取得，请重新同步后核对本项状态。其它用途与原配置继续保留。</p><ChannelConfigRetryButton/></SectionCard>;
  })}</div>;
  if(source==='local')return <SectionCard title="本地转录"><p className="text-sm text-muted-foreground">使用本地 Whisper 转录。实际档位与可用性由任务准备时核验。</p></SectionCard>;
  const rows=routing.resource?.capabilities.filter(row=>row.source==='codex'&&capabilities[family].includes(row.capability as ModelAuthorityCapability))??[];
  return <SectionCard title="本地 Codex"><div className="flex flex-col gap-3"><p className="text-sm text-muted-foreground">使用本地 Codex 登录，无需填写本用途的 API 密钥。各项能力分别核实。</p>{rows.length===0&&<p className="text-sm text-muted-foreground">本来源状态尚未取得，保存选择后重新核对。</p>}{rows.map(row=><p key={`${row.mode}:${row.capability}`} className="text-sm text-muted-foreground">{row.capability==='image.edit'?'编辑':row.capability==='image.generate'?'生成':labels[family]}：{({ready:'可用',not_configured:'未配置',unverified:'未核实',unavailable:'不可用'} as const)[row.status]}</p>)}</div></SectionCard>;
 };
 const configuration=(family:keyof ModelRoutingChoices,source:ModelRoutingChoices[keyof ModelRoutingChoices],imageSources?:Partial<Pick<ModelRoutingChoices,'vision'|'image'>>):React.ReactNode=>{
  if(family!=='image')return singleConfiguration(family,source);
  const selectedVision=imageSources?.vision??(source==='official'||source==='self'||source==='codex'?source:undefined);
  return <div className="flex flex-col gap-card-gap" data-slot="unified-image-configuration">
   <div className="flex flex-col gap-2"><p className="text-sm font-medium">图片理解</p>{selectedVision?<PreservedSourceConfiguration source={selectedVision} render={value=>singleConfiguration('vision',value)}/>:<p className="text-sm text-muted-foreground">理解来源尚未取得，原配置保持。</p>}</div>
   <div className="flex flex-col gap-2"><p className="text-sm font-medium">图片生成与编辑</p>{singleConfiguration('image',source)}</div>
  </div>;
 };
 return <div data-slot="settings-rail" className="flex flex-col gap-card-gap" data-model-highlight={highlight??undefined}>
  <ModelCapabilitySource renderConfiguration={configuration} highlight={highlight}/>
  <div data-highlight="ai-credits"><AiCreditCenterCard accountStatus={modelAuthority?.managedAccountStatus}/></div>
  <div data-highlight="redfox"><RedfoxConfiguration/></div>
  {modelAuthority?.services?.filter(service=>service.credentialSource!=='activation_managed').map(service=><ChannelServiceCredentialCard key={service.serviceId} service={service}/>)}
  <ModelConfigTransferCard/>
 </div>;
}

/** 已展开的不同来源保mounted，切来源不丢自配草稿。 */
function PreservedSourceConfiguration({source,render}:{source:ModelRoutingChoices['vision'];render:(source:ModelRoutingChoices['vision'])=>React.ReactNode}){
 const [mounted,setMounted]=React.useState<ModelRoutingChoices['vision'][]>([source]);
 React.useEffect(()=>{setMounted(current=>current.includes(source)?current:[...current,source]);},[source]);
 return <>{mounted.map(value=><div key={value} hidden={value!==source}>{render(value)}</div>)}</>;
}
function IndependentImageEdit({state}:{state:React.ComponentProps<typeof MultimodalModelCard>['state']}){
 const [mounted,setMounted]=React.useState(false);
 return <details onToggle={event=>{if(event.currentTarget.open)setMounted(true);}} className="rounded-card border border-border px-4 py-3"><summary className="cursor-pointer text-sm font-medium">高级：独立编辑配置（可选）</summary>{mounted&&<div className="mt-3"><MultimodalModelCard kind="imageEdit" state={state}/></div>}</details>;
}

"use client";
import * as React from 'react';
import {SectionCard} from '@/components/project/section-card';
import {ChannelConfigRetryButton} from '@/components/shell/channel-config-bootstrap';
import type {ModelAuthorityState,SettingsViewModel,ModelAuthorityCapability} from './settings-page';
import {AiCreditCenterCard,ChannelManagedModelCard,ChannelServiceCredentialCard} from './channel-model-configuration';
import {ModelCapabilitySource} from './model-capability-source';
import {ModelConfigTransferCard} from './model-config-transfer-card';
import {MultimodalModelCard} from './multimodal-model-configuration';
import {ModelConfigurationCard} from './text-model-configuration';
import {ModelConfigurationManual} from './model-configuration-manual';
import {modelConfigurationIdentity,useModelConnectionTest} from './model-connection-test';
import {useAssistantEngine} from '@/features/copilot/use-assistant-engine';
import type {ModelRoutingChoices} from '@creatoros/contract';
export function SettingsModelRegion({viewModel,modelAuthority,highlight}:{viewModel:SettingsViewModel;modelAuthority?:ModelAuthorityState;highlight:string|null}){
 const {routing,recheck}=useAssistantEngine();
 const probe=useModelConnectionTest('default',modelConfigurationIdentity(viewModel.model),routing.ready);
 const labels={text:'文本创作与结构化',vision:'图片理解',image:'图片生成与编辑',video:'视频生成',audio:'语音转文字',embed:'检索向量'};
 const capabilities:Record<keyof ModelRoutingChoices,ModelAuthorityCapability[]>={text:['default'],vision:['asset.classify'],image:['image.generate','image.edit'],video:['video.generate'],audio:['transcribe.audio'],embed:['knowledge.search.embed']};
 const missing={capability:'image.edit' as const,provider:'',modelName:'',baseUrl:'',hasSecret:false};
 const configuration=(family:keyof ModelRoutingChoices,source:ModelRoutingChoices[keyof ModelRoutingChoices]):React.ReactNode=>{
  if(source==='self'){
   if(family==='text')return <div className="flex flex-col gap-card-gap"><ModelConfigurationManual/><ModelConfigurationCard key={[viewModel.model.provider,viewModel.model.modelName,viewModel.model.baseUrl,viewModel.model.apiFormat,viewModel.model.hasSecret,viewModel.model.temperature].join(':')} model={viewModel.model} testSession={probe}/></div>;
   if(family==='image')return <div className="flex flex-col gap-card-gap"><MultimodalModelCard key={`image:${JSON.stringify(viewModel.multimodalModels.image)}`} kind="image" state={viewModel.multimodalModels.image}/><MultimodalModelCard key={`imageEdit:${JSON.stringify(viewModel.multimodalModels.imageEdit??missing)}`} kind="imageEdit" state={viewModel.multimodalModels.imageEdit??missing}/></div>;
   return <MultimodalModelCard key={`${family}:${JSON.stringify(viewModel.multimodalModels[family])}`} kind={family} state={viewModel.multimodalModels[family]}/>;
  }
  if(source==='official')return <div className="flex flex-col gap-card-gap">{capabilities[family].map(capability=>{
   const state=modelAuthority?.capabilities?.[capability];
   return state?.authority==='channel'?<ChannelManagedModelCard key={capability} state={state} title={capability==='image.edit'?'参考图编辑':labels[family]} highlight={capability}/>:<SectionCard key={capability} title={capability==='image.edit'?'参考图编辑':labels[family]}><p className="text-sm text-muted-foreground">当前官方配置尚未取得，请重新同步后核对本项状态。其它用途与原配置继续保留。</p><ChannelConfigRetryButton/></SectionCard>;
  })}</div>;
  if(source==='local')return <SectionCard title="本地转录"><p className="text-sm text-muted-foreground">使用本地 Whisper 转录。实际档位与可用性由任务准备时核验。</p></SectionCard>;
  const rows=routing.resource?.capabilities.filter(row=>row.source==='codex'&&capabilities[family].includes(row.capability as ModelAuthorityCapability))??[];
  return <SectionCard title="本地 Codex"><div className="flex flex-col gap-3"><p className="text-sm text-muted-foreground">使用本地 Codex 登录，无需填写本用途的 API 密钥。各项能力分别核实。</p>{rows.length===0&&<p className="text-sm text-muted-foreground">本来源状态尚未取得，保存选择后重新核对。</p>}{rows.map(row=><p key={`${row.mode}:${row.capability}`} className="text-sm text-muted-foreground">{row.capability==='image.edit'?'编辑':row.capability==='image.generate'?'生成':labels[family]}：{({ready:'可用',not_configured:'未配置',unverified:'未核实',unavailable:'不可用'} as const)[row.status]}</p>)}<button type="button" onClick={recheck} disabled={routing.reading} className="inline-flex min-h-10 items-center self-start rounded-control border border-border bg-surface px-4 text-sm font-medium text-foreground disabled:opacity-50">重新检查本地状态</button></div></SectionCard>;
 };
 return <div data-slot="settings-rail" className="flex flex-col gap-card-gap" data-model-highlight={highlight??undefined}>
  <ModelCapabilitySource renderConfiguration={configuration} highlight={highlight}/>
  {modelAuthority?.services?.some(service=>service.credentialSource==='activation_managed')?<AiCreditCenterCard accountStatus={modelAuthority.managedAccountStatus}/>:null}
  {modelAuthority?.services?.filter(service=>service.credentialSource!=='activation_managed').map(service=><ChannelServiceCredentialCard key={service.serviceId} service={service}/>)}
  <ModelConfigTransferCard/>
 </div>;
}

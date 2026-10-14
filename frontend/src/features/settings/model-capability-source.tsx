"use client";
import * as React from 'react';
import {modelRoutingChoicesSchema,type ModelRoutingChoices,type ModelRoutingResource} from '@creatoros/contract';
import {SectionCard} from '@/components/project/section-card';
import {Button} from '@/components/ui/button';
import {SettingsFormRow} from './settings-form-row';
import {useAssistantEngine} from '@/features/copilot/use-assistant-engine';
import {loadModelRouting,writeModelRouting} from '@/features/copilot/assistant-engine';
type Family=keyof ModelRoutingChoices;
const families:Family[]=['text','vision','image','video','audio','embed'];
const labels:Record<Family,string>={text:'文本创作与结构化',vision:'图片理解',image:'图片生成与编辑',video:'视频生成',audio:'语音转文字',embed:'检索向量'};
const sourceLabels={official:'官方模型',self:'自配模型',codex:'本地 Codex',local:'本地转录（Whisper）'};
const modes:Record<Family,string[]>={text:['text','structured'],vision:['vision'],image:['image'],video:['video'],audio:['asr'],embed:['embedding']};
const statusLabels={ready:'可用',not_configured:'未配置',unverified:'未核实',unavailable:'不可用'};
const reasonLabels:Record<string,string>={CODEX_LOGIN_REQUIRED:'Codex 尚未登录',CODEX_STATUS_UNAVAILABLE:'Codex 状态尚未取得',CODEX_VERSION_UNSUPPORTED:'Codex 版本暂不支持',CODEX_CAPABILITY_UNAVAILABLE:'Codex 不支持此用途',CODEX_IMAGE_CAPABILITY_UNAVAILABLE:'Codex 图片能力不可用',MODEL_NOT_CONFIGURED:'用途尚未配置',MODEL_CREDENTIAL_UNAVAILABLE:'本用途凭据未取得',MODEL_CONFIGURATION_UNAVAILABLE:'本用途配置暂不可用',MODEL_CAPABILITY_UNVERIFIED:'用途支持尚未核实'};
function statusText(resource:ModelRoutingResource|null,family:Family){
 const rows=resource?.capabilities.filter(row=>modes[family].includes(row.mode))??[];
 if(family==='image')return ['image.generate','image.edit'].map((capability,index)=>{const row=rows.find(row=>row.capability===capability),reason=row?.status==='unavailable'&&row.reasonCode?reasonLabels[row.reasonCode]:null;return `${index===0?'生成':'编辑'}：${statusLabels[row?.status??'unverified']}${reason?`（${reason}）`:''}`;}).join('；');
 if(!rows.length)return '状态未核实';
 const ready=rows.filter(row=>row.status==='ready').length;
 const reasons=[...new Set(rows.map(row=>row.reasonCode?reasonLabels[row.reasonCode]:null).filter(Boolean))];
 return `${ready}/${rows.length} 项已返回用途可用${reasons.length?`；${reasons.join('；')}`:''}`;
}
export function ModelCapabilitySource({renderConfiguration,highlight}:{renderConfiguration?:(family:Family,source:ModelRoutingChoices[Family])=>React.ReactNode;highlight?:string|null}){
 const {routing}=useAssistantEngine();
 const [draft,setDraft]=React.useState<Partial<ModelRoutingChoices>>({}),[baseline,setBaseline]=React.useState<{revision:number;choices:string}|null>(null),[dirty,setDirty]=React.useState(false),[saved,setSaved]=React.useState(false);
 const [open,setOpen]=React.useState<string|null>(null),[mounted,setMounted]=React.useState<string[]>([]);
 const scope=React.useRef(routing.scope);
 const highlightApplied=React.useRef('');
 React.useEffect(()=>{
  const key=JSON.stringify([routing.scope,highlight]);
  if(!renderConfiguration||!routing.resource||highlightApplied.current===key)return;
  const family=({'text-model':'text','image-model':'image','image-edit-model':'image','asr-model':'audio','video-model':'video','vision-model':'vision','embed-model':'embed'} as Record<string,Family>)[highlight??''];
  const source=family?(routing.resource.choices?.[family]??routing.resource.effectiveChoices[family]):null;
  if(family&&source){const config=`${family}:${source}`;setMounted(current=>current.includes(config)?current:[...current,config]);setOpen(config);}
  highlightApplied.current=key;
 },[highlight,routing.scope,routing.resource,renderConfiguration]);
 React.useEffect(()=>{
  if(scope.current!==routing.scope){scope.current=routing.scope;setDirty(false);setDraft({});setBaseline(null);setOpen(null);setMounted([]);setSaved(false);}
  if(routing.resource&&!dirty){setDraft({...routing.resource.choices??routing.resource.effectiveChoices});setBaseline({revision:routing.resource.revision,choices:JSON.stringify(routing.resource.choices)});}
 },[routing.scope,routing.resource,dirty]);
 const parsed=modelRoutingChoicesSchema.safeParse(draft);
 const changed=Boolean(parsed.success&&(routing.resource?.choices===null||JSON.stringify(parsed.data)!==JSON.stringify(routing.resource?.choices)));
 const stale=Boolean(dirty&&baseline&&routing.resource&&baseline.revision!==routing.resource.revision);
 const save=async()=>{if(!parsed.success||!baseline||routing.saving)return;setSaved(false);try{const resource=await writeModelRouting(parsed.data,baseline.revision);setDraft({...resource.choices!});setDirty(false);setBaseline({revision:resource.revision,choices:JSON.stringify(resource.choices)});setSaved(true);}catch{/* 保存状态与原草稿由同一真值保留。 */}};
 return <div data-slot="model-capability-source" data-highlight="assistant-engine">
  <SectionCard title="按用途选择模型" description="保存后对新任务生效，在途任务沿用原选择。">
   <div className="flex flex-col gap-4">
    {families.map(family=>{
     const source=draft[family],id=`model-source-${family}`,configKey=source?`${family}:${source}`:null;
     return <div key={family} data-model-family={family} className="flex min-w-0 flex-col gap-2">
      <SettingsFormRow label={labels[family]} controlId={id}>
       <div className="flex min-w-0 w-full flex-col gap-2">
        <div className="flex flex-wrap items-center gap-3">
         <select id={id} aria-label={`${labels[family]}模型来源`} value={source??''} disabled={!routing.ready||routing.saving} onChange={event=>{setDraft(current=>({...current,[family]:event.target.value}));setOpen(current=>current?.startsWith(`${family}:`)?null:current);setDirty(true);setSaved(false);}}
          className="h-10 w-full max-w-xs rounded-control border border-border bg-surface px-3 text-sm text-foreground">
          <option value="" disabled>请选择来源</option>{modelRoutingChoicesSchema.shape[family].options.map(option=><option key={option} value={option}>{sourceLabels[option]}</option>)}
         </select>
         {renderConfiguration&&configKey&&<Button type="button" variant="outline" aria-label={`配置${labels[family]}`} aria-expanded={open===configKey} onClick={()=>{setMounted(current=>current.includes(configKey)?current:[...current,configKey]);setOpen(current=>current===configKey?null:configKey);}}>配置</Button>}
        </div>
        <p className="text-sm text-muted-foreground" data-slot={`model-source-current-${family}`}>当前使用：{routing.resource?(routing.resource.choices?.[family]??routing.resource.effectiveChoices[family])?sourceLabels[(routing.resource.choices?.[family]??routing.resource.effectiveChoices[family])!]: '尚未取得':'尚未取得'}{routing.resource?.choices===null?' · 沿用原设置':''}</p>
        <p className="text-sm text-muted-foreground" data-slot={`model-source-status-${family}`}>{statusText(routing.resource,family)}</p>
        {source&&(routing.resource?.choices?.[family]??routing.resource?.effectiveChoices[family])!==source&&<p className="text-sm text-muted-foreground">草稿：{sourceLabels[source]}，保存后生效。</p>}
       </div>
      </SettingsFormRow>
      {mounted.filter(key=>key.startsWith(`${family}:`)).map(key=><div key={key} hidden={open!==key} data-slot="model-source-configuration">{renderConfiguration?.(family,key.split(':')[1] as ModelRoutingChoices[Family])}</div>)}
     </div>;
    })}
    {routing.error&&<p role="alert" className="text-sm text-destructive">{routing.error}</p>}
    {stale&&<p role="status" className="text-sm text-warning">其它窗口已更新，请重新读取并核对当前值。再次保存仍先校验原版本。</p>}
    <div className="flex flex-wrap items-center gap-3">
     <Button type="button" disabled={!routing.ready||!parsed.success||!changed||routing.saving||stale} onClick={()=>void save()}>{routing.saving?'正在保存…':'保存模型来源'}</Button>
     <Button type="button" variant="outline" disabled={routing.reading||routing.saving} onClick={()=>void loadModelRouting(true)}>{routing.reading?'正在读取…':'重新读取当前设置'}</Button>
     {stale&&<Button type="button" variant="outline" onClick={()=>{if(routing.resource)setBaseline({revision:routing.resource.revision,choices:JSON.stringify(routing.resource.choices)});}}>已核对，保留草稿继续编辑</Button>}
    </div>
    <p role="status" className="text-sm text-muted-foreground">{saved?'已保存并读回当前设置':!routing.ready?(routing.reading?'正在读取模型来源…':'模型来源尚未取得'):!parsed.success?'请为六种用途选择合法来源':changed?'来源草稿尚未保存':'未修改'}</p>
   </div>
  </SectionCard>
 </div>;
}

"use client";
import * as React from 'react';
import {modelRoutingChoicesSchema,type ModelRoutingChoices,type ModelRoutingResource} from '@creatoros/contract';
import {SectionCard} from '@/components/project/section-card';
import {Button} from '@/components/ui/button';
import {SettingsFormRow} from './settings-form-row';
import {useAssistantEngine} from '@/features/copilot/use-assistant-engine';
import {loadModelRouting,writeModelRouting} from '@/features/copilot/assistant-engine';
type Family=keyof ModelRoutingChoices;
const families:Family[]=['text','image','video','audio'];
const labels:Record<Family,string>={text:'文本创作与结构化',vision:'图片理解',image:'图片',video:'视频生成',audio:'语音转文字',embed:'检索向量'};
const sourceLabels={official:'官方模型',self:'自配模型',codex:'本地 Codex',local:'本地转录（Whisper）'};
const modes:Record<Family,string[]>={text:['text','structured'],vision:['vision'],image:['image'],video:['video'],audio:['asr'],embed:['embedding']};
// 给创作者看的状态说明：只说「能不能用、差什么、去哪补」，不透出「x/y 项」「用途」等内部口径。
const notReadyLabels={not_configured:'还没设置模型',unverified:'还没检测是否可用',unavailable:'暂不可用'};
const reasonLabels:Record<string,string>={CODEX_LOGIN_REQUIRED:'需要先登录 Codex',CODEX_STATUS_UNAVAILABLE:'暂时读不到 Codex 状态',CODEX_VERSION_UNSUPPORTED:'Codex 版本太旧，请先升级',CODEX_CAPABILITY_UNAVAILABLE:'Codex 不支持这项功能',CODEX_IMAGE_CAPABILITY_UNAVAILABLE:'Codex 不支持图片功能',MODEL_NOT_CONFIGURED:'还没设置模型',MODEL_CREDENTIAL_UNAVAILABLE:'缺少可用的 API Key',MODEL_CONFIGURATION_UNAVAILABLE:'模型设置暂时读不到',MODEL_CAPABILITY_UNVERIFIED:'还没检测是否可用'};
type CapabilityRow=ModelRoutingResource['capabilities'][number];
const problem=(row:CapabilityRow|undefined)=>!row?'还没检测是否可用':(row.reasonCode&&reasonLabels[row.reasonCode])||notReadyLabels[row.status as keyof typeof notReadyLabels]||'暂不可用';
const fixHint=(problems:string[])=>problems.some(p=>p.includes('设置模型')||p.includes('API Key'))?'，可点「配置」补上':'';
function statusText(resource:ModelRoutingResource|null,family:Family){
 if(!resource)return '还没检测是否可用';
 if(family==='image'){
  const parts=([['识别图片','vision','asset.classify'],['生成图片','image','image.generate'],['修改图片','image','image.edit']] as const).map(([label,mode,capability])=>({label,row:resource.capabilities.find(row=>row.mode===mode&&row.capability===capability)}));
  const ready=parts.filter(p=>p.row?.status==='ready').map(p=>p.label);
  const missing=parts.filter(p=>p.row?.status!=='ready').map(p=>({label:p.label,why:problem(p.row)}));
  if(!missing.length)return '识别、生成、修改图片都可以正常使用';
  const grouped=[...new Set(missing.map(m=>m.why))].map(why=>`${missing.filter(m=>m.why===why).map(m=>m.label).join('、')}${why}`);
  return `${ready.length?`可以${ready.join('、')}；`:''}${grouped.join('；')}${fixHint(missing.map(m=>m.why))}`;
 }
 const rows=resource.capabilities.filter(row=>modes[family].includes(row.mode));
 if(!rows.length)return '还没检测是否可用';
 const notReady=rows.filter(row=>row.status!=='ready');
 if(!notReady.length)return '可以正常使用';
 const reasons=[...new Set(notReady.map(row=>problem(row)))];
 if(notReady.length===rows.length)return `暂不能使用：${reasons.join('；')}${fixHint(reasons)}`;
 return `大部分功能可以使用；有 ${notReady.length} 项功能${reasons.join('；')}${fixHint(reasons)}`;
}
export function ModelCapabilitySource({renderConfiguration,highlight}:{renderConfiguration?:(family:Family,source:ModelRoutingChoices[Family],imageSources?:Partial<Pick<ModelRoutingChoices,'vision'|'image'>>)=>React.ReactNode;highlight?:string|null}){
 const {routing}=useAssistantEngine();
 const [draft,setDraft]=React.useState<Partial<ModelRoutingChoices>>({}),[baseline,setBaseline]=React.useState<{revision:number;choices:string}|null>(null),[dirty,setDirty]=React.useState(false),[saved,setSaved]=React.useState(false);
 const [open,setOpen]=React.useState<string|null>(null),[mounted,setMounted]=React.useState<string[]>([]);
 const scope=React.useRef(routing.scope);
 const highlightApplied=React.useRef('');
 React.useEffect(()=>{
  const key=JSON.stringify([routing.scope,highlight]);
  if(!renderConfiguration||!routing.resource||highlightApplied.current===key)return;
  const family=({'text-model':'text','image-model':'image','image-edit-model':'image','asr-model':'audio','video-model':'video','vision-model':'image'} as Record<string,Family>)[highlight??''];
  const source=family?(routing.resource.choices?.[family]??routing.resource.effectiveChoices[family]):null;
  if(family&&source){const config=`${family}:${source}`;setMounted(current=>current.includes(config)?current:[...current,config]);setOpen(config);}
  highlightApplied.current=key;
 },[highlight,routing.scope,routing.resource,renderConfiguration]);
 React.useEffect(()=>{
  if(scope.current!==routing.scope){scope.current=routing.scope;setDirty(false);setDraft({});setBaseline(null);setOpen(null);setMounted([]);setSaved(false);}
  if(routing.resource&&!dirty){setDraft({...routing.resource.choices??routing.resource.effectiveChoices});setBaseline({revision:routing.resource.revision,choices:JSON.stringify(routing.resource.choices)});}
 },[routing.scope,routing.resource,dirty]);
 const parsed=modelRoutingChoicesSchema.safeParse(draft);
 const currentChoices=modelRoutingChoicesSchema.safeParse(routing.resource?.choices??routing.resource?.effectiveChoices);
 const changed=Boolean(parsed.success&&currentChoices.success&&JSON.stringify(parsed.data)!==JSON.stringify(currentChoices.data));
 const stale=Boolean(dirty&&baseline&&routing.resource&&baseline.revision!==routing.resource.revision);
 const save=async()=>{if(!parsed.success||!baseline||routing.saving)return;setSaved(false);try{const resource=await writeModelRouting(parsed.data,baseline.revision);setDraft({...resource.choices!});setDirty(false);setBaseline({revision:resource.revision,choices:JSON.stringify(resource.choices)});setSaved(true);}catch{/* 保存状态与原草稿由同一真值保留。 */}};
 return <div data-slot="model-capability-source" data-highlight="assistant-engine">
  <SectionCard title="按用途选择模型" description="保存后，新开始的任务会用新的模型；正在进行的任务不受影响。">
   <div className="flex flex-col gap-4">
    {families.map(family=>{
     const source=draft[family],mixed=family==='image'&&Boolean(draft.vision&&source&&draft.vision!==source),id=`model-source-${family}`,configKey=source?`${family}:${source}`:null;
     return <div key={family} data-model-family={family} className="flex min-w-0 flex-col gap-2">
      <SettingsFormRow label={labels[family]} controlId={id}>
       <div className="flex min-w-0 w-full flex-col gap-2">
        <div className="flex flex-wrap items-center gap-3">
         <select id={id} aria-label={`${labels[family]}模型来源`} value={mixed?'mixed':source??''} disabled={!routing.ready||routing.saving} onChange={event=>{const value=event.target.value;setDraft(current=>family==='image'?{...current,vision:value as ModelRoutingChoices['vision'],image:value as ModelRoutingChoices['image']}:{...current,[family]:value});setOpen(current=>current?.startsWith(`${family}:`)?null:current);setDirty(true);setSaved(false);}}
          className="h-10 w-full max-w-xs rounded-control border border-border bg-surface px-3 text-sm text-foreground">
          <option value="" disabled>请选择来源</option>{mixed&&<option value="mixed" disabled>目前分开设置（保持不变）</option>}{modelRoutingChoicesSchema.shape[family].options.map(option=><option key={option} value={option}>{sourceLabels[option]}</option>)}
         </select>
         {renderConfiguration&&configKey&&<Button type="button" variant="outline" aria-label={`配置${labels[family]}`} aria-expanded={open===configKey} onClick={()=>{setMounted(current=>current.includes(configKey)?current:[...current,configKey]);setOpen(current=>current===configKey?null:configKey);}}>配置</Button>}
        </div>
        <p className="text-sm text-muted-foreground" data-slot={`model-source-current-${family}`}>当前使用：{routing.resource?(routing.resource.choices?.[family]??routing.resource.effectiveChoices[family])?sourceLabels[(routing.resource.choices?.[family]??routing.resource.effectiveChoices[family])!]: '读取中':'读取中'}</p>
        <p className="text-sm text-muted-foreground" data-slot={`model-source-status-${family}`}>{statusText(routing.resource,family)}</p>
        {family==='image'&&routing.resource&&(routing.resource.choices?.vision??routing.resource.effectiveChoices.vision)!==(routing.resource.choices?.image??routing.resource.effectiveChoices.image)&&<p className="text-sm text-muted-foreground">目前识别图片用{sourceLabels[(routing.resource.choices?.vision??routing.resource.effectiveChoices.vision)??'official']}，生成和修改图片用{sourceLabels[(routing.resource.choices?.image??routing.resource.effectiveChoices.image)??'official']}；在上面重新选择后会统一成一个。</p>}{source&&((routing.resource?.choices?.[family]??routing.resource?.effectiveChoices[family])!==source||(family==='image'&&draft.vision!==(routing.resource?.choices?.vision??routing.resource?.effectiveChoices.vision)))&&<p className="text-sm text-muted-foreground">已选择{sourceLabels[source]}，点「保存模型来源」后生效。</p>}
       </div>
      </SettingsFormRow>
      {mounted.filter(key=>key.startsWith(`${family}:`)).map(key=><div key={key} hidden={open!==key} data-slot="model-source-configuration">{renderConfiguration?.(family,key.split(':')[1] as ModelRoutingChoices[Family],family==='image'?{vision:draft.vision,image:draft.image}:undefined)}</div>)}
     </div>;
    })}
    {routing.error&&<p role="alert" className="text-sm text-destructive">{routing.error}</p>}
    {stale&&<p role="status" className="text-sm text-warning">设置在别的窗口里被改过了，请先点「重新读取当前设置」核对后再保存。</p>}
    <div className="flex flex-wrap items-center gap-3">
     <Button type="button" disabled={!routing.ready||!parsed.success||!changed||routing.saving||stale} onClick={()=>void save()}>{routing.saving?'正在保存…':'保存模型来源'}</Button>
     <Button type="button" variant="outline" disabled={routing.reading||routing.saving} onClick={()=>void loadModelRouting(true)}>{routing.reading?'正在读取…':'重新读取当前设置'}</Button>
     {stale&&<Button type="button" variant="outline" onClick={()=>{if(routing.resource)setBaseline({revision:routing.resource.revision,choices:JSON.stringify(routing.resource.choices)});}}>已核对，保留草稿继续编辑</Button>}
    </div>
    <p role="status" className="text-sm text-muted-foreground">{saved?'已保存':!routing.ready?(routing.reading?'正在读取设置…':'暂时读不到设置，请点「重新读取当前设置」'):!parsed.success?'请为每一项选择模型来源':changed?'有改动还没保存':'未修改'}</p>
   </div>
  </SectionCard>
 </div>;
}

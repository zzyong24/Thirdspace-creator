'use client';
import * as React from 'react';
import {noteRelayLayout,type NoteRelayLayout,type ArticleDocument,type GraphicPostDocument} from '@creatoros/contract';
import {useCreationWorkspace,creationScopeKey} from '@/lib/creation-workspace-scope';
import {useNativeWorkspace} from '../use-native-account';
import {client} from '@/lib/contract-client';
import {Button} from '@/components/ui/button';
import {Input} from '@/components/ui/input';
import {Select,SelectContent,SelectItem,SelectTrigger,SelectValue} from '@/components/ui/select';
import {NativeEditorSurface,type NativeEditorHandle} from '../native-editor-surface';
import {projectArticle,projectGraphic,defaultLayout,assetSource} from './projection';
type Props={accountId:string|null;projectId:string;outputId:string;sourceVersionId:string;platform:'wechat'|'rednote';value:ArticleDocument|GraphicPostDocument;onLayoutChange:(layout:NoteRelayLayout)=>void;disabled?:boolean};
type Metadata={themes:Array<{id:string;name:string}>;images:Array<{key:string;label:string}>;pageIndex:number;pageCount:number;selectedImage:string};
type ExportAction='copy-html'|'html'|'copy-text'|'copy-png'|'png'|'zip';
type Delivery={blob:Blob;plainText?:string;filename?:string};
const empty:Metadata={themes:[],images:[],pageIndex:0,pageCount:0,selectedImage:''};
function Choice({label,value,items,onChange,disabled}:{label:string;value:string;items:Array<{id:string;name:string}>;onChange:(value:string)=>void;disabled?:boolean}){
 return <label className="space-y-1 text-xs text-muted-foreground"><span>{label}</span><Select value={value} onValueChange={onChange} disabled={disabled}><SelectTrigger aria-label={label} className="min-w-32"><SelectValue/></SelectTrigger><SelectContent>{items.map(item=><SelectItem key={item.id} value={item.id}>{item.name}</SelectItem>)}</SelectContent></Select></label>;
}
export function NoteRelayEditor(props:Props){const scope=useNativeWorkspace();return <NoteRelayEditorSession key={`${creationScopeKey(scope)}:${props.outputId}`} {...props}/>;}
function NoteRelayEditorSession(props:Props){
 const scope=useNativeWorkspace(),workspace=useCreationWorkspace(scope),client=workspace.client;
 const [mountVersion]=React.useState(props.sourceVersionId);
 const {platform,value,onLayoutChange,disabled}=props;
 const editor=React.useRef<NativeEditorHandle>(null),alive=React.useRef(true),ready=React.useRef(false),assets=React.useRef(new Map<string,Blob>()),sequence=React.useRef(0),loading=React.useRef<AbortController|null>(null);
 const [rendered,setRendered]=React.useState(''),[busy,setBusy]=React.useState(false),[error,setError]=React.useState<string|null>(null),[assetError,setAssetError]=React.useState<string|null>(null),[message,setMessage]=React.useState<string|null>(null),[epoch,setEpoch]=React.useState(0),[meta,setMeta]=React.useState(empty);
 const projection=React.useMemo(()=>platform==='wechat'?projectArticle(value as ArticleDocument):projectGraphic(value as GraphicPostDocument),[platform,value]);
 const layout=value.nativeLayout?.editor==='noterelay'?value.nativeLayout:defaultLayout(platform);
 const digest=JSON.stringify({projection,layout}),latest=React.useRef({projection,layout,platform,digest});
 React.useLayoutEffect(()=>{latest.current={projection,layout,platform,digest};},[projection,layout,platform,digest]);
 const initialize=React.useCallback(async()=>{
  const active=editor.current;if(!active||!ready.current||!alive.current)return;
  loading.current?.abort();const abort=new AbortController();loading.current=abort;const generation=++sequence.current,snapshot=latest.current;
  setRendered('');const images:Array<{source:string;blob:Blob}>=[],failures:string[]=[];
  try{
   for(const image of snapshot.projection.images){
    abort.signal.throwIfAborted();const source=assetSource(image);
    try{let blob=assets.current.get(source);if(!blob){const file=await client.getAssetFileDownloadUrl({params:image,query:undefined,body:undefined});abort.signal.throwIfAborted();const response=await fetch(file.url,{credentials:'omit',signal:abort.signal});if(!response.ok)throw new Error('素材下载失败');blob=await response.blob();abort.signal.throwIfAborted();if(!blob.type.startsWith('image/')||blob.size>25*1024*1024)throw new Error('素材不是受支持的图片或超过 25 MiB');assets.current.set(source,blob);}images.push({source,blob});}
    catch(reason){abort.signal.throwIfAborted();failures.push(reason instanceof Error?reason.message:'图片读取失败');}
   }
   if(generation!==sequence.current||snapshot.digest!==latest.current.digest||editor.current!==active||!alive.current)return;
   setAssetError(failures.length?`有 ${failures.length} 张图片无法读取；正文和版式仍可保存，请重新选图后导出。`:null);
   const result=await active.request<Metadata>('load',{platform:snapshot.platform,title:snapshot.projection.title,markdown:snapshot.projection.markdown,layout:snapshot.layout,images},{signal:abort.signal});
   if(generation===sequence.current&&snapshot.digest===latest.current.digest&&alive.current){setMeta(result);setRendered(snapshot.digest);}
  }catch(reason){if(!abort.signal.aborted&&alive.current)setError(reason instanceof Error?reason.message:'预览未完成');}
 },[]);
 React.useEffect(()=>{const assetCache=assets.current;const renderSequence=sequence;alive.current=true;return()=>{alive.current=false;ready.current=false;renderSequence.current++;loading.current?.abort();assetCache.clear();};},[]);
 React.useEffect(()=>{if(ready.current)void initialize();},[digest,initialize]);
 const loaded=rendered===digest,locked=busy||disabled;
 function change(patch:Partial<NoteRelayLayout>){const parsed=noteRelayLayout.safeParse({...layout,...patch});if(parsed.success)onLayoutChange(parsed.data);else setError('版式设置超出范围，当前稿件已保留。');}
 function request(operation:string,payload:unknown){const active=editor.current;void active?.request<Metadata>(operation,payload).then(value=>{if(alive.current&&editor.current===active)setMeta(value);}).catch(reason=>{if(alive.current&&editor.current===active)setError(reason.message);});}
 async function deliver(action:ExportAction){
  const active=editor.current;if(busy||!loaded||!active)return;setBusy(true);setError(null);setMessage(null);const frozen=latest.current.digest;
  try{
   const result=await active.request<Delivery>('export',{action});
   if(!alive.current||editor.current!==active||latest.current.digest!==frozen)throw new Error('稿件已改变，请重新导出');
   const mime=action==='zip'?'application/zip':platform==='wechat'?'text/html':'image/png';if(!(result.blob instanceof Blob)||result.blob.type!==mime)throw new Error('交付文件类型不符');
   if(action==='copy-html'){if(typeof ClipboardItem==='undefined'||!navigator.clipboard?.write)throw new Error('当前环境不支持富文本复制，请使用“复制纯文本”或“导出 HTML”。');await navigator.clipboard.write([new ClipboardItem({'text/html':result.blob,'text/plain':new Blob([result.plainText??''],{type:'text/plain'})})]);if(alive.current)setMessage('公众号文章已复制。');}
   else if(action==='copy-text'){await navigator.clipboard.writeText(result.plainText??'');if(alive.current)setMessage('正文已复制为纯文本。');}
   else if(action==='copy-png'){await navigator.clipboard.write([new ClipboardItem({'image/png':result.blob})]);if(alive.current)setMessage('当前页 PNG 已复制。');}
   else{const url=URL.createObjectURL(result.blob),anchor=document.createElement('a');anchor.href=url;anchor.download=result.filename??`${projection.title.replace(/[\\/:*?"<>|]/g,'-')||'公众号文章'}.html`;anchor.click();setTimeout(()=>URL.revokeObjectURL(url),1000);if(alive.current)setMessage('交付文件已生成。');}
  }catch(reason){if(alive.current&&editor.current===active)setError(reason instanceof Error?reason.message:'交付失败，请重试。');}finally{if(alive.current&&editor.current===active)setBusy(false);}
 }
 return <section className="space-y-4 rounded-xl border border-border bg-surface p-4" aria-label="NoteRelay 排版预览">
  <div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="text-[13.5px] font-semibold">{platform==='wechat'?'公众号排版':'图文分页'}</h2></div>
   <div className="flex flex-wrap items-start gap-2"><Button className="min-h-11 px-4" disabled={!loaded||locked} onClick={()=>void deliver(platform==='wechat'?'copy-html':'zip')}>{busy?'正在交付…':platform==='wechat'?'复制公众号文章':'导出分页 ZIP'}</Button>
    <details className="relative"><summary className="cursor-pointer rounded-md border border-border px-3 py-3 text-sm">更多导出</summary><div className="absolute right-0 z-20 mt-2 flex min-w-40 flex-col gap-1 rounded-lg border border-border bg-surface p-2 shadow-lg">
    {(platform==='wechat'?[['html','导出 HTML'],['copy-text','复制纯文本']]:[['copy-png','复制当前页'],['png','下载当前页']]).map(([action,label])=><Button key={action} variant="ghost" disabled={!loaded||locked} onClick={()=>void deliver(action as ExportAction)}>{label}</Button>)}
    <Button variant="ghost" disabled={busy} onClick={()=>{ready.current=false;setRendered('');setEpoch(n=>n+1);}}>重新加载预览</Button></div></details>
   </div></div>
  <div className="h-[min(850px,75dvh)] min-h-[420px] overflow-hidden rounded-lg border border-border"><NativeEditorSurface key={epoch} ref={editor} editor="noterelay" owner={{groupId:scope.groupId,accountId:scope.accountId,projectId:props.projectId,outputId:props.outputId,sourceVersionId:mountVersion}} disabled={locked} onReady={()=>{ready.current=true;void initialize();}} onChanged={v=>{if(v&&typeof v==='object')setMeta(v as Metadata);}} onImport={async()=>{throw new Error('请从当前稿件选择图片');}} onError={setError}/></div>
  {platform==='rednote'&&<div className="flex flex-wrap items-center gap-3"><Button variant="outline" disabled={!loaded||locked||meta.pageIndex<=0} onClick={()=>request('page',{index:meta.pageIndex-1})}>上一页</Button><span className="text-sm text-muted-foreground">{meta.pageCount?meta.pageIndex+1:0} / {meta.pageCount}</span><Button variant="outline" disabled={!loaded||locked||meta.pageIndex>=meta.pageCount-1} onClick={()=>request('page',{index:meta.pageIndex+1})}>下一页</Button>
</div>}
  <details className="rounded-lg border border-border"><summary className="cursor-pointer px-4 py-3 text-sm font-medium">排版设置</summary><div className="space-y-4 border-t border-border p-4">
  <div className="flex flex-wrap items-end gap-3 rounded-lg bg-surface-subtle p-3">
   <Choice label="排版主题" value={layout.themeId} items={meta.themes} disabled={locked} onChange={themeId=>change({themeId})}/>
   <label className="space-y-1 text-xs text-muted-foreground">署名<Input aria-label="署名" value={layout.authorName} maxLength={120} disabled={locked} onChange={e=>change({authorName:e.target.value})}/></label>
   <label className="space-y-1 text-xs text-muted-foreground">简介<Input aria-label="简介" value={layout.authorBio} maxLength={500} disabled={locked} onChange={e=>change({authorBio:e.target.value})}/></label>
   {platform==='rednote'&&<><label className="space-y-1 text-xs text-muted-foreground">字号<Input aria-label="字号" type="number" min={12} max={32} className="w-20" value={layout.fontSize} disabled={locked} onChange={e=>{const n=Number(e.target.value);if(Number.isInteger(n)&&n>=12&&n<=32)change({fontSize:n});}}/></label>
    <Choice label="分页" value={String(layout.splitHeading)} items={[{id:'1',name:'一级标题'},{id:'2',name:'二级标题'}]} disabled={locked} onChange={v=>change({splitHeading:Number(v) as 1|2})}/>
    <Choice label="卡片模板" value={layout.templateId} items={[{id:'default',name:'标准卡片'},{id:'notes',name:'笔记卡片'}]} disabled={locked} onChange={v=>change({templateId:v as 'default'|'notes'})}/></>}
  </div>
  {platform==='wechat'&&<details><summary className="cursor-pointer text-sm text-muted-foreground">栏目、日期等文章变量（可选）</summary><div className="mt-3 grid gap-3 sm:grid-cols-3">{['栏目名','日期','副标题','关键词','标签'].map(name=><label key={name} className="space-y-1 text-xs text-muted-foreground">{name}<Input value={layout.variables[name]??''} aria-label={`文章变量${name}`} maxLength={2000} disabled={locked} onChange={e=>change({variables:{...layout.variables,[name]:e.target.value}})}/></label>)}</div></details>}
  {platform==='rednote'&&<div className="flex flex-wrap items-center gap-3">
   {meta.images.length>0&&<><Choice label="正文图片" value={meta.selectedImage} items={meta.images.map(i=>({id:i.key,name:i.label}))} disabled={!loaded||locked} onChange={key=>request('select-image',{key})}/>
    <Choice label="图片宽度" value={String(layout.imageWidths[meta.selectedImage]??'auto')} items={[{id:'auto',name:'自适应'},...Array.from(new Set([50,75,100,...(layout.imageWidths[meta.selectedImage]!==undefined?[layout.imageWidths[meta.selectedImage]]:[])])).map(n=>({id:String(n),name:`${n}%`}))]} disabled={locked} onChange={v=>{const imageWidths={...layout.imageWidths};if(v==='auto')delete imageWidths[meta.selectedImage];else imageWidths[meta.selectedImage]=Number(v);change({imageWidths});}}/>
    <label className="space-y-1 text-xs text-muted-foreground">宽度 %<Input aria-label="图片自定义宽度" type="number" className="w-20" min={30} max={100} value={layout.imageWidths[meta.selectedImage]??100} disabled={locked} onChange={e=>{const n=Number(e.target.value);if(n>=30&&n<=100)change({imageWidths:{...layout.imageWidths,[meta.selectedImage]:n}});}}/></label>
    <label className="space-y-1 text-xs text-muted-foreground">图片圆角<Input aria-label="图片圆角" type="number" className="w-20" min={0} max={32} value={layout.imageRadii[meta.selectedImage]??0} disabled={locked} onChange={e=>{const n=Number(e.target.value);if(n>=0&&n<=32)change({imageRadii:{...layout.imageRadii,[meta.selectedImage]:n}});}}/></label></>}
  </div>}
  </div></details>
  {(error||assetError)&&<p role="alert" className="text-sm text-destructive">{error||assetError}</p>}{message&&<p role="status" className="text-sm text-success">{message}</p>}

  <details className="text-xs text-muted-foreground"><summary className="cursor-pointer">开源来源与许可</summary><a className="mt-2 block underline" href="/reference-editors/sources/noterelay/source.zip" download>NoteRelay 0.1.8 源码与许可</a></details>
 </section>;
}

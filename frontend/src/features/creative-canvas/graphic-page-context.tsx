'use client';
import * as React from 'react';
import Link from 'next/link';
import Image from 'next/image';
import {canvasDocumentSchema,canvasMaterialSelectionResource,graphicPostDocument,type CanvasMaterialSelection,type GraphicPostDocument} from '@creatoros/contract';
import {client} from '@/lib/contract-client';
import {readCurrentAccountId} from '@/lib/http-transport';
type FileRef={assetId:string;assetFileId:string};
type Scope={accountId:string;projectId:string;outputId:string;cardId:string;baseVersionId:string;artifactId:string;canvasId:string;nodeId:string;expectedFile:FileRef|null};
// SEMANTIC_BOUNDARY_ALLOW: 临时上下文只核验明确ID及结构；服务端仍核验归属和版本。
const scopeSchema={parse(raw:unknown):Scope{
 if(!raw||typeof raw!=='object'||Array.isArray(raw))throw Error('原图文上下文缺失');
 const value=raw as Record<string,unknown>,ids=['accountId','projectId','outputId','cardId','baseVersionId','artifactId','canvasId','nodeId'];
 if(Object.keys(value).some(key=>!ids.includes(key)&&key!=='expectedFile')||ids.some(key=>typeof value[key]!=='string'||!(value[key] as string).trim()||(value[key] as string).length>512))throw Error('原图文上下文身份不完整');
 if(value.expectedFile!==null){const ref=value.expectedFile as Record<string,unknown>|null;if(!ref||typeof ref!=='object'||Array.isArray(ref)||Object.keys(ref).length!==2||typeof ref.assetId!=='string'||!ref.assetId||typeof ref.assetFileId!=='string'||!ref.assetFileId)throw Error('原页精确图片引用无效');}
 return value as Scope;
}};
const cacheKey=(accountId:string,handle:string)=>'creatoros-graphic-page:'+accountId+':'+handle;
function assertAccount(accountId:string){if(readCurrentAccountId()!==accountId)throw Error('当前账号已变化，请返回原组图重新打开');}
const slot=(document:GraphicPostDocument,cardId:string)=>{const image=document.imageUses.find(use=>use.role==='card'&&use.cardId===cardId);return image?{assetId:image.assetId,assetFileId:image.assetFileId}:null;};
// SEMANTIC_BOUNDARY_ALLOW: 按明确字段核对冻结输入，不判断页内容、风格或连贯性。
function basis(document:GraphicPostDocument){return {title:document.title,body:document.body,summary:document.summary,sourceRefs:document.sourceRefs,cardBriefs:document.cardBriefs??[],seriesProfile:document.seriesProfile??null};}
const equal=(a:unknown,b:unknown)=>JSON.stringify(a)===JSON.stringify(b);
const openings=new Map<string,Promise<string>>();
/** 读取保存真值并带到现有画布；不提交模型，不建立作品组合。 */
export function openGraphicPageCanvas(input:{accountId:string;projectId:string;outputId:string;cardId:string}):Promise<string>{
 const key=JSON.stringify(input),running=openings.get(key);if(running)return running;
 const operation=openPage(input).finally(()=>openings.delete(key));openings.set(key,operation);return operation;
}
async function openPage(input:{accountId:string;projectId:string;outputId:string;cardId:string}){
 assertAccount(input.accountId);
 const pendingKey='creatoros-graphic-page-open:'+input.accountId+':'+input.outputId+':'+input.cardId;
 const previous=JSON.parse(sessionStorage.getItem(pendingKey)??'null') as {state:string;canvasId?:string;handle?:string}|null;
 if(previous?.state==='ready'&&previous.canvasId&&previous.handle){const prior=await readGraphicPageScope(input.accountId,previous.handle,previous.canvasId,input.projectId);if(equal(basis(prior.current),basis(prior.base))&&equal(slot(prior.current,input.cardId),prior.scope.expectedFile))return '/canvases/'+encodeURIComponent(previous.canvasId)+'?graphicPageContext='+encodeURIComponent(previous.handle);sessionStorage.removeItem(pendingKey);}
 else if(previous)throw Error('上次画布创建或保存结果尚未确认，请在画布库核对原画布；不会重复创建');
 const post=await client.getGraphicPost({params:{outputId:input.outputId},query:undefined,body:undefined});assertAccount(input.accountId);
 if(post.projectId!==input.projectId||post.outputId!==input.outputId)throw Error('原图文归属不一致');
 const saved=await client.getGraphicPostVersion({params:{outputId:input.outputId,versionId:post.currentVersionId},query:undefined,body:undefined});assertAccount(input.accountId);
 const document=graphicPostDocument.parse(saved.document),index=(document.cardBriefs??[]).findIndex(card=>card.cardId===input.cardId),card=document.cardBriefs?.[index];
 if(saved.versionId!==post.currentVersionId||!card)throw Error('原图文页已不存在，请保留当前内容');
 const prompt=JSON.stringify({task:'为明确选定的这一页制作图片；全部有序页只用于理解衔接，不把整篇再次画成一页。用户可在画布修改描述。',targetCardId:card.cardId,targetPage:card,pages:document.cardBriefs,content:{title:document.title,body:document.body,summary:document.summary,sourceRefs:document.sourceRefs},sharedDirection:document.seriesProfile??null});
 if(prompt.length>10000)throw Error('组图上下文超过画布描述容量，请缩短页规划后再带入；原稿仍可保存和逐页生成');
 const nodeId=crypto.randomUUID(),handle=crypto.randomUUID(),profile=document.seriesProfile;
 const reference=profile?.referenceImage;
 const nodes=[{id:nodeId,type:'image_generation' as const,label:'第 '+(index+1)+' 页 · '+card.title.slice(0,130),position:{x:100,y:100},prompt,mode:reference?'image_to_image' as const:'text_to_image' as const,...(profile?.aspectRatio?{aspectRatio:profile.aspectRatio}:{}),...(reference?{referenceAssetId:reference.assetId,referenceFileId:reference.assetFileId}:{})}];
 const canvasDocument=canvasDocumentSchema.parse({schemaVersion:1,viewport:{x:0,y:0,zoom:1},nodes,edges:[]});
 // 创建接口尚无请求回执：创建前保留未知窗口，避免响应丢失后再次创建。
 sessionStorage.setItem(pendingKey,JSON.stringify({state:'creating'}));
 const canvas=await client.createCanvas({params:undefined,query:undefined,body:{projectId:input.projectId,title:('第 '+(index+1)+' 页 · '+(post.current.title||card.title||'组图')).slice(0,160)}});assertAccount(input.accountId);
 if(canvas.accountId!==input.accountId||canvas.projectId!==input.projectId)throw Error('新画布归属不一致');
 sessionStorage.setItem(pendingKey,JSON.stringify({state:'saving',canvasId:canvas.id}));
 const save={params:{canvasId:canvas.id},query:undefined,body:{expectedRevision:canvas.revision,document:canvasDocument}};
 try{await client.saveCanvas(save);}catch(reason){
  // 保存响应未知只读核对原画布，不重新创建，也不覆盖用户后续编辑。
  const actual=await client.getCanvas({params:{canvasId:canvas.id},query:undefined,body:undefined}).catch(()=>null);assertAccount(input.accountId);
  if(!actual||actual.accountId!==input.accountId||actual.projectId!==input.projectId||!equal(actual.document,canvasDocument))throw reason;
 }
 assertAccount(input.accountId);
 const context=scopeSchema.parse({...input,baseVersionId:saved.versionId,artifactId:post.artifactId,canvasId:canvas.id,nodeId,expectedFile:slot(document,card.cardId)});
 sessionStorage.setItem(cacheKey(input.accountId,handle),JSON.stringify(context));sessionStorage.setItem(pendingKey,JSON.stringify({state:'ready',canvasId:canvas.id,handle}));
 return '/canvases/'+encodeURIComponent(canvas.id)+'?graphicPageContext='+encodeURIComponent(handle);
}
export async function readGraphicPageScope(accountId:string,handle:string,canvasId:string,projectId:string|null){
 assertAccount(accountId);const scope=scopeSchema.parse(JSON.parse(sessionStorage.getItem(cacheKey(accountId,handle))??'null'));
 if(scope.accountId!==accountId||scope.canvasId!==canvasId||scope.projectId!==projectId)throw Error('原图文上下文不属于当前画布');
 const post=await client.getGraphicPost({params:{outputId:scope.outputId},query:undefined,body:undefined});assertAccount(accountId);
 if(post.projectId!==scope.projectId||post.outputId!==scope.outputId||post.artifactId!==scope.artifactId)throw Error('原图文归属不一致');
 const saved=await client.getGraphicPostVersion({params:{outputId:scope.outputId,versionId:scope.baseVersionId},query:undefined,body:undefined});assertAccount(accountId);
 if(saved.versionId!==scope.baseVersionId)throw Error('原图文版本不一致');
 const base=graphicPostDocument.parse(saved.document),index=(base.cardBriefs??[]).findIndex(card=>card.cardId===scope.cardId);
 if(index<0||!post.current.cardBriefs?.some(card=>card.cardId===scope.cardId))throw Error('原图文页已不存在');
 return {scope,base,index,current:graphicPostDocument.parse(post.current)};
}
export function GraphicPageCanvasContext({accountId,projectId,canvasId,handle,confirmedSelections=[],onLeave}:{accountId:string;projectId:string|null;canvasId:string;handle:string;confirmedSelections?:CanvasMaterialSelection[];onLeave?:(href:string)=>Promise<void>}){
 const [context,setContext]=React.useState<Awaited<ReturnType<typeof readGraphicPageScope>>|null>(null),[error,setError]=React.useState(''),[message,setMessage]=React.useState(''),[pending,setPending]=React.useState<CanvasMaterialSelection|null>(null),[busy,setBusy]=React.useState(false);
 const live=React.useRef(true),inFlight=React.useRef(false),request=React.useRef<{digest:string;id:string}|null>(null);
 React.useEffect(()=>{live.current=true;void readGraphicPageScope(accountId,handle,canvasId,projectId).then(value=>{if(live.current){setContext(value);setError('');}}).catch(reason=>{if(live.current)setError(reason instanceof Error?reason.message:'原页不可读取');});return()=>{live.current=false;};},[accountId,handle,canvasId,projectId]);
 const choices=context?confirmedSelections.filter(value=>value.status==='available'&&value.phase==='confirmed'&&value.assetType==='image'&&value.origin.canvasId===canvasId&&value.origin.nodeId===context.scope.nodeId&&!equal(value.file,context.scope.expectedFile)):[];
 async function refreshSlot(){if(!context||inFlight.current)return;inFlight.current=true;setBusy(true);try{const post=await client.getGraphicPost({params:{outputId:context.scope.outputId},query:undefined,body:undefined});assertAccount(accountId);if(!equal(basis(post.current),basis(context.base)))throw Error('页规划或统一参考已变化，请从原组图重新进入');const scope={...context.scope,expectedFile:slot(post.current,context.scope.cardId)};sessionStorage.setItem(cacheKey(accountId,handle),JSON.stringify(scope));if(live.current){setContext({...context,scope});request.current=null;setError('');setMessage('已读回当前页。请重新预览候选，再确认替换。');setPending(null);}}catch(reason){if(live.current)setError(reason instanceof Error?reason.message:'当前页不可读取');}finally{inFlight.current=false;if(live.current)setBusy(false);}}
 async function adopt(){if(!context||!pending||pending.status!=='available'||inFlight.current)return;inFlight.current=true;setBusy(true);setError('');let pointerKey:string|undefined,requestKey:string|undefined;
  try{assertAccount(accountId);const scope=context.scope;
   const actual=canvasMaterialSelectionResource.parse(await client.getCanvasGenerationMaterial({params:{canvasId,generationLinkId:pending.origin.generationLinkId},query:undefined,body:undefined}));assertAccount(accountId);
   if(actual.status!=='available'||actual.phase!=='confirmed'||actual.assetType!=='image'||actual.origin.nodeId!==scope.nodeId||actual.origin.canvasId!==scope.canvasId||!equal(actual.file,pending.file)||actual.checksum!==pending.checksum)throw Error('原候选文件或确认状态已变化，请保留候选重新读取');
   const digest=JSON.stringify({scope,file:actual.file,origin:actual.origin});pointerKey=cacheKey(accountId,handle)+':request:'+actual.origin.generationLinkId;
   if(request.current?.digest!==digest){const prior=JSON.parse(sessionStorage.getItem(pointerKey)??'null') as {digest:string;id:string}|null;request.current=prior?.digest===digest&&typeof prior.id==='string'?prior:{digest,id:crypto.randomUUID()};sessionStorage.setItem(pointerKey,JSON.stringify(request.current));}
   requestKey=cacheKey(accountId,handle)+':adopt:'+request.current.id;
   let body=JSON.parse(sessionStorage.getItem(requestKey)??'null') as Parameters<typeof client.createGraphicPostVersion>[0]['body']|null;
   if(!body){const post=await client.getGraphicPost({params:{outputId:scope.outputId},query:undefined,body:undefined});assertAccount(accountId);
    if(post.projectId!==scope.projectId||post.artifactId!==scope.artifactId||!post.current.cardBriefs?.some(card=>card.cardId===scope.cardId))throw Error('原图文页已不存在或归属变化');
    if(!equal(basis(post.current),basis(context.base)))throw Error('页规划或统一参考已变化，请从原组图重新进入');
    if(!equal(slot(post.current,scope.cardId),scope.expectedFile))throw Error('这页图片已变化，请重新读取当前页并确认替换');
    const imageUses=post.current.imageUses.slice(),index=imageUses.findIndex(use=>use.role==='card'&&use.cardId===scope.cardId),use={...actual.file,role:'card' as const,cardId:scope.cardId,order:index<0?imageUses.length:index};
    if(index<0)imageUses.push(use);else imageUses.splice(index,1,use);
    // SEMANTIC_BOUNDARY_ALLOW: 仅按用户明确的cardId顺序派生显示次序，保留无绑定旧照片；不作内容选择。
    const pages=post.current.cardBriefs??[],rank=(image:GraphicPostDocument['imageUses'][number])=>{if(image.role==='cover')return -1;const at=pages.findIndex(card=>card.cardId===image.cardId);return at<0?pages.length:at;};
    imageUses.sort((a,b)=>rank(a)-rank(b));
    body={expectedCurrentVersionId:post.currentVersionId,document:{...post.current,imageUses:imageUses.map((image,order)=>({...image,order}))},clientRequestId:request.current.id};
    sessionStorage.setItem(requestKey,JSON.stringify(body));
   }
   const saved=await client.createGraphicPostVersion({params:{outputId:scope.outputId},query:undefined,body});assertAccount(accountId);
   if(!equal(slot(saved.document,scope.cardId),actual.file))throw Error('保存回执没有包含这页精确图片，请保留原请求核对');
   const nextScope={...scope,expectedFile:actual.file};sessionStorage.setItem(cacheKey(accountId,handle),JSON.stringify(nextScope));if(live.current){setMessage('已采用回原组图，其他页和旧版本保留。');setPending(null);setContext({...context,scope:nextScope});}
  }catch(reason){const conflict=reason as {status?:unknown;code?:unknown}|null;if(conflict&&(conflict.status===409||conflict.code==='ConflictError'||conflict.code==='VERSION_CONFLICT')){if(pointerKey)sessionStorage.removeItem(pointerKey);if(requestKey)sessionStorage.removeItem(requestKey);request.current=null;}if(live.current)setError(reason instanceof Error?reason.message:'采用结果未确认，原候选与请求保留');}finally{inFlight.current=false;if(live.current)setBusy(false);}
 }
 if(error&&!context)return <div role="alert" className="border-b p-3 text-sm text-destructive">{error}。画布可继续独立编辑。</div>;
 if(!context)return <p role="status" className="border-b p-3 text-sm">正在核对原图文页…</p>;
 return <section aria-label="原图文页" className="space-y-2 border-b bg-primary/5 px-4 py-3 text-sm"><div className="flex flex-wrap items-center gap-3"><span>第 {context.index+1} 页 · {context.base.cardBriefs?.[context.index]?.title||'未命名页'}</span><Link href={'/projects/'+encodeURIComponent(context.scope.projectId)+'/outputs/'+encodeURIComponent(context.scope.outputId)+'/image'} onClick={event=>{if(!onLeave||event.button!==0||event.metaKey||event.ctrlKey||event.shiftKey||event.altKey)return;event.preventDefault();void onLeave(event.currentTarget.getAttribute('href')!).catch(reason=>{if(live.current)setError(reason instanceof Error?reason.message:'画布保存失败，请保留当前编辑');});}} className="rounded-md border px-3 py-2">返回原组图</Link></div>
  {choices.map(value=>value.status==='available'?<button key={value.origin.generationLinkId} disabled={busy} onClick={()=>{setPending(value);setError('');setMessage('');}} className="mr-2 rounded-md border px-3 py-2">采用到这一页</button>:null)}
  {pending?.status==='available'?<div className="space-y-3"><CandidatePagePreview key={pending.origin.generationLinkId} file={pending.file} name={pending.name}/><div className="flex flex-wrap items-center gap-3"><span>{context.scope.expectedFile?'将替换这页当前图片，其他页和旧素材保留。':'将补充到这一页，其他页保留。'}</span><button disabled={busy} onClick={()=>void adopt()} className="rounded-md bg-primary px-3 py-2 text-primary-foreground">{busy?'正在保存…':'确认替换这一页'}</button><button disabled={busy} onClick={()=>setPending(null)} className="rounded-md border px-3 py-2">取消</button></div></div>:null}
  {error?<div role="alert">{error}<button disabled={busy} onClick={()=>void refreshSlot()} className="ml-3 underline">重新读取当前页</button></div>:null}{message?<p role="status">{message}</p>:null}
  {!choices.length?<p className="text-xs text-muted-foreground">生成并保留这一页的候选后，可明确采用回原组图。</p>:null}
 </section>;
}

function CandidatePagePreview({file,name}:{file:FileRef;name:string}){
 const [url,setUrl]=React.useState<string|null>(null),[error,setError]=React.useState('');
 React.useEffect(()=>{let live=true;void client.getAssetFileDownloadUrl({params:{assetId:file.assetId,assetFileId:file.assetFileId},query:undefined,body:undefined}).then(value=>{if(live)setUrl(value.url);}).catch(()=>{if(live)setError('这张候选暂不可预览，原图片与候选保留。');});return()=>{live=false;};},[file.assetId,file.assetFileId]);
 return <figure className="max-w-sm">{url?<Image src={url} alt={'将采用的页图：'+name} width={360} height={240} unoptimized className="max-h-48 rounded-lg object-contain"/>:<p className="text-xs text-muted-foreground">{error||'读取这张候选…'}</p>}<figcaption className="mt-1 text-xs text-muted-foreground">{name}</figcaption></figure>;
}

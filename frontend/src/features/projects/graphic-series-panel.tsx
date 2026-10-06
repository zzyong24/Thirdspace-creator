"use client";
import {useCreationClient} from "@/lib/creation-workspace-scope";
import * as React from 'react';
import Image from 'next/image';
import Link from 'next/link';
import type {GraphicPostDocument,GraphicPostCardBrief} from '@creatoros/contract';
import {Button} from '@/components/ui/button';
import {Dialog,DialogContent,DialogHeader,DialogTitle} from '@/components/ui/dialog';
import {client} from '@/lib/contract-client';
import {deleteGraphicPage,moveGraphicPage,replaceGraphicPageImage,setGraphicCover} from './graphic-series-document';

type ImageUse=GraphicPostDocument['imageUses'][number];
export type GraphicImageAsset={id:string;name:string;assetType:string;status:string;currentFileId:string|null};
type GraphicImagePreviewProps={image:Pick<ImageUse,'assetId'|'assetFileId'>;large?:boolean};
export function GraphicImagePreview(props:GraphicImagePreviewProps){return <GraphicImagePreviewSession key={`${props.image.assetId}:${props.image.assetFileId}`} {...props}/>;}
function GraphicImagePreviewSession({image,large=false}:GraphicImagePreviewProps){
 const client=useCreationClient();

 const [url,setUrl]=React.useState<string|null>(null),[error,setError]=React.useState(false);
 React.useEffect(()=>{let active=true;
  void client.getAssetFileDownloadUrl({params:{assetId:image.assetId,assetFileId:image.assetFileId},query:undefined,body:undefined})
   .then(value=>{if(active)setUrl(value.url);}).catch(()=>{if(active)setError(true);});
  return()=>{active=false;};
 },[image.assetId,image.assetFileId]);
 return url?<Image src={url} alt="作品中的精确图片版本" width={640} height={800} unoptimized className={`${large?'max-h-96':'h-36'} w-full rounded-md bg-surface-subtle object-contain`}/>
  :<div className={`${large?'h-64':'h-36'} flex items-center justify-center rounded-md bg-surface-subtle text-xs text-muted-foreground`}>{error?'图片版本暂不可读取':'读取图片中…'}</div>;
}

export function GraphicSeriesPanel({document,onChange,selectedCardId,selectedCardIds,onSelect,onSelectionChange,assets,disabled,onOpenCanvas,onOpenDesign,children}:{
 document:GraphicPostDocument;onChange:(document:GraphicPostDocument)=>void;selectedCardId:string|null;selectedCardIds:string[];
 onSelect:(cardId:string)=>void;onSelectionChange:(cardIds:string[])=>void;assets:GraphicImageAsset[];disabled:boolean;
 onOpenCanvas:(cardId:string)=>void;onOpenDesign:(cardId:string)=>void;children?:React.ReactNode;
}){
 const cards=document.cardBriefs??[],selected=cards.find(card=>card.cardId===selectedCardId),index=cards.findIndex(card=>card.cardId===selectedCardId);
 const image=selected?document.imageUses.find(item=>item.role==='card'&&item.cardId===selected.cardId):undefined;
 const [assetSelection,setAssetSelection]=React.useState<{cardId:string|null;assetId:string}>({cardId:selectedCardId,assetId:''});
 const assetId=assetSelection.cardId===selectedCardId?assetSelection.assetId:'';
 function setAssetId(value:string){setAssetSelection({cardId:selectedCardId,assetId:value});}
 const [deleteTarget,setDeleteTarget]=React.useState<string|null>(null);
 const deleteOpen=Boolean(deleteTarget&&deleteTarget===selectedCardId);
 function setDeleteOpen(open:boolean){setDeleteTarget(open?selectedCardId:null);}
 const selectedAsset=assets.find(asset=>asset.id===assetId&&asset.currentFileId);
 function edit(patch:Partial<GraphicPostCardBrief>){if(selected)onChange({...document,cardBriefs:cards.map(card=>card.cardId===selected.cardId?{...card,...patch}:card)});}
 function add(){const cardId=crypto.randomUUID();onChange({...document,cardBriefs:[...cards,{cardId,title:'',body:'',sourceRefs:[]}]});onSelect(cardId);onSelectionChange([...selectedCardIds,cardId]);}
 return <section aria-label="连续组图工作台" className="space-y-4">
  <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-xl font-semibold">一组图，讲清一份内容</h2><p className="mt-1 text-sm text-muted-foreground">先看每页说什么，再逐页出图。重做这一页会保留其他页。</p></div><Button variant="outline" disabled={disabled} onClick={add}>添加一页</Button></div>
  <div className="grid min-w-0 gap-5 lg:grid-cols-[minmax(240px,0.85fr)_minmax(0,1.15fr)]">
   <div className="min-w-0 space-y-3 rounded-xl border border-border bg-surface p-4">
    <div className="flex items-center justify-between gap-2"><h3 className="font-medium">整组预览 · {cards.length} 页</h3>{cards.length>0&&<Button size="sm" variant="ghost" disabled={disabled} onClick={()=>onSelectionChange(selectedCardIds.length===cards.length?[]:cards.map(card=>card.cardId))}>{selectedCardIds.length===cards.length?'取消全选':'选中全部页'}</Button>}</div>
    {cards.length?<ol className="grid grid-cols-2 gap-3">{cards.map((card,position)=>{const pageImage=document.imageUses.find(item=>item.role==='card'&&item.cardId===card.cardId);return <li key={card.cardId} className={`min-w-0 rounded-lg border p-2 ${card.cardId===selectedCardId?'border-primary bg-primary/5':'border-border'}`}>
      <button type="button" aria-label={`查看第 ${position+1} 页：${card.title||'未命名'}`} aria-pressed={card.cardId===selectedCardId} onClick={()=>onSelect(card.cardId)} className="block w-full rounded-md text-left focus-visible:outline-2 focus-visible:outline-primary">
       {pageImage?<GraphicImagePreview image={pageImage}/>:<div className="flex h-36 items-center justify-center rounded-md border border-dashed border-border bg-surface-subtle text-xs text-muted-foreground">尚未出图</div>}
       <span className="mt-2 block truncate text-sm font-medium">{position+1}. {card.title||'未填写标题'}</span><span className="mt-1 line-clamp-2 block min-h-8 text-xs text-muted-foreground">{card.body||'还没有页内容'}</span>
      </button>
      <label className="mt-2 flex min-h-8 items-center gap-2 text-xs"><input type="checkbox" aria-label={`选择第 ${position+1} 页生成`} disabled={disabled} checked={selectedCardIds.includes(card.cardId)} onChange={event=>onSelectionChange(event.target.checked?[...selectedCardIds,card.cardId]:selectedCardIds.filter(id=>id!==card.cardId))}/>生成这一页</label>
     </li>;})}</ol>:<div className="rounded-lg border border-dashed border-border p-6 text-sm text-muted-foreground">还没有逐页规划。可以先写正文，让 AI 规划组图；也可以直接添加一页或使用已有照片。</div>}
    <p className="text-xs text-muted-foreground">按页序阅读，检查文字、画面和前后衔接。统一参考能帮助保持风格，仍需逐页核对实际图片。</p>
   </div>
   <div className="min-w-0 space-y-4">
    {selected&&<fieldset disabled={disabled} aria-label="选中页" className="space-y-3 rounded-xl border border-border bg-surface p-4">
     <div className="flex flex-wrap items-center justify-between gap-2"><h3 className="font-medium">第 {index+1} 页</h3><div className="flex gap-1"><Button size="sm" variant="ghost" aria-label={`图卡${index+1}上移`} disabled={disabled||index===0} onClick={()=>onChange(moveGraphicPage(document,selected.cardId,-1))}>前移</Button><Button size="sm" variant="ghost" aria-label={`图卡${index+1}下移`} disabled={disabled||index===cards.length-1} onClick={()=>onChange(moveGraphicPage(document,selected.cardId,1))}>后移</Button><Button size="sm" variant="ghost" onClick={()=>setDeleteOpen(true)}>删除这一页</Button></div></div>
     <label className="block text-sm">页标题<input aria-label={`图卡${index+1}标题`} value={selected.title} onChange={event=>edit({title:event.target.value})} className="mt-1 h-10 w-full rounded-md border border-border bg-background px-3"/></label>
     <label className="block text-sm">页内容<textarea aria-label={`图卡${index+1}正文`} value={selected.body} onChange={event=>edit({body:event.target.value})} rows={4} className="mt-1 w-full rounded-md border border-border bg-background p-3"/></label>
     <details><summary className="cursor-pointer text-sm text-muted-foreground">这页的画面想法，可选</summary><textarea aria-label="这一页的画面想法" value={selected.visualBrief??''} onChange={event=>edit({visualBrief:event.target.value})} rows={3} className="mt-2 w-full rounded-md border border-border bg-background p-3 text-sm"/></details>
     {image&&<GraphicImagePreview image={image} large/>}
     <div className="flex flex-wrap gap-2"><Button size="sm" variant="outline" onClick={()=>onOpenCanvas(selected.cardId)}>进入画布制作这一页</Button>{image&&<><Button size="sm" variant="outline" onClick={()=>onChange(setGraphicCover(document,image))}>用这页作封面</Button><Button size="sm" variant="outline" onClick={()=>onChange({...document,seriesProfile:{visualDirection:document.seriesProfile?.visualDirection??'',aspectRatio:document.seriesProfile?.aspectRatio??'',referenceImage:{assetId:image.assetId,assetFileId:image.assetFileId}}})}>设为统一参考</Button></>}<Button size="sm" variant="ghost" onClick={()=>onOpenDesign(selected.cardId)}>快图细调</Button></div>
     <div className="flex gap-2"><select aria-label="选择这一页的已有图片" value={assetId} onChange={event=>setAssetId(event.target.value)} className="min-w-0 flex-1 rounded-md border border-border bg-background p-2 text-sm"><option value="">选择已有图片</option>{assets.map(asset=><option key={asset.id} value={asset.id}>{asset.name}</option>)}</select><Button size="sm" variant="outline" disabled={!selectedAsset} onClick={()=>{if(selectedAsset?.currentFileId)onChange(replaceGraphicPageImage(document,selected.cardId,{assetId:selectedAsset.id,assetFileId:selectedAsset.currentFileId}));setAssetId('');}}>使用到这一页</Button></div>
     <Link href="/assets" className="inline-flex min-h-8 items-center text-xs text-primary hover:underline">上传图片素材 →</Link>
    </fieldset>}
    {children}
   </div>
  </div>
  <details className="rounded-xl border border-border bg-surface p-4"><summary className="cursor-pointer text-sm font-medium">统一方向与参考，可选</summary>
   <div className="mt-3 space-y-3"><label className="block text-sm">这组图的视觉方向<textarea aria-label="统一视觉方向" disabled={disabled} value={document.seriesProfile?.visualDirection??''} onChange={event=>onChange({...document,seriesProfile:{...document.seriesProfile,visualDirection:event.target.value,aspectRatio:document.seriesProfile?.aspectRatio??''}})} rows={3} className="mt-1 w-full rounded-md border border-border bg-background p-3" placeholder="描述你希望整组保持的画面、人物或色彩"/></label>
    <label className="block text-sm">画幅比例<input aria-label="组图画幅比例" disabled={disabled} value={document.seriesProfile?.aspectRatio??''} onChange={event=>onChange({...document,seriesProfile:{...document.seriesProfile,visualDirection:document.seriesProfile?.visualDirection??'',aspectRatio:event.target.value}})} className="ml-2 h-10 rounded-md border border-border bg-background px-3" placeholder="留空使用模型默认值"/></label>
    {document.seriesProfile?.referenceImage&&<div className="flex items-start gap-3"><div className="w-32"><GraphicImagePreview image={document.seriesProfile.referenceImage}/></div><div className="space-y-2"><p className="text-xs text-muted-foreground">固定使用这张图片的精确文件版本。</p><Button size="sm" variant="ghost" disabled={disabled} onClick={()=>{const profile=document.seriesProfile!;onChange({...document,seriesProfile:{visualDirection:profile.visualDirection,aspectRatio:profile.aspectRatio}});}}>取消统一参考</Button></div></div>}
   </div>
  </details>
  <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}><DialogContent><DialogHeader><DialogTitle>删除这一页？</DialogTitle></DialogHeader><p className="text-sm text-muted-foreground">会移除这页规划、绑定的作品图片和快图设计。素材库和已保存历史仍保留，封面用途也保留。</p><div className="flex flex-wrap gap-2"><Button variant="outline" onClick={()=>setDeleteOpen(false)}>取消删除</Button><Button disabled={disabled} onClick={()=>{if(selected)onChange(deleteGraphicPage(document,selected.cardId));setDeleteOpen(false);}}>删除页和绑定图片</Button></div></DialogContent></Dialog>
 </section>;
}

"use client";
import type {GraphicPostDocument} from "@creatoros/contract";
import {LazyDisclosure} from "@/features/reference-editors/noterelay/lazy-disclosure";
import {Button} from "@/components/ui/button";
import {GraphicImagePreview} from "./graphic-series-panel";
import {graphicDeliveryImages} from "./graphic-series-document";

export function GraphicImagePages({document,selectedCardIds,onSelectionChange,onChange,disabled=false}:{
 document:GraphicPostDocument;selectedCardIds:string[];onSelectionChange:(ids:string[])=>void;
 onChange:(document:GraphicPostDocument)=>void;disabled?:boolean;
}){
 const cards=document.cardBriefs??[];
 const otherImages=graphicDeliveryImages(document).filter(image=>image.role!=='card'||!cards.some(card=>card.cardId===image.cardId));
 return <section aria-label="小红书图片" className="space-y-4 rounded-xl border border-border bg-surface p-4">
  <div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="font-semibold">小红书图片 · {cards.length} 页</h2><p className="mt-1 text-sm text-muted-foreground">根据每页内容用 AI 生成图片，预览后采用。可以只重做选中的页。</p></div>
   {cards.length>0&&<Button variant="outline" disabled={disabled} onClick={()=>onSelectionChange(selectedCardIds.length===cards.length?[]:cards.map(card=>card.cardId))}>{selectedCardIds.length===cards.length?'取消全选':'选择全部页'}</Button>}
  </div>
  {!cards.length&&<p className="text-sm text-muted-foreground">先点击“重新组织内容”，让 AI 整理小红书配文和每页画面，采用规划后即可生成图片。</p>}
  <LazyDisclosure label="整组画面设置">{()=> <div className="mt-3 space-y-3">
    <label className="block text-sm">统一视觉方向<textarea aria-label="统一视觉方向" disabled={disabled} value={document.seriesProfile?.visualDirection??''} rows={3} placeholder="描述整组要保持的人物、场景、色彩与画风" className="mt-1 w-full rounded-md border border-border bg-background p-2" onChange={event=>onChange({...document,seriesProfile:{...document.seriesProfile,visualDirection:event.target.value,aspectRatio:document.seriesProfile?.aspectRatio??''}})}/></label>
    <label className="block text-sm">画幅比例<select aria-label="组图画幅比例" disabled={disabled} value={document.seriesProfile?.aspectRatio??''} className="mt-1 block min-h-11 w-full rounded-md border border-border bg-background px-3 sm:w-auto" onChange={event=>onChange({...document,seriesProfile:{...document.seriesProfile,visualDirection:document.seriesProfile?.visualDirection??'',aspectRatio:event.target.value}})}>
     <option value="">使用模型默认比例</option><option value="3:4">3:4 · 竖版</option><option value="2:3">2:3 · 竖版</option><option value="9:16">9:16 · 竖屏</option><option value="1:1">1:1 · 方图</option><option value="4:3">4:3 · 横版</option><option value="16:9">16:9 · 横屏</option>
     {document.seriesProfile?.aspectRatio&&!['3:4','2:3','9:16','1:1','4:3','16:9'].includes(document.seriesProfile.aspectRatio)&&<option value={document.seriesProfile.aspectRatio}>{document.seriesProfile.aspectRatio} · 已保存</option>}
    </select></label>
    <p className="text-xs text-muted-foreground">设置会先保存，再用于生成所选页；已采用的图片保持原样。模型支持的尺寸可能与所选比例不同，请在采用前核对实际画面。</p>
    {document.seriesProfile?.referenceImage&&<div className="space-y-2"><p className="text-sm">统一参考图</p><div className="max-w-40"><GraphicImagePreview image={document.seriesProfile.referenceImage}/></div><Button variant="outline" disabled={disabled} onClick={()=>{const {referenceImage:_reference,...profile}=document.seriesProfile!;onChange({...document,seriesProfile:profile});}}>取消统一参考</Button><p className="text-xs text-muted-foreground">使用这张图片的固定版本帮助保持风格，仍需逐页检查人物和场景。</p></div>}
   </div>}</LazyDisclosure>
  <ol className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{cards.map((card,index)=>{
   const image=document.imageUses.find(item=>item.role==='card'&&item.cardId===card.cardId);
   return <li key={card.cardId} className="min-w-0 space-y-3 rounded-lg border border-border p-3">
    <h3 className="font-medium">{index+1}. {card.title||'未命名页'}</h3>
    {image?<GraphicImagePreview image={image} large/>:<div className="flex aspect-[3/4] items-center justify-center rounded-md border border-dashed border-border bg-surface-subtle text-sm text-muted-foreground">尚未生成图片</div>}
    <p className="whitespace-pre-wrap break-words text-sm text-muted-foreground">{card.body}</p>
    {image&&<Button variant="outline" disabled={disabled} aria-label={`以第 ${index+1} 页作为统一参考`} onClick={()=>onChange({...document,seriesProfile:{...document.seriesProfile,visualDirection:document.seriesProfile?.visualDirection??'',aspectRatio:document.seriesProfile?.aspectRatio??'',referenceImage:{assetId:image.assetId,assetFileId:image.assetFileId}}})}>用作整组参考</Button>}
    <details><summary className="cursor-pointer text-sm text-muted-foreground">调整这页画面</summary><label className="mt-2 block text-sm">画面想法<textarea aria-label={`第 ${index+1} 页画面想法`} disabled={disabled} value={card.visualBrief??''} placeholder="留空时由 AI 根据这一页内容构思画面" rows={3} className="mt-1 w-full rounded-md border border-border bg-background p-2" onChange={event=>onChange({...document,cardBriefs:cards.map(item=>item.cardId===card.cardId?{...item,visualBrief:event.target.value}:item)})}/></label></details>
    <label className="flex min-h-9 items-center gap-2 text-sm"><input type="checkbox" aria-label={`选择第 ${index+1} 页生成`} disabled={disabled} checked={selectedCardIds.includes(card.cardId)} onChange={event=>onSelectionChange(event.target.checked?[...selectedCardIds,card.cardId]:selectedCardIds.filter(id=>id!==card.cardId))}/>{image?'重新生成这一页':'生成这一页'}</label>
   </li>;
  })}</ol>
  {otherImages.length>0&&<div className="space-y-3"><h3 className="text-sm font-medium">已有图片</h3><div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{otherImages.map((image,index)=><GraphicImagePreview key={`${image.assetFileId}:${index}`} image={image} large/>)}</div></div>}
 </section>;
}

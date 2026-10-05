"use client";
import * as React from "react";
import type {GraphicPostCardBrief} from "@creatoros/contract";
import {Button} from "@/components/ui/button";

export function GraphicCardBriefEditor({cards,onChange,disabled}:{cards:GraphicPostCardBrief[];
 onChange:(cards:GraphicPostCardBrief[])=>void;disabled:boolean}){
 function edit(cardId:string,patch:Partial<Pick<GraphicPostCardBrief,"title"|"body">>){
  onChange(cards.map(card=>card.cardId===cardId?{...card,...patch}:card));
 }
 function move(index:number,step:number){
  const target=index+step;if(target<0||target>=cards.length)return;
  const next=[...cards];[next[index],next[target]]=[next[target]!,next[index]!];onChange(next);
 }
 return <section aria-label="图卡文字" className="space-y-4 rounded-xl border border-border bg-surface p-5">
  <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="font-semibold">图卡文字</h2>
   <p className="mt-1 text-sm text-muted-foreground">先保存每页文字。图片可以稍后补充。</p></div>
   <Button variant="outline" disabled={disabled} onClick={()=>onChange([...cards,{cardId:crypto.randomUUID(),title:"",body:"",sourceRefs:[]}])}>添加图卡文字</Button></div>
  {cards.length?<ol className="space-y-4">{cards.map((card,index)=><li key={card.cardId} className="space-y-3 rounded-lg border border-border p-3">
   <label className="block text-sm">第 {index+1} 页标题<input aria-label={`图卡${index+1}标题`} disabled={disabled} value={card.title}
    onChange={event=>edit(card.cardId,{title:event.target.value})} className="mt-2 h-10 w-full rounded-md border border-border bg-background px-3"/></label>
   <label className="block text-sm">第 {index+1} 页正文<textarea aria-label={`图卡${index+1}正文`} disabled={disabled} value={card.body}
    onChange={event=>edit(card.cardId,{body:event.target.value})} rows={4} className="mt-2 w-full rounded-md border border-border bg-background p-3"/></label>
   <div className="flex flex-wrap gap-2"><Button size="sm" variant="outline" aria-label={`图卡${index+1}上移`} disabled={disabled||index===0} onClick={()=>move(index,-1)}>上移</Button>
    <Button size="sm" variant="outline" aria-label={`图卡${index+1}下移`} disabled={disabled||index===cards.length-1} onClick={()=>move(index,1)}>下移</Button>
    <Button size="sm" variant="ghost" aria-label={`移除图卡${index+1}文字`} disabled={disabled} onClick={()=>onChange(cards.filter(item=>item.cardId!==card.cardId))}>移除文字</Button></div>
  </li>)}</ol>:<p className="text-sm text-muted-foreground">暂无图卡文字，可逐页添加。</p>}
 </section>;
}

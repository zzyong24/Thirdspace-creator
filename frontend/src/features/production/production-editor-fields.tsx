"use client";
import {AssetPicker} from "@/components/media/asset-picker";
import {mediaIdentity} from "@/components/media/asset-picker.types";
import {videoCardMotion,videoRenderBroll,videoRenderTone} from "@creatoros/contract";
import type {DraftItem,DraftPlan} from "./production-editor-draft";
import {readDraftItem} from "./production-editor-draft";

const label="grid gap-1 text-xs text-muted-foreground",input="w-full rounded-md border bg-background px-2 py-1.5 text-sm text-foreground";
function Field({name,value,onCommit,numeric=false}:{name:string;value:unknown;onCommit:(v:string|number)=>void;numeric?:boolean}) {
  return <label className={label}>{name}<input key={JSON.stringify(value)} aria-label={name} className={input} type={numeric?"number":"text"} step={numeric?"0.1":undefined} defaultValue={String(value??"")} onBlur={e=>{const v=numeric?Number(e.currentTarget.value):e.currentTarget.value;if(v!==value)onCommit(v);}}/></label>;
}
function Text({name,value,onCommit}:{name:string;value:string;onCommit:(v:string)=>void}) {
  return <label className={label}>{name}<textarea key={value} aria-label={name} className={input} rows={3} defaultValue={value} onBlur={e=>{if(e.currentTarget.value!==value)onCommit(e.currentTarget.value);}}/></label>;
}
export function ProductionEditorFields({plan,item,patch,remove,materials,onSceneTitle}:{plan:DraftPlan;item:DraftItem;patch:(p:Record<string,unknown>)=>void;remove:()=>void;materials:Array<{id:string;name:string;assetType:string}>;onSceneTitle:(sceneId:string,title:string)=>void}) {
 const raw=readDraftItem(plan,item.id) as unknown as Record<string,unknown>|undefined;
 if(!raw)return <p>请重新选择片段</p>;
 return <ProductionEditableItemFields raw={raw} kind={item.kind} patch={patch} remove={remove} materials={materials} sceneTitle={item.sceneId?plan.renderProps.scenes.find(scene=>scene.id===item.sceneId)?.title:undefined} onSceneTitle={item.sceneId?title=>onSceneTitle(item.sceneId!,title):undefined}/>;
}
/** 仅编辑用户明确选中的项；v2 直接传当前项，素材文件留给原精确采用入口。 */
export function ProductionEditableItemFields({raw,kind,patch,remove,materials,sceneTitle,onSceneTitle,skipTime=false}:{raw:Record<string,unknown>;kind:"caption"|"broll"|"card";patch:(p:Record<string,unknown>)=>void;remove:()=>void;materials?:Array<{id:string;name:string;assetType:string}>;sceneTitle?:string;onSceneTitle?:(title:string)=>void;skipTime?:boolean}) {
  const select=(name:string,field:string,values:ReadonlyArray<string>)=><label className={label}>{name}<select aria-label={name} className={input} value={String(raw[field]??"")} onChange={e=>patch({[field]:e.target.value||undefined})}><option value="">沿用默认</option>{values.map(v=><option key={v} value={v}>{({bar:"对比条",counter:"数字递增",metaphor:"视觉隐喻",strike:"划线",reveal:"依次出现",plain:"基础进场",accent:"强调",green:"绿色",amber:"暖色",muted:"低调",danger:"警示"} as Record<string,string>)[v]??v}</option>)}</select></label>;
  const field=(name:string,key:string,numeric=false)=><Field name={name} value={raw[key]} numeric={numeric} onCommit={v=>patch({[key]:v})}/>;
  const choices=materials?.filter(m=>raw.kind!=="image"||m.assetType==="image").map(m=>({choiceKey:m.id,value:m,identity:mediaIdentity({...m,currentFileId:(m as {currentFileId?:string}).currentFileId??null}),name:m.name,assetType:m.assetType as "image"|"video"|"audio"}))??[];
  const file=materials?<AssetPicker ownerKey={String(raw.id??"legacy-item")} label="替换素材" source={{kind:"bounded",key:"legacy-project-materials",label:"当前项目素材",allowedTypes:raw.kind==="image"?["image"]:["image","video","audio"],items:choices,completeness:"complete"}} value={choices.find(choice=>choice.value.id===raw.file)??(raw.file?{choiceKey:String(raw.file),value:{id:String(raw.file),name:"当前素材",assetType:"image"},name:"当前素材",identity:null}:null)} onConfirm={choice=>patch({file:choice.value.id})}/>:<p className="text-xs text-muted-foreground">图片和视频文件请在作品组合的材料区选择、替换或解除；此处修改已采用画面的文字与位置。</p>;
  return <div className="grid gap-3">
    <h3 className="text-sm font-medium">{kind==="caption"?"字幕":kind==="broll"?"素材片段":"画面卡片"}</h3>
    {kind==="caption"?<><Text name="中文字幕" value={String(raw.cn)} onCommit={cn=>patch({cn})}/><Text name="英文字幕" value={String(raw.en??"")} onCommit={en=>patch({en:en||null})}/>{!skipTime&&<>{field("开始时间（秒）","start",true)}{field("结束时间（秒）","end",true)}</>}</>:<>
      {!skipTime&&field("出现时间（秒）","at",true)}
      {kind==="broll"?<>{!skipTime&&field("持续时间（秒）","durationSec",true)}{field("素材说明","label")}{file}{select("素材动效","motion",videoRenderBroll.shape.motion.unwrap().options)}</>:<>
        {raw.kind==="stat"?<>{field("显示数字／文字","value")}{field("单位","unit")}{field("说明","label")}<label className="text-sm"><input type="checkbox" checked={Boolean(raw.strike)} onChange={e=>patch({strike:e.target.checked})}/> 划掉数值</label></>:null}
        {raw.kind==="quote"?<Text name="原句" value={String(raw.text)} onCommit={text=>patch({text})}/>:null}
        {raw.kind==="list"?<>{field("列表标题","title")}<Text name="列表内容（每行一项）" value={(raw.items as Array<{text:string}>).map(i=>i.text).join("\n")} onCommit={text=>patch({items:text.split("\n").map((t,i)=>({...((raw.items as unknown[])[i] as object??{}),text:t}))})}/></>:null}
        {raw.kind==="compare"?(["left","right"] as const).map(side=>{const data=raw[side] as {title:string;items:string[];tone:string};return <div key={side} className="grid gap-2"><Field name={`${side==="left"?"左":"右"}侧标题`} value={data.title} onCommit={title=>patch({[side]:{...data,title}})}/><Text name={`${side==="left"?"左":"右"}侧内容（每行一项）`} value={data.items.join("\n")} onCommit={text=>patch({[side]:{...data,items:text.split("\n")}})}/><label className={label}>{side==="left"?"左":"右"}侧色调<select className={input} value={data.tone} onChange={e=>patch({[side]:{...data,tone:e.target.value}})}>{videoRenderTone.options.map(v=><option key={v} value={v}>{({muted:"低调",accent:"强调",green:"绿色",amber:"暖色",danger:"警示"} as Record<string,string>)[v]??v}</option>)}</select></label></div>}):null}
        {raw.kind==="code"?<><Text name="代码／命令" value={String(raw.code)} onCommit={code=>patch({code})}/>{field("代码说明","label")}</>:null}
        {raw.kind==="image"?<>{field("图片说明","label")}{file}</>:null}
        {"tone" in raw?select("卡片色调","tone",videoRenderTone.options):null}{select("卡片动效","motion",videoCardMotion.options)}
        {sceneTitle!==undefined&&onSceneTitle?<Field name="所属分场标题" value={sceneTitle} onCommit={title=>onSceneTitle(String(title))}/>:null}
      </>}
    </>}
    <button type="button" className="rounded-md border px-3 py-2 text-sm text-destructive" onClick={remove}>移除这个片段</button>
  </div>;
}

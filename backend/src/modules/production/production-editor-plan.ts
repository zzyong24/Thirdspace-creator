import { createHash, randomUUID } from "node:crypto";
import {
  productionEditorEdit, videoRenderProps,
  type ProductionEditorEdit, type VideoRenderProps, type VideoRenderCard, type VideoRenderCaption, type VideoRenderBroll,
} from "@creatoros/contract";
import { ConflictError } from "./production.errors";

type Extra = Record<string, unknown>;
type Caption = VideoRenderCaption & {id:string} & Extra;
type Card = VideoRenderCard & {id:string} & Extra;
type Broll = VideoRenderBroll & {id:string} & Extra;
type Scene = Omit<VideoRenderProps["scenes"][number],"cards"> & {cards:Card[]} & Extra;
export type EditorProps = Omit<VideoRenderProps,"scenes"|"captions"|"broll"|"meta"> & {
  scenes:Scene[]; captions:Caption[]; broll:Broll[]; meta:VideoRenderProps["meta"] & Extra;
} & Extra;
export type EditorPlan = Extra & {editorVersion:1; renderProps:EditorProps};

function object(value:unknown):value is Extra {return !!value && typeof value === "object" && !Array.isArray(value);}

// SEMANTIC_BOUNDARY_ALLOW: 只规范 JSON 键序做精确前值/幂等摘要，不比较文本语义。
function canonical(value:unknown):string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (object(value)) return `{${Object.keys(value).sort().filter(k=>value[k]!==undefined).map(k=>`${JSON.stringify(k)}:${canonical(value[k])}`).join(",")}}`;
  const result=JSON.stringify(value);
  if(result===undefined || (typeof value==="number" && !Number.isFinite(value))) throw new ConflictError("方案包含不可保存的值");
  return result;
}
export function itemDigest(item:unknown):string {return `sha256:${createHash("sha256").update(canonical(item)).digest("hex")}`;}

// SEMANTIC_BOUNDARY_ALLOW: 按同一结构补契约默认值，保留未知键，不做创作或素材选择。
function withDefaults(raw:unknown, parsed:unknown):unknown {
  if(Array.isArray(parsed)) return parsed.map((v,i)=>withDefaults(Array.isArray(raw)?raw[i]:undefined,v));
  if(object(parsed)) return Object.fromEntries([...Object.entries(object(raw)?raw:{}),...Object.entries(parsed).map(([k,v])=>[k,withDefaults(object(raw)?raw[k]:undefined,v)])]);
  return parsed;
}
function items(props:EditorProps):Array<{kind:"scene"|"card"|"caption"|"broll"; item:Extra & {id:string}; container?:Array<Extra>}> {
  return [
    ...props.scenes.flatMap(scene=>[{kind:"scene" as const,item:scene},...scene.cards.map(item=>({kind:"card" as const,item,container:scene.cards}))]),
    ...props.captions.map(item=>({kind:"caption" as const,item,container:props.captions})),
    ...props.broll.map(item=>({kind:"broll" as const,item,container:props.broll})),
  ];
}
function validateTimes(props:EditorProps, previous:EditorProps) {
  const duration=props.talkingHead.durationSec;
  const captions=new Map(previous.captions.map(item=>[item.id,item]));
  const broll=new Map(previous.broll.map(item=>[item.id,item]));
  // SEMANTIC_BOUNDARY_ALLOW: 只约束本次新增/改时间的片段；旧合法尾部由原渲染器裁到片长，
  // 不能因用户只改别处文字而新增整单拒绝。此处不选择画面或创作内容。
  if(props.captions.some(c=>{
    const old=captions.get(c.id);return (!old || old.start!==c.start || old.end!==c.end) && c.end>duration+0.05;
  })) throw new ConflictError("字幕超出视频时长，请调整结束时间");
  if(props.broll.some(b=>{
    const old=broll.get(b.id);return (!old || old.at!==b.at || old.durationSec!==b.durationSec) && b.durationSec!==undefined && b.at+b.durationSec>duration+1e-6;
  })) throw new ConflictError("素材超出视频时长，请缩短或移动片段");
}

/** 仅供明确保存调用；读取路径不得调用此函数后落库。 */
export function prepareEditorPlan(raw:unknown, nextId:()=>string = ()=>`item-${randomUUID()}`):EditorPlan {
  if(!object(raw) || !object(raw.renderProps)) throw new ConflictError("当前方案缺少可编辑画面数据");
  const copied=structuredClone(raw);
  const parsed=videoRenderProps.parse(copied.renderProps);
  const plan={...copied,editorVersion:1,renderProps:withDefaults(copied.renderProps,parsed)} as EditorPlan;
  const seen=new Set<string>();
  for(const {item} of items(plan.renderProps)) {
    if(typeof item.id!=="string" || !item.id || seen.has(item.id)) {
      if(raw.editorVersion===1) throw new ConflictError("方案片段身份缺失或重复，请重新读取方案");
      let candidate="";
      for(let n=0;n<8 && (!candidate || seen.has(candidate));n++) candidate=nextId();
      if(!candidate || seen.has(candidate)) throw new ConflictError("无法分配唯一片段身份");
      item.id=candidate;
    }
    seen.add(item.id);
  }
  return plan;
}

/** 返回新候选；无数据库/任务副作用。服务保存前仍需真实归属与 CAS 校验。 */
export function applyEditorEdits(raw:EditorPlan, input:ProductionEditorEdit[], nextId:()=>string = ()=>`item-${randomUUID()}`):EditorPlan {
  if(raw.editorVersion!==1) throw new ConflictError("请先保存旧方案，再编辑片段");
  const plan=prepareEditorPlan(raw), edits=input.map(edit=>productionEditorEdit.parse(edit));
  const byId=new Map(items(plan.renderProps).map(entry=>[entry.item.id,entry]));
  const touched=new Set<string>();
  // 全批前值先核对，失败不改任何输入对象。
  for(const edit of edits) {
    if(edit.type==="addBroll") continue;
    const target=byId.get(edit.itemId);
    if(!target || itemDigest(target.item)!==edit.expectedItemDigest || touched.has(edit.itemId)) throw new ConflictError("选中片段已变化，请重新读取后应用");
    touched.add(edit.itemId);
    const expected=edit.type==="updateCaption"?"caption":edit.type==="updateCard"?"card":edit.type==="updateBroll"?"broll":edit.type==="updateSceneTitle"?"scene":undefined;
    if((expected && target.kind!==expected) || (edit.type==="removeItem" && target.kind==="scene")) throw new ConflictError("修改类型与所选片段不符");
  }
  for(const edit of edits) {
    if(edit.type==="addBroll") {
      const id=edit.broll.id ?? nextId();
      if(!id || byId.has(id)) throw new ConflictError("新增片段身份重复");
      const item={...structuredClone(edit.broll),id};plan.renderProps.broll.push(item);byId.set(id,{kind:"broll",item,container:plan.renderProps.broll});continue;
    }
    const target=byId.get(edit.itemId)!;
    if(edit.type==="removeItem") {target.container!.splice(target.container!.indexOf(target.item),1);continue;}
    if(edit.type==="updateSceneTitle") {target.item.title=edit.title;continue;}
    if(edit.type==="updateCard") {
      if(edit.card.id && edit.card.id!==target.item.id) throw new ConflictError("不能修改片段身份");
      const merged=withDefaults(target.item,{...edit.card,id:target.item.id}) as Extra;
      Object.keys(target.item).forEach(key=>delete target.item[key]);Object.assign(target.item,merged);continue;
    }
    const patch=edit.patch;
    Object.assign(target.item,structuredClone(patch));
    if(edit.type==="updateCaption") {
      if(edit.patch.en===null) delete target.item.en;
      const cap=target.item as Caption;
      // SEMANTIC_BOUNDARY_ALLOW: 只保留仍逐字/逐时合法的已选重点，不选择新重点。
      const remaining=cap.emphasis?.filter(e=>Array.from(cap.cn).slice(e.startChar,e.endChar).join("")===e.text && e.startSec>=cap.start && e.endSec<=cap.end);
      if(remaining?.length) cap.emphasis=remaining;else delete cap.emphasis;
    }
  }
  const result=prepareEditorPlan(plan);
  validateTimes(result.renderProps, raw.renderProps);
  return result;
}

import { createHash, randomUUID } from "node:crypto";
import {
  productionLegacyEditorEdit, videoRenderProps,videoRenderDirection,
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

// SEMANTIC_BOUNDARY_ALLOW: 旧方向按原位置/真实片段 ID 重绑，移动按用户明确的时间差。
// 不推断场景意义或选素材；不兼容的可选方向降级基础模板，保留全部内容并返回说明。
function bindDirection(plan:EditorPlan, previous?:EditorProps) {
  const props=plan.renderProps, direction=props.direction;
  if(!direction) return;
  const refs=new Map<string,Array<{ref:string;at:number;duration?:number;sceneIdx:number}>>();
  const oldByRef=new Map<string,{at:number;duration?:number}>();
  props.scenes.forEach((scene,si)=>scene.cards.forEach((card,ci)=>{
    const target={ref:`card:${card.id}`,at:card.at,sceneIdx:si};
    refs.set(target.ref,[target]);if(!previous) refs.set(`card:${si}:${ci}`,[target]);
  }));
  props.broll.forEach(b=>{
    if(b.presentation==="overlay") return;
    const target={ref:`broll:${b.id}`,at:b.at,duration:b.durationSec,sceneIdx:props.scenes.findIndex(s=>b.at>=s.startSec && b.at<s.endSec)};
    refs.set(target.ref,[target]);
    if(!previous) refs.set(`broll:${b.file}`,[...(refs.get(`broll:${b.file}`)??[]),target]);
  });
  previous?.scenes.forEach(s=>s.cards.forEach(c=>oldByRef.set(`card:${c.id}`,{at:c.at})));
  previous?.broll.forEach(b=>oldByRef.set(`broll:${b.id}`,{at:b.at,duration:b.durationSec}));
  const used=new Set<string>();
  const beats=direction.beatGraph.flatMap(beat=>{
    if(beat.subject.kind==="talking_head") return [beat];
    const targets=refs.get(beat.subject.ref)??[];
    return targets.map((target,index)=>{
      used.add(target.ref);
      const old=oldByRef.get(target.ref), delta=old ? target.at-old.at : targets.length>1 ? target.at-beat.startSec : 0;
      const startSec=beat.startSec+delta;
      const endSec=(old && target.duration!==old.duration && target.duration!==undefined) || targets.length>1
        ? startSec+(target.duration??beat.endSec-beat.startSec) : beat.endSec+delta;
      return {...beat,id:index?`editor-${randomUUID().replaceAll("-","")}`:beat.id,sceneIdx:target.sceneIdx,startSec,endSec,
        subject:{...beat.subject,ref:target.ref}};
    });
  });
  // 新增素材沿用户明确位置使用无额外动效的安全基础窗。
  for(const b of props.broll) {
    const ref=`broll:${b.id}`;if(b.presentation==="overlay" || used.has(ref)) continue;
    const sceneIdx=props.scenes.findIndex(s=>b.at>=s.startSec && b.at<s.endSec);
    beats.push({id:`editor-${randomUUID().replaceAll("-","")}`,sceneIdx,startSec:b.at,
      endSec:Math.min(props.talkingHead.durationSec,b.at+(b.durationSec??((props.scenes[sceneIdx]?.endSec??props.talkingHead.durationSec)-b.at))),
      subject:{kind:"broll",ref},startState:"off_canvas",endState:"takeover",motionVerb:"hold",stageMode:"takeover",transitionIn:"cut",transitionOut:"cut",returnGeometry:"same_base"});
  }
  props.direction={...direction,beatGraph:beats.sort((a,b)=>a.startSec-b.startSec)};
  if(!videoRenderProps.safeParse(props).success) {
    delete props.direction;
    plan.compatibilityWarnings=[...(Array.isArray(plan.compatibilityWarnings)?plan.compatibilityWarnings:[]),"本次片段调整与原运动时间窗冲突，已使用基础画面布局；内容和素材均保留。"];
  }
}

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

/** 只报告未支持结构，保留原件；读取不分配 ID、补默认值或写数据库。 */
export function unsupportedEditorFields(plan:Extra|null):string[] {
  if(!plan)return [];
  // 协议字段清单只标识当前编辑器支持的结构，不选择或解释创作内容。
  const rootFields=new Set(["editorVersion","revision","renderProps","sourceTaskId","sourceRenderTaskId","confirmedAt","decisions","inventory","excludedAssetIds","compatibilityWarnings"]);
  const result=Object.keys(plan).filter(key=>!rootFields.has(key));
  if(!object(plan.renderProps))return result;
  const parsed=videoRenderProps.safeParse(plan.renderProps);
  if(!parsed.success)return [...result,"renderProps"];
  const visit=(raw:unknown,known:unknown,path:string)=>{
    if(Array.isArray(raw)&&Array.isArray(known))raw.forEach((v,i)=>visit(v,known[i],`${path}.${i}`));
    else if(object(raw)&&object(known))for(const [key,value] of Object.entries(raw)) {
      if(!(key in known))result.push(`${path}.${key}`);else visit(value,known[key],`${path}.${key}`);
    }
  };
  visit(plan.renderProps,parsed.data,"renderProps");return result;
}

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
export function validateEditorChanges(next:EditorPlan,previous:EditorPlan|null) {
  validateTimes(next.renderProps,previous?.renderProps??{...next.renderProps,captions:[],broll:[]});
}

/** 仅供明确保存调用；读取路径不得调用此函数后落库。 */
export function prepareEditorPlan(raw:unknown, nextId:()=>string = ()=>`item-${randomUUID()}`,previous?:EditorProps):EditorPlan {
  if(!object(raw) || !object(raw.renderProps)) throw new ConflictError("当前方案缺少可编辑画面数据");
  const copied={...structuredClone(raw),renderProps:structuredClone(raw.renderProps)};
  const direction=previous?copied.renderProps.direction:undefined;
  if(previous) {
    delete copied.renderProps.direction;
    if(direction!==undefined)videoRenderDirection.parse(direction);
    // 完整手工保存也只清理原有且已失效的字幕重点。
    if(Array.isArray(copied.renderProps.captions))for(const value of copied.renderProps.captions) {
      if(!object(value) || !Array.isArray(value.emphasis) || typeof value.cn!=="string")continue;
      const prior=previous.captions.find(c=>c.id===value.id);
      if(!prior || (prior.cn===value.cn && prior.start===value.start && prior.end===value.end))continue;
      const remaining=value.emphasis.filter(e=>object(e) && Array.from(value.cn as string).slice(Number(e.startChar),Number(e.endChar)).join("")===e.text && Number(e.startSec)>=Number(value.start) && Number(e.endSec)<=Number(value.end));
      if(remaining.length)value.emphasis=remaining;else delete value.emphasis;
    }
  }
  const parsed=videoRenderProps.parse(copied.renderProps);
  const plan={...copied,editorVersion:1,renderProps:withDefaults(copied.renderProps,parsed)} as EditorPlan;
  if(direction!==undefined)plan.renderProps.direction=structuredClone(direction) as VideoRenderProps["direction"];
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
  if(raw.editorVersion!==1 || previous) bindDirection(plan,previous);
  videoRenderProps.parse(plan.renderProps);
  return plan;
}

/** 返回新候选；无数据库/任务副作用。服务保存前仍需真实归属与 CAS 校验。 */
export function applyEditorEdits(raw:EditorPlan, input:ProductionEditorEdit[], nextId:()=>string = ()=>`item-${randomUUID()}`):EditorPlan {
  if(raw.editorVersion!==1) throw new ConflictError("请先保存旧方案，再编辑片段");
  const plan=prepareEditorPlan(raw), edits=input.map(edit=>productionLegacyEditorEdit.parse(edit));
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
  bindDirection(plan,raw.renderProps);
  const result=prepareEditorPlan(plan);
  validateTimes(result.renderProps, raw.renderProps);
  return result;
}

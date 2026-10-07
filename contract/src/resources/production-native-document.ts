import {z} from 'zod';

/** 固定 OpenCut cf5e79e v31；纯合同可逐字节复制到原生源码。仅供新增编导候选。 */
export const NATIVE_DOCUMENT_VERSION=31;
export const NATIVE_SOURCE_REVISION='cf5e79e919144200294fb9fed22a222592a0aeea';
export const NATIVE_TICKS_PER_SECOND=120000;
export const nativeTick=z.number().int().min(0).max(Number.MAX_SAFE_INTEGER);
const signedTick=z.number().int().min(-Number.MAX_SAFE_INTEGER).max(Number.MAX_SAFE_INTEGER);
const id=z.string().min(1);
export const productionNativeParams=z.record(z.string(),z.union([z.number().finite(),z.string(),z.boolean()]));
const handle=z.looseObject({dt:signedTick,dv:z.number().finite()});
const scalarKey=z.looseObject({id,time:nativeTick,value:z.number().finite(),segmentToNext:z.enum(['step','linear','bezier']),tangentMode:z.enum(['auto','aligned','broken','flat']),leftHandle:handle.optional(),rightHandle:handle.optional()});
const discreteKey=z.looseObject({id,time:nativeTick,value:z.union([z.string(),z.boolean()])});
const scalarChannel=z.looseObject({keys:z.array(scalarKey),extrapolation:z.object({before:z.enum(['hold','linear']),after:z.enum(['hold','linear'])}).strict().optional()});
const discreteChannel=z.looseObject({keys:z.array(discreteKey)});
const channel=z.union([scalarChannel,discreteChannel]);
export const productionNativeAnimations=z.record(z.string(),z.union([channel,z.record(z.string(),channel.optional())]).optional());
export const productionNativeEffect=z.looseObject({id,type:id,params:productionNativeParams,enabled:z.boolean()});
const maskBase={feather:z.number().finite(),inverted:z.boolean(),strokeColor:z.string(),strokeWidth:z.number().finite(),strokeAlign:z.enum(['inside','center','outside'])};
const rect={...maskBase,centerX:z.number().finite(),centerY:z.number().finite(),width:z.number().finite(),height:z.number().finite(),rotation:z.number().finite(),scale:z.number().finite()};
const point=z.looseObject({id,x:z.number().finite(),y:z.number().finite(),inX:z.number().finite(),inY:z.number().finite(),outX:z.number().finite(),outY:z.number().finite()});
export const productionNativeMask=z.discriminatedUnion('type',[
 z.looseObject({id,type:z.literal('split'),params:z.looseObject({...maskBase,centerX:z.number().finite(),centerY:z.number().finite(),rotation:z.number().finite()})}),
 ...(['cinematic-bars','rectangle','ellipse','heart','diamond','star'] as const).map(type=>z.looseObject({id,type:z.literal(type),params:z.looseObject(rect)})),
 z.looseObject({id,type:z.literal('text'),params:z.looseObject({...maskBase,content:z.string(),fontSize:z.number().finite(),fontFamily:z.string(),fontWeight:z.enum(['normal','bold']),fontStyle:z.enum(['normal','italic']),textDecoration:z.enum(['none','underline','line-through']),letterSpacing:z.number().finite(),lineHeight:z.number().finite(),centerX:z.number().finite(),centerY:z.number().finite(),rotation:z.number().finite(),scale:z.number().finite()})}),
 z.looseObject({id,type:z.literal('freeform'),params:z.looseObject({...maskBase,path:z.array(point),closed:z.boolean(),centerX:z.number().finite(),centerY:z.number().finite(),rotation:z.number().finite(),scale:z.number().finite()})}),
]);
export const productionNativeRetime=z.object({rate:z.number().finite().min(0.01).max(5),maintainPitch:z.boolean().optional()}).strict();
const base={id,name:z.string(),startTime:nativeTick,duration:nativeTick.refine(v=>v>0),trimStart:nativeTick,trimEnd:nativeTick,sourceDuration:nativeTick.optional(),params:z.record(z.string(),z.json()),animations:productionNativeAnimations.optional()};
const visual={hidden:z.boolean().optional(),effects:z.array(z.union([productionNativeEffect,z.record(z.string(),z.json())])).optional()};
const video=z.looseObject({...base,...visual,type:z.literal('video'),mediaId:id,isSourceAudioEnabled:z.boolean().optional(),retime:productionNativeRetime.optional(),masks:z.array(z.union([productionNativeMask,z.record(z.string(),z.json())])).optional()});
const image=z.looseObject({...base,...visual,type:z.literal('image'),mediaId:id,masks:z.array(z.union([productionNativeMask,z.record(z.string(),z.json())])).optional()});
const text=z.looseObject({...base,...visual,type:z.literal('text')});
const uploadAudio=z.looseObject({...base,type:z.literal('audio'),sourceType:z.literal('upload'),mediaId:id,retime:productionNativeRetime.optional()});
const libraryAudio=z.looseObject({...base,type:z.literal('audio'),sourceType:z.literal('library'),sourceUrl:id,retime:productionNativeRetime.optional()});
const sticker=z.looseObject({...base,...visual,type:z.literal('sticker'),stickerId:id,intrinsicWidth:z.number().positive().optional(),intrinsicHeight:z.number().positive().optional()});
const graphic=z.looseObject({...base,...visual,type:z.literal('graphic'),definitionId:id,masks:z.array(z.union([productionNativeMask,z.record(z.string(),z.json())])).optional()});
const effect=z.looseObject({...base,type:z.literal('effect'),effectType:id});
export const productionNativeElement=z.union([video,image,text,uploadAudio,libraryAudio,sticker,graphic,effect]);
const trackBase={id,name:z.string()};
export const productionNativeVideoTrack=z.looseObject({...trackBase,type:z.literal('video'),muted:z.boolean(),hidden:z.boolean(),elements:z.array(z.union([video,image]))});
export const productionNativeTextTrack=z.looseObject({...trackBase,type:z.literal('text'),hidden:z.boolean(),elements:z.array(text)});
export const productionNativeAudioTrack=z.looseObject({...trackBase,type:z.literal('audio'),muted:z.boolean(),elements:z.array(z.union([uploadAudio,libraryAudio]))});
const graphicTrack=z.looseObject({...trackBase,type:z.literal('graphic'),hidden:z.boolean(),elements:z.array(z.union([sticker,graphic]))});
const effectTrack=z.looseObject({...trackBase,type:z.literal('effect'),hidden:z.boolean(),elements:z.array(effect)});
export const productionNativeOverlayTrack=z.union([productionNativeVideoTrack,productionNativeTextTrack,graphicTrack,effectTrack]);
export const productionNativeTrack=z.union([productionNativeOverlayTrack,productionNativeAudioTrack]);
export const productionNativeTracks=z.looseObject({main:productionNativeVideoTrack,overlay:z.array(productionNativeOverlayTrack),audio:z.array(productionNativeAudioTrack)});
export const productionNativeScene=z.looseObject({id,name:z.string(),isMain:z.boolean(),tracks:productionNativeTracks,bookmarks:z.array(z.looseObject({time:nativeTick,note:z.string().optional(),color:z.string().optional(),duration:nativeTick.optional()})),createdAt:z.string(),updatedAt:z.string()});
export type NativeSerializedTimelineElement=z.infer<typeof productionNativeElement>;
export type NativeSerializedTimelineTrack=z.infer<typeof productionNativeTrack>;
export type NativeSerializedTimelineTracks=z.infer<typeof productionNativeTracks>;
export type NativeSerializedScene=z.infer<typeof productionNativeScene>;
export interface ProductionNativeMedia {mediaId:string;kind:'video'|'audio'|'image';durationTick:number|null}

// SEMANTIC_BOUNDARY_ALLOW: 仅检查新增/变更字段、类型、唯一身份、ticks与真实媒体数学，不选择镜头或创作风格。
const same=(a:unknown,b:unknown):boolean=>{
 if(a===b)return true;if(!a||!b||typeof a!=='object'||typeof b!=='object')return false;
 if(Array.isArray(a)||Array.isArray(b))return Array.isArray(a)&&Array.isArray(b)&&a.length===b.length&&a.every((v,i)=>same(v,b[i]));
 const x=a as Record<string,unknown>,y=b as Record<string,unknown>;return Object.keys(x).length===Object.keys(y).length&&Object.keys(x).every(k=>Object.hasOwn(y,k)&&same(x[k],y[k]));
};
export function validateNativeSceneTracksCandidate(before:NativeSerializedTimelineTracks,after:NativeSerializedTimelineTracks,media:readonly ProductionNativeMedia[]):void{
 const tracks=(v:NativeSerializedTimelineTracks)=>[v.main,...v.overlay,...v.audio];
 const oldTracks=tracks(before),nextTracks=tracks(after),oldElements=new Map(oldTracks.flatMap(t=>t.elements.map(e=>[e.id,e] as const)));
 if(after.main.id!==before.main.id||after.main.type!=='video')throw new Error('主轨身份不能改变');
 const trackIds=new Set<string>(),elementIds=new Set<string>(),catalog=new Map(media.map(m=>[m.mediaId,m]));
 for(const track of nextTracks){
  if(trackIds.has(track.id))throw new Error('轨道ID重复');trackIds.add(track.id);
  const prior=oldTracks.find(t=>t.id===track.id);
  if(!prior)productionNativeTrack.parse(track);else {if(prior.type!==track.type)throw new Error('既有轨道类型不能改变');for(const key of new Set([...Object.keys(prior),...Object.keys(track)]))if(key!=='elements'&&!same(prior[key],track[key])){if(key==='name')z.string().parse(track[key]);else if(key==='muted'||key==='hidden')z.boolean().parse(track[key]);else throw new Error('不能改写轨道身份或扩展');}}
  if(track===after.main&&track.type!=='video'||after.audio.includes(track as never)&&track.type!=='audio'||after.overlay.includes(track as never)&&track.type==='audio')throw new Error('轨道不属于该lane');
  for(const element of track.elements){
   if(elementIds.has(element.id))throw new Error('元素ID重复');elementIds.add(element.id);
   const old=oldElements.get(element.id);
   if(!old)productionNativeElement.parse(element);else if(old.type!==element.type)throw new Error('既有元素类型不能改变');
   const allowed=track.type==='video'?['video','image']:track.type==='graphic'?['sticker','graphic']:[track.type];
   if(!allowed.includes(element.type))throw new Error('元素与轨道类型不符');
   if(old&&same(old,element))continue;
   // 未改丰富字段保持原值；仅对变动known字段使用原v31schema，不重验原扩展。
   const variants={video,image,text,audio:element.sourceType==='library'?libraryAudio:uploadAudio,sticker,graphic,effect};
   const shape=variants[element.type].shape as Record<string,z.ZodType>;
   for(const key of Object.keys(shape))if(!old||!same(old[key],element[key])){
    if(key==='params')continue;
    shape[key]!.parse(element[key]);
   }
   if(old){for(const key of new Set([...Object.keys(old),...Object.keys(element)]))if(!same(old[key],element[key])&&!Object.hasOwn(base,key)&&!['type','mediaId','isSourceAudioEnabled','hidden','retime','effects','masks'].includes(key))throw new Error('不能改写原生受保护扩展');
    if('sourceType'in old&&old.sourceType!==element.sourceType||'sourceUrl'in old&&old.sourceUrl!==element.sourceUrl)throw new Error('不能改写来源');}
   if(element.type==='audio'&&element.sourceType==='library'&&!old)throw new Error('不能新增外部音频来源');
   const timingChanged=!old||['startTime','duration','trimStart','trimEnd','sourceDuration','mediaId','retime','animations'].some(k=>!same(old[k],element[k]));
   if(timingChanged){
    for(const key of ['startTime','duration','trimStart','trimEnd'] as const)nativeTick.parse(element[key]);
    if(!element.duration||!Number.isSafeInteger(element.startTime+element.duration))throw new Error('时间范围溢出');
    const rate='retime'in element?(element.retime as {rate:number}|undefined)?.rate??1:1;
    if(rate<=0||!Number.isFinite(rate))throw new Error('速率无效');
    if('mediaId'in element){const m=catalog.get(element.mediaId as string);if(!m)throw new Error('媒体未登记');if(m.kind!==element.type&&!(element.type==='audio'&&m.kind==='video'))throw new Error('媒体类型不符');
     if(element.type==='video'||element.type==='audio'){
      if(m.durationTick===null||!Number.isSafeInteger(m.durationTick)||m.durationTick<=0)throw new Error('媒体缺少真实时长');
      const sourceDuration=element.sourceDuration??m.durationTick;
      if(sourceDuration>m.durationTick||sourceDuration<=element.trimStart+element.trimEnd)throw new Error('源时间越界');
      const expected=Math.round((sourceDuration-element.trimStart-element.trimEnd)/rate);
      if(element.duration!==expected)throw new Error('片段时长与trim/rate不符');
     }
    }
    const visit=(v:unknown)=>{if(!v||typeof v!=='object')return;if(Array.isArray(v)){v.forEach(visit);return;}const r=v as Record<string,unknown>;if(Array.isArray(r.keys)){const seen=new Set<string>();for(const k of r.keys as Array<{id:string;time:number}>){if(seen.has(k.id)||k.time>element.duration)throw new Error('关键帧重复或越界');seen.add(k.id);}}else Object.values(r).forEach(visit);};visit(element.animations);
   }
   if(!old||!same(old.masks,element.masks))for(const mask of (element.masks??[]) as Array<Record<string,unknown>>){const prior=(old?.masks as Array<Record<string,unknown>>|undefined)?.find(m=>m.id===mask.id);if(!prior||!same(prior,mask))productionNativeMask.parse(mask);}
   if(element.type==='graphic'&&!old&&!Object.hasOwn(graphicParams,element.definitionId))throw new Error('图形不属于固定renderer catalog');
   if(element.type==='effect'&&(!old||!same(old.effectType,element.effectType))&&element.effectType!=='blur')throw new Error('效果不属于固定renderer catalog');
   validateChangedParams(old?.params??{},element.params,element);
   validateChangedAnimations(old?.animations??{},element);
   if(!old||!same(old.effects,element.effects))for(const fx of (element.effects??[]) as Array<{id:string;type:string;params:Record<string,unknown>}>){const prior=(old?.effects as Array<{id:string;type:string;params:Record<string,unknown>}>|undefined)?.find(value=>value.id===fx.id);if(prior&&same(prior,fx))continue;productionNativeEffect.parse(fx);if(fx.type!=='blur'||prior&&prior.type!==fx.type)throw new Error('效果不属于固定renderer catalog');validateParamChanges(prior?.params as Record<string,unknown>??{},fx.params,blurParams);}
  }
 }
}

// 固定原params registry；只验证模型明确变更的字段，旧未知参数可原样保留。
const visualParams:Record<string,z.ZodType>={
 'transform.positionX':z.number().finite().min(-100000),'transform.positionY':z.number().finite().min(-100000),
 'transform.scaleX':z.number().finite().min(.01),'transform.scaleY':z.number().finite().min(.01),'transform.rotate':z.number().min(-360).max(360),
 opacity:z.number().min(0).max(1),blendMode:z.enum(['normal','darken','multiply','color-burn','lighten','screen','plus-lighter','color-dodge','overlay','soft-light','hard-light','difference','exclusion','hue','saturation','color','luminosity']),
};
const audioParams={volume:z.number().min(-60).max(20),muted:z.boolean()};
const textParams:Record<string,z.ZodType>={content:z.string(),fontFamily:z.string(),fontSize:z.number().min(1),color:z.string(),textAlign:z.enum(['left','center','right']),fontWeight:z.enum(['normal','bold']),fontStyle:z.enum(['normal','italic']),textDecoration:z.enum(['none','underline','line-through']),letterSpacing:z.number().min(-100),lineHeight:z.number().min(.1),'background.enabled':z.boolean(),'background.color':z.string(),'background.cornerRadius':z.number().min(0).max(100),'background.paddingX':z.number().min(0),'background.paddingY':z.number().min(0),'background.offsetX':z.number().min(-100000),'background.offsetY':z.number().min(-100000)};
const blurParams:Record<string,z.ZodType>={intensity:z.number().finite().min(0).max(100)};
const graphicBase:Record<string,z.ZodType>={fill:z.string(),stroke:z.string(),strokeWidth:z.number().finite().min(0).max(64),strokeAlign:z.enum(['inside','center','outside'])};
const graphicParams:Record<string,Record<string,z.ZodType>>={rectangle:{...graphicBase,cornerRadius:z.number().finite().min(0).max(50)},ellipse:graphicBase,polygon:{...graphicBase,sides:z.number().finite().min(3).max(12),cornerRadius:z.number().finite().min(0).max(50)},star:{...graphicBase,points:z.number().finite().min(3).max(12),depth:z.number().finite().min(1).max(99)}};
function paramRegistry(type:string,definitionId?:string,effectType?:string):Record<string,z.ZodType>{return type==='video'?{...visualParams,...audioParams}:type==='text'?{...visualParams,...textParams}:type==='audio'?audioParams:type==='effect'?(effectType==='blur'?blurParams:{}):type==='graphic'?{...visualParams,...graphicParams[definitionId??'']}:visualParams;}
/** 与固定源params/graphics/effects registry同名；只披露机械可改字段，不决定创作。 */
export function productionNativeParamRegistryKeys(type:string,definitionId?:string,effectType?:string):string[]{return Object.keys(paramRegistry(type,definitionId,effectType));}
export const PRODUCTION_NATIVE_GRAPHIC_DEFINITIONS=['rectangle','ellipse','polygon','star'] as const;
function validateParamChanges(before:Record<string,unknown>,after:Record<string,unknown>,registry:Record<string,z.ZodType>){
 for(const key of new Set([...Object.keys(before),...Object.keys(after)]))if(!same(before[key],after[key])){const schema=registry[key];if(!schema)throw new Error('参数不属于固定原生registry');schema.parse(after[key]);}
}
function validateChangedParams(before:Record<string,unknown>,after:Record<string,unknown>,element:NativeSerializedTimelineElement){validateParamChanges(before,after,paramRegistry(element.type,element.definitionId as string|undefined,element.effectType as string|undefined));}
const notKeyframable=new Set(['blendMode','muted','content','fontFamily','textAlign','fontWeight','fontStyle','textDecoration','background.enabled']);
function validateChangedAnimations(before:Record<string,unknown>,element:NativeSerializedTimelineElement){
 const registry=paramRegistry(element.type),after=element.animations??{};
 for(const path of new Set([...Object.keys(before),...Object.keys(after)])){
  if(same(before[path],after[path])||after[path]===undefined)continue;
  let schema=notKeyframable.has(path)?undefined:registry[path],color=path==='color'||path==='background.color';
  if(element.type==='graphic'&&path.startsWith('params.')){const key=path.slice(7);schema=graphicParams[element.definitionId]?.[key];color=key==='fill'||key==='stroke';}
  if(path.startsWith('effects.')){const split=path.indexOf('.params.',8),fx=split>8?(element.effects as Array<{id:string;type:string}>|undefined)?.find(f=>f.id===path.slice(8,split)):undefined,key=split>8?path.slice(split+8):'';schema=fx?.type==='blur'?blurParams[key]:undefined;color=false;}
  if(!schema)throw new Error('动画字段不属于固定原生registry');
  const data=after[path] as Record<string,unknown>;
  if(color&&!Array.isArray(data.keys)){for(const [component,channel] of Object.entries(data)){if(!['r','g','b','a'].includes(component))throw new Error('动画颜色component无效');if(channel!==undefined)for(const key of (channel as {keys:Array<{value:unknown}>}).keys)z.number().finite().parse(key.value);}}
  else if(Array.isArray(data.keys)){for(const key of data.keys as Array<{value:unknown}>)schema.parse(key.value);}
  else throw new Error('动画channel与参数类型不符');
 }
}

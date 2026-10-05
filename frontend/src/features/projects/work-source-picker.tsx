"use client";
import * as React from "react";
import {type WorkCompositionResource,type WorkContentSource,type WorkSourceRef,type WorkSourceSelectBody} from "@creatoros/contract";
import {client} from "@/lib/contract-client";
import {Button} from "@/components/ui/button";
import {describeUserError} from "@/lib/ai-error-humanize";
type Props={purpose?:"candidate"|"material";composition:WorkCompositionResource;disabled:boolean;onSelect:(source:WorkContentSource)=>void;onBusyChange?:(busy:boolean)=>void};
const labels={video:"视频脚本",article:"公众号",image:"图文",moments:"朋友圈"};
export function WorkSourcePicker(props:Props){return <ScopedSourcePicker key={props.composition.compositionId} {...props}/>;}
function ScopedSourcePicker({composition,disabled,onSelect,onBusyChange,purpose}:Props){
 const[selected,setSelected]=React.useState(""),[field,setField]=React.useState("whole"),[busy,setBusy]=React.useState(false),[error,setError]=React.useState<string|null>(null);
 const active=React.useRef(true),inFlight=React.useRef(false);
 React.useEffect(()=>{active.current=true;return()=>{active.current=false;};},[]);
 const options: Array<{id:string;label:string;pick:WorkSourceSelectBody["pick"];fields:Array<{id:string;label:string}>}>=[{id:"basis",label:"共享依据 · 已保存版本",pick:{kind:"work_basis_version",compositionId:composition.compositionId,versionId:composition.current.basisVersionId,selection:{mode:"whole"}},fields:[{id:"topic",label:"仅主题"},{id:"claims",label:"仅核心观点"},{id:"factItems",label:"仅事实"}]}];
 for(const item of composition.memberCurrent){if(item.availability!=="available"||item.currentVersion.kind!=="artifact")continue;const member=item.member;
  options.push({id:member.kind,label:`${labels[member.kind]} · 当前保存稿`,pick:member.kind==="moments"?{kind:"moments_version",momentsId:member.momentsId,versionId:item.currentVersion.versionId,selection:{mode:"whole"}}:{kind:"output_version",sourceOutputId:member.outputId,versionId:item.currentVersion.versionId,selection:{mode:"whole"}},fields:member.kind==="moments"?[{id:"text",label:"仅短文"},{id:"imageUses",label:"仅配图引用"}]:member.kind==="article"?[{id:"title",label:"仅标题"},{id:"summary",label:"仅简介"}]:member.kind==="image"?[{id:"title",label:"仅标题"},{id:"body",label:"仅正文"},{id:"summary",label:"仅简介"},{id:"tags",label:"仅标签"}]:[{id:"script",label:"仅脚本全文"}]});
 }
 const chosen=options.find(option=>option.id===selected);
 async function select(){if(!chosen||disabled||inFlight.current)return;inFlight.current=true;setBusy(true);onBusyChange?.(true);setError(null);
  try{let pick=chosen.pick;if(field!=="whole"){
   if(!chosen.fields.some(option=>option.id===field))throw Error("请选择当前来源的有效字段");
   pick=pick.kind==="moments_version"?{...pick,selection:{mode:"selected",fields:[field as "text"|"imageUses"],textRanges:[]}}:pick.kind==="work_basis_version"?{...pick,selection:{mode:"selected",fields:[field as "topic"|"claims"|"factItems"],claimIds:[],factItemIds:[]}}:{...pick,selection:{mode:"selected",sourceFields:[field as "title"|"body"|"summary"|"tags"|"script"],sourceSectionIds:[],textRanges:[]}};
  }
  const response=await client.selectWorkSource({params:undefined,query:undefined,body:{projectId:composition.projectId,pick}});if(active.current){onSelect(response.source);setSelected("");setField("whole");}
  }catch(reason){if(active.current)setError(describeUserError(reason,"所选保存版本暂不可作为依据，原编辑已保留。"));}finally{inFlight.current=false;if(active.current){setBusy(false);onBusyChange?.(false);}}
 }
 return <section className="space-y-3 rounded-lg border p-3" aria-label="选择已保存来源"><h3 className="text-sm font-medium">添加已保存内容作为依据</h3><p className="text-xs text-muted-foreground">{purpose==="candidate"?"明确选择本次生成使用的稿件与范围；采纳候选后才写入正式稿来源。":purpose==="material"?"选择材料使用的保存稿与范围。进入画布会再次核验；采用材料后保存这份来源记录。":"明确选择稿件和范围，保存共享依据后才记录来源。尚未保存的稿件不会出现在这里。"}</p><select aria-label="来源稿件版本" value={selected} disabled={disabled||busy} onChange={event=>{setSelected(event.target.value);setField("whole");}} className="w-full rounded-md border bg-background p-2 text-sm"><option value="">选择来源版本</option>{options.map(option=><option key={option.id} value={option.id}>{option.label}</option>)}</select>{chosen&&<select aria-label="来源使用范围" value={field} disabled={disabled||busy} onChange={event=>setField(event.target.value)} className="w-full rounded-md border bg-background p-2 text-sm"><option value="whole">整份保存内容</option>{chosen.fields.map(option=><option key={option.id} value={option.id}>{option.label}</option>)}</select>}<Button variant="outline" disabled={disabled||busy||!chosen} onClick={()=>void select()}>{busy?"核验保存版本中…":"添加所选依据"}</Button>{error&&<p role="alert" className="text-sm text-destructive">{error}</p>}</section>;
}

const fieldNames:Record<string,string>={topic:"主题",claims:"核心观点",factItems:"事实",text:"短文",imageUses:"配图引用",title:"标题",body:"正文",summary:"简介",tags:"标签",script:"脚本"};
function sourceDescription(source:WorkSourceRef){
 if(!("selection" in source))return {name:source.kind==="project"?"项目":source.kind==="asset"?"素材":"内容雷达",range:"已记录的来源版本"};
 const name=source.kind==="moments_version"?"朋友圈":source.kind==="work_basis_version"?"共享依据":source.sourceType==="article"?"公众号":source.sourceType==="image"?"图文":"视频脚本";
 const selection=source.selection;
 let range="整份保存内容";
 if(selection.mode==="selected"){
  const fields="sourceFields" in selection?selection.sourceFields:selection.fields;
  const parts=fields.map(field=>fieldNames[field]??field);
  if("textRanges" in selection&&selection.textRanges.length)parts.push(`文字选区 ${selection.textRanges.length} 段`);
  if("sourceSectionIds" in selection&&selection.sourceSectionIds.length)parts.push(`章节 ${selection.sourceSectionIds.length} 项`);
  if("claimIds" in selection&&selection.claimIds.length)parts.push(`观点 ${selection.claimIds.length} 项`);
  if("factItemIds" in selection&&selection.factItemIds.length)parts.push(`事实 ${selection.factItemIds.length} 项`);
  range=parts.join("、");
 }
 return {name,range};
}
export function WorkSourceList({sources,disabled,onRemove}:{sources:WorkSourceRef[];disabled:boolean;onRemove:(index:number)=>void}){
 if(!sources.length)return <p className="text-xs text-muted-foreground">还没有来源。可选择已保存稿件，明确本次使用的内容。</p>;
 return <ul aria-label="已记录的来源" className="space-y-2">{sources.map((source,index)=>{const description=sourceDescription(source);return <li key={`${source.versionId}:${"selectionDigest" in source?source.selectionDigest:source.id}:${index}`} className="flex items-start gap-3 rounded-lg border p-3"><div className="min-w-0 flex-1 space-y-1"><p className="text-sm font-medium">{description.name} · {description.range}</p><details className="text-xs text-muted-foreground"><summary className="cursor-pointer">查看来源版本记录</summary><p className="mt-1 break-all">保存版本：{source.versionId}</p></details></div><Button variant="ghost" size="sm" disabled={disabled} aria-label={`移除来源 ${index+1}`} onClick={()=>onRemove(index)}>移除</Button></li>;})}</ul>;
}

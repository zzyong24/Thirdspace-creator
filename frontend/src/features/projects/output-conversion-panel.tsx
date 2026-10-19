"use client";
import {useCreationClient,useCreationScope,creationScopeKey,readCreationScope} from "@/lib/creation-workspace-scope";
import * as React from "react";
import Link from "next/link";
import {ENDPOINTS,articleCandidateSection,graphicPostCardBriefs,outputConversionRequest,type OutputConversionRequest,type OutputConversionReceipt,type CreativeCapability,type CreativeResult} from "@creatoros/contract";
import {client} from "@/lib/contract-client";
import {Button} from "@/components/ui/button";
import {describeUserError} from "@/lib/ai-error-humanize";

type SourceType="article"|"image"|"video";
type SourceField="title"|"summary"|"body"|"tags"|"script";
const labels={article:"公众号文章",image:"图文",video:"视频脚本",title:"标题",summary:"摘要",body:"正文",tags:"标签",script:"脚本",sections:"段落",cardBriefs:"图卡文字"};
const wholeFields={article:["title","summary","sections"],image:["title","body","cardBriefs"],video:["script"]} as const;
const targetFields={...wholeFields,image:["title","body","summary","tags","cardBriefs"]} as const;
const statusText={queued:"等待生成",running:"正在生成",awaiting_confirmation:"待审阅",succeeded:"候选待采用",failed:"生成未完成",cancelled:"已取消",adopted:"已采用"};
const control="w-full rounded-md border border-border bg-background p-2 text-sm disabled:opacity-60";
function destination(projectId:string,outputId:string,type:SourceType){const base=`/projects/${encodeURIComponent(projectId)}`;return type==="article"?`${base}/article?outputId=${encodeURIComponent(outputId)}`:`${base}/outputs/${encodeURIComponent(outputId)}/${type}`;}
function storeRequest(key:string,request:OutputConversionRequest|null){try{if(request)sessionStorage.setItem(key,JSON.stringify(request));else sessionStorage.removeItem(key);}catch{/* 会话存储不可用时仍可在当前页面继续。 */}}

type OutputConversionPanelProps={
 accountId:string|null;projectId:string;outputId:string;sourceType:SourceType;versionId:string;dirty:boolean;
 fields:Partial<Record<SourceField,string|string[]>>;sections?:readonly {sectionId:string;heading:string;body:string}[];
 images?:readonly {assetId:string;assetFileId:string}[];
};
export function OutputConversionPanel(props:OutputConversionPanelProps){
 const selection=useCreationScope(),workspaceKey=creationScopeKey(selection);
 // 同一组内切平台不重建；切换账号或组时立即结束旧轮询、采用和请求寿命。
 return <OutputConversionPanelScope key={JSON.stringify([workspaceKey,props.projectId,props.outputId,props.sourceType])} {...props} workspaceKey={workspaceKey} groupId={selection.groupId}/>;
}
function OutputConversionPanelScope({accountId,projectId,outputId,sourceType,versionId,dirty,fields,sections=[],images=[],workspaceKey,groupId}:OutputConversionPanelProps&{workspaceKey:string;groupId:string|null}){
 const client=useCreationClient();

 const [open,setOpen]=React.useState(false),[target,setTarget]=React.useState<SourceType>(sourceType==="image"?"article":"image");
 const [mode,setMode]=React.useState<"whole"|"selected">("whole"),[selectedFields,setSelectedFields]=React.useState<SourceField[]>([]),[selectedSections,setSelectedSections]=React.useState<string[]>([]);
 const [range,setRange]=React.useState<{field:"body"|"script";start:number;end:number}|null>(null),[selectedTargets,setSelectedTargets]=React.useState<string[]>([...wholeFields[target]]),[selectedImages,setSelectedImages]=React.useState<Array<{assetId:string;assetFileId:string}>>([]);
 const [abilities,setAbilities]=React.useState<CreativeCapability[]>([]),[original,setOriginal]=React.useState<OutputConversionRequest|null>(null),[receipt,setReceipt]=React.useState<OutputConversionReceipt|null>(null);
 const [results,setResults]=React.useState<CreativeResult[]>([]),[edits,setEdits]=React.useState<Record<string,unknown>>({}),[facts,setFacts]=React.useState<Record<string,Array<{id:string;text:string}>>>({}),[includeFacts,setIncludeFacts]=React.useState<Record<string,boolean>>({});
 const [error,setError]=React.useState<string|null>(null),[busy,setBusy]=React.useState<string|null>(null);
 const scope=JSON.stringify([workspaceKey,projectId,outputId,sourceType]),serial=React.useRef(0),pollInFlight=React.useRef(false),mounted=React.useRef(false);
 // 沿用原账号/作品缓存键，既有丢回执请求仍可恢复；缓存不授予跨作用域执行权。
 const key=groupId?`creatoros-output-conversion:group:${groupId}:${outputId}`:`creatoros-output-conversion:${accountId}:${outputId}`,panelId=React.useId();
 const current=(token?:number)=>{const actual=readCreationScope();return mounted.current&&creationScopeKey(actual)===workspaceKey&&(groupId?actual.groupId===groupId&&actual.accountId===null:!!accountId&&actual.groupId===null&&actual.accountId===accountId)&&(token===undefined||serial.current===token);};
 React.useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;serial.current++;};},[]);
 const adoptionAttempts=React.useRef<Record<string,{signature:string;body:Parameters<typeof client.adoptResult>[0]["body"]}>>({}),retryAttempts=React.useRef<Record<string,string>>({});
 async function read(next:OutputConversionReceipt,token:number){
   if(!current(token))return;
   const rows=await Promise.all(next.items.map(item=>client.getResult({params:{resultId:item.resultId},query:undefined,body:undefined})));
   if(!current(token))return;
   const factRows=await Promise.all(rows.filter(row=>row.kind==="sections"&&row.typedCandidateRef&&(row.status==="succeeded"||row.status==="adopted")).map(async row=>({id:row.resultId,facts:(await client.getArticleCandidate({params:{candidateId:row.typedCandidateRef!.id},query:undefined,body:undefined})).proposedFactItems})));
   if(!current(token))return;
   const restored:Record<string,unknown>={},restoredFacts:Record<string,boolean>={};
   for(const row of rows){try{
     const saved=JSON.parse(sessionStorage.getItem(`${key}:adopt:${row.resultId}`)??"null"),parsed=ENDPOINTS.adoptResult.body.safeParse(saved?.body);
     if(parsed.success&&parsed.data.expected.owner===row.typedCandidateRef?.owner&&saved.signature===JSON.stringify({editedValue:parsed.data.editedValue,includeFactItems:parsed.data.includeFactItems})){
       adoptionAttempts.current[row.resultId]={signature:saved.signature,body:parsed.data};
       if(parsed.data.editedValue!==undefined)restored[row.resultId]=parsed.data.editedValue;
       if(parsed.data.includeFactItems!==undefined)restoredFacts[row.resultId]=parsed.data.includeFactItems;
     }
   }catch{/* 缓存仅恢复待审编辑，正式采用仍经服务端校验。 */}}
   setEdits(current=>({...restored,...current}));setIncludeFacts(current=>({...restoredFacts,...current}));
   setReceipt(next);setResults(rows);setFacts(current=>({...current,...Object.fromEntries(factRows.map(row=>[row.id,row.facts]))}));
 }
 React.useEffect(()=>{
   if(!open||!current())return;let alive=true;const token=serial.current;
   void client.listCreativeCapabilities({params:undefined,query:{...(groupId?{}:{accountId:accountId??undefined}),projectId},body:undefined}).then(value=>{if(alive&&current())setAbilities(value.items);}).catch(()=>{if(alive&&current())setError("暂时无法读取模型能力，原稿仍可编辑。");});
   void Promise.resolve().then(()=>{if(!alive||!current(token))return;try {const saved=outputConversionRequest.safeParse(JSON.parse(sessionStorage.getItem(key)??"null"));if(saved.success&&saved.data.sourceOutputId===outputId){setOriginal(saved.data);setTarget(saved.data.targetType);setMode(saved.data.mode);setSelectedImages(saved.data.reuseImages);if(saved.data.mode==="selected"){setSelectedFields(saved.data.sourceFields);setSelectedSections(saved.data.sourceSectionIds);setSelectedTargets(saved.data.targetFields);const first=saved.data.textRanges[0];setRange(first?{field:first.field,start:first.start,end:first.end}:null);}void client.getOutputConversion({params:{clientRequestId:saved.data.clientRequestId},query:undefined,body:undefined}).then(value=>alive&&current(token)?read(value,token):undefined).catch(()=>{if(alive&&current())setError("上次转换的回执暂未读到，可用原请求恢复。");});}}catch{/* 空会话没有恢复请求。 */}});
   return ()=>{alive=false;};
 },[open,scope,accountId,projectId,key,outputId]);
 React.useEffect(()=>{
   if(!open||!original||!receipt||!["queued","running"].includes(receipt.status))return;
   let alive=true,timer:ReturnType<typeof setTimeout>;
   const tick=async()=>{if(!alive||!current())return;if(pollInFlight.current){timer=setTimeout(tick,2000);return;}pollInFlight.current=true;const token=serial.current;
     try{const next=await client.getOutputConversion({params:{clientRequestId:original.clientRequestId},query:undefined,body:undefined});if(alive&&current(token))await read(next,token);}catch{if(alive&&current())setError("进度暂未读到，已生成内容仍保留。");}
     finally{pollInFlight.current=false;if(alive)timer=setTimeout(tick,2000);}};
   timer=setTimeout(tick,2000);return()=>{alive=false;clearTimeout(timer);};
 },[open,scope,original?.clientRequestId,receipt?.bundleId,receipt?.status]);
 const requestedFields=mode==="whole"?[...wholeFields[target]]:selectedTargets;
 const supported=requestedFields.length>0&&requestedFields.every(kind=>abilities.some(item=>item.outputType===target&&item.platform===null&&item.kind===kind&&item.state==="supported"));
 const selected=selectedFields.length+selectedSections.length+(range?1:0)>0;
 async function start(){
   if(!current())return;
   const token=++serial.current;setBusy("start");setError(null);
   try{
     let request=original;
     if(!request){
       const textRanges=[];
       if(mode==="selected"&&range){const text=fields[range.field];if(typeof text!=="string")throw Error("保存稿的所选文字暂不可读取");const bytes=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(text));if(!current(token))return;textRanges.push({...range,textDigest:Array.from(new Uint8Array(bytes)).map(n=>n.toString(16).padStart(2,"0")).join("")});}
       request=outputConversionRequest.parse({sourceOutputId:outputId,sourceVersionId:versionId,targetType:target,mode,clientRequestId:crypto.randomUUID(),reuseImages:selectedImages,...(mode==="selected"?{sourceFields:selectedFields,sourceSectionIds:selectedSections,textRanges,targetFields:selectedTargets}:{})});
       if(!current(token))return;setOriginal(request);storeRequest(key,request);
     }
     if(!current(token))return;
     const next=await client.convertOutput({params:undefined,query:undefined,body:request});await read(next,token);
   }catch(cause){if(current(token))setError(describeUserError(cause,"转换暂未完成，原稿与选择已保留，可恢复这次转换。"));}
   finally{if(current(token))setBusy(null);}
 }
 async function adopt(row:CreativeResult){
   if(!receipt||!original||!current())return;const token=++serial.current;setBusy(row.resultId);setError(null);
   try{
     const editedValue=edits[row.resultId]??row.value,includeFactItems=row.kind==="sections"?(includeFacts[row.resultId]??false):undefined;
     const signature=JSON.stringify({editedValue,includeFactItems}),attemptKey=`${key}:adopt:${row.resultId}`;
     let prior=adoptionAttempts.current[row.resultId];
     if(!prior){try{const saved=JSON.parse(sessionStorage.getItem(attemptKey)??"null"),parsed=ENDPOINTS.adoptResult.body.safeParse(saved?.body);if(saved?.signature===signature&&parsed.success)prior={signature,body:parsed.data};}catch{/* 坏缓存不作为可信采用输入。 */}}
     if(!prior||prior.signature!==signature){
       const versionId=receipt.targetType==="image"?(await client.getGraphicPost({params:{outputId:receipt.targetOutputId},query:undefined,body:undefined})).currentVersionId:
         receipt.targetType==="article"?(await client.getArticle({params:{outputId:receipt.targetOutputId},query:undefined,body:undefined})).currentVersionId:row.baseVersionId;
       if(!current(token))return;
       if(!versionId)throw Error("目标保存版本暂未读到，请先打开目标作品保存稿件。");
       prior={signature,body:{expected:{owner:row.typedCandidateRef!.owner as "graphic_post"|"wechat_article"|"output_script",versionId},editedValue:editedValue as Parameters<typeof client.adoptResult>[0]["body"]["editedValue"],clientRequestId:crypto.randomUUID(),...(includeFactItems!==undefined?{includeFactItems}:{})}};
       adoptionAttempts.current[row.resultId]=prior;try{sessionStorage.setItem(attemptKey,JSON.stringify(prior));}catch{/* 当前页面仍保留原采用请求。 */}
     }
     if(!current(token))return;
     await client.adoptResult({params:{resultId:row.resultId},query:undefined,body:prior.body});
     if(!current(token))return;
     await read(await client.getOutputConversion({params:{clientRequestId:original.clientRequestId},query:undefined,body:undefined}),token);
   }catch(cause){if(current(token))setError(describeUserError(cause,"采用未完成，人工编辑已保留；目标稿有修改时请重新审阅。"));}
   finally{if(current(token))setBusy(null);}
 }
 async function retry(row:CreativeResult){if(!original||!current())return;const token=++serial.current;setBusy(row.resultId);setError(null);try{
   const originalResultId=row.retryOf&&!row.taskId?row.retryOf:row.resultId;
   const attemptKey=`${key}:retry:${originalResultId}`;let clientRequestId:string|undefined=row.retryRequestId??retryAttempts.current[originalResultId];
   if(!clientRequestId){try{clientRequestId=sessionStorage.getItem(attemptKey)??undefined;}catch{/* 会话存储不可用仍保留当前请求。 */}}
   if(!clientRequestId||clientRequestId.length<8||clientRequestId.length>128)clientRequestId=crypto.randomUUID();retryAttempts.current[originalResultId]=clientRequestId;try{sessionStorage.setItem(attemptKey,clientRequestId);}catch{}
   if(!current(token))return;await client.retryResult({params:{resultId:originalResultId},query:undefined,body:{clientRequestId}});if(!current(token))return;await read(await client.getOutputConversion({params:{clientRequestId:original.clientRequestId},query:undefined,body:undefined}),token);
 }catch(cause){if(current(token))setError(describeUserError(cause,"重试暂未完成，原候选仍保留。"));}finally{if(current(token))setBusy(null);}}

 function chooseField(field:SourceField,checked:boolean){setSelectedFields(current=>checked?[...current.filter(item=>item!==field),field]:current.filter(item=>item!==field));if(field==="body"||field==="script"){setRange(null);if(checked)setSelectedSections([]);}}
 return <section className="rounded-xl border border-border bg-surface">
   <button type="button" aria-label="转成其他作品" aria-expanded={open} aria-controls={panelId} onClick={()=>{if(open){serial.current++;setBusy(null);}setOpen(value=>!value);}} className="flex w-full flex-wrap items-center gap-2 rounded-xl p-4 text-left text-sm font-medium focus-visible:outline-2 focus-visible:outline-primary">转成其他作品<span className="text-xs font-normal text-muted-foreground">使用这份保存稿，独立生成并逐项审阅</span></button>
   {open&&<div id={panelId} className="space-y-4 border-t border-border p-4">
     {dirty&&<p className="text-sm text-amber-700">先保存当前稿，再使用这份保存稿转换。</p>}
     {original&&original.sourceVersionId!==versionId&&<p className="text-sm text-muted-foreground">原稿后来已保存新版本；这次转换仍使用发起时的保存稿。</p>}
     <fieldset disabled={Boolean(busy)||Boolean(original)} className="space-y-4">
       <div className="grid gap-4 sm:grid-cols-2"><label className="space-y-1 text-sm">目标作品<select aria-label="目标作品" className={control} value={target} onChange={event=>{const value=event.target.value as SourceType;setTarget(value);setSelectedTargets([...wholeFields[value]]);if(value!=="image")setSelectedImages([]);}}>{(["article","image","video"] as const).filter(type=>type!==sourceType).map(type=><option key={type} value={type}>{labels[type]}</option>)}</select></label>
       <div className="space-y-2 text-sm"><label className="flex items-center gap-2"><input type="radio" name={`${panelId}-mode`} checked={mode==="whole"} onChange={()=>setMode("whole")}/>转换整份保存稿</label><label className="flex items-center gap-2"><input type="radio" name={`${panelId}-mode`} checked={mode==="selected"} onChange={()=>setMode("selected")}/>只转换选中内容</label></div></div>
       {mode==="selected"&&(!original||original.sourceVersionId===versionId)&&<div className="grid gap-4 lg:grid-cols-2"><div className="space-y-3"><p className="text-sm font-medium">选择来源</p>{(Object.keys(fields) as SourceField[]).map(field=><label key={field} className="flex items-center gap-2 text-sm"><input type="checkbox" aria-label={`来源${labels[field]}`} checked={selectedFields.includes(field)} onChange={event=>chooseField(field,event.target.checked)}/>{labels[field]}</label>)}
       {sections.map(section=><label key={section.sectionId} className="flex items-start gap-2 text-sm"><input type="checkbox" checked={selectedSections.includes(section.sectionId)} onChange={event=>{setSelectedSections(current=>event.target.checked?[...current,section.sectionId]:current.filter(id=>id!==section.sectionId));setSelectedFields(current=>current.filter(field=>field!=="body"&&field!=="script"));setRange(null);}}/>{section.heading||"未命名段落"}</label>)}
       {(["body","script"] as const).filter(field=>typeof fields[field]==="string").map(field=><label key={field} className="block space-y-1 text-xs text-muted-foreground">也可拖选保存稿中的一段文字<textarea aria-label={`选择${labels[field]}文字范围`} readOnly value={fields[field] as string} className={`${control} min-h-24`} onSelect={event=>{const node=event.currentTarget;if(node.selectionEnd>node.selectionStart){setRange({field,start:node.selectionStart,end:node.selectionEnd});setSelectedFields(current=>current.filter(item=>item!==field));setSelectedSections([]);}}}/></label>)}{range&&<p className="text-xs text-primary">已选 {range.end-range.start} 个字符；中间未选文字不会提交。</p>}</div>
       <div className="space-y-3"><p className="text-sm font-medium">授权生成的目标字段</p>{targetFields[target].map(field=><label key={field} className="flex items-center gap-2 text-sm"><input type="checkbox" checked={selectedTargets.includes(field)} onChange={event=>setSelectedTargets(current=>event.target.checked?[...current,field]:current.filter(item=>item!==field))}/>{labels[field]}</label>)}</div></div>}
       {target==="image"&&!!images.length&&<div className="space-y-2"><p className="text-sm font-medium">作为图卡复用已有图片（可选）</p>{images.map((image,index)=><label key={image.assetFileId} className="flex items-center gap-2 text-sm"><input type="checkbox" checked={selectedImages.some(item=>item.assetFileId===image.assetFileId)} onChange={event=>setSelectedImages(current=>event.target.checked?[...current,image]:current.filter(item=>item.assetFileId!==image.assetFileId))}/>保存稿的第 {index+1} 张图片</label>)}</div>}
     </fieldset>
     {!supported&&!original&&<p className="text-xs text-muted-foreground">当前模型能力尚不可用，原稿仍可手工编辑。请在模型设置中完成配置后重新展开。</p>}
     <div className="flex flex-wrap gap-2"><Button disabled={Boolean(busy)||(!original&&(dirty||!supported||(mode==="selected"&&(!selected||!selectedTargets.length))))} onClick={()=>void start()}>{busy==="start"?"正在提交…":original?"恢复这次转换":"开始转换"}</Button>{original&&<Button variant="outline" disabled={Boolean(busy)} onClick={()=>{serial.current++;storeRequest(key,null);setOriginal(null);setReceipt(null);setResults([]);setEdits({});setError(null);}}>另起转换</Button>}{receipt&&<Link href={destination(projectId,receipt.targetOutputId,receipt.targetType)} className="inline-flex items-center rounded-md border border-border px-3 py-2 text-sm text-primary hover:underline">打开目标作品</Link>}</div>
     {error&&<p role="alert" className="rounded-md bg-red-50 p-3 text-sm text-red-700">{error}</p>}
     {receipt&&<div className="space-y-3"><p role="status" className="text-sm text-muted-foreground">{receipt.status==="complete"?"候选生成已完成，请逐项审阅采用。":receipt.status==="failed"?"生成未完成。目标作品已保留，可以继续手工编辑。":"目标作品已建立，进度与采用状态分别记录。"}</p>{results.map(row=><div key={row.resultId} className="space-y-3 rounded-lg border border-border p-3"><div className="flex flex-wrap items-center justify-between gap-2"><h3 className="text-sm font-medium">{labels[row.kind as keyof typeof labels]??row.kind}</h3><span className="text-xs text-muted-foreground">{statusText[row.status]}</span></div>
       {row.status==="succeeded"&&<CandidateFields value={edits[row.resultId]??row.value} kind={row.kind} disabled={Boolean(busy)} onChange={value=>setEdits(current=>({...current,[row.resultId]:value}))}/>}
       {!!facts[row.resultId]?.length&&<div className="space-y-2 rounded-md bg-amber-50 p-3 text-sm"><p className="font-medium">关联的待确认事实</p><ul className="list-inside list-disc">{facts[row.resultId]!.map(fact=><li key={fact.id}>{fact.text}</li>)}</ul>{row.status==="succeeded"&&<label className="flex items-start gap-2"><input type="checkbox" checked={includeFacts[row.resultId]??false} disabled={Boolean(busy)} onChange={event=>setIncludeFacts(current=>({...current,[row.resultId]:event.target.checked}))}/>随段落采用到待确认清单</label>}<p className="text-xs">没有勾选的事实保留在候选中，不会覆盖正式稿的事实清单。</p></div>}
       {row.errorCode&&<p className="text-xs text-muted-foreground">{row.taskId?"这一项未完成，其他候选仍保留。":"这一项尚未取得任务回执，可恢复这次转换。"}</p>}
       {row.status==="succeeded"&&row.typedCandidateRef&&<Button disabled={Boolean(busy)} onClick={()=>void adopt(row)}>采用{labels[row.kind as keyof typeof labels]??"这一项"}</Button>}{row.retryOf&&!row.taskId&&row.retryRequestId&&<Button variant="outline" disabled={Boolean(busy)} onClick={()=>void retry(row)}>恢复这次重试</Button>}{(row.status==="failed"||row.status==="cancelled")&&row.taskId&&<Button variant="outline" disabled={Boolean(busy)} onClick={()=>void retry(row)}>重试这一项</Button>}
     </div>)}</div>}
   </div>}
 </section>;
}

function CandidateFields({kind,value,disabled,onChange}:{kind:string;value:unknown;disabled:boolean;onChange:(value:unknown)=>void}){
 if(typeof value==="string")return <textarea aria-label={`${labels[kind as keyof typeof labels]??"内容"}候选编辑`} disabled={disabled} className={`${control} min-h-28`} value={value} onChange={event=>onChange(event.target.value)}/>;
 const sections=kind==="sections"?articleCandidateSection.array().safeParse(value):null,cards=kind==="cardBriefs"?graphicPostCardBriefs.safeParse(value):null;
 if(sections?.success||cards?.success){const rows=sections?.success?sections.data:cards?.success?cards.data:[];return <div className="space-y-3">{rows.map((row,index)=><fieldset key={"sectionId" in row?row.sectionId:row.cardId} disabled={disabled} className="space-y-2 rounded-md border border-border p-3"><legend className="px-1 text-xs">第 {index+1} {kind==="sections"?"段":"张图卡"}</legend><label className="block text-xs">小标题<input className={control} value={"heading" in row?row.heading:row.title} onChange={event=>onChange(rows.map((item,i)=>i===index?{...item,...("heading" in item?{heading:event.target.value}:{title:event.target.value})}:item))}/></label><label className="block text-xs">正文<textarea className={`${control} min-h-24`} value={row.body} onChange={event=>onChange(rows.map((item,i)=>i===index?{...item,body:event.target.value}:item))}/></label></fieldset>)}</div>;}
 if(kind==="tags"&&Array.isArray(value)&&value.every(item=>typeof item==="string"))return <div className="space-y-2">{value.map((tag,index)=><input key={index} aria-label={`候选标签 ${index+1}`} disabled={disabled} className={control} value={tag} onChange={event=>onChange(value.map((item,i)=>i===index?event.target.value:item))}/>)}</div>;
 return <p className="text-xs text-muted-foreground">候选结构暂无法读取，已保存稿件仍保留。</p>;
}

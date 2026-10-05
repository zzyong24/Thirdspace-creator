import {savedOutputSourcePick} from "@creatoros/contract";
import {createHash} from "node:crypto";
import {articleSourceRef,outputConversionRequest,outputConversionSourceAnchor,type OutputConversionRequest,
 type OutputConversionSourceAnchor,type RequestContext} from "@creatoros/contract";
import type {ProjectsService} from "@creatoros/backend/modules/projects";
import type {ArticlesService} from "@creatoros/backend/modules/articles";
import type {GraphicPostsService} from "@creatoros/backend/modules/graphic-posts";
import type {OutputScriptsService} from "@creatoros/backend/modules/output-scripts";

type Section={sectionId:string;heading:string;body:string;sourceRefs:unknown[]};
type Fields=Record<string,string|string[]|unknown[]>;
type Source={projectId:string;artifactId:string;versionId:string;type:"article"|"image"|"video";
 fields:Fields;sections:Section[];structureValid:boolean;
 constraints:{factItems:unknown[];sourceRefs:Array<{location:string;refs:unknown[]}>;ruleSnapshotRef:unknown}};
export interface ConversionSourcePorts{
 projects:Pick<ProjectsService,"getOutput">;
 articles:Pick<ArticlesService,"getArticle"|"getVersion">;
 graphicPosts:Pick<GraphicPostsService,"getGraphicPost"|"getVersion">;
 outputScripts:Pick<OutputScriptsService,"getSavedScript">;
}
export interface FrozenConversionSource{
 projectId:string;sourceAnchor:OutputConversionSourceAnchor;
 content:{fields:Fields;sections:Section[]};
 /** 事实待确认项与引用是约束，不是局部转换额外正文。 */
 constraints:Source["constraints"];
}
function fail(code:string,message:string):never{throw Object.assign(new Error(message),{code});}
function invalid(message:string):never{return fail("SOURCE_SELECTION_INVALID",message);}
const textHash=(text:string)=>createHash("sha256").update(text).digest("hex");
// SEMANTIC_BOUNDARY_ALLOW: 稳定序列化只为版本/选区协议身份，不判断语义或内容质量。
function canonical(value:unknown):string{
 if(Array.isArray(value))return `[${value.map(canonical).join(",")}]`;
 if(value && typeof value==="object")return `{${Object.entries(value).sort(([a],[b])=>a.localeCompare(b))
  .map(([key,item])=>`${JSON.stringify(key)}:${canonical(item)}`).join(",")}}`;
 return JSON.stringify(value)??"null";
}
function splitsPair(text:string,at:number){
 if(at===0 || at===text.length)return false;
 const before=text.charCodeAt(at-1),after=text.charCodeAt(at);
 return before>=0xd800 && before<=0xdbff && after>=0xdc00 && after<=0xdfff;
}

/** 仅冻结来源；目标创建/模型提交必须在其实际执行点再次核验当前版本。 */
export function createConversionSourceService(ports:ConversionSourcePorts){
 async function read(ctx:RequestContext,request:OutputConversionRequest,historical:boolean):Promise<Source>{
  const output=await ports.projects.getOutput(ctx,request.sourceOutputId);
  if(output.contentType===request.targetType)fail("UNSUPPORTED_CONVERSION","请选择另一种作品类型");
  let source:Source;
  if(output.contentType==="article"){
   const saved=await ports.articles.getArticle(ctx,output.id);
   const version=historical?await ports.articles.getVersion(ctx,output.id,request.sourceVersionId):null;
   const doc=version?.document??saved.current;
   source={projectId:saved.projectId,artifactId:saved.artifactId,versionId:version?.versionId??saved.currentVersionId,type:"article",
    fields:{title:doc.title,summary:doc.summary},sections:doc.sections.map(section=>({sectionId:section.sectionId,
     heading:section.heading,body:section.body,sourceRefs:section.sourceRefs})),structureValid:true,
    constraints:{factItems:doc.factItems,ruleSnapshotRef:null,sourceRefs:[
     {location:"title",refs:doc.titleSourceRefs??[]},{location:"summary",refs:doc.summarySourceRefs??[]},
     ...doc.sections.map(s=>({location:`section:${s.sectionId}`,refs:s.sourceRefs})),
     ...doc.factItems.map(f=>({location:`fact:${f.id}`,refs:f.sourceRefs}))]}};
  }else if(output.contentType==="image"){
   const saved=await ports.graphicPosts.getGraphicPost(ctx,output.id);
   const version=historical?await ports.graphicPosts.getVersion(ctx,output.id,request.sourceVersionId):null;
   const doc=version?.document??saved.current;
   source={projectId:saved.projectId,artifactId:saved.artifactId,versionId:version?.versionId??saved.currentVersionId,type:"image",
    fields:{title:doc.title,body:doc.body,summary:doc.summary,tags:doc.tags,...(doc.cardBriefs?{cardBriefs:doc.cardBriefs}:{})},
    sections:[],structureValid:false,constraints:{factItems:[],ruleSnapshotRef:doc.ruleSnapshotRef,
     sourceRefs:[{location:"document",refs:doc.sourceRefs},...(doc.cardBriefs??[]).map(c=>({location:`card:${c.cardId}`,refs:c.sourceRefs}))]}};
  }else if(output.contentType==="video"){
   const saved=await ports.outputScripts.getSavedScript(ctx,output.id,historical?request.sourceVersionId:undefined);
   if(!saved)fail("SOURCE_TEXT_REQUIRED","该视频尚无保存脚本，请先取得逐字稿或补充文字");
   const data=saved.contentData;
   const record=data && typeof data==="object" && !Array.isArray(data)?data as Record<string,unknown>:{};
   const raw=record.sections;
   const refs=(value:unknown)=>articleSourceRef.array().parse(value??[]);
   const valid=Array.isArray(raw) && raw.every(s=>s && typeof s==="object" && !Array.isArray(s) &&
    typeof s.id==="string" && s.id.length>0 && typeof s.heading==="string" && typeof s.body==="string") &&
    new Set(raw.map(s=>s.id)).size===raw.length;
   const sections:Section[]=valid?(raw as Array<{id:string;heading:string;body:string;sourceRefs?:unknown}>).map(s=>({
    sectionId:s.id,heading:s.heading,body:s.body,sourceRefs:refs(s.sourceRefs)})):[];
   source={projectId:saved.projectId,artifactId:saved.artifactId,versionId:saved.versionId,type:"video",
    fields:{script:saved.contentText},sections,structureValid:valid,constraints:{factItems:[],sourceRefs:[
     {location:"document",refs:refs(record.sourceRefs)},...sections.map(s=>({location:`section:${s.sectionId}`,refs:s.sourceRefs}))],ruleSnapshotRef:null}};
  }else return fail("UNSUPPORTED_CONVERSION","当前作品类型无法作为互转来源");
  if(source.projectId!==output.projectId)fail("SOURCE_ANCHOR_CONFLICT","来源稿与具体作品归属不一致");
  if(source.versionId!==request.sourceVersionId)fail("SOURCE_VERSION_CONFLICT","来源稿已变化，请保存并重新选择来源版本");
  return source;
 }
 async function freezeSource(ctx:RequestContext,input:OutputConversionRequest,historical:boolean,readSource?:Source):Promise<FrozenConversionSource>{
  const parsed=outputConversionRequest.safeParse(input);
  if(!parsed.success)invalid("互转请求或选区协议无效");
  const request=parsed.data,source=readSource??await read(ctx,request,historical);
  let content:FrozenConversionSource["content"];
  let selection:OutputConversionSourceAnchor["selection"];
  if(request.mode==="whole"){
   // SEMANTIC_BOUNDARY_ALLOW: 仅核验保存正文存在；不判断文字质量，不生成备用正文。
   const sectionText=source.sections.some(s=>s.body.trim());
   const body=source.type==="article"?sectionText:source.type==="video"?
    String(source.fields.script??"").trim() || sectionText:String(source.fields.body??"").trim() ||
    (source.fields.cardBriefs as Array<{title:string;body:string}>|undefined)?.some(card=>card.title.trim()||card.body.trim());
   if(!body)fail("SOURCE_TEXT_REQUIRED","来源尚无正文，请先保存正文、脚本或图卡文字");
   content={fields:source.fields,sections:source.sections};selection={mode:"whole"};
  }else{
   const allowed=source.type==="article"?["title","summary","body"]:source.type==="image"?["title","body","summary","tags"]:["script"];
   if(request.sourceFields.some(field=>!allowed.includes(field)))invalid("所选字段不属于该来源作品类型");
   if(request.sourceSectionIds.length && (!source.structureValid || source.type==="image"))invalid("该保存稿不支持段落 ID 选区，请选择真实文字范围");
   if(request.sourceSectionIds.length && request.sourceFields.includes(source.type==="video"?"script":"body"))invalid("不能同时选择整份正文与其中段落");
   if(request.sourceSectionIds.length && request.textRanges.length)invalid("段落与文字范围不能重叠选择同一正文");
   for(const id of request.sourceSectionIds)if(source.sections.filter(s=>s.sectionId===id).length!==1)invalid("选中段落不存在或 ID 不唯一");
   const fields:Fields={};
   for(const field of request.sourceFields)if(field!=="body" || source.type!=="article")fields[field]=source.fields[field]!;
   const sections=source.type==="article" && request.sourceFields.includes("body")?source.sections:
    source.sections.filter(s=>request.sourceSectionIds.includes(s.sectionId));
   const ranges=[...request.textRanges].sort((a,b)=>a.field.localeCompare(b.field)||a.start-b.start);
   for(const range of ranges){
    if((source.type==="image" && range.field!=="body") || (source.type==="video" && range.field!=="script") || source.type==="article")
     invalid("所选范围必须绑定该稿的真实字符串字段");
    const text=source.fields[range.field];
    if(typeof text!=="string" || range.end>text.length || textHash(text)!==range.textDigest ||
     splitsPair(text,range.start) || splitsPair(text,range.end))invalid("文字范围、完整字段摘要或字符边界已变化");
    // 多个明确范围保留为独立片段，绝不包含中间未选择的文字。
    const segment=text.slice(range.start,range.end),previous=fields[range.field];
    fields[range.field]=previous===undefined?segment:typeof previous==="string"?[previous,segment]:[...previous,segment];
   }
   if(!sections.some(s=>s.body.trim()||s.heading.trim()) && !Object.values(fields).some(v=>
    typeof v==="string"?v.trim():v.length))fail("SOURCE_TEXT_REQUIRED","选区没有可转换的文字，请保留输入并补充内容");
   content={fields,sections};selection={mode:"selected",sourceSectionIds:sections.map(s=>s.sectionId).filter(id=>request.sourceSectionIds.includes(id)),
    sourceFields:[...request.sourceFields].sort(),textRanges:ranges};
  }
  const identity={kind:"output_version" as const,sourceOutputId:request.sourceOutputId,artifactId:source.artifactId,
   versionId:source.versionId,sourceType:source.type,selection};
  const sourceAnchor=outputConversionSourceAnchor.parse({...identity,selectionDigest:textHash(canonical(identity))});
  // selected 仅保留所选位置的引用及独立事实约束，不泄漏未选图卡引用。
  const locations=new Set(["document",...Object.keys(content.fields),...content.sections.map(s=>`section:${s.sectionId}`),
   ...source.constraints.factItems.map(f=>`fact:${(f as {id:string}).id}`)]);
  const constraints={...source.constraints,sourceRefs:source.constraints.sourceRefs.filter(ref=>
   request.mode==="whole" || locations.has(ref.location))};
  return structuredClone({projectId:source.projectId,sourceAnchor,content,constraints});
 }
 return {
  /** 纯历史选择：服务器从同一历史字段填摘要，不先whole freeze、不提交模型。 */
  async selectSavedSource(ctx:RequestContext,raw:unknown){
   const pick=savedOutputSourcePick.parse(raw),output=await ports.projects.getOutput(ctx,pick.sourceOutputId);
   // SEMANTIC_BOUNDARY_ALLOW: 另一类型仅满足内部选区校验，不建立目标或做创作判断。
   const targetType=output.contentType==="article"?"image" as const:"article" as const;
   const common={sourceOutputId:pick.sourceOutputId,sourceVersionId:pick.versionId,targetType,clientRequestId:"select-saved-source",reuseImages:[]};
   const historyRequest=outputConversionRequest.parse({...common,mode:"whole"});
   const source=await read(ctx,historyRequest,true);
   const selection=pick.selection.mode==="whole"?pick.selection:{...pick.selection,textRanges:pick.selection.textRanges.map(range=>{
    const text=source.fields[range.field];if(typeof text!=="string")invalid("范围字段不是该保存版本的真实字符串");
    return{...range,textDigest:textHash(text)};
   })};
   const request=outputConversionRequest.parse(selection.mode==="whole"?{...common,...selection}:{...common,...selection,targetFields:targetType==="image"?["body"]:["sections"]});
   return freezeSource(ctx,request,true,source);
  },
  /** 核验正式稿中的不可变来源；只读来源，不创建目标或提交模型。 */
  async assertReference(ctx:RequestContext,input:OutputConversionSourceAnchor,projectId:string){
   const anchor=outputConversionSourceAnchor.parse(input);
   // SEMANTIC_BOUNDARY_ALLOW: 选择另一类型仅复用选区协议校验，不转换内容或决定目标。
   const targetType=anchor.sourceType==="article"?"image" as const:"article" as const;
   const common={sourceOutputId:anchor.sourceOutputId,sourceVersionId:anchor.versionId,targetType,
    clientRequestId:"verify-source-reference",reuseImages:[]};
   const request=outputConversionRequest.parse(anchor.selection.mode==="whole"?
    {...common,mode:"whole"}:{...common,...anchor.selection,targetFields:targetType==="image"?["body"]:["sections"]});
   const saved=await freezeSource(ctx,request,true);
   if(saved.projectId!==projectId || canonical(saved.sourceAnchor)!==canonical(anchor))
    fail("SOURCE_ANCHOR_CONFLICT","作品来源归属、历史版本或选区锚点不一致");
  },
  freeze:(ctx:RequestContext,input:OutputConversionRequest)=>freezeSource(ctx,input,false),
  /** 仅恢复持久源锚点；目标、规则正文与完整请求幂等仍由原账本/任务冻结输入校验。 */
  async restore(ctx:RequestContext,input:OutputConversionRequest,anchor:OutputConversionSourceAnchor){
   const parsed=outputConversionSourceAnchor.safeParse(anchor);
   if(!parsed.success)fail("SOURCE_ANCHOR_CONFLICT","原冻结来源锚点无效");
   const saved=await freezeSource(ctx,input,true);
   if(canonical(saved.sourceAnchor)!==canonical(parsed.data))fail("SOURCE_ANCHOR_CONFLICT","原冻结来源版本或选区不一致");
   return saved;
  },
 };
}

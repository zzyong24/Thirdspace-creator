import type {ChatToolDeps} from "./chat-tools";
import {ChatToolUserError} from "./chat-tool-errors";
import type {ChatSelection} from "./chat-context";

export interface ArticleImageReadable {
 projectId:string;
 outputId:string;
 artifactId:string;
 currentVersionId:string;
 current:{sections:Array<{sectionId:string;heading:string;body:string}>;visualBriefs:Array<{sectionId:string;brief:string}>};
}
export interface ArticleImageAnchor {outputId:string;versionId:string;sectionId:string}
export interface ArticleImageSnapshot extends ArticleImageAnchor {projectId:string;artifactId:string;heading:string;body:string;visualBrief:string|null}

/** 仅接受深链显式锚点；模型参数与自然语言均不能重绑定目标文章段落。 */
export function articleImageAnchorFromSelection(selection:ChatSelection|undefined):ArticleImageAnchor|null {
 if(selection?.kind!=="article_section")return null;
 const outputId=selection.outputId?.trim(),versionId=selection.versionId?.trim(),sectionId=selection.ids[0]?.trim();
 if(!outputId||!versionId||!sectionId||selection.ids.length!==1)throw new ChatToolUserError("文章配图目标不完整，请从当前文章段落重新打开生成入口。");
 return {outputId,versionId,sectionId};
}

/** 当下重读当前文章真值，跨账号、错项目、旧版本和失效段落均拒绝。 */
export async function readCurrentArticleImageSnapshot(input:{projectId:string;anchor:ArticleImageAnchor;getArticleForImage:(input:{outputId:string})=>Promise<ArticleImageReadable>;signal?:AbortSignal}):Promise<ArticleImageSnapshot>{
 input.signal?.throwIfAborted();
 const article=await input.getArticleForImage({outputId:input.anchor.outputId});
 input.signal?.throwIfAborted();
 if(article.projectId!==input.projectId||article.outputId!==input.anchor.outputId||article.currentVersionId!==input.anchor.versionId)throw new ChatToolUserError("文章配图目标已变化，请刷新当前文章后重新选择段落。");
 const matches=article.current.sections.filter(section=>section.sectionId===input.anchor.sectionId);
 if(matches.length!==1)throw new ChatToolUserError("文章段落已变化，请刷新当前文章后重新选择段落。");
 const target=matches[0]!;
 const briefs=article.current.visualBriefs.filter(brief=>brief.sectionId===input.anchor.sectionId);
 if(briefs.length>1)throw new ChatToolUserError("文章段落的配图建议不唯一，请刷新当前文章。");
 return {...input.anchor,projectId:article.projectId,artifactId:article.artifactId,heading:target.heading,body:target.body,visualBrief:briefs[0]?.brief??null};
}

export interface MaterialGenerationInput {
 kind:"image"|"video";
 prompt:string;
 style?:string;
 sectionRef?:string;
 visualPurpose?:"evidence"|"mechanism"|"comparison"|"consequence"|"emotion"|"analogy";
 mediaKind?:"illustration"|"information_card"|"fact_capture";
 referenceAssetId?:string;
}
/** 只读取当前稿和准备生成输入，不创建任务或调用模型，供原入口与事务提交复用。 */
export async function prepareMaterialGeneration(raw:MaterialGenerationInput,options:Pick<ChatToolDeps,"boundProjectId"|"forcedMaterialKind"|"getArtifactText"|"getArticleForImage"|"articleImageSelection"> & {signal?:AbortSignal}):Promise<Parameters<ChatToolDeps["dispatchGenerateAsset"]>[0]>{
 const input={...raw},projectId=options.boundProjectId?.trim(),kind=options.forcedMaterialKind??(input.kind==="video"?"video":"image");
 const getArtifactText=options.getArtifactText,signal=options.signal;
 signal?.throwIfAborted();
 const prompt=typeof input.prompt==="string"?input.prompt.trim():"",mediaKind=input.mediaKind??"illustration";
 if(mediaKind!=="illustration")throw new ChatToolUserError(mediaKind==="information_card"
  ?"这张画面要求精确文字、数字或节点关系，不能交给自由文生图。请使用真实截图或确定性信息卡/图表能力；当前没有对应工具时直接说明，不能生成一张看似正确的假表格。"
  :"事实页面和公告不能用 AI 图冒充。请使用 web.read / material.screenshot 获取真实来源画面。");
 if(!prompt)throw new ChatToolUserError("没有收到生成描述 —— 请说清楚要生成什么画面。");
 if(options.articleImageSelection?.kind==="article_section"){
  const anchor=articleImageAnchorFromSelection(options.articleImageSelection)!;
  if(!projectId||!options.getArticleForImage)throw new ChatToolUserError("文章配图缺少当前文章读取能力，请刷新后重试。");
  if(kind!=="image")throw new ChatToolUserError("文章段落配图只能生成图片。");
  const snapshot=await readCurrentArticleImageSnapshot({projectId,anchor,getArticleForImage:options.getArticleForImage,signal});
  const groundedPrompt=["【当前公众号文章段落绑定】",`版本:${snapshot.versionId}`,`目标段落:${snapshot.heading||snapshot.sectionId}`,`段落原文:${snapshot.body}`,`视觉简报:${snapshot.visualBrief??"待设计"}`,`画面职责:${input.visualPurpose??"未说明"}`,"【视觉方案】",prompt].join("\n");
  return {kind:"image",prompt:groundedPrompt,style:typeof input.style==="string"&&input.style.trim()?input.style.trim():undefined,articleImageAnchor:anchor,articleSnapshot:snapshot};
 }
 let groundedPrompt=prompt;
 if(projectId && getArtifactText){
  const source=await getArtifactText({projectId,artifactType:"output_script"});
  signal?.throwIfAborted();
  if(source?.sections?.length){
   const ref=typeof input.sectionRef==="string"?input.sectionRef.trim():"";
   // SEMANTIC_BOUNDARY_ALLOW: 精确引用校验只落实模型已选段落，不选择内容或评估语义。
   const matches=source.sections.filter(section=>section.sectionRef===ref);
   if(matches.length!==1)throw new ChatToolUserError("项目内容配图必须绑定执行当下当前稿中的唯一段落。请先重新读取当前稿，再使用它返回的段落引用重试。");
   const target=matches[0]!;
   groundedPrompt=["【当前确认稿绑定】",`版本:${source.currentVersionId??"unknown"}`,`内容指纹:${source.contentHash??"unknown"}`,`目标段落:${target.heading||`第 ${target.index+1} 段`}`,`段落原文:${target.body}`,`画面职责:${input.visualPurpose??"未说明"}`,"【视觉方案】",prompt].join("\n");
  }
 }
 signal?.throwIfAborted();
 return {kind,prompt:groundedPrompt,style:typeof input.style==="string"&&input.style.trim()?input.style.trim():undefined,
  ...(typeof input.referenceAssetId==="string"&&input.referenceAssetId.trim()?{referenceAssetId:input.referenceAssetId.trim()}:{}),
 };
}

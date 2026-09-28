import type {ChatToolDeps} from "./chat-tools";

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
export async function prepareMaterialGeneration(raw:MaterialGenerationInput,options:Pick<ChatToolDeps,"boundProjectId"|"forcedMaterialKind"|"getArtifactText"> & {signal?:AbortSignal}):Promise<Parameters<ChatToolDeps["dispatchGenerateAsset"]>[0]>{
 const input={...raw},projectId=options.boundProjectId?.trim(),kind=options.forcedMaterialKind??(input.kind==="video"?"video":"image");
 const getArtifactText=options.getArtifactText,signal=options.signal;
 signal?.throwIfAborted();
 const prompt=typeof input.prompt==="string"?input.prompt.trim():"",mediaKind=input.mediaKind??"illustration";
 if(mediaKind!=="illustration")throw new Error(mediaKind==="information_card"
  ?"这张画面要求精确文字、数字或节点关系，不能交给自由文生图。请使用真实截图或确定性信息卡/图表能力；当前没有对应工具时直接说明，不能生成一张看似正确的假表格。"
  :"事实页面和公告不能用 AI 图冒充。请使用 web.read / material.screenshot 获取真实来源画面。");
 if(!prompt)throw new Error("没有收到生成描述 —— 请说清楚要生成什么画面。");
 let groundedPrompt=prompt;
 if(projectId && getArtifactText){
  const source=await getArtifactText({projectId,artifactType:"output_script"});
  signal?.throwIfAborted();
  if(source?.sections?.length){
   const ref=typeof input.sectionRef==="string"?input.sectionRef.trim():"";
   // SEMANTIC_BOUNDARY_ALLOW: 精确引用校验只落实模型已选段落，不选择内容或评估语义。
   const matches=source.sections.filter(section=>section.sectionRef===ref);
   if(matches.length!==1)throw new Error("项目内容配图必须绑定执行当下当前稿中的唯一段落。请先重新读取 context.artifact.text，再使用它返回的 sectionRef 重试。");
   const target=matches[0]!;
   groundedPrompt=["【当前确认稿绑定】",`版本:${source.currentVersionId??"unknown"}`,`内容指纹:${source.contentHash??"unknown"}`,`目标段落:${target.heading||`第 ${target.index+1} 段`}`,`段落原文:${target.body}`,`画面职责:${input.visualPurpose??"未说明"}`,"【视觉方案】",prompt].join("\n");
  }
 }
 signal?.throwIfAborted();
 return {kind,prompt:groundedPrompt,style:typeof input.style==="string"&&input.style.trim()?input.style.trim():undefined,
  ...(typeof input.referenceAssetId==="string"&&input.referenceAssetId.trim()?{referenceAssetId:input.referenceAssetId.trim()}:{}),
 };
}

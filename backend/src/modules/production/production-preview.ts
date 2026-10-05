import {ErrorCode,videoRenderProps,type RequestContext,type ProductionEditorPreview,type ProductionPlanV2} from "@creatoros/contract";
import {generateVideoRenderHtml} from "../execution";
import {unsupportedEditorFields,type EditorPlan} from "./production-editor-plan";
import {compileV2RenderablePlan} from "./production-v2-compile";
import type {ProductionOverlayBinding} from './production-overlay-capture';
import {ConflictError} from "./production.errors";

export type ResolveEditorMedia=(ctx:RequestContext,input:{projectId:string;assetId:string;assetFileId?:string;fileDigest?:string})=>Promise<{url:string;mimeType:string}>;

// SEMANTIC_BOUNDARY_ALLOW: 只校验来源协议、权威类型和真实素材引用，不选择创作内容。
export async function buildProductionPreview(ctx:RequestContext,projectId:string,plan:EditorPlan|ProductionPlanV2,resolve:ResolveEditorMedia,exactOverlays:ProductionOverlayBinding[]=[]):Promise<ProductionEditorPreview> {
  const compiled=plan.editorVersion===2?compileV2RenderablePlan(plan,exactOverlays):null;
  const props=compiled?.props??videoRenderProps.parse((plan as EditorPlan).renderProps);
  const bindings=new Map(compiled?.mediaBindings.map(b=>[b.mountAs,b])??[]);
  const imageCards=props.scenes.flatMap(s=>s.cards.filter(c=>c.kind==="image").map(c=>c.kind==="image"?c.file:""));
  const refs=new Set([...(props.talkingHead.clips?.map(c=>c.file)??[props.talkingHead.file]),...props.broll.map(b=>b.file),...imageCards]);
  const urls=new Map<string,string>(),images=new Set<string>(),unavailable=new Set<string>(),mediaWarnings:string[]=[];
  const mainRefs=new Set(props.talkingHead.clips?.map(c=>c.file)??[props.talkingHead.file]);
  for(const assetId of refs) {
    let media:Awaited<ReturnType<ResolveEditorMedia>>;try{media=await resolve(ctx,{projectId,...(bindings.get(assetId)??{assetId})});}catch(error){
     const code=(error as {code?:string}).code;
     if(mainRefs.has(assetId)||![ErrorCode.ConflictError,'ENOENT','NoSuchKey','NotFound'].includes(code??''))throw error;
     unavailable.add(assetId);mediaWarnings.push('有一项可选素材暂时无法读取，本次预览已隐藏，原内容与精确文件绑定保留');continue;
    }
    if(!/^https?:\/\//i.test(media.url) && !/^\/(?!\/)/.test(media.url))throw new ConflictError("素材预览地址无效，请重新读取素材");
    const mime=media.mimeType.split(";",1)[0]!.trim().toLowerCase();
    if(!mime.startsWith("image/") && !mime.startsWith("video/"))throw new ConflictError("该素材不是可预览的图片或视频");
    if(mainRefs.has(assetId) && !mime.startsWith("video/"))throw new ConflictError("口播源必须是视频素材");
    if(imageCards.includes(assetId) && !mime.startsWith("image/"))throw new ConflictError("图片卡片必须选择图片素材");
    urls.set(assetId,media.url);if(mime.startsWith("image/"))images.add(assetId);
  }
  if(unavailable.size){props.broll=props.broll.filter(b=>!unavailable.has(b.file));props.scenes=props.scenes.map(s=>({...s,cards:s.cards.filter(c=>c.kind!=='image'||!unavailable.has(c.file))}));}
  const warnings=[...mediaWarnings,...(compiled?.warnings??[]),...unsupportedEditorFields(plan.editorVersion===1?plan:null).map(path=>`已保留未支持字段：${path}`),...(Array.isArray(plan.compatibilityWarnings)?plan.compatibilityWarnings.filter((s):s is string=>typeof s==="string"):[])];
  return {html:generateVideoRenderHtml(props,{mediaUrls:urls,imageFiles:images,gsapSrc:"https://cdn.jsdelivr.net/npm/gsap@3.12.5/dist/gsap.min.js"}),durationSec:props.talkingHead.durationSec,warnings};
}

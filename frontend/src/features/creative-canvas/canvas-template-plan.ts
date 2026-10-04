import type {CanvasDocument,CanvasNode,CanvasVisualGroup,VisualTemplate} from "@creatoros/contract";
export type TemplatePlanInput={headline:string;content:string;caption:string;prompt:string;aspectRatio:string;pageMode:"single_cover"|"carousel";referenceAssetId?:string};
type ImageNode=Extract<CanvasNode,{type:"image_generation"|"video_generation"}>;
/** SEMANTIC_BOUNDARY_ALLOW: 仅替换用户明确字段、安排节点几何和落实已选配方，不推断行业或创作内容。 */
export function createTemplatePlan(template:VisualTemplate,input:TemplatePlanInput,center:{x:number;y:number},nextId:()=>string):{nodes:ImageNode[];group:CanvasVisualGroup}{
 const identity=template.requiredIdentity||template.visualMode==="real_person";
 if(identity&&!input.referenceAssetId)throw new Error("请先选择本人照片");
 if(!input.prompt.trim())throw new Error("请填写提示词");
 const expand=(text:string)=>text.replaceAll("{{本期标题}}",input.headline.trim()).replaceAll("{{本期主题}}",input.headline.trim()).replaceAll("{{当前确认稿}}",input.content.trim()).replaceAll("{{真实素材与当前确认稿}}",input.content.trim());
 const recipes=input.pageMode==="carousel"&&template.pageRecipes.length?template.pageRecipes:[{role:"cover" as const,label:"封面",prompt:""}];
 const nodes:ImageNode[]=recipes.map((recipe,index)=>({id:nextId(),type:"image_generation",label:recipe.label,position:{x:Math.round(center.x-175+index*390),y:Math.round(center.y-215)},size:{width:350,height:430},mode:input.referenceAssetId?"image_to_image":"text_to_image",prompt:[expand(input.prompt),expand(recipe.prompt),`本页是第 ${index+1} 页，共 ${recipes.length} 页。只生成本页独立图片，目标比例 ${input.aspectRatio}。`].filter(Boolean).join("\n"),aspectRatio:input.aspectRatio,visualMode:template.visualMode,templateId:template.id,templateVersion:template.revision,...(input.referenceAssetId?{referenceAssetId:input.referenceAssetId}:{})}));
 return {nodes,group:{id:nextId(),name:input.headline.trim()||template.name,libraryKind:template.libraryKind,aspectRatio:input.aspectRatio,caption:input.caption,pageOrder:nodes.map(node=>node.id),templateSnapshot:{id:template.id,name:template.name,version:template.revision,prompt:input.prompt,visualMode:template.visualMode,requiredIdentity:identity},generationAttempts:{}}};
}
export function pruneVisualGroups(document:CanvasDocument):CanvasDocument{
 if(!document.visualGroups)return document;
 const ids=new Set(document.nodes.filter(node=>node.type==="image"||node.type==="image_generation").map(node=>node.id));
 return {...document,visualGroups:document.visualGroups.map(group=>({...group,pageOrder:group.pageOrder.filter(id=>ids.has(id)),generationAttempts:Object.fromEntries(Object.entries(group.generationAttempts).filter(([id])=>ids.has(id)))})).filter(group=>group.pageOrder.length)};
}

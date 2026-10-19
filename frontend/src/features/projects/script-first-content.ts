import type {ArticleDocument,GraphicPostDocument,ProjectScriptContext} from '@creatoros/contract';
import {fillScriptMetadata} from './script-derived-metadata';

/** SEMANTIC_BOUNDARY_ALLOW: 首次空稿逐字承接已保存原稿；不拆段、归类或改写，不覆盖独立平台成稿。 */
function readable(context:ProjectScriptContext|undefined):context is ProjectScriptContext & {scriptRef:NonNullable<ProjectScriptContext['scriptRef']>}{
 return context?.state==='ready'&&Boolean(context.scriptRef)&&Boolean(context.scriptText.trim());
}
export function inheritArticleScript<T extends ArticleDocument>(document:T,context:ProjectScriptContext|undefined):T{
 if(document.sections.length)return document;
 const metadata=fillScriptMetadata(document,context);
 if(!readable(context))return metadata;
 return {...metadata,sections:[{sectionId:`script-${context.scriptRef.id}`,order:0,heading:'',headingLevel:2,body:context.scriptText,sourceRefs:[context.scriptRef]}]};
}
export function inheritGraphicScript<T extends GraphicPostDocument>(document:T,context:ProjectScriptContext|undefined):T{
 if(document.body.trim()||document.cardBriefs?.length)return document;
 const metadata=fillScriptMetadata(document,context);
 if(!readable(context))return metadata;
 return {...metadata,body:context.scriptText,sourceRefs:[...document.sourceRefs.filter(ref=>ref.kind!=='project_script'||ref.id!==context.scriptRef.id),context.scriptRef]};
}
export function reorganizePrompt(platform:'wechat'|'rednote'){
 return `请先用 work.editor.read 读取当前作品的完整文档和 scriptContext，以最新已保存的脚本原稿为依据，按照${platform==='wechat'?'公众号文章':'图文内容'}的阅读方式、行为风格和当前已选品牌风格，重新组织本平台内容，给我一份可审阅采纳的完整候选。保留原意、已确认事实和现有图片、版式；不要反向修改脚本，也不要修改其他平台。若脚本为空或不可读，请说明情况，不要编造。`;
}

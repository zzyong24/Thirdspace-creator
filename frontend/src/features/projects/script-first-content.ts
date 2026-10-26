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
 if(platform==='rednote')return '请根据当前已保存的图文内容，以及已有脚本和绑定来源，重新整理一份可预览采纳的小红书图文。没有脚本时以当前图文为依据；如果都没有内容，请说明情况，不要编造。分别整理小红书标题、发布正文、标签和图片页：小红书发布正文用自然的分享语气、清楚短段和有依据的要点，不写成逐字口播稿，不虚构亲身经历；图片页按内容含义拆分，每页一个标题和简洁要点，开头介绍主题、中间展开、末页收束，页数由内容决定，不机械切字数，不把整篇配文重复贴进图片。保留已有人工修改、图片、版式和真实来源。给我完整预览，等待我明确采纳后再保存，不修改脚本或其他平台，也不要声称图片已经生成。';
 return `请先读取当前作品，以最新已保存的脚本原稿为依据，按照${platform==='wechat'?'公众号文章':'图文内容'}的阅读方式、行为风格和当前已选品牌风格，重新组织本平台内容，给我一份可审阅采纳的完整候选。保留原意、已确认事实和现有图片、版式；不要反向修改脚本，也不要修改其他平台。若脚本为空或不可读，请说明情况，不要编造。`;
}

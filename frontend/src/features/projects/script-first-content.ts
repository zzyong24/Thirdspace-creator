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
 if(platform==='rednote')return '请先用 work.editor.read 读取当前作品的完整 document 和 scriptContext，基于当前图文内容与已保存脚本、绑定来源重新组织一份可审阅采纳的完整图文候选。若没有主脚本但当前已有图文正文或图片页，以当前已保存图文为依据；都为空时说明情况，不编造。分别整理：1. 小红书标题；2. 小红书发布正文 body 与 tags，采用自然的分享语气、清楚短段和有依据的要点，不写成逐字口播稿，不虚构亲身经历；3. 图片页 cardBriefs，按语义拆成若干张图，每页有独立标题和简洁要点，开头介绍主题、中间展开、末页收束，页数由实际内容决定，不机械切字数，不把发布正文重复贴进每一页。保留 cardId、现有图片、版式与真实来源；新页用唯一 cardId，完整按本轮工具 schema 提交候选。已有人工修改要保留。给我预览并等待我明确采纳，不直接写正式稿，不反向修改脚本或其他平台，不声称图片已经生成。';
 return `请先用 work.editor.read 读取当前作品的完整文档和 scriptContext，以最新已保存的脚本原稿为依据，按照${platform==='wechat'?'公众号文章':'图文内容'}的阅读方式、行为风格和当前已选品牌风格，重新组织本平台内容，给我一份可审阅采纳的完整候选。保留原意、已确认事实和现有图片、版式；不要反向修改脚本，也不要修改其他平台。若脚本为空或不可读，请说明情况，不要编造。`;
}

export interface ChatResearchContext {selectionTitle:string;userMaterialQueryTerms:string[];searchConfigured?:boolean}
/** SEMANTIC_BOUNDARY_ALLOW: 仅整理空白；查询语义归检索规划 Skill，不追加或拆分关键词。 */
export function prepareChatResearchQuery(context:ChatResearchContext,input:{query?:string}){
 const query=(input.query??"").trim().replace(/\s+/g," ");
 // 保留旧快照字段供历史读取；它们不再修改模型明确选择的查询。
 return query || (context.selectionTitle ?? "").trim().replace(/\s+/g," ");
}
export function projectChatSearchResults(results:Array<{title:string;url:string;snippet:string;siteName?:string}>){
 return {kind:"material.gather" as const,grounding:"web" as const,items:results.map(item=>({title:item.title,url:item.url,source:item.siteName||new URL(item.url).hostname,whyRelevant:item.snippet,category:"联网资料",sourceUrl:item.url}))};
}

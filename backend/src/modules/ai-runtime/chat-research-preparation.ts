export interface ChatResearchContext {selectionTitle:string;userMaterialQueryTerms:string[];searchConfigured?:boolean}
/** SEMANTIC_BOUNDARY_ALLOW: 仅整理空白并拼接已由原上下文提供的素材词，不推断查询语义。 */
export function prepareChatResearchQuery(context:ChatResearchContext,input:{query?:string}){
 const query=(input.query??"").trim().replace(/\s+/g," ");
 return [query||context.selectionTitle||"",...context.userMaterialQueryTerms].filter(Boolean).join(" ");
}
export function projectChatSearchResults(results:Array<{title:string;url:string;snippet:string;siteName?:string}>){
 return {kind:"material.gather" as const,grounding:"web" as const,items:results.map(item=>({title:item.title,url:item.url,source:item.siteName||new URL(item.url).hostname,whyRelevant:item.snippet,category:"联网资料",sourceUrl:item.url}))};
}

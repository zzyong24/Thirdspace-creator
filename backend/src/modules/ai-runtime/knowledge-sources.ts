import {knowledgeSources,type KnowledgeSourceRef} from "@creatoros/contract";

/**
 * 第三批步骤3：知识来源回传链路（冻结上下文 → worker → 结果）。
 * - 装配上下文时把本次检索到的知识条目冻结成目录（knowledgeId + 完整标题）。
 * - worker 只回报它引用的条目标题；这里按冻结目录映射回 knowledgeId，映射不上一律丢弃，
 *   不信任模型自报 ID，也不把用户之后改名/删除的条目算进本次来源。
 * - 旧任务没有冻结目录：返回 []，调用方不写 knowledgeSources 键，保持旧结果逐字不变。
 */
export const KNOWLEDGE_CATALOG_FACET="__knowledgeCatalog";
const ELLIPSIS="…";

export function buildKnowledgeCatalog(rows:ReadonlyArray<{id?:string|null;title:string}>):KnowledgeSourceRef[]{
 return knowledgeSources.parse(rows.filter(row=>typeof row.id==="string"&&row.id.length>0&&row.title.trim().length>0)
  .slice(0,20).map(row=>({knowledgeId:row.id!,title:row.title.trim().slice(0,200)})));
}

export function readKnowledgeCatalogFacet(facets:Record<string,string>|undefined):KnowledgeSourceRef[]{
 const raw=facets?.[KNOWLEDGE_CATALOG_FACET];
 if(!raw)return [];
 try{return knowledgeSources.parse(JSON.parse(raw));}catch{return [];}
}

/** 模型引用的标题 → 冻结目录里的条目。标题可能被提示词截断（以…结尾），按前缀匹配。 */
export function resolveKnowledgeSources(cited:ReadonlyArray<string>|undefined,catalog:ReadonlyArray<KnowledgeSourceRef>):KnowledgeSourceRef[]{
 if(!cited?.length||!catalog.length)return [];
 const matched:KnowledgeSourceRef[]=[];
 for(const raw of cited){
  const text=raw.trim();if(!text)continue;
  const prefix=text.endsWith(ELLIPSIS)?text.slice(0,-ELLIPSIS.length):null;
  const hit=catalog.find(item=>item.title===text)??(prefix&&prefix.length>=4?catalog.find(item=>item.title.startsWith(prefix)):undefined);
  if(hit)matched.push(hit);
 }
 return knowledgeSources.parse(matched);
}

import { ENDPOINTS } from "./endpoints";
import { getCliOperationPolicy,type CliEffect } from "./cli-policy";

/** 已逐项审计的ACP宿主读取/候选；发现目录本身不授予执行权限。 */
export const ASSISTANT_EXTERNAL_HOST_TOOL_NAMES=Object.freeze([
  "work.editor.read","work.editor.propose","work.creation.read","work.creation.propose",
  "history.read","tool.result.read","skill.read","creatoros.guide",
  "context.projects","context.projects.search","context.comments","context.knowledge","context.materials",
  "context.project.detail","context.project.lifecycle","context.review.report","context.positioning.detail",
  "context.knowledge.detail","context.artifacts","context.artifact.text","context.knowledge.text",
  "context.publications","context.metrics","context.learnings","context.candidates","context.predictions",
  "learning.capture","brief.fill","script.patch","video.edit.render",
  "system.features","system.read","system.action.propose",
  "canvas.read","canvas.propose","canvas.create.propose","canvas.generate.propose",
] as const);
export function isAssistantEngineToolAllowed(engine:"pi"|"codex"|"codebuddy",tool:{name:string;effect:string;execution?:string}){
  // SEMANTIC_BOUNDARY_ALLOW:按已审工具身份/执行方式/效果查固定权限，完全不判断创作意图。
  return engine==="pi" || ((ASSISTANT_EXTERNAL_HOST_TOOL_NAMES as readonly string[]).includes(tool.name)
    && (tool.execution??"host")==="host" && (tool.effect==="none"||tool.effect==="proposal"));
}

export function getAssistantOperationSummary(operation:string){
  const endpoint=Object.values(ENDPOINTS).find(entry=>entry.id===operation),policy=getCliOperationPolicy(operation);
  if(!endpoint||!policy)return null;
  return {operation:endpoint.id,domain:endpoint.id.split(".")[0]!,method:endpoint.method,path:endpoint.path,
    ...policy,hasParams:Boolean(endpoint.params),hasQuery:Boolean(endpoint.query),hasBody:Boolean(endpoint.body)};
}
export function listAssistantOperations(input:{domain?:string;effect?:CliEffect;offset?:number;limit?:number}={}){
  const offset=input.offset??0,limit=input.limit??20;
  if(!Number.isSafeInteger(offset)||offset<0||!Number.isSafeInteger(limit)||limit<1||limit>50)throw Error("操作目录分页范围无效");
  const rows=Object.values(ENDPOINTS).map(endpoint=>getAssistantOperationSummary(endpoint.id)!)
    .filter(entry=>(!input.domain||entry.domain===input.domain)&&(!input.effect||entry.effect===input.effect))
    .sort((left,right)=>left.operation.localeCompare(right.operation));
  const page=rows.slice(offset,offset+limit),nextOffset=offset+page.length<rows.length?offset+page.length:null;
  return {rows:page,total:rows.length,offset,limit,hasMore:nextOffset!==null,nextOffset};
}

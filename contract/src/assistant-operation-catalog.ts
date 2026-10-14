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
/** 仅Codex可复用的既有工具宿主；每项仍守原参数、授权、效果与账本。 */
const CODEX_EXECUTION_TOOLS:Readonly<Record<string,{execution:string;effect:string}>>=Object.freeze({
  'plan.update':{execution:'host',effect:'committed'},
  'web.read':{execution:'worker.web-read',effect:'committed'},
  'redfox.query':{execution:'worker.redfox',effect:'committed'},
  'project.transcribe':{execution:'host',effect:'committed'},
  'material.screenshot':{execution:'host',effect:'committed'},
  'intelligence.douyin.share':{execution:'host',effect:'committed'},
  'local.read':{execution:'host',effect:'committed'},
  'local.tools':{execution:'host',effect:'none'},
  'local.workspace':{execution:'host',effect:'none'},
  'cover.generate':{execution:'host.task-submit',effect:'committed'},
  'research.autonomous':{execution:'host.task-submit',effect:'committed'},
  'planning.thesis':{execution:'host.task-submit',effect:'committed'},
  'material.generate':{execution:'host.task-submit',effect:'committed'},
  'review.script':{execution:'host.task-submit',effect:'committed'},
  'publish.package':{execution:'host.task-submit',effect:'committed'},
  'script.hooks':{execution:'worker.script-hooks',effect:'proposal'},
  'script.draft':{execution:'worker.script-draft',effect:'committed'},
  'material.gather':{execution:'worker.research',effect:'none'},
  'topic.enrich':{execution:'worker.structured-node',effect:'proposal'},
  'positioning.generate':{execution:'worker.structured-node',effect:'proposal'},
  'calibration.diagnose':{execution:'worker.structured-node',effect:'proposal'},
  'topic.generate':{execution:'worker.structured-node',effect:'proposal'},
  'review.analyze':{execution:'worker.structured-node',effect:'proposal'},
  'knowledge.distill':{execution:'worker.structured-node',effect:'proposal'},
});
export function isAssistantEngineToolAllowed(engine:"pi"|"codex"|"codebuddy",tool:{name:string;effect:string;execution?:string},workbench?:{name:string;effects:readonly ("read"|"task_write"|"domain_candidate"|"external_write"|"process")[]}){
  // SEMANTIC_BOUNDARY_ALLOW:按已审工具身份/执行方式/效果查固定权限，完全不判断创作意图。
  if(engine==='codex'){
    if(workbench?.name===tool.name&&(tool.execution??'host')==='host'){
      const effect=workbench.effects.some(value=>['task_write','external_write','process'].includes(value))?'committed':workbench.effects.includes('domain_candidate')?'proposal':'none';
      return workbench.effects.length>0&&tool.effect===effect;
    }
    const owned=CODEX_EXECUTION_TOOLS[tool.name];
    if(owned)return owned.execution===(tool.execution??'host')&&owned.effect===tool.effect;
  }
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

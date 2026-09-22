import {ENDPOINTS,type RequestContext,type Transport} from "@creatoros/contract";
import {AuthenticationError,OwnershipError,UnsupportedOperationError} from "./execution.errors";
import type {createWorkbenchPublicService} from "./workbench-public.service";
import type {createExecutionStreamService} from "./execution-stream.service";
import type {createWorkbenchArtifactReadService} from "./workbench-artifact.service";

export const WORKBENCH_OP_IDS=["workbench.tasks.inspect","workbench.tasks.events","workbench.capabilities.list","workbench.artifacts.list","workbench.artifacts.read","workbench.artifacts.render","workbench.artifacts.reconcile"] as const;
export function createWorkbenchPublicTransport(deps:{
  tasks:ReturnType<typeof createWorkbenchPublicService>;
  stream:Pick<ReturnType<typeof createExecutionStreamService>,"read">;
  artifacts:ReturnType<typeof createWorkbenchArtifactReadService>;
  capabilities:()=>unknown;
  render:(ctx:RequestContext,taskId:string,artifactId:string,version:number,format:"raw"|"preview"|"png"|"pdf")=>Promise<unknown>;
  reconcile:(ctx:RequestContext,conversationId:string,operationId:string)=>Promise<unknown>;
}):Transport{return {async request(endpoint,input,ctx){
  if(!ctx)throw new AuthenticationError();
  if(!ctx.accountId)throw new OwnershipError("当前账号不存在");
  const i=(input??{}) as {params?:unknown;query?:unknown;body?:unknown};
  let data:unknown;
  switch(endpoint.id){
    case "workbench.tasks.inspect":{const p=ENDPOINTS.inspectWorkbenchTask.params.parse(i.params),q=ENDPOINTS.inspectWorkbenchTask.query.parse(i.query??{});data=await deps.tasks.inspect(ctx,p.taskId,q);break;}
    case "workbench.tasks.events":{const p=ENDPOINTS.readWorkbenchEvents.params.parse(i.params),q=ENDPOINTS.readWorkbenchEvents.query.parse(i.query??{});data=await deps.stream.read(ctx,p.taskId,q);break;}
    case "workbench.capabilities.list":data=deps.capabilities();break;
    case "workbench.artifacts.list":{const p=ENDPOINTS.listWorkbenchArtifacts.params.parse(i.params),q=ENDPOINTS.listWorkbenchArtifacts.query.parse(i.query??{});data=await deps.artifacts.listConversation(ctx,p.conversationId,q);break;}
    case "workbench.artifacts.read":{const p=ENDPOINTS.readWorkbenchArtifact.params.parse(i.params),q=ENDPOINTS.readWorkbenchArtifact.query.parse(i.query??{});const r=await deps.artifacts.read(ctx,p.taskId,p.artifactId,p.version,q.offset,q.limit);data={metadata:r.metadata,total:r.total,offset:q.offset,nextOffset:r.nextOffset,encoding:"base64",data:Buffer.from(r.bytes).toString("base64")};break;}
    case "workbench.artifacts.render":{const p=ENDPOINTS.renderWorkbenchArtifact.params.parse(i.params),q=ENDPOINTS.renderWorkbenchArtifact.query.parse(i.query??{});data=await deps.render(ctx,p.taskId,p.artifactId,p.version,q.format);break;}
    case "workbench.artifacts.reconcile":{const p=ENDPOINTS.reconcileWorkbenchArtifact.params.parse(i.params),b=ENDPOINTS.reconcileWorkbenchArtifact.body.parse(i.body);data=await deps.reconcile(ctx,p.conversationId,b.operationId);break;}
    default:throw new UnsupportedOperationError(endpoint.id);
  }
  return {data:endpoint.response.parse(data),meta:{requestId:ctx.requestId}};
}};}

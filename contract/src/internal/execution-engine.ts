import {z} from 'zod';
import {executionRouteV2Schema,type ModelRouteMode} from './model-routing';
export * from './model-routing';
export const executionRouteV1Schema=z.object({schemaVersion:z.literal(1),engine:z.enum(['pi','codex']),source:z.enum(['preference','chat-explicit','parent','legacy']),protocolKind:z.enum(['pi','codex-app-server']),runtimeVersion:z.string().min(1).optional()}).strict();
export const executionRouteSchema=z.discriminatedUnion('schemaVersion',[executionRouteV1Schema,executionRouteV2Schema]);
export type ExecutionRoute=z.infer<typeof executionRouteSchema>;
export const codexModelSpecSchema=z.object({engine:z.literal('codex'),protocolKind:z.literal('codex-app-server'),runtimeVersion:z.literal('0.159.3'),requestedModel:z.string().min(1).optional()}).strict();
export type CodexModelSpec=z.infer<typeof codexModelSpecSchema>;
/** SEMANTIC_BOUNDARY_ALLOW:只读取宿主冻结的执行路由，不判断创作内容。 */
export function frozenExecutionEngine(runtime:unknown):'pi'|'codex'{
 if(!runtime||typeof runtime!=='object'||Array.isArray(runtime))return 'pi';
 const route=(runtime as Record<string,unknown>).executionRoute;
 if(route===undefined)return 'pi';
 const parsed=executionRouteSchema.parse(route);
 return parsed.schemaVersion===1?parsed.engine:parsed.orchestrator.engine;
}
export function createExecutionRoute(engine:'pi'|'codex',source:z.infer<typeof executionRouteV1Schema>['source']='preference'):z.infer<typeof executionRouteV1Schema>{
 return {schemaVersion:1,engine,source,protocolKind:engine==='codex'?'codex-app-server':'pi',...(engine==='codex'?{runtimeVersion:'0.159.3'}:{})};
}
export function codexExecutionSpec():CodexModelSpec{return {engine:'codex',protocolKind:'codex-app-server',runtimeVersion:'0.159.3'};}
/** SEMANTIC_BOUNDARY_ALLOW: 按宿主已冻结协议键读取；旧记录沿原兼容分支，绝不读当前偏好补洞。 */
export function readFrozenModelRoute(runtime:unknown,mode:ModelRouteMode,capability:string){
 if(!runtime||typeof runtime!=='object'||Array.isArray(runtime))return null;
 const raw=(runtime as Record<string,unknown>).executionRoute;
 if(raw===undefined)return null;
 const key=`${mode}:${capability}`;
 if(raw&&typeof raw==='object'&&(raw as {schemaVersion?:unknown}).schemaVersion===2){
  const routes=(raw as {routes?:Record<string,unknown>}).routes;
  if(!routes||!Object.hasOwn(routes,key))throw new Error('MODEL_ROUTE_NOT_FROZEN');
 }
 const route=executionRouteSchema.parse(raw);
 return route.schemaVersion===1?null:route.routes[key]??(()=>{throw new Error('MODEL_ROUTE_NOT_FROZEN');})();
}

import {z} from 'zod';
export const executionRouteSchema=z.object({schemaVersion:z.literal(1),engine:z.enum(['pi','codex']),source:z.enum(['preference','chat-explicit','parent','legacy']),protocolKind:z.enum(['pi','codex-app-server']),runtimeVersion:z.string().min(1).optional()}).strict();
export type ExecutionRoute=z.infer<typeof executionRouteSchema>;
export const codexModelSpecSchema=z.object({engine:z.literal('codex'),protocolKind:z.literal('codex-app-server'),runtimeVersion:z.literal('0.159.3'),requestedModel:z.string().min(1).optional()}).strict();
export type CodexModelSpec=z.infer<typeof codexModelSpecSchema>;
/** SEMANTIC_BOUNDARY_ALLOW:只读取宿主冻结的执行路由，不判断创作内容。 */
export function frozenExecutionEngine(runtime:unknown):'pi'|'codex'{
 if(!runtime||typeof runtime!=='object'||Array.isArray(runtime))return 'pi';
 const route=(runtime as Record<string,unknown>).executionRoute;
 return route===undefined?'pi':executionRouteSchema.parse(route).engine;
}
export function createExecutionRoute(engine:'pi'|'codex',source:ExecutionRoute['source']='preference'):ExecutionRoute{
 return {schemaVersion:1,engine,source,protocolKind:engine==='codex'?'codex-app-server':'pi',...(engine==='codex'?{runtimeVersion:'0.159.3'}:{})};
}
export function codexExecutionSpec():CodexModelSpec{return {engine:'codex',protocolKind:'codex-app-server',runtimeVersion:'0.159.3'};}

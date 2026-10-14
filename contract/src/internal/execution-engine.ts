import {z} from 'zod';
export const executionRouteSchema=z.object({schemaVersion:z.literal(1),engine:z.enum(['pi','codex']),source:z.enum(['preference','chat-explicit','parent','legacy']),protocolKind:z.enum(['pi','codex-app-server']),runtimeVersion:z.string().min(1).optional()}).strict();
/** SEMANTIC_BOUNDARY_ALLOW:只读取宿主冻结的执行路由，不判断创作内容。 */
export function frozenExecutionEngine(runtime:unknown):'pi'|'codex'{
 if(!runtime||typeof runtime!=='object'||Array.isArray(runtime))return 'pi';
 const route=(runtime as Record<string,unknown>).executionRoute;
 return route===undefined?'pi':executionRouteSchema.parse(route).engine;
}

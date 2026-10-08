import {z} from "zod";
import {ENDPOINTS,CONTRACT_VERSION,getCliOperationPolicy,listAssistantOperations,type Endpoint} from "@creatoros/contract";

export const operationCatalogInput=z.object({domain:z.string().min(1).max(128).optional(),effect:z.enum(["read","write","destructive","external"]).optional(),offset:z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER).default(0),limit:z.number().int().min(1).max(50).default(20)}).strict();
export const operationDescribeInput=z.object({operation:z.string().min(1).max(256)}).strict();
/** 离线元信息来自真实合同，不读取用户数据，也不授予执行许可。 */
export function operationCatalog(raw:unknown){return listAssistantOperations(operationCatalogInput.parse(raw));}
export function describeOperation(operation:string,inputSchema:(endpoint:Endpoint)=>unknown,outputSchema:(schema:z.ZodTypeAny)=>unknown){
 const endpoint=Object.values(ENDPOINTS).find(endpoint=>endpoint.id===operation);
 if(!endpoint)throw Error(`未知 operation: ${operation}`);
 const policy=getCliOperationPolicy(operation);if(!policy)throw Error(`operation 缺 CLI policy: ${operation}`);
 return {operation:endpoint.id,method:endpoint.method,path:endpoint.path,
  description:endpoint.id==="ingestion.douyin.refresh"?`${endpoint.id} 已退役；刷新本人作品请用 creatoros douyin refresh (${endpoint.method} ${endpoint.path})`:`${endpoint.id} (${endpoint.method} ${endpoint.path})`,
  ...policy,contractVersion:CONTRACT_VERSION,inputSchema:inputSchema(endpoint),outputSchema:outputSchema(endpoint.response)};
}

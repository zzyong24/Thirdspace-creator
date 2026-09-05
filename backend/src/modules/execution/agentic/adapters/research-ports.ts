import type { RequestContext } from "@creatoros/contract";
import type { ResearchPorts } from "./research-adapter";
export interface ResearchReadServices {
  search(ctx:RequestContext,query:string,options:{signal:AbortSignal}):Promise<Array<{title:string;url:string;snippet:string}>>;
  read(ctx:RequestContext,url:string,signal:AbortSignal):ReturnType<ResearchPorts["webRead"]>;
  stageKnowledge(ctx:RequestContext,input:Parameters<ResearchPorts["knowledgeWrite"]>[0],signal:AbortSignal):ReturnType<ResearchPorts["knowledgeWrite"]>;
}
/** 每次任务装配独立实例；全文缓存只服务本轮分页，不跨用户、账号或恢复进程。 */
export function createResearchPorts(ctx:RequestContext,services:ResearchReadServices):ResearchPorts{
  const pages=new Map<string,Awaited<ReturnType<ResearchPorts["webRead"]>>>();
  return {
    async webSearch({query},signal){
      signal.throwIfAborted();const results=await services.search(ctx,query,{signal});signal.throwIfAborted();
      return {grounding:"web",results};
    },
    async webRead({url},signal){
      signal.throwIfAborted();const cached=pages.get(url);if(cached)return cached;
      const result=await services.read(ctx,url,signal);signal.throwIfAborted();
      // 登录提示不缓存，用户完成登录后同一任务允许重新观察。
      if(!result.needLogin){if(pages.size>=8)pages.delete(pages.keys().next().value!);pages.set(url,result);}
      return result;
    },
    async knowledgeWrite(input,signal){signal.throwIfAborted();return services.stageKnowledge(ctx,input,signal);},
  };
}

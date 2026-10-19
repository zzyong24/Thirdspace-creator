import {z} from "zod";
import type {RequestContext} from "@creatoros/contract";
import {agenticToolOutcomeSchema} from "@creatoros/contract/execution-worker";
import type {AgenticBackendTool} from "../execution/agentic-tool-binding";
import type {createCollectionToolPorts} from "../intelligence/collection-tool-ports";

const plan=z.object({query:z.string().optional(),limit:z.number().int().min(1).max(100).default(20),offset:z.number().int().nonnegative().default(0)}).strict();
const run=z.object({targetId:z.string().min(1)}).strict();
const status=z.object({targetId:z.string().min(1),runId:z.string().min(1),observation:z.number().int().min(1).max(1000)}).strict();
const definitions=[
 {name:"collect.plan",label:"列采集目标",description:"读取可采集来源及上次采集时间；通过limit/offset分页。不会启动采集。",effect:"none" as const,version:"2",parameters:plan},
 {name:"collect.run",label:"提交采集任务",description:"为targetId幂等提交采集任务。pending只代表排队或运行，不能宣称完成；保存返回的runId并使用collect.status观察。",effect:"committed" as const,version:"2",parameters:run},
 {name:"collect.status",label:"查看采集结果",description:"纯读当前任务提交的采集结果。保留targetId和runId；首次observation=1，此后每次新观察递增，不要复用旧序号请求新状态。pending不是成功；只有ok=true才是采集完成。受任务调用预算约束，未完成时如实交代任务ID。",effect:"none" as const,version:"1",parameters:status},
];
/** Worker 负责采集决策；原领域服务提交与读取任务，采集消费者仍沿既有执行链。 */
export function createAgenticCollectionTools(ports:{forTask(ctx:RequestContext,parentTaskId:string,executionSignal:AbortSignal):ReturnType<typeof createCollectionToolPorts>}){
 const tools:Record<string,AgenticBackendTool>={};
 for(const definition of definitions){
  tools[definition.name]={version:definition.version,parameters:definition.parameters,effect:definition.effect,
   async execute(ctx,input,scope){
    scope.signal.throwIfAborted();
    const collection=ports.forTask(ctx,scope.aiTaskId,scope.executionSignal??scope.signal);
    if(definition.name==="collect.plan"){
     const result=await collection.listTargets(plan.parse(input),scope.signal);
     scope.signal.throwIfAborted();
     return agenticToolOutcomeSchema.parse({status:"ok",summary:`发现 ${result.targets.length} 个可采集目标`,data:result,evidence:result.targets.map(target=>({entityId:target.id,title:target.label})),error:null,continuation:null,sideEffect:"none"});
    }
    const args=definition.name==="collect.status"?status.parse(input):run.parse(input);
    const result="runId" in args?await collection.readCollection(status.parse(args),scope.signal):await collection.runCollection(args,scope.signal);
    scope.signal.throwIfAborted();
    const summary=result.ok?`采集完成：新增 ${result.itemsNew}、更新 ${result.itemsUpdated}`:"pending" in result?`采集任务${result.status}，尚未完成，请使用collect.status继续观察`:"采集需要重新登录，请处理登录后查看原任务";
    return agenticToolOutcomeSchema.parse({status:"ok",summary,data:{targetId:args.targetId,...result,...("observation" in args?{observation:args.observation}:{})},evidence:result.ok?[{entityId:args.targetId,title:summary}]:[],error:null,continuation:null,sideEffect:definition.effect});
   },
  };
 }
 return {tools,definitions:definitions.map(({parameters,...definition})=>({...definition,parameters:z.record(z.string(),z.json()).parse(z.toJSONSchema(parameters,{target:"draft-7"}))}))};
}

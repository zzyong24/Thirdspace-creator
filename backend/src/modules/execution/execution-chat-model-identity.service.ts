import { isDeepStrictEqual } from "node:util";
import { z } from "zod";
import { asc, eq, executionCalls, executionTasks, type Db } from "@creatoros/backend";
import { chatWorkerInputSchema,codexExecutionSpec,codexModelSpecSchema,type ExecutionRef } from "@creatoros/contract/execution-worker";
import { createExecutionLeaseService } from "./execution-lease.service";
import { latestAgenticRootCall,createAgenticToolBinding, type AgenticBackendTool } from "./agentic-tool-binding";
import { executionModelIdentitySchema, prepareExecutionModelIdentity } from "./execution-model-identity.service";
import {recoverableCodexProposalParents,recoverableCodexSettledProposalParents} from "./chat-generation-recovery";
import { ConflictError } from "./execution.errors";
const entrySchema = ()=>z.object({inputDigest:z.string(),identity:executionModelIdentitySchema}).strict();
const identitiesSchema = ()=>z.record(z.string(),entrySchema());

/** 能力由真实父工具推出；凭据仅返回当前调用，不进入任务快照。 */
export function createExecutionChatModelIdentityService(db: Db, deps: {now?:()=>string;tools:Record<string,AgenticBackendTool>}) {
  const leases=createExecutionLeaseService(db,deps), binding=createAgenticToolBinding(deps.tools);
  type Identity=z.infer<typeof executionModelIdentitySchema>;
  async function access<T>(ref:ExecutionRef,callId:string, action:(state:Awaited<ReturnType<typeof scope>>)=>Promise<T>) {
    return leases.withLease(ref,"admission",async lease=>action(await scope(lease,callId)));
  }
  async function scope({tx,task}:Parameters<Parameters<typeof leases.withLease>[2]>[0],callId:string) {
    const payload=z.record(z.string(),z.json()).parse(task.payload), input=chatWorkerInputSchema.parse(payload.modelInput);
    const calls=await tx.select().from(executionCalls).where(eq(executionCalls.executionTaskId,task.id)).orderBy(asc(executionCalls.sequence));
    const parent=calls.find(call=>call.id===callId);
    if(!parent || parent.kind!=="tool" || parent.parentCallId || parent.toolExecutionClaimId || !["started","settled"].includes(parent.status))throw new ConflictError("子模型缺少真实父工具");
    const recovering=[...recoverableCodexProposalParents(task,calls),...recoverableCodexSettledProposalParents(task,calls)].includes(callId);
    const bound=binding.forCall(task,calls,parent,recovering?{readonlyRecovery:true}:undefined);
    if(bound.validationOutcome || (bound.effect!=="proposal" && !(bound.execution==="worker.script-draft" && bound.executionToolName==="script.draft" && bound.effect==="committed")))throw new ConflictError("当前工具不能取得子模型身份");
    let capability:string;
    if((bound.execution==="worker.script-hooks" && bound.executionToolName==="script.hooks") || (bound.execution==="worker.script-draft" && bound.executionToolName==="script.draft"))capability=input.capability;
    else if(bound.execution==="worker.structured-node" && ["topic.enrich","positioning.generate","calibration.diagnose","topic.generate","review.analyze","knowledge.distill"].includes(bound.executionToolName))capability=bound.executionToolName==="review.analyze"?"review.insights":bound.executionToolName;
    else throw new ConflictError("当前工具不是已登记的生成节点");
    if(parent.status!=="settled" && latestAgenticRootCall(calls)?.id!==bound.modelCallId)throw new ConflictError("旧模型回合不能取得新凭据");
    const identities=identitiesSchema().parse(payload.chatModelIdentities??{}), existing=identities[callId];
    if(recovering&&(!existing||!('engine' in existing.identity)||existing.identity.engine!=='codex'))throw new ConflictError('恢复子模型缺少原Codex身份');
    if(existing && (existing.inputDigest!==bound.inputDigest || existing.identity.capability!==capability))throw new ConflictError("子模型身份与原工具绑定不符");
    return {tx,task,payload,input,bound,capability,identities,existing};
  }
  async function save(state:Awaited<ReturnType<typeof scope>>,callId:string,identity:Identity) {
    if((state.input.executionEngine==='codex')!==('engine' in identity&&identity.engine==='codex'))throw new ConflictError('子模型与原冻结执行引擎不符');
    if(identity.capability!==state.capability)throw new ConflictError("子模型能力与原工具不符");
    if(state.existing){if(!isDeepStrictEqual(state.existing.identity,identity))throw new ConflictError("子模型配置与原执行身份不符");return state.existing.identity;}
    const entry=entrySchema().parse({inputDigest:state.bound.inputDigest,identity});
    await state.tx.update(executionTasks).set({payload:{...state.payload,chatModelIdentities:{...state.identities,[callId]:entry}}}).where(eq(executionTasks.id,state.task.id));
    return identity;
  }
  return {
    /** 开场沿用原主模型，但仍将其与实际父工具绑定，恢复不可替换。 */
    pinPrimary(ref:ExecutionRef,callId:string) {
      return access(ref,callId,async state=>{
        if(state.bound.execution!=="worker.script-hooks" && state.bound.execution!=="worker.script-draft")throw new ConflictError("专属生成节点不能借用聊天主模型");
        const identity=state.input.executionEngine==='codex'?prepareExecutionModelIdentity(state.capability,codexExecutionSpec()).identity:executionModelIdentitySchema.parse(state.payload.modelIdentity);
        return save(state,callId,identity);
      });
    },
    async pin(ref:ExecutionRef,callId:string,raw:unknown) {
      const credential=structuredClone(raw);
      return access(ref,callId,async state=>{
        if(state.bound.execution!=="worker.structured-node")throw new ConflictError("当前工具不能替换主模型凭据");
        if(state.input.executionEngine==='codex'&&!codexModelSpecSchema.safeParse(credential).success)throw new ConflictError('原Codex子节点不能改用API模型');
        if((state.input.executionEngine??'pi')==='pi'&&codexModelSpecSchema.safeParse(credential).success)throw new ConflictError('原Pi子节点不能改用Codex');
        const prepared=prepareExecutionModelIdentity(state.capability,credential);
        await save(state,callId,prepared.identity);
        return prepared.credential;
      });
    },
    read(ref:ExecutionRef,callId:string) {
      return access(ref,callId,async state=>{if(!state.existing)throw new ConflictError("子模型尚未绑定身份");return structuredClone(state.existing.identity);});
    },
  };
}

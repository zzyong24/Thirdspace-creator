import {transcribeAsrPlanSchema,transcribeLocalFallbackSchema} from '@creatoros/contract/execution-worker';
import {ConflictError} from './execution.errors';
/** 两条身份各自保留；本地回退不能覆盖原云端选择和回执。 */
export function readTranscribeAsrPlan(payload:Record<string,unknown>,awemeId:string){
 function map(key:string){const raw=payload[key];if(raw!==undefined&&(!raw||typeof raw!=='object'||Array.isArray(raw)))throw new ConflictError('转写执行选择损坏');return (raw??{}) as Record<string,unknown>;}
 const plans=map('transcribeAsrPlans'),fallbacks=map('transcribeLocalFallbacks');
 const primary=Object.hasOwn(plans,awemeId)?transcribeAsrPlanSchema.parse(plans[awemeId]):null;
 const fallback=Object.hasOwn(fallbacks,awemeId)?transcribeLocalFallbackSchema.parse(fallbacks[awemeId]):null;
 if(fallback&&(!primary||primary.identity.protocol==='whisper-local.v1'||fallback.plan.identity.protocol!=='whisper-local.v1'||fallback.plan.identity.model!=='Xenova/whisper-small'||fallback.plan.audioDigest!==primary.audioDigest||fallback.plan.audioByteLength!==primary.audioByteLength||fallback.plan.identity.language!==primary.identity.language))throw new ConflictError('本地回退与原云端输入不符');
 return {plans,fallbacks,primary,fallback,plan:fallback?.plan??primary};
}

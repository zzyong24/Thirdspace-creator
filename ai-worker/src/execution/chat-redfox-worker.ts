import {z} from "zod";
import {redfoxInputSchema,redfoxObservationSchema,agenticToolOutcomeSchema,type WorkerPort} from "@creatoros/contract/execution-worker";
import {queryRedfox} from "./redfox-client";
const preparation=z.object({input:redfoxInputSchema,observation:redfoxObservationSchema.optional(),credential:z.object({key:z.string(),fingerprint:z.string()}).nullable()});
export async function runChatRedfoxInWorker(callId:string,signal:AbortSignal,call:(port:WorkerPort,input:unknown,signal?:AbortSignal)=>Promise<unknown>){
 const prepared=preparation.parse(await call("prepareChatRedfox",{callId},signal));signal.throwIfAborted();
 const observation=prepared.observation??(prepared.credential?await queryRedfox(prepared.input,prepared.credential.key,signal):{status:"error" as const,code:"REDFOX_NOT_CONFIGURED"});
 return agenticToolOutcomeSchema.parse(await call("settleChatRedfox",{callId,observation}).catch(()=>call("settleChatRedfox",{callId,observation})));
}

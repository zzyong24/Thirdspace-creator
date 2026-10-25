import type {RequestContext} from "@creatoros/contract";
import {modelProbeRequestSchema,modelProbeResponseSchema} from "@creatoros/contract/model-probe-io";
import {z} from "zod";
import {createRequestIoService} from "./request-io.service";
type Request=z.infer<typeof modelProbeRequestSchema>;
export function createModelProbeIoService(deps:{entryPath:()=>string;timeoutMs?:number}){
 const io=createRequestIoService({...deps,parseInput:input=>modelProbeRequestSchema.parse(input),parseResponse:raw=>modelProbeResponseSchema.parse(raw)});
 return {
  async probeText(ctx:RequestContext,spec:Extract<Request,{type:"text"}>["spec"],signal?:AbortSignal){const {apiFormat,baseUrl,model,authStyle,token,displayModelKey}=spec;return z.object({text:z.string(),reasoningText:z.string()}).parse(await io.request(ctx,{type:"text",spec:{apiFormat,baseUrl,model,authStyle,token,displayModelKey}},signal));},
  async probeImage(ctx:RequestContext,spec:Extract<Request,{type:"image"}>["spec"],signal?:AbortSignal){const {provider,baseUrl,model,token,displayModelKey}=spec;return z.object({byteLength:z.number().int().nonnegative()}).parse(await io.request(ctx,{type:"image",spec:{provider,baseUrl,model,token,displayModelKey}},signal));},
  stop:()=>io.stop(),
 };
}

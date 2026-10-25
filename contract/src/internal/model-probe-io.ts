import {z} from "zod";
const common={requestId:z.string().min(1),deadlineAt:z.number().finite()};
export const modelProbeRequestSchema=z.discriminatedUnion("type",[
 z.object({type:z.literal("cancel"),requestId:z.string()}).strict(),
 z.object({...common,type:z.literal("text"),textOutputLimit:z.union([z.literal(128),z.literal(8192)]).optional(),spec:z.object({apiFormat:z.enum(["anthropic","openai_chat","openai_responses"]),baseUrl:z.string().nullable(),model:z.string().min(1),authStyle:z.enum(["bearer","x-api-key"]).optional(),token:z.string(),displayModelKey:z.literal("channel-managed").optional()}).strict()}).strict(),
 z.object({...common,type:z.literal("image"),spec:z.object({provider:z.string().min(1),baseUrl:z.string().nullable(),model:z.string().min(1),token:z.string(),displayModelKey:z.literal("channel-managed").optional()}).strict()}).strict(),
]);
export const modelProbeResponseSchema=z.discriminatedUnion("type",[
 z.object({type:z.literal("ready")}).strict(),
 z.object({type:z.literal("result"),requestId:z.string(),value:z.union([z.object({text:z.string(),reasoningText:z.string()}).strict(),z.object({byteLength:z.number().int().nonnegative()}).strict()])}).strict(),
 z.object({type:z.literal("error"),requestId:z.string(),message:z.string().max(2000)}).strict(),
]);

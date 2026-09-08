import {z} from "zod";
/** 私有短请求 IPC；不构造业务任务或 ExecutionRef，不持久化文本/密钥。 */
export const embeddingIoRequestSchema=z.discriminatedUnion("type",[
 z.object({type:z.literal("embed"),requestId:z.string().min(1),deadlineAt:z.number().finite(),spec:z.object({apiFormat:z.enum(["anthropic","openai_chat","openai_responses"]),baseUrl:z.string().nullable(),model:z.string().min(1),token:z.string(),displayModelKey:z.literal("channel-managed").optional(),structuredOutputs:z.boolean().optional()}).strict(),texts:z.array(z.string())}).strict(),
 z.object({type:z.literal("cancel"),requestId:z.string().min(1)}).strict(),
]);
export const embeddingIoResponseSchema=z.discriminatedUnion("type",[
 z.object({type:z.literal("ready")}).strict(),
 z.object({type:z.literal("result"),requestId:z.string(),embeddings:z.array(z.array(z.number().finite()).min(1))}).strict(),
 z.object({type:z.literal("error"),requestId:z.string(),code:z.enum(["cancelled","rejected","unknown","invalid"])}).strict(),
]);

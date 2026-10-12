import {z} from 'zod';
export const localCodexStatusSchema=z.object({engine:z.literal('codex'),installed:z.boolean(),available:z.boolean(),version:z.string().nullable(),loginStatus:z.enum(['authenticated','not-required','unauthenticated','unchecked']),errorCode:z.string().max(128).optional(),capabilities:z.object({text:z.boolean(),imageUnderstanding:z.boolean(),imageGeneration:z.boolean(),imageErrorCode:z.string().max(128).optional()}).strict().optional()}).strict();
export const localCodexStatusRequestSchema=z.discriminatedUnion('type',[
 z.object({type:z.literal('status'),requestId:z.string().min(1),deadlineAt:z.number().int().positive()}).strict(),
 z.object({type:z.literal('cancel'),requestId:z.string().min(1)}).strict(),
]);
export const localCodexStatusResponseSchema=z.discriminatedUnion('type',[
 z.object({type:z.literal('ready')}).strict(),
 z.object({type:z.literal('result'),requestId:z.string().min(1),value:localCodexStatusSchema}).strict(),
 z.object({type:z.literal('error'),requestId:z.string().min(1),message:z.string().max(128)}).strict(),
]);

// 公开预检只返回受控协议安全码，不把异常消息或供应商凭据投影到页面。
export const codexCapabilityReasonSchema=z.enum(['CODEX_LOGIN_REQUIRED','CODEX_IMAGE_CAPABILITY_UNAVAILABLE','CODEX_IMAGE_MODEL_UNAVAILABLE','CODEX_CAPABILITY_UNAVAILABLE','CODEX_CAPABILITY_UNVERIFIED','CODEX_STATUS_UNAVAILABLE','CODEX_STATUS_CANCELLED','CODEX_CONFIG_CHANGED','CODEX_RUNTIME_UNAVAILABLE','CODEX_VERSION_UNSUPPORTED','CODEX_PLATFORM_UNSUPPORTED']);

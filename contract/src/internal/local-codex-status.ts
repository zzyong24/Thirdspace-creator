import {z} from 'zod';
export const localCodexStatusSchema=z.object({engine:z.literal('codex'),installed:z.boolean(),available:z.boolean(),version:z.string().nullable(),loginStatus:z.enum(['authenticated','not-required','unauthenticated','unchecked']),errorCode:z.string().max(128).optional()}).strict();
export const localCodexStatusRequestSchema=z.discriminatedUnion('type',[
 z.object({type:z.literal('status'),requestId:z.string().min(1),deadlineAt:z.number().int().positive()}).strict(),
 z.object({type:z.literal('cancel'),requestId:z.string().min(1)}).strict(),
]);
export const localCodexStatusResponseSchema=z.discriminatedUnion('type',[
 z.object({type:z.literal('ready')}).strict(),
 z.object({type:z.literal('result'),requestId:z.string().min(1),value:localCodexStatusSchema}).strict(),
 z.object({type:z.literal('error'),requestId:z.string().min(1),message:z.string().max(128)}).strict(),
]);

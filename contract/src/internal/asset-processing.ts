import { z } from 'zod';
export const assetProcessingInputSchema = z.object({ taskType: z.enum(['asset.classify', 'material.extract']), assetId: z.string().min(1), fileId: z.string().nullable(), checksum: z.string().nullable(), fileName: z.string(), mimeType: z.string(), skipModel: z.boolean() }).strict();
export const materialExtractionSchema = z.object({ status: z.enum(['done', 'failed', 'unsupported']), text: z.string().optional(), note: z.string() }).strict().refine(v => v.status !== 'done' || Boolean(v.text?.trim()), '抽取成功必须有正文');
export const assetProcessingReadSchema = z.object({ bytes: z.instanceof(Uint8Array).nullable(), mimeType: z.string(), extraction: materialExtractionSchema.nullable() }).strict();
export const assetProcessingCompleteSchema = z.object({ callId: z.string().min(1).optional(), text: z.string().optional() }).strict().refine(v => Boolean(v.callId) === Boolean(v.text));

import { z } from "zod";
const digest = z.string().regex(/^sha256:[a-f0-9]{64}$/);
const bytes = z.number().int().positive().max(2147483647);
export const asrIdentitySchema = z.object({
    protocol: z.enum(["openai-audio-transcriptions.v1", "qwen-chat-audio.v1", "mimo-chat-audio.v1"]),
    provider: z.string().min(1).max(128), model: z.string().min(1).max(512), endpointDigest: digest, language: z.string().max(128).nullable(),
}).strict();
export const asrAudioManifestSchema = z.object({ audioDigest: digest, audioByteLength: bytes, chunks: z.array(z.object({ digest, byteLength: bytes }).strict()).min(1).max(10000) }).strict().refine(value => value.chunks.reduce((sum, chunk) => sum + chunk.byteLength, 0) <= value.audioByteLength, "分片字节不能超出原音频");
export const asrRequestSchema = asrIdentitySchema.extend({ audioDigest: digest, audioByteLength: bytes, chunks: asrAudioManifestSchema.shape.chunks, chunkDigest: digest, chunkByteLength: bytes, chunkIndex: z.number().int().nonnegative(), chunkCount: z.number().int().positive().max(10000) }).strict().refine(value => value.chunkCount === value.chunks.length && value.chunks[value.chunkIndex]?.digest === value.chunkDigest && value.chunks[value.chunkIndex]?.byteLength === value.chunkByteLength && asrAudioManifestSchema.safeParse({ audioDigest: value.audioDigest, audioByteLength: value.audioByteLength, chunks: value.chunks }).success, "分片与完整清单不符");
export const asrTaskInputSchema = z.object({ kind: z.literal("transcribe.douyin"), awemeIds: z.array(z.string().min(1).max(128)).min(1).max(10000), identity: asrIdentitySchema }).strict().refine(value => new Set(value.awemeIds).size === value.awemeIds.length, "作品不能重复");
export const asrTranscriptSchema = z.object({ text: z.string().max(1900000), language: z.string().max(128).optional() }).strict();
export const asrResultReceiptSchema = z.object({ schemaVersion: z.literal(1), result: asrTranscriptSchema }).strict();
const call = z.object({ awemeId: z.string().min(1).max(128), callId: z.string().min(1).max(256) }).strict();
export const asrPortInputSchemas = {
    reserveAsrRequest: z.object({ awemeId: z.string().min(1).max(128), request: asrRequestSchema }).strict(),
    startAsrRequest: call,
    settleAsrRequest: z.discriminatedUnion("status", [
        call.extend({ status: z.literal("settled"), result: asrTranscriptSchema }).strict(),
        call.extend({ status: z.literal("unknown") }).strict(),
        call.extend({ status: z.literal("rejected"), rejectionStatus: z.union([z.literal(400), z.literal(401), z.literal(402), z.literal(403), z.literal(404), z.literal(405), z.literal(413), z.literal(415), z.literal(422), z.literal(429)]).optional() }).strict(),
    ]),
};
export type AsrRequest = z.infer<typeof asrRequestSchema>;

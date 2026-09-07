import {z} from "zod";
/** 仅用于原任务音频快照；存储 key 不接收自 Worker。 */
export const transcribeAudioPortSchemas={
 readTranscribeAudio:z.object({awemeId:z.string().min(1).max(128)}).strict(),
 saveTranscribeAudio:z.object({awemeId:z.string().min(1).max(128),bytes:z.instanceof(Uint8Array).refine(value=>value.byteLength>0 && value.byteLength<=2_147_483_647,"音频字节超出存储范围")}).strict(),
};
export const transcribeAudioReceiptSchema=z.object({schemaVersion:z.literal(1),state:z.enum(['reserved','ready']),storageKey:z.string().min(1).max(1024),audioDigest:z.string().regex(/^sha256:[a-f0-9]{64}$/),audioByteLength:z.number().int().positive().max(2_147_483_647)}).strict();

import {z} from "zod";
import {assetGenerationInputSchema} from "./asset-generation";
const callId=z.string().min(1);
export const coverReferenceSchema=z.object({assetId:z.string().min(1),assetFileId:z.string().min(1).optional(),checksum:z.string().min(1),mimeType:z.string().min(1)}).strict();
export const coverImagePreparationSchema=z.object({
 input:assetGenerationInputSchema,
 reference:coverReferenceSchema.nullable(),
 resultData:z.record(z.string(),z.json()),
}).strict();
export const coverImageReadinessSchema=z.discriminatedUnion("status",[z.object({status:z.literal("pending")}).strict(),z.object({status:z.literal("prepared"),value:coverImagePreparationSchema}).strict()]);
export const coverPortInputSchemas={
 reserveCoverModel:z.object({operationKey:z.string().min(1),request:z.record(z.string(),z.json()).refine(value=>JSON.stringify(value).length<=4_000_000)}).strict(),
 startCoverModel:z.object({callId}).strict(),
 prepareCoverImage:z.object({}).strict(),
 readCoverReference:z.object({callId}).strict(),
};

import {z} from "zod";
export const videoSkillSchema=z.enum(["video.scenes","video.cards","video.broll","video.subtitles","video.director","material.match"]);
export const videoFrozenSchema=z.object({task:z.object({id:z.string().min(1),projectId:z.string().min(1),retryOfTaskId:z.string().nullable(),inputData:z.record(z.string(),z.json())}),inventory:z.array(z.record(z.string(),z.json())),storyboard:z.array(z.record(z.string(),z.json())),retryRuntime:z.record(z.string(),z.json()),modelIdentities:z.record(z.string(),z.json())}).strict();
export const videoPortInputSchemas={
 resolveVideoModel:z.object({skillId:videoSkillSchema}).strict(),
 reserveVideoModel:z.object({skillId:videoSkillSchema,operationKey:z.string().min(1).max(256),request:z.record(z.string(),z.json())}).strict(),
 recordVideoStep:z.object({stepNo:z.number().int().positive(),kind:z.string(),text:z.string().max(20000),toolCalls:z.array(z.json())}).strict(),
 saveVideoCheckpoint:z.object({checkpoint:z.record(z.string(),z.json())}).strict(),
 saveVideoResult:z.object({text:z.string().min(1).max(2000000)}).strict(),
};

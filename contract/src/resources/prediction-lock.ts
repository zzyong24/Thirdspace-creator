import {z} from "zod";
import {aiTaskResource} from "./ai";
import {predictionResource,rubricVersionResource} from "./calibration";
const id=z.string().min(1);
export const predictionLockSource=z.object({conversationId:id,sourceMessageId:id,toolCallId:id}).strict();
export type PredictionLockSource=z.infer<typeof predictionLockSource>;
export const predictionLockState=z.object({
 policyVersion:z.literal(1),source:predictionLockSource,
 status:z.enum(["available","legacy_unknown","running","awaiting_confirmation","locked","failed","unknown","missing"]),
 subjectId:id.nullable(),projectId:id.nullable(),baselineDigest:z.string().nullable(),
 baseline:z.object({artifactId:id,versionId:id,sha256:z.string()}).strict().nullable(),
 diagnoseTaskId:id.nullable(),resultId:id.nullable(),predictionId:id.nullable(),task:aiTaskResource.nullable(),
 formalPrediction:z.object({prediction:predictionResource,rubric:rubricVersionResource.pick({id:true,dimensions:true})}).strict().nullable().optional(),
}).strict();
export type PredictionLockState=z.infer<typeof predictionLockState>;

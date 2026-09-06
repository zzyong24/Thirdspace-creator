import { z } from "zod";
const id=z.string().min(1).max(256);
export const agenticToolOutcomeSchema=z.object({
  status:z.enum(["ok","partial","blocked","error"]),
  summary:z.string().max(10000),
  evidence:z.array(z.object({sourceUrl:z.string().optional(),title:z.string().optional(),text:z.string().optional(),entityId:z.string().optional(),version:z.string().optional()}).strict()).max(1000),
  data:z.json().optional(),
  error:z.object({code:z.enum(["transient","stale_observation","no_evidence","needs_login","captcha","permission","unknown_commit","cancelled","deadline","invalid_input"]),retryable:z.boolean(),recovery:z.string().max(10000)}).strict().nullable(),
  continuation:z.object({evidenceRef:id,nextOffset:z.number().int().nonnegative(),totalChars:z.number().int().nonnegative()}).strict().nullable(),
  sideEffect:z.enum(["none","proposal","committed","unknown"]),
}).strict().refine(value=>JSON.stringify(value).length<=1_000_000,"工具结果过大");
export type AgenticToolOutcome=z.infer<typeof agenticToolOutcomeSchema>;
export const reserveAgenticToolSchema=z.object({modelCallId:id,toolCallId:id}).strict();
export const settleAgenticToolSchema=z.discriminatedUnion("status",[
  z.object({callId:id,status:z.literal("settled"),output:agenticToolOutcomeSchema}).strict(),
  z.object({callId:id,status:z.literal("unknown")}).strict(),
]);
export const agenticToolReservationSchema=z.object({
  callId:id,status:z.enum(["reserved","started","settled","unknown","rejected"]),toolName:id,input:z.json(),
  validationOutcome:agenticToolOutcomeSchema.optional(),
  receipt:z.object({schemaVersion:z.literal(1),kind:z.literal("tool"),toolCallId:id,toolName:id,output:agenticToolOutcomeSchema,reusedCallId:id.optional()}).strict().optional(),
}).strict();

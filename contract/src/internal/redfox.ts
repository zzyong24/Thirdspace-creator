import {z} from "zod";
export const redfoxInputSchema=z.discriminatedUnion("action",[
 z.object({action:z.literal("hotspots"),startDate:z.string().min(10).max(19),endDate:z.string().min(10).max(19)}).strict(),
 z.object({action:z.literal("search"),keyword:z.string().trim().min(1).max(200),page:z.number().int().min(1).max(100).default(1)}).strict(),
 z.object({action:z.literal("accountWorks"),authorUrl:z.string().url(),offset:z.number().int().min(0).max(20000).multipleOf(20).default(0)}).strict(),
 z.object({action:z.literal("detail"),workId:z.string().regex(/^\d{5,30}$/)}).strict(),
 z.object({action:z.literal("transcriptSubmit"),url:z.string().url()}).strict(),
 z.object({action:z.literal("transcriptResult"),taskId:z.string().min(1).max(200)}).strict(),
]);
export type RedfoxInput=z.infer<typeof redfoxInputSchema>;
export const redfoxObservationSchema=z.object({status:z.enum(["ok","error","unknown"]),data:z.json().optional(),code:z.string().max(100).optional()}).strict();

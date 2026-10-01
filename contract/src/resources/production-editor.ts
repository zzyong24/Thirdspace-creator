import { z } from "zod";
import { videoRenderCard, videoRenderBroll, videoBrollMotion } from "./video-render";

// T-1037：只表达用户或模型明确提出的修改，身份/前值由服务端再次校验。
const target = { itemId: z.string().min(1), expectedItemDigest: z.string().regex(/^sha256:[a-f0-9]{64}$/) };
export const productionEditorEdit = z.discriminatedUnion("type", [
  z.object({type:z.literal("updateCaption"),...target,patch:z.object({
    cn:z.string().min(1).optional(),en:z.string().nullable().optional(),
    start:z.number().nonnegative().optional(),end:z.number().positive().optional(),
  }).strict()} ).strict(),
  z.object({type:z.literal("updateCard"),...target,card:videoRenderCard}).strict(),
  z.object({type:z.literal("updateBroll"),...target,patch:z.object({
    at:z.number().nonnegative().optional(),durationSec:z.number().positive().optional(),
    file:z.string().min(1).optional(),label:z.string().min(1).optional(),motion:videoBrollMotion.optional(),
  }).strict()}).strict(),
  z.object({type:z.literal("updateSceneTitle"),...target,title:z.string().min(1)}).strict(),
  z.object({type:z.literal("removeItem"),...target}).strict(),
  z.object({type:z.literal("addBroll"),broll:videoRenderBroll}).strict(),
]);
export type ProductionEditorEdit = z.infer<typeof productionEditorEdit>;

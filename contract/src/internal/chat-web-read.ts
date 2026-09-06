import { z } from "zod";
const webUrl = z.string().url().max(16384).refine((value) => {
  const url = new URL(value);
  return ["http:", "https:"].includes(url.protocol) && !url.username && !url.password;
}, "网页地址必须为不含凭据的 HTTP(S) URL");
/** 原始网页观察，不允许 Worker 自报账号、候选或已保存的素材。 */
export const chatWebReadObservationSchema = z.object({
  text: z.string().min(1).max(2 * 1024 * 1024).refine((value) => value.trim().length > 0 && new TextEncoder().encode(value).byteLength <= 2 * 1024 * 1024, "网页正文为空或超过 2 MiB"),
  title: z.string().max(10000), finalUrl: webUrl,
  extractor: z.enum(["chatgpt-share", "readability", "rendered-text"]),
  extractPath: z.enum(["ssr", "dom", "readability", "rendered-text"]),
  turnCount: z.number().int().nonnegative().nullable(),
}).strict();
export const chatWebReadCallSchema = z.object({ callId: z.string().min(1).max(256) }).strict();
export const chatWebReadRecordSchema = chatWebReadCallSchema.extend({ observation: chatWebReadObservationSchema }).strict();

export const chatWebReadSessionSaveSchema = chatWebReadCallSchema.extend({ revision: z.string().min(1).nullable(), stateJson: z.string().max(2 * 1024 * 1024) }).strict();

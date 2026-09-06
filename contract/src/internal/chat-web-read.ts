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

/** 仅记录明确失败，不接受成功素材、正文或 Worker 自报的执行终态。 */
export const chatWebReadFailureSchema = chatWebReadCallSchema.extend({failure:z.discriminatedUnion("kind",[
  z.object({kind:z.literal("needs_login")}).strict(),
  z.object({kind:z.literal("http_blocked"),status:z.number().int().min(400).max(599),message:z.string().min(1).max(10000),alternates:z.array(z.object({title:z.string().max(10000),url:webUrl,snippet:z.string().max(10000)}).strict()).max(5)}).strict(),
  z.object({kind:z.literal("browser_runtime_unavailable")}).strict(),
  z.object({kind:z.literal("read_error"),code:z.enum(["transient","no_evidence","permission"]),message:z.string().min(1).max(10000)}).strict(),
])}).strict();

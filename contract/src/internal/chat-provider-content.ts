import { z } from "zod";
const metadata = z.record(z.string(), z.json()).optional();
const fileData = z.discriminatedUnion("type", [
  z.object({ type: z.literal("data"), data: z.string() }).strict(),
  z.object({ type: z.literal("url"), url: z.string().url() }).strict(),
]);
/** SDK V4 非文本回执的持久形状；仅校验协议，不做内容选择。 */
export const chatProviderNonTextSchema = z.union([
  z.object({ type: z.literal("source"), sourceType: z.literal("url"), id: z.string().min(1), url: z.string().url(), title: z.string().optional(), providerMetadata: metadata }).passthrough(),
  z.object({ type: z.literal("source"), sourceType: z.literal("document"), id: z.string().min(1), mediaType: z.string().min(1), title: z.string(), filename: z.string().optional(), providerMetadata: metadata }).passthrough(),
  z.object({ type: z.enum(["file", "reasoning-file"]), mediaType: z.string().min(1), data: fileData, providerMetadata: metadata }).passthrough(),
]);

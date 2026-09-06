import { createHash } from "node:crypto";
import { z } from "zod";
import { chatWebReadObservationSchema } from "@creatoros/contract/execution-worker";
import type { executionEvidence } from "../../schema/intelligence";
import { canonicalJson } from "../ai/canonical-json";
import { ConflictError } from "./execution.errors";
type Observation = z.infer<typeof chatWebReadObservationSchema>;
type Evidence = typeof executionEvidence.$inferSelect;
const metadataSchema = z.object({ kind: z.literal("chat.web.read"), inputDigest: z.string(), extractor: chatWebReadObservationSchema.shape.extractor, extractPath: chatWebReadObservationSchema.shape.extractPath, turnCount: chatWebReadObservationSchema.shape.turnCount }).strict();
// SEMANTIC_BOUNDARY_ALLOW: 摘要只绑定原始观察身份，不判断内容相关性或创作价值。
export const chatWebReadDigest = (url: string, observation: Observation) => createHash("sha256").update(canonicalJson({ url, observation })).digest("hex");

/** 只验证原始观察身份；不授予新浏览器操作或素材写入权限。 */
export function readChatWebReadEvidence(row: Evidence, expected: { taskId: string; callId: string; inputDigest: string; url?: string }) {
  const metadata = metadataSchema.parse(row.metadata);
  const observation = chatWebReadObservationSchema.parse({ text: row.fullText, title: row.title, finalUrl: row.sourceUrl, extractor: metadata.extractor, extractPath: metadata.extractPath, turnCount: metadata.turnCount });
  const requested = new URL(row.requestedUrl);
  if (!["http:", "https:"].includes(requested.protocol) || requested.username || requested.password || row.executionTaskId !== expected.taskId || row.originCallId !== expected.callId || metadata.inputDigest !== expected.inputDigest || (expected.url !== undefined && row.requestedUrl !== expected.url) || row.contentHash !== chatWebReadDigest(row.requestedUrl, observation) || row.byteLength !== Buffer.byteLength(row.fullText, "utf8")) throw new ConflictError("持久网页观察与原调用不符");
  return observation;
}

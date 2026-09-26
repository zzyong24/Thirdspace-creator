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

/** 分页复用原证据；缓存和浏览器观察各自校验既有摘要，不登记第二份全文。 */
export function readChatWebReadPageEvidence(row: Evidence, expected: { taskId: string; callId: string; inputDigest: string; url: string; version: string }) {
  if (row.contentHash !== expected.version) throw new ConflictError("网页分页版本不符");
  const metadata = z.object({kind:z.string()}).parse(row.metadata);
  if (metadata.kind === "chat.web.read") return readChatWebReadEvidence(row, expected).text;
  const cached = z.object({kind:z.literal("chat.web.read.cache"),inputDigest:z.string(),assetId:z.string(),fileId:z.string()}).strict().parse(row.metadata);
  // SEMANTIC_BOUNDARY_ALLOW: 复核既有缓存摘要和归属，只防正文被替换，不判断语义。
  const contentHash = createHash("sha256").update(JSON.stringify({url:row.requestedUrl,assetId:cached.assetId,fileId:cached.fileId,text:row.fullText})).digest("hex");
  if (row.executionTaskId !== expected.taskId || row.originCallId !== expected.callId || row.requestedUrl !== expected.url || cached.inputDigest !== expected.inputDigest || row.contentHash !== contentHash || row.byteLength !== Buffer.byteLength(row.fullText,"utf8")) throw new ConflictError("缓存网页分页证据与原调用不符");
  return row.fullText;
}

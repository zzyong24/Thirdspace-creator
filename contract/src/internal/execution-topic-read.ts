import { z } from "zod";
const id = z.string().min(1).max(256);
const url = z
  .string()
  .url()
  .max(8192)
  .refine((value) => {
    const u = new URL(value);
    return (
      ["http:", "https:"].includes(u.protocol) && !u.username && !u.password
    );
  }, "只支持无凭据的HTTP链接");
export const topicReadTargetSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("search") }).strict(),
  z.object({ kind: z.literal("source"), sourceId: id }).strict(),
]);
export const topicReadRequestSchema = z.discriminatedUnion("kind", [
  z
    .object({ kind: z.literal("search"), query: z.string().min(1).max(8192) })
    .strict(),
  z
    .object({
      kind: z.enum(["web", "rss"]),
      sourceId: id,
      name: z.string().max(1000),
      domain: z.string().min(1).max(253),
      url,
    })
    .strict(),
]);
export const topicReadErrorCodeSchema = z.enum([
  "NEEDS_LOGIN",
  "CAPTCHA",
  "BROWSER_RUNTIME_UNAVAILABLE",
  "TRANSIENT",
  "PERMISSION",
  "INVALID_INPUT",
  "UNSUPPORTED",
  "NOT_FOUND",
]);
const error = z
  .object({ code: topicReadErrorCodeSchema, retryable: z.boolean() })
  .strict();
export const topicReadReceiptSchema = z.union([
  z
    .object({
      kind: z.literal("search"),
      status: z.literal("ok"),
      data: z
        .object({
          results: z
            .array(
              z
                .object({
                  title: z.string().max(10000),
                  url,
                  snippet: z.string().max(20000),
                })
                .strict(),
            )
            .max(100),
        })
        .strict(),
    })
    .strict(),
  z
    .object({
      kind: z.enum(["web", "rss"]),
      status: z.literal("ok"),
      data: z
        .object({
          sourceUrl: url,
          title: z.string().max(10000),
          text: z.string().max(1_500_000),
        })
        .strict(),
    })
    .strict(),
  z
    .object({
      kind: z.enum(["search", "web", "rss"]),
      status: z.literal("error"),
      error,
    })
    .strict(),
]);
export const topicReadStoredReceiptSchema = z
  .object({
    protocol: z.literal("topic.read.v1"),
    target: topicReadTargetSchema,
    request: topicReadRequestSchema,
    requestDigest: z.string().regex(/^sha256:[a-f0-9]{64}$/),
    receipt: topicReadReceiptSchema,
  })
  .strict();
export const topicReadReservationSchema = z
  .object({
    callId: id,
    status: z.enum(["reserved", "started", "settled", "unknown", "rejected"]),
    request: topicReadRequestSchema,
    requestDigest: z.string().regex(/^sha256:[a-f0-9]{64}$/),
    receipt: topicReadReceiptSchema.optional(),
  })
  .strict();
export const topicReadPortInputSchemas = {
  reserveTopicRead: z
    .object({
      target: topicReadTargetSchema,
      ordinal: z.number().int().min(1).max(2).default(1),
    })
    .strict(),
  startTopicRead: z.object({ callId: id }).strict(),
  settleTopicRead: z.union([
    z.object({ callId: id, receipt: topicReadReceiptSchema }).strict(),
    z.object({ callId: id, status: z.literal("unknown") }).strict(),
  ]),
  readTopicRead: z.object({ callId: id }).strict(),
  readTopicBrowserSession: z.object({ callId: id }).strict(),
  saveTopicBrowserSession: z
    .object({
      callId: id,
      revision: z.string().min(1).nullable(),
      stateJson: z.string().max(2_100_000),
    })
    .strict(),
};
export type TopicReadTarget = z.infer<typeof topicReadTargetSchema>;
export type TopicReadRequest = z.infer<typeof topicReadRequestSchema>;
export type TopicReadReceipt = z.infer<typeof topicReadReceiptSchema>;

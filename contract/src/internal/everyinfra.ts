import { z } from "zod";

export const defaultEveryInfraHost = "https://api.everyinfra.com";
export const everyInfraHostSchema = z.enum([defaultEveryInfraHost, "https://api-cn.everyinfra.com"]);
export type EveryInfraHost = z.infer<typeof everyInfraHostSchema>;
export type EveryInfraCredentials = { apiKey: string; baseUrl: EveryInfraHost };

/** 公开笔记地址只携带作品身份，访问参数留给内部读源端口。 */
export function publicXiaohongshuWorkUrl(raw: string): string {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return raw;
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return raw;
  const isNoteHost = url.hostname === "xiaohongshu.com" || url.hostname.endsWith(".xiaohongshu.com");
  const isNote = isNoteHost && /^\/(?:explore|discovery\/item)\//.test(url.pathname);
  const hasAccessParam = Array.from(url.searchParams.keys()).some((key) => key.toLowerCase() === "xsec_token");
  return isNote || hasAccessParam ? `${url.origin}${url.pathname}` : raw;
}

export const everyInfraPlatformSchema = z.enum(["douyin", "xiaohongshu", "wechatVideo"]);
export const everyInfraActionSchema = z.enum(["search", "user_posts", "video", "trending"]);
const identifier = z.string().min(1).max(120).regex(/^[^\s:]+$/);
const keyword = z.string().trim().min(1).max(300);
const pageToken = z.string().max(2000).optional();
const numericId = z.string().regex(/^\d{1,120}$/);
const douyinUrl = z.string().regex(/^https:\/\/www\.douyin\.com\/video\/\d{1,120}$/);
const xiaohongshuId = z.string().regex(/^[0-9a-fA-F]{24}$/);
const xiaohongshuUrl = z.string().max(4096).regex(/^https:\/\/(?:www\.)?xiaohongshu\.com\/(?:explore|discovery\/item)\/[0-9a-fA-F]{24}(?:\?[^\s#]*)?$/);
const channelsShareUrl = z.string().max(1024).regex(/^https:\/\/weixin\.qq\.com\/sph\/[A-Za-z0-9_-]+(?:\?[^\s#]*)?$/);
const channelsUsername = z.string().max(120).regex(/^(?:sph[A-Za-z0-9_-]+|v2_[A-Za-z0-9_-]+@finder)$/);

const douyinSearch = z.strictObject({
  platform: z.literal("douyin"), action: z.literal("search"),
  params: z.strictObject({
    keyword,
    sort: z.enum(["relevance", "newest", "most_liked"]).optional(),
    publish_time: z.enum(["unlimited", "one_day", "one_week", "half_year"]).optional(),
    page_token: pageToken,
    limit: z.number().int().min(1).max(50).optional(),
  }),
});
const douyinUserPosts = z.strictObject({
  platform: z.literal("douyin"), action: z.literal("user_posts"),
  params: z.strictObject({ user_id: identifier, page_token: pageToken }),
});
const douyinVideo = z.strictObject({
  platform: z.literal("douyin"), action: z.literal("video"),
  params: z.strictObject({ url: douyinUrl }),
});
const douyinBoard = z.enum(["hotspot", "seeding", "entertainment", "social", "challenge"]);
const douyinTrending = z.strictObject({
  platform: z.literal("douyin"), action: z.literal("trending"),
  params: z.strictObject({ boards: z.union([douyinBoard, z.array(douyinBoard).max(5)]).optional() }),
});
const xiaohongshuSearch = z.strictObject({
  platform: z.literal("xiaohongshu"), action: z.literal("search"),
  params: z.strictObject({
    keyword,
    content_type: z.enum(["all", "image", "video"]).optional(),
    sort: z.enum(["relevance", "newest", "most_liked", "most_commented", "most_collected"]).optional(),
    date_range: z.enum(["any_time", "last_24_hours", "last_7_days", "last_30_days", "last_6_months", "last_1_year"]).optional(),
    page_token: pageToken,
  }),
});
const xiaohongshuUserPosts = z.strictObject({
  platform: z.literal("xiaohongshu"), action: z.literal("user_posts"),
  params: z.strictObject({ user_id: xiaohongshuId, page_token: pageToken }),
});
const xiaohongshuTrending = z.strictObject({
  platform: z.literal("xiaohongshu"), action: z.literal("trending"), params: z.strictObject({}),
});
const channelsSearch = z.strictObject({
  platform: z.literal("wechatVideo"), action: z.literal("search"), params: z.strictObject({ keyword }),
});
const channelsUserPosts = z.strictObject({
  platform: z.literal("wechatVideo"), action: z.literal("user_posts"), params: z.strictObject({ username: channelsUsername }),
});
const channelsVideo = z.strictObject({
  platform: z.literal("wechatVideo"), action: z.literal("video"),
  params: z.strictObject({ object_id: z.union([numericId, channelsShareUrl]) }),
});

export const everyInfraQuerySchema = z.union([
  douyinSearch, douyinUserPosts, douyinVideo, douyinTrending, xiaohongshuSearch,
  xiaohongshuUserPosts, xiaohongshuTrending, channelsSearch, channelsUserPosts, channelsVideo,
]);
export type EveryInfraQuery = z.infer<typeof everyInfraQuerySchema>;

export const everyInfraRequestSchema = z.union([
  everyInfraQuerySchema,
  z.strictObject({
    platform: z.literal("douyin"), action: z.literal("media_links"),
    params: z.strictObject({ urls: z.array(z.union([numericId, douyinUrl])).min(1).max(20), fresh: z.boolean().optional() }),
  }),
  z.strictObject({
    platform: z.literal("xiaohongshu"), action: z.literal("note"),
    params: z.strictObject({ url: z.union([xiaohongshuId, xiaohongshuUrl]) }),
  }),
  z.strictObject({
    platform: z.literal("xiaohongshu"), action: z.literal("video"),
    params: z.strictObject({ url: xiaohongshuUrl }),
  }),
]);
export type EveryInfraRequest = z.infer<typeof everyInfraRequestSchema>;

const metricsSchema = z.strictObject({
  likes: z.number().optional(),
  comments: z.number().optional(),
  shares: z.number().optional(),
  favorites: z.number().optional(),
});

export const everyInfraVideoHitSchema = z.strictObject({
  platform: everyInfraPlatformSchema,
  action: everyInfraActionSchema,
  externalId: identifier.optional(),
  canonicalUrl: z.url({protocol: /^https$/}).max(4096).optional(),
  title: z.string().max(300).optional(),
  summary: z.string().max(4000).optional(),
  authorId: identifier.optional(),
  authorName: z.string().max(300).optional(),
  coverUrl: z.url({protocol: /^https$/}).max(4096).optional(),
  durationMs: z.number().nonnegative().optional(),
  publishedAt: z.iso.datetime().optional(),
  type: z.enum(["video", "article"]).optional(),
  metrics: metricsSchema,
  addable: z.boolean(),
});
export type EveryInfraVideoHit = z.infer<typeof everyInfraVideoHitSchema>;
export const everyInfraObservationSchema = z.strictObject({
  platform: everyInfraPlatformSchema,
  action: everyInfraActionSchema,
  hits: z.array(everyInfraVideoHitSchema).max(100),
  nextPageToken: pageToken,
});
export type EveryInfraObservation = z.infer<typeof everyInfraObservationSchema>;

export const everyInfraQueryErrorCodeSchema = z.enum([
  "EVERYINFRA_NOT_CONFIGURED",
  "EVERYINFRA_AUTH_INVALID",
  "EVERYINFRA_QUOTA_EXHAUSTED",
  "EVERYINFRA_RATE_LIMIT",
  "EVERYINFRA_RESPONSE_SHAPE",
  "EVERYINFRA_UPSTREAM",
]);
export type EveryInfraQueryErrorCode = z.infer<typeof everyInfraQueryErrorCodeSchema>;

export const everyInfraQueryErrorMessages: Record<EveryInfraQueryErrorCode, string> = {
  EVERYINFRA_NOT_CONFIGURED: "请先在设置中填写万有引擎密钥。",
  EVERYINFRA_AUTH_INVALID: "万有引擎密钥无效或已达到该密钥的消费上限。",
  EVERYINFRA_QUOTA_EXHAUSTED: "万有引擎余额不足。",
  EVERYINFRA_RATE_LIMIT: "万有引擎查询过于频繁，请稍后再查。",
  EVERYINFRA_RESPONSE_SHAPE: "万有引擎返回了无法识别的查询结果。",
  EVERYINFRA_UPSTREAM: "万有引擎暂时不可用，请稍后重试。",
};

export const everyInfraToolObservationSchema = z.discriminatedUnion("status", [
  z.strictObject({ status: z.literal("ok"), result: everyInfraObservationSchema }),
  z.strictObject({ status: z.literal("error"), code: everyInfraQueryErrorCodeSchema, automaticReplayBlocked: z.literal(true).optional() }),
]);

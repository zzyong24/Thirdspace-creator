import { z } from "zod";
import { id, iso8601 } from "../primitives";

// [T-235b] 通用网页信源(热点多源证据,SPEC 2026-07-11 daily-topic-autopilot §2.2)。
// 用户登记任意站点/页面为选题热点信源(热榜页/垂类社区/RSS feed);出题时逐 enabled 源抓取
// (web 型 readUrl 带登录态读正文 → AI 结构化抽取信号;rss 型 fetch feed 解析)并进 trend brief。
// 单一 wire-shape 真源;模块 trend-sources.schema.ts re-export(同 benchmark 约定)。

export const trendSourceResource = z.object({
  id,
  userId: id,
  groupId:id.nullable().optional(),
  accountId: id.nullable(), // 按抖音号隔离(哪个号在用这批信源)
  name: z.string(), // 展示名(缺省用 domain)
  url: z.string(), // 信源 URL(幂等锚:同 user 重复登记同 URL → 更新不新建)
  sourceType: z.enum(["web", "rss"]), // web=浏览器自动化读正文+AI 抽取;rss=直接 fetch feed 解析
  domain: z.string(), // URL 派生 hostname(查 .auth/web 登录态用)
  note: z.string().nullable(),
  enabled: z.boolean(),
  createdAt: iso8601,
  updatedAt: iso8601,
});
export type TrendSourceResource = z.infer<typeof trendSourceResource>;

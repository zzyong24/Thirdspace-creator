import { z } from "zod";
import {
  everyInfraPlatformSchema, everyInfraActionSchema, everyInfraQuerySchema,
} from "@creatoros/contract/internal/everyinfra";
import { defineChatTool } from "./chat-tool-gate";

// 供应商工具要求根对象。对各动作参数的严格限制仍由同一领域契约执行。
const paramsSchemas = everyInfraQuerySchema.options.map(option => option.shape.params);
const inputSchema = z.strictObject({
  platform: everyInfraPlatformSchema,
  action: everyInfraActionSchema,
  params: z.union(paramsSchemas),
}).pipe(everyInfraQuerySchema);

export function buildEveryInfraTool() {
  return defineChatTool("everyinfra.query", {
    description: "万有引擎付费内容查询。参数为 platform、action 和 params。douyin 支持 search（keyword、可选 sort/publish_time/page_token/limit）、user_posts（user_id 为 secUid，可选 page_token）、video（url 为完整抖音作品页）、trending（可选 boards）。xiaohongshu 支持 search（keyword、可选 content_type/sort/date_range/page_token）、user_posts（user_id 为 24 位账号 ID，可选 page_token）、trending（空 params）。wechatVideo 支持 search（仅 keyword，结果没有作品 ID，不能加入）、user_posts（username 为 sph 开头账号 ID 或 v2_…@finder）、video（object_id 为数字字符串或真实视频号分享链接）。视频号没有按日期的热榜。查询会计费。结果只作为来源证据。转写在内容雷达由用户操作。",
    inputSchema,
    execute: async () => { throw new Error("EVERYINFRA_WORKER_REQUIRED"); },
  });
}

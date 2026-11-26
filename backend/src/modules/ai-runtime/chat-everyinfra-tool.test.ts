import { describe, expect, it } from "vitest";
import { registerAllTemplates, getTemplate } from "@creatoros/ai-worker";
import { workerPortInputSchemas } from "@creatoros/contract/execution-worker";
import { buildChatTools, ALL_CHAT_TOOL_NAMES, getSurfaceToolScope, type ChatToolDeps } from "./chat-tools";
import { prepareChatToolDefinitions } from "./chat-tool-definitions";

describe("万有引擎对话工具", () => {
  it("新回合只挂载 worker 的万有引擎工具和方法，历史观察仍可解析", async () => {
    const tools = buildChatTools(["redfox.query", "everyinfra.query"], {} as ChatToolDeps);
    expect(Object.keys(tools)).toEqual(["everyinfra.query"]);
    expect(ALL_CHAT_TOOL_NAMES).not.toContain("redfox.query");
    expect(getSurfaceToolScope("topics")).toContain("everyinfra.query");
    expect(getSurfaceToolScope("topics")).not.toContain("redfox.query");
    const definitions = (await prepareChatToolDefinitions(tools)).definitions;
    expect(definitions[0]).toMatchObject({ name: "everyinfra.query", execution: "worker.everyinfra", effect: "committed" });
    expect(workerPortInputSchemas.settleChatRedfox.parse({
      callId: "old-call",
      observation: { status: "ok", data: { id: "123", title: "旧查询记录" } },
    }).observation.status).toBe("ok");
    registerAllTemplates();
    expect(getTemplate("method.everyinfra.topic-research").system).toContain("视频号没有按日期的热榜");
    expect(getTemplate("method.everyinfra.benchmark").system).toContain("内容雷达");
  });

  it("接受三平台白名单动作，跨平台参数及内部分发动作在计费前被拒绝", async () => {
    const tools = buildChatTools(["everyinfra.query"], {} as ChatToolDeps);
    const { parameters } = (await prepareChatToolDefinitions(tools)).parameters["everyinfra.query"]!;
    const legal = [
      { platform: "douyin", action: "search", params: { keyword: "咖啡", limit: 5, sort: "newest" } },
      { platform: "douyin", action: "user_posts", params: { user_id: "MS4wfixture", page_token: "" } },
      { platform: "douyin", action: "video", params: { url: "https://www.douyin.com/video/123456" } },
      { platform: "douyin", action: "trending", params: { boards: ["hotspot", "seeding"] } },
      { platform: "xiaohongshu", action: "search", params: { keyword: "咖啡", content_type: "video" } },
      { platform: "xiaohongshu", action: "user_posts", params: { user_id: "0123456789abcdef01234567" } },
      { platform: "xiaohongshu", action: "trending", params: {} },
      { platform: "wechatVideo", action: "search", params: { keyword: "咖啡" } },
      { platform: "wechatVideo", action: "user_posts", params: { username: "v2_fixture@finder" } },
      { platform: "wechatVideo", action: "video", params: { object_id: "15039881603147501275" } },
    ];
    for (const input of legal) expect(parameters.parse(input)).toEqual(input);
    const illegal = [
      { platform: "douyin", action: "video", params: { url: "https://publication.example/video/123" } },
      { platform: "douyin", action: "media_links", params: { urls: ["123"] } },
      { platform: "douyin", action: "transcript", params: { url: "https://www.douyin.com/video/123" } },
      { platform: "xiaohongshu", action: "video", params: { url: "https://www.xiaohongshu.com/explore/0123456789abcdef01234567" } },
      { platform: "xiaohongshu", action: "search", params: { keyword: "咖啡", limit: 10 } },
      { platform: "wechatVideo", action: "search", params: { keyword: "咖啡", limit: 10 } },
      { platform: "wechatVideo", action: "user_posts", params: { username: "sph123", limit: 3 } },
      { platform: "wechatVideo", action: "trending", params: {} },
      { platform: "wechatVideo", action: "video", params: { object_id: 15 } },
      { ...legal[0], baseUrl: "https://not-configured.example" },
      { ...legal[0], params: { keyword: "咖啡", request_headers: {} } },
    ];
    for (const input of illegal) expect(parameters.safeParse(input).success).toBe(false);
  });
});

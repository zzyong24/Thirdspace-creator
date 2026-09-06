import { describe, expect, it, vi } from "vitest";
import { prepareChatPositioning, prepareChatTopicEnrich } from "./chat-structured-tool-nodes";
import type { CreativeContext } from "./creative-context";

const context = {
  positioningBrief: "原定位", accountsBrief: "原账号", learningsBrief: "复盘事实",
  knowledgeBrief: "已存资料", signalsBrief: "受众评论",
} as CreativeContext;

describe("聊天共享结构化节点准备", () => {
  it("选中已有候选时冻结其标题和采纳目标，保留联网证据", async () => {
    const source = { ...context }, selection = { kind: "candidate", ids: ["candidate-original"], label: " 已选题目 " };
    const input = { title: "模型传错的题目", angle: "原角度", verifiedBrief: "来源 https://example.test/source：已核实事实" };
    const preparing = prepareChatTopicEnrich(source, selection, input);
    selection.ids[0] = "changed"; selection.label = "后来的选区"; source.knowledgeBrief = "后来的资料"; input.verifiedBrief = "后来的证据";
    const prepared = await preparing;
    expect(prepared).toMatchObject({ capability: "topic.enrich", candidateId: "candidate-original", facets: { title: "已选题目", angle: "原角度" } });
    expect(prepared.facets.knowledge).toContain("已存资料");
    expect(prepared.facets.knowledge).toContain("https://example.test/source");
    expect(JSON.stringify(prepared)).not.toContain("后来的");
  });

  it("账号态补全没有虚构采纳 ID，缺失证据明确保留未核实提示", async () => {
    const prepared = await prepareChatTopicEnrich(context, undefined, { title: " 输入题目 ", angle: "" });
    expect(prepared).toMatchObject({ candidateId: null, facets: { title: "输入题目" } });
    expect(prepared.facets.knowledge).toContain("本轮未联网核实");
  });

  it.each([
    { sourceMode: "scratch" as const, extraBrief: "新方向" },
    { extraBrief: "路径：完全从零开始\n新方向" },
  ])("从零开始不调用作品读取，也不夹带旧资料 %j", async input => {
    const read = vi.fn(async () => "旧作品");
    const prepared = await prepareChatPositioning(context, input, read);
    expect(read).not.toHaveBeenCalled();
    expect(prepared.facets).toMatchObject({ accounts: "", works: "" });
    expect(JSON.stringify(prepared)).not.toContain("原定位");
    expect(JSON.stringify(prepared)).not.toContain("原账号");
    expect(prepared.facets.current).toContain("新方向");
  });

  it("优化时按既有 12 条限制读取，异步期间不串入后来的资料和指令", async () => {
    let release!: (value: string) => void;
    const read = vi.fn(() => new Promise<string>(resolve => { release = resolve; }));
    const source = { ...context }, input = { sourceMode: "optimize" as const, extraBrief: "本次指令" };
    const preparing = prepareChatPositioning(source, input, read);
    source.positioningBrief = "后来的定位"; input.extraBrief = "后来的指令";
    release("真实作品标题");
    const prepared = await preparing;
    expect(read).toHaveBeenCalledWith(12);
    expect(prepared.facets.current).toContain("原定位");
    expect(prepared.facets.current).toContain("本次指令");
    expect(prepared.facets.works).toContain("真实作品标题");
    expect(JSON.stringify(prepared)).not.toContain("后来的");
  });

  it("未选模式保留旧作品读取默认范围，真实空结果不补造作品", async () => {
    const read = vi.fn(async () => "");
    const prepared = await prepareChatPositioning(context, {}, read);
    expect(read).toHaveBeenCalledWith(undefined);
    expect(prepared.facets.works).toBe("");
  });
});

it("真实节点通过各自 capability 调用测试模型并保留完整候选投影", async () => {
  const { createServer } = await import("node:http");
  const { registerAllTemplates } = await import("@creatoros/ai-worker");
  const { runChatTopicEnrich, runChatPositioning } = await import("./chat-structured-tool-nodes");
  registerAllTemplates();
  const requests: Array<{model: string; messages: unknown[]}> = [];
  const server = createServer(async (req, res) => {
    let body = ""; for await (const chunk of req) body += chunk;
    const request = JSON.parse(body); requests.push(request);
    const output = request.model === "topic.enrich" ? { oneLiner: "真实节点选题", materialBasis: "未核实", audiencePainScore: null } : {
      oneLiner: "真实节点定位", keywords: ["一个关键词"], facets: { avoid: "不做代运营" }, downstreamRules: { forbidRule: "不夸大收益" },
    };
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({id:"local-response",object:"chat.completion",created:1,model:request.model,choices:[{index:0,message:{role:"assistant",content:JSON.stringify(output)},finish_reason:"stop"}],usage:{prompt_tokens:10,completion_tokens:20,total_tokens:30}}));
  });
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const owner = { userId: "node-user", accountId: "node-account", source: "user" as const, requestId: "node-request" };
  const resolveModelSpec = vi.fn(async (_ctx: typeof owner, capability: string) => ({ apiFormat: "openai_chat" as const, model: capability, baseUrl: `http://127.0.0.1:${(server.address() as {port:number}).port}/v1`, token: "local-fixture", structuredOutputs: false }));
  const scopes: string[][] = [];
  const ports = { resolveModelSpec, async runWithSkillSnapshot<T>(ids: readonly string[], execute: () => Promise<T>): Promise<T> { scopes.push([...ids]); return execute(); } };
  try {
    const card = await runChatTopicEnrich(owner, context, {kind:"candidate",ids:["original"],label:"所选题目"}, {title:"另一个题目",angle:""}, ports);
    const positioning = await runChatPositioning(owner, context, {sourceMode:"scratch",extraBrief:"新定位意图"}, ports);
    expect(resolveModelSpec.mock.calls.map(call => [call[0],call[1]])).toEqual([[owner,"topic.enrich"],[owner,"positioning.generate"]]);
    expect(scopes).toEqual([["topic.enrich"],["positioning.generate"]]);
    expect(requests.map(request => request.model)).toEqual(["topic.enrich","positioning.generate"]);
    expect(JSON.stringify(requests[0]!.messages)).toContain("所选题目");
    expect(JSON.stringify(requests[1]!.messages)).not.toContain("原定位");
    expect(card).toMatchObject({ candidateId: "original", card: { oneLiner: "真实节点选题", materialBasis: "未核实", audiencePainScore: null } });
    expect(positioning).toMatchObject({ oneLiner: "真实节点定位", keywords: ["一个关键词","",""], facets: { avoid: "不做代运营" }, downstreamRules: { forbidRule: "不夸大收益" } });
  } finally { server.closeAllConnections(); await new Promise<void>((resolve,reject)=>server.close(error=>error?reject(error):resolve())); }
});

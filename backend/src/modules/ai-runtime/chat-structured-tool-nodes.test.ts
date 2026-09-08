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

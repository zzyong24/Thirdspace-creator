import { it, expect } from "vitest";
import {
  prepareScriptImportAuthorization,
  parseSemanticVerbatimSelection,
} from "./chat-script-import-authorization";

it("授权节点使用完整最新指令和完整来源，不消费模型建议作为最终边界", () => {
  const text = "我把稿子发给你。第一句正文不能被删。\n完整结尾。";
  const node = prepareScriptImportAuthorization({
    source: { ref: "message:1", text },
    latestUserInstruction: "把刚才完整稿子保真写入，先给候选",
    suggestedStartAnchor: "不可信建议",
  });
  expect(node.prompt).toContain(text);
  expect(node.prompt).toContain("把刚才完整稿子保真写入，先给候选");
  expect(node.prompt).toContain("它们只供参考");
  expect(node.prompt).toContain("authorized 必须为 false");
  expect(node.system).toContain("只做授权与原文边界选择");
});

it("授权解析保留精确锚点，拒绝错误类型，不从模型说明猜授权", () => {
  expect(parseSemanticVerbatimSelection(JSON.stringify({
    authorized: true,
    startAnchor: " 第一行 ",
    endAnchor: null,
    reason: " 原文 ",
  }))).toEqual({
    authorized: true,
    startAnchor: " 第一行 ",
    endAnchor: null,
    reason: "原文",
  });
  expect(parseSemanticVerbatimSelection("应该可以导入")).toBeNull();
  expect(parseSemanticVerbatimSelection('{"authorized":"yes"}')).toBeNull();
  expect(parseSemanticVerbatimSelection('{"authorized":true,"startAnchor":3}')).toBeNull();
});

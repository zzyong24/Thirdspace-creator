import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { prepareScriptDraftContext, readFrozenScriptSources } from "./script-preparation";
import type { ContextDeps } from "./creative-context";
const ctx = {
  userId: "u",
  accountId: "a",
  requestId: "r",
  source: "user" as const,
};
const hash = (text: string) => createHash("sha256").update(text).digest("hex");
function deps() {
  return {
    positioning: {
      getPositioningCenter: vi.fn(async () => ({
        profile: null,
        currentStatement: null,
      })),
    },
  } as unknown as ContextDeps;
}
const sourceText = " 原文\n完整保存。 ";
const verbatim = {
  artifactId: "art",
  draftMode: "verbatim",
  verbatimSourceText: sourceText,
  verbatimSourceRef: "message:1",
  verbatimSourceLength: sourceText.length,
  verbatimSourceSha256: hash(sourceText),
};
it("原文模式精确保真且完全不读取创作上下文", async () => {
  const d = deps();
  const p = await prepareScriptDraftContext(
    ctx,
    { projectId: "p", inputData: verbatim },
    d,
  );
  expect(p).toEqual({
    artifactId: "art",
    mode: "verbatim",
    sourceText,
    sourceRef: "message:1",
    sourceLength: sourceText.length,
    sourceSha256: hash(sourceText),
  });
  expect(d.positioning.getPositioningCenter).not.toHaveBeenCalled();
});
it.each([
  { artifactId: null },
  { verbatimSourceRef: "" },
  { verbatimSourceLength: 1 },
  { verbatimSourceSha256: "wrong" },
  { verbatimSourceText: " " },
])("坏原文在读取上下文前拒绝 %s", async (patch) => {
  const d = deps();
  await expect(
    prepareScriptDraftContext(
      ctx,
      { projectId: "p", inputData: { ...verbatim, ...patch } },
      d,
    ),
  ).rejects.toThrow();
  expect(d.positioning.getPositioningCenter).not.toHaveBeenCalled();
});
it("生成模式保存真实源资料与节点输入，不带模型或可执行函数", async () => {
  const body = "真实素材";
  const source = {
    sourceType: "attachment",
    sourceId: "file1",
    label: "附件",
    order: 0,
    charCount: body.length,
    sha256: hash(body),
    body,
    complete: true,
  };
  const result = await prepareScriptDraftContext(
    ctx,
    {
      projectId: null,
      inputData: {
        artifactId: "art",
        topic: "题目",
        extraBrief: " 补充 ",
        targetDurationSeconds: 60,
        instruction: "按资料写",
        sourceSnapshots: [source],
      },
    },
    deps(),
  );
  expect(result.mode).toBe("generate");
  if (result.mode !== "generate") throw new Error("unexpected");
  expect(result.nodeInput).toMatchObject({
    topicTitle: "题目",
    extraBrief: "补充",
    targetDurationSeconds: 60,
    sourceInstruction: "按资料写",
  });
  expect(result.nodeInput.sourceMaterialsBrief).toContain(body);
  expect(result.nodeInput).not.toHaveProperty("model");
  expect(result.frozenSources.sources).toEqual([source]);
  expect(result.frozenSources.metadata[0]).not.toHaveProperty("body");
  expect(Object.keys(result.fingerprintContext)).toEqual([
    "positioningBrief",
    "learningsBrief",
    "knowledgeBrief",
    "projectBriefHard",
    "benchmarkRefBrief",
    "projectIntelligenceBrief",
    "topic",
    "orientationHint",
    "thesisBrief",
    "contractBrief",
    "outlineBrief",
    "userMaterialHardBrief",
    "userMaterialRefBrief",
    "assetsBrief",
  ]);
  expect(JSON.parse(JSON.stringify(result)).nodeInput.topicTitle).toBe("题目");
});
it("资料篡改先于上下文读取失败", async () => {
  const d = deps();
  await expect(
    prepareScriptDraftContext(
      ctx,
      {
        projectId: "p",
        inputData: {
          artifactId: "art",
          instruction: "方向",
          sourceSnapshots: [
            {
              sourceType: "message",
              sourceId: "m",
              label: "m",
              order: 0,
              charCount: 2,
              sha256: hash("原文"),
              body: "篡改",
              complete: true,
            },
          ],
        },
      },
      d,
    ),
  ).rejects.toThrow("资料快照");
  expect(d.positioning.getPositioningCenter).not.toHaveBeenCalled();
});

// T959 无来源的指令同样必须进入生成上下文。
describe("T959 无来源指令",()=>{it("不因sourceSnapshots缺失丢弃instruction",()=>{expect(readFrozenScriptSources({instruction:"只改开头"}).instruction).toBe("只改开头");});});

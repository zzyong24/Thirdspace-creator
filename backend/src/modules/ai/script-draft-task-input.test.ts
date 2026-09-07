import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";

import { buildScriptDraftTaskInputData } from "./script-draft-task-input";

describe("[T-727] script.draft 任务输入装配", () => {
  it("verbatim 把完整原文/ref/长度/hash 原样写入 task input，不混入 generate 摘要字段", () => {
    const sourceText = "  原文第一行\n\n错别子也保留。  ";
    const sourceSha256 = createHash("sha256").update(sourceText).digest("hex");
    expect(
      buildScriptDraftTaskInputData({
        artifactId: "artifact-1",
        projectId: "project-1",
        draftMode: "verbatim",
        verbatimSourceRef: "user:3:0",
        verbatimSourceText: sourceText,
        verbatimSourceLength: sourceText.length,
        verbatimSourceSha256: sourceSha256,
        extraBrief: "不应进入任务的十点摘要",
      }),
    ).toEqual({
      artifactId: "artifact-1",
      projectId: "project-1",
      draftMode: "verbatim",
      verbatimSourceRef: "user:3:0",
      verbatimSourceText: sourceText,
      verbatimSourceLength: sourceText.length,
      verbatimSourceSha256: sourceSha256,
    });
  });

  it("hash/长度不一致在创建任务前拒绝；普通 generate 旧形状不变", () => {
    expect(() =>
      buildScriptDraftTaskInputData({
        artifactId: "artifact-1",
        projectId: "project-1",
        draftMode: "verbatim",
        verbatimSourceRef: "user:3:0",
        verbatimSourceText: "完整原文",
        verbatimSourceLength: 3,
        verbatimSourceSha256: "0".repeat(64),
      }),
    ).toThrow(/原文保真任务输入校验失败/);

    expect(
      buildScriptDraftTaskInputData({
        artifactId: "artifact-1",
        projectId: "project-1",
        topic: "主题",
        targetDurationSeconds: 180,
        extraBrief: "补充要求",
      }),
    ).toEqual({
      artifactId: "artifact-1",
      projectId: "project-1",
      topic: "主题",
      targetDurationSeconds: 180,
      extraBrief: "补充要求",
    });
  });

  it("[T-791] generate 冻结 instruction 与完整来源快照，hash/顺序任一异常整次拒绝", () => {
    const body = "访谈原文第一段。\n访谈原文第二段。";
    const snapshot = {
      sourceType: "attachment" as const,
      sourceId: "asset-1",
      label: "访谈.txt",
      order: 0,
      charCount: body.length,
      sha256: createHash("sha256").update(body).digest("hex"),
      body,
      complete: true as const,
    };
    expect(
      buildScriptDraftTaskInputData({
        artifactId: "artifact-1",
        projectId: "project-1",
        instruction: "只用原文事实，重写逻辑",
        sourceSnapshots: [snapshot],
      }),
    ).toEqual({
      artifactId: "artifact-1",
      projectId: "project-1",
      instruction: "只用原文事实，重写逻辑",
      sourceSnapshots: [snapshot],
    });

    expect(() =>
      buildScriptDraftTaskInputData({
        artifactId: "artifact-1",
        projectId: "project-1",
        instruction: "重写",
        sourceSnapshots: [{ ...snapshot, sha256: "0".repeat(64) }],
      }),
    ).toThrow(/资料快照校验失败/);
  });
});

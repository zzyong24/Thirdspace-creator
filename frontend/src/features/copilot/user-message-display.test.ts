import { describe, expect, it } from "vitest";
import { buildProjectPreparationBriefSeed } from "@creatoros/backend/application/projects/project-preparation-brief-seed";
import { displayUserMessageText, PREPARATION_BRIEF_SEED_DISPLAY } from "./user-message-display";

describe("编导对话不展示内部种子指令（月明录屏 2026-11-10）", () => {
  it("立项资料补全种子只显示一句人话，不露 brief.fill / userFreeBrief / JSON", () => {
    const seed = buildProjectPreparationBriefSeed({ id: "p1", title: "小号演示-AI口播说明书腔", brief: "讲讲为什么 AI 口播稿像说明书", briefDetail: {} });
    const shown = displayUserMessageText(seed);
    expect(shown).toBe(PREPARATION_BRIEF_SEED_DISPLAY);
    expect(shown).not.toMatch(/brief\.fill|userFreeBrief|savedBriefDetail|\{/);
  });
  it("用户自己写的消息原样显示", () => {
    expect(displayUserMessageText("帮我把开头改短一点")).toBe("帮我把开头改短一点");
  });
});

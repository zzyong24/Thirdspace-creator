import { describe, expect, it } from "vitest";
import { buildHooksPrompt, parseHookItems, finalizeHookItems } from "./script-hooks";

describe("Worker 开场文案兼容性", () => {
  it("保留真实上下文和生成指令", () => {
    const prompt = buildHooksPrompt({topic:"测试主题",positioningBrief:"定位资料",extraBrief:"补充要求",projectBriefHard:"立项约束",userMaterialHard:"用户事实",userMaterialRef:"参考事实",antiFabrication:"可溯要求",audienceMindset:"观众纪律"});
    for (const text of ["测试主题","定位资料","补充要求","立项约束","用户事实","参考事实","可溯要求","观众纪律"]) expect(prompt).toContain(text);
    expect(buildHooksPrompt({topic:"",positioningBrief:""})).not.toContain("【本次生成指令");
  });
  it("容忍围栏和缺省角度，最多保留六项", () => {
    const raw = "```json\n" + JSON.stringify([{text:" ",angle:"空"},...Array.from({length:8},(_,i)=>({text:` 文案${i} `}))]) + "\n```";
    expect(parseHookItems(raw)).toEqual(Array.from({length:6},(_,i)=>({text:`文案${i}`,angle:"hook"})));
  });
  it("无有效结果保持空输出，不新增整单失败", () => {
    for (const raw of ["没有结果", "{}", "[]", "[null]", "[1]", "[{\"text\":false}]"]) expect(finalizeHookItems(raw,[])).toEqual([]);
  });
  it("未溯源数字只标注，不删除候选；已溯源保持正文", () => {
    const raw = JSON.stringify([{text:"增长了 97.3%",angle:"数据"}]);
    expect(finalizeHookItems(raw,["真实资料：增长了 97.3%"])) .toEqual([{text:"增长了 97.3%",angle:"数据"}]);
    const result = finalizeHookItems(raw,[]);
    expect(result).toHaveLength(1);
    expect(result[0]!.text).toContain("增长了 97.3%");
    expect(result[0]!.text).not.toBe("增长了 97.3%");
  });
});

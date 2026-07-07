import { describe, it, expect } from "vitest";
import { parseJsonLoose, extractText, buildSystem } from "./parse";

describe("parseJsonLoose", () => {
  it("parses a bare JSON object", () => {
    expect(parseJsonLoose('{"a":1}')).toEqual({ a: 1 });
  });
  it("strips ``` fences and leading prose", () => {
    const t = "好的,结果如下:\n```json\n{\"a\":2}\n```\n以上。";
    expect(parseJsonLoose(t)).toEqual({ a: 2 });
  });
  it("tolerates an array payload", () => {
    expect(parseJsonLoose("前缀 [1,2,3] 后缀")).toEqual([1, 2, 3]);
  });
  it("returns undefined when nothing parses", () => {
    expect(parseJsonLoose("没有 json")).toBeUndefined();
    expect(parseJsonLoose("")).toBeUndefined();
  });
});

describe("extractText", () => {
  it("concatenates text blocks, ignores non-text", () => {
    const msg = {
      content: [
        { type: "text", text: "你好" },
        { type: "tool_use", id: "x" },
        { type: "text", text: "世界" },
      ],
    };
    expect(extractText(msg)).toBe("你好世界");
  });
  it("returns '' when no content", () => {
    expect(extractText({})).toBe("");
  });
});

describe("buildSystem", () => {
  it("returns undefined with neither system nor schema", () => {
    expect(buildSystem(undefined, undefined)).toBeUndefined();
  });
  it("passes a plain system through", () => {
    expect(buildSystem("你是助手", undefined)).toBe("你是助手");
  });
  it("appends a JSON instruction when schema is given", () => {
    const s = buildSystem(undefined, { type: "object" });
    expect(s).toContain("JSON");
  });
});

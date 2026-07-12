import { describe, it, expect } from "vitest";
import {
  parseSrt,
  srtTotalDurationSec,
  checkSrtDurationMatch,
  checkSrtScriptMatch,
  srtScriptSimilarity,
  nearestSrtStart,
  srtStartSet,
} from "./srt";

// [T-254b] SRT 纯函数单测 —— 解析(CRLF/BOM/多行文本/点号毫秒/缺序号)、时长匹配校验、
// 与口播稿 token 重合率校验(传错 SRT 挡在提交前)、吸附与 start 集合。全确定性,零 IO。

const SRT = `1
00:00:00,000 --> 00:00:03,500
大家好,今天讲三个提示词技巧

2
00:00:03,500 --> 00:00:08,120
第一个技巧是给模型一个角色

3
00:00:08,120 --> 00:00:12,000
第二个技巧
是提供示例

4
00:00:12,000 --> 00:00:15,000
第三个技巧是让它一步步想
`;

describe("parseSrt", () => {
  it("标准 SRT → [{index,startSec,endSec,text}],多行字幕文本合并", () => {
    const lines = parseSrt(SRT);
    expect(lines).toHaveLength(4);
    expect(lines[0]).toEqual({
      index: 1,
      startSec: 0,
      endSec: 3.5,
      text: "大家好,今天讲三个提示词技巧",
    });
    expect(lines[2]!.text).toBe("第二个技巧 是提供示例");
    expect(lines[3]!.endSec).toBe(15);
  });

  it("容忍 CRLF + BOM + 点号毫秒", () => {
    const crlf =
      "﻿1\r\n00:00:01.250 --> 00:00:02.750\r\nhello world\r\n\r\n2\r\n00:00:02.750 --> 00:00:04.000\r\nbye\r\n";
    const lines = parseSrt(crlf);
    expect(lines).toHaveLength(2);
    expect(lines[0]!.startSec).toBeCloseTo(1.25);
    expect(lines[0]!.text).toBe("hello world");
  });

  it("缺序号行按出现顺序补;垃圾文本 → [](诚实空,不猜)", () => {
    const noIdx = "00:00:00,000 --> 00:00:02,000\n第一行\n\n00:00:02,000 --> 00:00:04,000\n第二行";
    const lines = parseSrt(noIdx);
    expect(lines.map((l) => l.index)).toEqual([1, 2]);
    expect(parseSrt("这不是 SRT 文件")).toEqual([]);
    expect(parseSrt("")).toEqual([]);
  });
});

describe("时长匹配校验(校验①)", () => {
  it("SRT 总时长 = 最后止秒;与视频时长偏差在容差内 → ok", () => {
    const lines = parseSrt(SRT);
    expect(srtTotalDurationSec(lines)).toBe(15);
    expect(checkSrtDurationMatch(lines, 16).ok).toBe(true); // 容差 max(5, 0.8)=5
    const bad = checkSrtDurationMatch(lines, 180); // 3 分钟视频配 15 秒 SRT = 传错
    expect(bad.ok).toBe(false);
    expect(bad.deltaSec).toBe(165);
  });

  it("空 SRT 永不 ok", () => {
    expect(checkSrtDurationMatch([], 0).ok).toBe(false);
  });
});

describe("口播稿相似度校验(校验②,token 重合率)", () => {
  const lines = parseSrt(SRT);
  it("同一条稿(ASR 小错字)相似度高 → ok", () => {
    const script =
      "大家好,今天讲三个提示词技巧。第一个技巧是给模型一个角色;第二个技巧是提供示例;第三个技巧是让它一步步想。";
    const r = checkSrtScriptMatch(lines, script);
    expect(r.similarity).toBeGreaterThan(0.8);
    expect(r.ok).toBe(true);
  });

  it("整篇传错(另一条稿)跌穿阈值 → 不 ok", () => {
    const other =
      "今天开箱一台新相机,评测它的对焦、防抖和夜景表现,最后聊聊值不值得买。";
    const r = checkSrtScriptMatch(lines, other);
    expect(r.ok).toBe(false);
    expect(r.similarity).toBeLessThan(0.4);
  });

  it("空输入相似度 0", () => {
    expect(srtScriptSimilarity([], "有稿")).toBe(0);
    expect(srtScriptSimilarity(lines, "")).toBe(0);
  });
});

describe("吸附与 start 集合", () => {
  const lines = parseSrt(SRT);
  it("srtStartSet 升序去重;nearestSrtStart 吸到最近行 start", () => {
    expect(srtStartSet(lines)).toEqual([0, 3.5, 8.12, 12]);
    expect(nearestSrtStart(4.1, [0, 3.5, 8.12, 12])).toBe(3.5);
    expect(nearestSrtStart(10.5, [0, 3.5, 8.12, 12])).toBe(12);
    expect(nearestSrtStart(7, [])).toBe(7); // 空集合原样返回
  });
});

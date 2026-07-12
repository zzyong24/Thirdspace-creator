// [T-254c] 前端 SRT 校验纯函数测试 —— 真值源 backend/src/modules/ai-runtime/srt.ts
// 的前端复制件;断言两道检查「真挡真放」(时长偏差/相似度)+ 解析容错。

import { describe, expect, it } from "vitest";

import {
  parseSrt,
  srtTotalDurationSec,
  checkSrtDurationMatch,
  checkSrtScriptMatch,
} from "./srt-check";

const SRT = [
  "1",
  "00:00:00,000 --> 00:00:03,500",
  "大家好 今天讲上下文工程",
  "",
  "2",
  "00:00:03,500 --> 00:00:08,000",
  "第一性原理是什么",
  "",
  "3",
  "00:00:08,000 --> 00:00:12,000",
  "模型只看得到你给它的窗口",
].join("\n");

describe("parseSrt", () => {
  it("解析标准 SRT(含 CRLF/BOM 容错),时间转秒", () => {
    const lines = parseSrt(`﻿${SRT.replace(/\n/g, "\r\n")}`);
    expect(lines).toHaveLength(3);
    expect(lines[0]).toMatchObject({ index: 1, startSec: 0, endSec: 3.5 });
    expect(lines[2]!.text).toBe("模型只看得到你给它的窗口");
    expect(srtTotalDurationSec(lines)).toBe(12);
  });

  it("解析不出任何时间行 → 空数组(诚实,调用方据此报错)", () => {
    expect(parseSrt("这不是SRT,只是一段文本")).toEqual([]);
  });
});

describe("checkSrtDurationMatch(校验①:时长)", () => {
  const lines = parseSrt(SRT); // SRT 总时长 12s

  it("视频时长接近 SRT 总时长 → 放行", () => {
    expect(checkSrtDurationMatch(lines, 13).ok).toBe(true);
  });

  it("传错 SRT(时长差 5 分钟)→ 真挡,并给出具体偏差", () => {
    const r = checkSrtDurationMatch(lines, 312);
    expect(r.ok).toBe(false);
    expect(r.deltaSec).toBe(300);
    expect(r.srtDurationSec).toBe(12);
  });
});

describe("checkSrtScriptMatch(校验②:与口播稿相似度)", () => {
  const lines = parseSrt(SRT);

  it("SRT 全文来自口播稿(ASR 小噪声)→ 放行", () => {
    const script =
      "大家好,今天讲上下文工程。第一性原理是什么?模型只看得到你给它的窗口。";
    const r = checkSrtScriptMatch(lines, script);
    expect(r.ok).toBe(true);
    expect(r.similarity).toBeGreaterThan(0.7);
  });

  it("整篇传错(另一条稿的 SRT)→ 跌穿阈值真挡", () => {
    const otherScript =
      "本期评测三款降噪耳机的佩戴体验、续航表现与音质差异,最后给出购买建议。";
    const r = checkSrtScriptMatch(lines, otherScript);
    expect(r.ok).toBe(false);
    expect(r.similarity).toBeLessThan(0.55);
  });
});

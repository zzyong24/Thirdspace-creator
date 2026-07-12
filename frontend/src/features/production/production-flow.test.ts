// [T-254c] 流程助手纯函数测试:状态机相邻步进 / 渲染 inputs 的 mountAs=assetId
// 闭环约定 / executor 环境错误人话化。

import { describe, expect, it } from "vitest";
import { videoRenderProps } from "@creatoros/contract";

import {
  statusStepsTo,
  buildRenderInputs,
  humanizeRenderError,
} from "./production-flow";

describe("statusStepsTo(production 状态机相邻步进)", () => {
  it("drafting → rendering 需要依次 PUT recording/editing/rendering(契约 forward-only +1)", () => {
    expect(statusStepsTo("drafting", "rendering")).toEqual([
      "recording",
      "editing",
      "rendering",
    ]);
  });

  it("已到位/已越过/未知状态 → 空序列(幂等,不发写)", () => {
    expect(statusStepsTo("editing", "editing")).toEqual([]);
    expect(statusStepsTo("ready", "rendering")).toEqual([]);
    expect(statusStepsTo("garbage", "ready")).toEqual([]);
  });

  it("rendering → ready 单步", () => {
    expect(statusStepsTo("rendering", "ready")).toEqual(["ready"]);
  });
});

describe("buildRenderInputs(mountAs=assetId 闭环约定)", () => {
  const props = videoRenderProps.parse({
    meta: { title: "测试成片" },
    talkingHead: { file: "asset-head-1", durationSec: 30 },
    captions: [{ start: 0, end: 3, cn: "你好" }],
    scenes: [
      {
        id: "scene-1",
        label: "SCENE 1",
        title: "开场",
        startSec: 0,
        endSec: 20,
        cards: [
          { kind: "image", at: 5, file: "asset-shot-1", label: "后台截图" },
          { kind: "quote", at: 8, text: "只看窗口内的东西" },
        ],
      },
      {
        id: "scene-2",
        label: "SCENE 2",
        title: "主体",
        startSec: 20,
        endSec: 30,
        cards: [],
      },
    ],
    broll: [
      { at: 12, file: "asset-broll-1", durationSec: 3, label: "演示画面" },
      // 同一素材复用两个插点 → inputs 去重成一条
      { at: 22, file: "asset-broll-1", durationSec: 2, label: "演示画面" },
    ],
    delivery: { width: 1920, height: 1080, fps: 30 },
  });

  it("扫齐 talkingHead/broll/image 卡的文件引用,去重,mountAs 必须等于 assetId", () => {
    const inputs = buildRenderInputs(props);
    expect(inputs.map((i) => i.assetId).sort()).toEqual([
      "asset-broll-1",
      "asset-head-1",
      "asset-shot-1",
    ]);
    for (const input of inputs) {
      expect(input.mountAs).toBe(input.assetId);
    }
  });
});

describe("humanizeRenderError(环境错误人话化)", () => {
  it("ffmpeg 缺失 → brew 安装引导", () => {
    expect(
      humanizeRenderError("渲染依赖系统 ffmpeg:未检测到,请先安装"),
    ).toContain("brew install ffmpeg");
  });

  it("Chromium 未就绪 → 浏览器下载引导", () => {
    expect(
      humanizeRenderError(
        "渲染用 Chromium 未就绪:请先在「采集/扫码」功能触发一次浏览器下载",
      ),
    ).toContain("playwright install chromium");
  });

  it("其他错误 → null(不编造解释,保留原始错误)", () => {
    expect(humanizeRenderError("模板生成失败:props.scenes 为空")).toBeNull();
    expect(humanizeRenderError(null)).toBeNull();
  });
});

// [T-254c] 流程助手纯函数测试:状态机相邻步进 / 渲染 inputs 的 mountAs=assetId
// 闭环约定 / executor 环境错误人话化。

import { describe, expect, it } from "vitest";
import { videoRenderProps } from "@creatoros/contract";

import {
  statusStepsTo,
  buildRenderInputs,
  humanizeRenderError,
  aggregateAutoBroll,
  assetRefsFromScriptContentData,
  type AutoBrollItem,
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
  it("ffmpeg/ffprobe 缺失 → 桌面用户先重装随包组件", () => {
    expect(
      humanizeRenderError("渲染依赖系统 ffmpeg:未检测到,请先安装"),
    ).toContain("重新安装最新版应用");
    expect(
      humanizeRenderError("渲染依赖系统 ffprobe:未检测到,请先安装"),
    ).toContain("CREATOROS_FFPROBE_PATH");
  });

  it("Chromium 未就绪 → 浏览器下载引导", () => {
    expect(
      humanizeRenderError(
        "渲染用 Chromium 未就绪:请先在「采集/扫码」功能触发一次浏览器下载",
      ),
    ).toContain("重新安装最新版应用");
  });

  it("[T-546] 素材不是视频流时给素材提示，不误报随包 ffprobe 缺失", () => {
    const message = humanizeRenderError(
      "ffprobe 未识别出视频流: asset-bc671a6f-155",
    );
    expect(message).toContain("素材");
    expect(message).toContain("不是可识别的视频");
    expect(message).not.toContain("重新安装");
  });

  it("ffprobe 已运行但素材不完整时提示重新上传，不误报组件缺失", () => {
    const message = humanizeRenderError(
      "ffprobe 失败: moov atom not found\nasset.mov: Invalid data found when processing input",
    );
    expect(message).toContain("上传");
    expect(message).toContain("不完整");
    expect(message).not.toContain("重新安装");
    expect(message).not.toContain("CREATOROS_FFPROBE_PATH");
  });

  it("其他错误 → null(不编造解释,保留原始错误)", () => {
    expect(humanizeRenderError("模板生成失败:props.scenes 为空")).toBeNull();
    expect(humanizeRenderError(null)).toBeNull();
  });
});

// ── [T-387c] B-roll 自动聚合(备料③)────────────────────────────────────────────

describe("[T-387c] aggregateAutoBroll(去重 + 手动项不重复列)", () => {
  const item = (
    assetId: string,
    source: AutoBrollItem["source"],
  ): AutoBrollItem => ({ assetId, name: assetId, kind: "image", source });

  it("同 assetId 保留先出现的(script → ammo 优先级由调用方排序)", () => {
    const out = aggregateAutoBroll(
      [item("a1", "script"), item("a1", "ammo"), item("a2", "ammo")],
      [],
    );
    expect(out.map((i) => [i.assetId, i.source])).toEqual([
      ["a1", "script"],
      ["a2", "ammo"],
    ]);
  });

  it("已手动上传为 B-roll 的素材不重复列(手动列表单独渲)", () => {
    const out = aggregateAutoBroll([item("a1", "script"), item("a2", "ammo")], [
      "a1",
    ]);
    expect(out.map((i) => i.assetId)).toEqual(["a2"]);
  });
});

describe("[T-726] assetRefsFromScriptContentData(宽容解析)", () => {
  it("脚本 sections[].visual.assetRefs 抽取;旧稿无 visual → []", () => {
    expect(
      assetRefsFromScriptContentData({
        sections: [
          { heading: "1", visual: { assetRefs: ["a1", " ", "a2"] } },
          { heading: "2" },
        ],
      }),
    ).toEqual(["a1", "a2"]);
    expect(
      assetRefsFromScriptContentData({ sections: [{ heading: "旧" }] }),
    ).toEqual([]);
    expect(assetRefsFromScriptContentData(null)).toEqual([]);
  });

  it("忽略退役 thesis_tree 字段，只消费脚本 visual 引用", () => {
    const result = assetRefsFromScriptContentData({
      thesis_tree: { materialRefs: ["legacy-1"] },
      sections: [{ heading: "正文", visual: { assetRefs: ["asset-live"] } }],
    });
    expect(result).toEqual(["asset-live"]);
    expect(result).not.toContain("legacy-1");
  });
});

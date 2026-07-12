/**
 * [T-254b] 分场预览卡交互测试(故事化,T-254c 接线前的独立验收):
 *   - 渲染:场景列表 + 卡片(kind 徽标/文案/插点)+ B-roll(换选下拉)+ 字幕样例;
 *   - 删卡:✕ 后该卡消失,确认产物不含它;
 *   - B-roll 换选:下拉换成清单里另一条素材,确认产物用新 assetId;
 *   - 确认:onConfirm 拿到编辑后的决策 + 组装好的渲染 props(contract
 *     videoRenderProps 单一真值,组装器已 `.parse()` 硬校验)。
 * 确定性:纯 fixture,无网络/随机/时钟。
 */

import { cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type {
  VideoDecisions,
  BrollAssetRef,
} from "@creatoros/backend/modules/ai-runtime";
import type { VideoRenderProps } from "@creatoros/contract";
import { VideoDecisionPreview } from "./video-decision-preview";

afterEach(cleanup);

const DECISIONS: VideoDecisions = {
  scenes: [
    { title: "开场钩子", startSec: 0, endSec: 3.5, summary: "抛出 47% 数字" },
    { title: "角色技巧", startSec: 3.5, endSec: 12, summary: "给模型一个角色" },
  ],
  cards: [
    { sceneIdx: 0, kind: "stat", content: "效率提升 47%", at: 0 },
    { sceneIdx: 1, kind: "quote", content: "给模型一个角色", at: 3.5 },
  ],
  broll: [{ sceneIdx: 1, assetId: "asset-1", at: 3.5, durationSec: 3 }],
  subtitles: [
    { index: 1, startSec: 0, endSec: 3.5, zh: "大家好,效率提升 47%", en: "Hi, +47%" },
    { index: 2, startSec: 3.5, endSec: 12, zh: "给模型一个角色", en: "Give it a role" },
  ],
  srtLines: [
    { index: 1, startSec: 0, endSec: 3.5, text: "大家好,效率提升 47%" },
    { index: 2, startSec: 3.5, endSec: 12, text: "给模型一个角色" },
  ],
};

const INVENTORY: BrollAssetRef[] = [
  { assetId: "asset-1", label: "提示词录屏", kind: "video", description: "" },
  { assetId: "asset-2", label: "角色示意图", kind: "image", description: "" },
];

describe("VideoDecisionPreview", () => {
  it("渲染场景列表 + 卡片 + B-roll 下拉 + 字幕样例", () => {
    const { getByTestId, getByText } = render(
      <VideoDecisionPreview
        decisions={DECISIONS}
        inventory={INVENTORY}
        onConfirm={vi.fn()}
      />,
    );
    expect(getByText("开场钩子")).toBeTruthy();
    expect(getByText("角色技巧")).toBeTruthy();
    expect(getByText("效率提升 47%")).toBeTruthy();
    expect(getByText("数据")).toBeTruthy(); // stat kind 徽标
    const select = getByTestId("broll-0").querySelector("select")!;
    expect(select.value).toBe("asset-1");
    expect(select.options).toHaveLength(2); // 选项集 = 素材清单快照
    expect(getByTestId("subtitle-sample-0").textContent).toContain(
      "大家好,效率提升 47%",
    );
  });

  it("删卡:✕ 后确认产物不含该卡(决策与 props 双侧)", () => {
    const onConfirm = vi.fn();
    const { getByLabelText, getByText } = render(
      <VideoDecisionPreview
        decisions={DECISIONS}
        inventory={INVENTORY}
        onConfirm={onConfirm}
        title="提示词三技巧"
        talkingHeadAssetId="asset-video-raw"
      />,
    );
    fireEvent.click(getByLabelText("删除卡片:效率提升 47%"));
    fireEvent.click(getByText("确认决策,进入渲染"));
    const payload = onConfirm.mock.calls[0]![0] as {
      decisions: VideoDecisions;
      renderProps: VideoRenderProps;
    };
    expect(payload.decisions.cards).toHaveLength(1);
    expect(payload.decisions.cards[0]!.content).toBe("给模型一个角色");
    expect(payload.renderProps.scenes[0]!.cards).toHaveLength(0);
    expect(payload.renderProps.scenes[1]!.cards).toHaveLength(1);
  });

  it("B-roll 换选:下拉换素材,确认产物用新 assetId(仅清单内可选)", () => {
    const onConfirm = vi.fn();
    const { getByTestId, getByText } = render(
      <VideoDecisionPreview
        decisions={DECISIONS}
        inventory={INVENTORY}
        onConfirm={onConfirm}
        title="提示词三技巧"
        talkingHeadAssetId="asset-video-raw"
      />,
    );
    const select = getByTestId("broll-0").querySelector("select")!;
    fireEvent.change(select, { target: { value: "asset-2" } });
    fireEvent.click(getByText("确认决策,进入渲染"));
    const payload = onConfirm.mock.calls[0]![0] as {
      decisions: VideoDecisions;
      renderProps: VideoRenderProps;
    };
    expect(payload.decisions.broll[0]!.assetId).toBe("asset-2");
    // 契约 B-roll 是顶层插点轴:file=assetId(mountAs 约定),label=清单展示名。
    expect(payload.renderProps.broll[0]!.file).toBe("asset-2");
    expect(payload.renderProps.broll[0]!.label).toBe("角色示意图");
  });

  it("确认产物 = 组装好的渲染 props(contract 真值形状:meta/talkingHead/captions/delivery)", () => {
    const onConfirm = vi.fn();
    const { getByText } = render(
      <VideoDecisionPreview
        decisions={DECISIONS}
        inventory={INVENTORY}
        onConfirm={onConfirm}
        title="提示词三技巧"
        talkingHeadAssetId="asset-video-raw"
      />,
    );
    fireEvent.click(getByText("确认决策,进入渲染"));
    const { renderProps } = onConfirm.mock.calls[0]![0] as {
      renderProps: VideoRenderProps;
    };
    expect(renderProps.meta).toEqual({ title: "提示词三技巧", brandLabel: "" });
    expect(renderProps.talkingHead).toEqual({
      file: "asset-video-raw",
      durationSec: 12,
      hasAudio: true,
    });
    expect(renderProps.captions).toHaveLength(2);
    expect(renderProps.captions[0]).toEqual({
      start: 0,
      end: 3.5,
      cn: "大家好,效率提升 47%",
      en: "Hi, +47%",
    });
    expect(renderProps.delivery).toEqual({ width: 1920, height: 1080, fps: 30 });
  });

  it("丢弃回调可选:传了才显示按钮并触发", () => {
    const onDiscard = vi.fn();
    const { getByText } = render(
      <VideoDecisionPreview
        decisions={DECISIONS}
        inventory={INVENTORY}
        onConfirm={vi.fn()}
        onDiscard={onDiscard}
      />,
    );
    fireEvent.click(getByText("丢弃"));
    expect(onDiscard).toHaveBeenCalledTimes(1);
  });
});

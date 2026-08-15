import { describe, expect, it } from "vitest";
import type { VideoDecisions } from "@creatoros/backend/modules/ai-runtime";
import type { VideoRenderProps } from "@creatoros/contract";
import {
  auditVideoDecisions,
  auditVideoRenderProps,
} from "./video-regression-audit";

function decisions(): VideoDecisions {
  return {
    scenes: [{ title: "演示", summary: "演示录屏", startSec: 0, endSec: 10 }],
    cards: [],
    broll: [
      {
        sceneIdx: 0,
        assetId: "screen-1",
        at: 0,
        durationSec: 6,
        presentation: "full_frame",
        visualRole: "screen_recording",
      },
      {
        sceneIdx: 0,
        assetId: "image-1",
        at: 6,
        durationSec: 4,
        presentation: "large_stage",
        visualRole: "still_image",
      },
    ],
    subtitles: [],
    srtLines: [],
  };
}

function props(): VideoRenderProps {
  return {
    meta: { title: "测试", brandLabel: "" },
    talkingHead: { file: "talking-head", durationSec: 10, hasAudio: true },
    captions: [],
    scenes: [
      {
        id: "scene-1",
        label: "SCENE 1",
        title: "演示",
        startSec: 0,
        endSec: 10,
        role: "body",
        cards: [],
      },
    ],
    broll: [
      {
        file: "screen-1",
        label: "录屏",
        at: 0,
        big: true,
        durationSec: 6,
        presentation: "full_frame",
        visualRole: "screen_recording",
        speakerMode: "pip_bottom_left",
        motion: "static",
      },
      {
        file: "image-1",
        label: "图片",
        at: 6,
        big: false,
        durationSec: 4,
        presentation: "large_stage",
        visualRole: "still_image",
        motion: "static",
      },
    ],
    delivery: { width: 1920, height: 1080, fps: 30 },
  };
}

describe("T-712 视频真实回归审计", () => {
  it("接受录屏全屏+左下人物画中画，并拒绝静态图全屏", () => {
    expect(auditVideoDecisions(decisions()).passed).toBe(true);
    expect(
      auditVideoRenderProps(props(), { expectedOrientation: "landscape" }).passed,
    ).toBe(true);

    const broken = props();
    broken.broll[1] = {
      ...broken.broll[1]!,
      presentation: "full_frame",
    };
    expect(auditVideoRenderProps(broken).errors.map((item) => item.code)).toContain(
      "still_image_full_frame",
    );
  });

  it("接受开场录屏隐藏人物，不把已明确的 hidden 误报成缺画中画", () => {
    const opening = props();
    opening.broll[0] = {
      ...opening.broll[0]!,
      speakerMode: "hidden",
    };
    expect(auditVideoRenderProps(opening).passed).toBe(true);
  });

  it("横屏与竖屏使用各自交付尺寸，不能拿横屏结果冒充竖屏验收", () => {
    const portrait = props();
    portrait.delivery = { width: 1080, height: 1920, fps: 30 };

    expect(
      auditVideoRenderProps(portrait, { expectedOrientation: "portrait" }).passed,
    ).toBe(true);
    expect(
      auditVideoRenderProps(portrait, { expectedOrientation: "landscape" }).errors.map(
        (item) => item.code,
      ),
    ).toContain("delivery_orientation_mismatch");
    expect(
      auditVideoRenderProps(props(), { expectedOrientation: "portrait" }).errors.map(
        (item) => item.code,
      ),
    ).toContain("delivery_orientation_mismatch");
  });

  it("竖屏拒绝把录屏切成看不清的短片，并要求录屏承担足够主视觉时长", () => {
    const short = decisions();
    short.broll[0] = { ...short.broll[0]!, durationSec: 4 };
    short.broll[1] = { ...short.broll[1]!, at: 4, durationSec: 6 };
    const decisionAudit = auditVideoDecisions(short, {
      minimumScreenRecordingDurationSec: 6,
      minimumScreenRecordingCoverageRatio: 0.5,
    });
    expect(decisionAudit.errors.map((item) => item.code)).toEqual(
      expect.arrayContaining([
        "screen_recording_too_short",
        "screen_recording_coverage_too_low",
      ]),
    );

    const shortProps = props();
    shortProps.delivery = { width: 1080, height: 1920, fps: 30 };
    shortProps.broll[0] = { ...shortProps.broll[0]!, durationSec: 4 };
    shortProps.broll[1] = { ...shortProps.broll[1]!, at: 4, durationSec: 6 };
    const renderAudit = auditVideoRenderProps(shortProps, {
      expectedOrientation: "portrait",
      minimumScreenRecordingDurationSec: 6,
      minimumScreenRecordingCoverageRatio: 0.5,
    });
    expect(renderAudit.errors.map((item) => item.code)).toEqual(
      expect.arrayContaining([
        "render_screen_recording_too_short",
        "render_screen_recording_coverage_too_low",
      ]),
    );

    expect(
      auditVideoDecisions(decisions(), {
        minimumScreenRecordingDurationSec: 6,
        minimumScreenRecordingCoverageRatio: 0.5,
      }).passed,
    ).toBe(true);
  });

  it("阻断同素材复用、主视觉重叠和明确排除素材", () => {
    const broken = decisions();
    broken.broll.push({
      ...broken.broll[0]!,
      at: 3,
      durationSec: 2,
    });
    const audit = auditVideoDecisions(broken, {
      forbiddenAssetIds: ["screen-1"],
    });
    expect(audit.passed).toBe(false);
    expect(audit.errors.map((item) => item.code)).toEqual(
      expect.arrayContaining([
        "duplicate_asset",
        "main_visual_overlap",
        "forbidden_asset_used",
      ]),
    );
  });

  it("把上传录屏未被采用记录为质量警告，不用代码替 AI 选材", () => {
    const audit = auditVideoDecisions(decisions(), {
      expectedScreenRecordingIds: ["screen-1", "screen-2"],
      minimumExpectedScreenRecordings: 2,
    });
    expect(audit.passed).toBe(true);
    expect(audit.warnings[0]?.code).toBe("uploaded_screen_recordings_underused");
  });

  it("把上游按语义判定的封面通过真实 ID 排除，不重复发明视觉角色", () => {
    const audit = auditVideoDecisions(decisions(), {
      forbiddenAssetIds: ["screen-1"],
    });
    expect(audit.errors.map((item) => item.code)).toContain(
      "forbidden_asset_used",
    );
  });
});

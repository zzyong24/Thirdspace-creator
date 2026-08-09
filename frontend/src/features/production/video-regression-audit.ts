import type { VideoDecisions } from "@creatoros/backend/modules/ai-runtime";
import type { VideoRenderProps } from "@creatoros/contract";

export interface VideoRegressionIssue {
  severity: "error" | "warning";
  code: string;
  message: string;
  sceneIdx?: number;
  assetId?: string;
}

export interface VideoRegressionAudit {
  passed: boolean;
  errors: VideoRegressionIssue[];
  warnings: VideoRegressionIssue[];
  metrics: Record<string, number>;
}

function result(
  issues: VideoRegressionIssue[],
  metrics: Record<string, number>,
): VideoRegressionAudit {
  const errors = issues.filter((issue) => issue.severity === "error");
  return {
    passed: errors.length === 0,
    errors,
    warnings: issues.filter((issue) => issue.severity === "warning"),
    metrics,
  };
}

/**
 * 只审计确定性边界，不判断素材创作语义。
 *
 * SEMANTIC_BOUNDARY_ALLOW: 素材是否适合某个场景由 material.match / 总导演模型决定；
 * 本函数只检查 ID 唯一、时间轴不冲突、视觉角色与版式契约、用户明确排除项。
 */
export function auditVideoDecisions(
  decisions: VideoDecisions,
  opts: {
    forbiddenAssetIds?: readonly string[];
    expectedScreenRecordingIds?: readonly string[];
    minimumExpectedScreenRecordings?: number;
    minimumScreenRecordingDurationSec?: number;
    minimumScreenRecordingCoverageRatio?: number;
  } = {},
): VideoRegressionAudit {
  const issues: VideoRegressionIssue[] = [];
  const forbidden = new Set(opts.forbiddenAssetIds ?? []);
  const expectedRecordings = new Set(opts.expectedScreenRecordingIds ?? []);
  const seen = new Set<string>();
  const expectedUsed = new Set<string>();
  let screenRecordingDurationSec = 0;

  for (const pick of decisions.broll) {
    if (forbidden.has(pick.assetId)) {
      issues.push({
        severity: "error",
        code: "forbidden_asset_used",
        message: "明确排除的素材进入了时间线",
        sceneIdx: pick.sceneIdx,
        assetId: pick.assetId,
      });
    }
    if (seen.has(pick.assetId)) {
      issues.push({
        severity: "error",
        code: "duplicate_asset",
        message: "同一素材在全片被重复使用",
        sceneIdx: pick.sceneIdx,
        assetId: pick.assetId,
      });
    }
    seen.add(pick.assetId);
    if (expectedRecordings.has(pick.assetId)) expectedUsed.add(pick.assetId);
    if (
      pick.visualRole === "screen_recording" &&
      pick.presentation === "full_frame"
    ) {
      screenRecordingDurationSec += Math.max(0, pick.durationSec);
      if (
        typeof opts.minimumScreenRecordingDurationSec === "number" &&
        pick.durationSec + 0.01 < opts.minimumScreenRecordingDurationSec
      ) {
        issues.push({
          severity: "error",
          code: "screen_recording_too_short",
          message: `录屏主视觉只有 ${pick.durationSec.toFixed(1)} 秒，观众来不及看清连续操作`,
          sceneIdx: pick.sceneIdx,
          assetId: pick.assetId,
        });
      }
    }
    if (
      pick.presentation === "full_frame" &&
      pick.visualRole !== "screen_recording"
    ) {
      issues.push({
        severity: "error",
        code: "non_screen_full_frame",
        message: "非录屏素材不得使用全屏版式",
        sceneIdx: pick.sceneIdx,
        assetId: pick.assetId,
      });
    }
  }

  for (let sceneIdx = 0; sceneIdx < decisions.scenes.length; sceneIdx += 1) {
    const main = decisions.broll
      .filter(
        (pick) => pick.sceneIdx === sceneIdx && pick.presentation !== "overlay",
      )
      .slice()
      .sort((a, b) => a.at - b.at);
    for (let index = 1; index < main.length; index += 1) {
      const previous = main[index - 1]!;
      const current = main[index]!;
      if (previous.at + previous.durationSec > current.at + 0.05) {
        issues.push({
          severity: "error",
          code: "main_visual_overlap",
          message: "同一场景的主视觉时间发生重叠",
          sceneIdx,
          assetId: current.assetId,
        });
      }
    }
  }

  const minimumExpected = Math.min(
    opts.minimumExpectedScreenRecordings ?? expectedRecordings.size,
    expectedRecordings.size,
  );
  if (expectedUsed.size < minimumExpected) {
    issues.push({
      severity: "warning",
      code: "uploaded_screen_recordings_underused",
      message: `用户上传的录屏只采用了 ${expectedUsed.size}/${expectedRecordings.size} 个`,
    });
  }

  const totalDurationSec = decisions.scenes.reduce(
    (max, scene) => Math.max(max, scene.endSec),
    0,
  );
  const screenRecordingCoverageRatio =
    totalDurationSec > 0 ? screenRecordingDurationSec / totalDurationSec : 0;
  if (
    typeof opts.minimumScreenRecordingCoverageRatio === "number" &&
    screenRecordingCoverageRatio + 0.0001 <
      opts.minimumScreenRecordingCoverageRatio
  ) {
    issues.push({
      severity: "error",
      code: "screen_recording_coverage_too_low",
      message: `录屏主视觉只覆盖全片 ${(screenRecordingCoverageRatio * 100).toFixed(1)}%，竖屏仍会长期退回真人全屏`,
    });
  }

  return result(issues, {
    sceneCount: decisions.scenes.length,
    brollCount: decisions.broll.length,
    uniqueBrollCount: seen.size,
    expectedRecordingCount: expectedRecordings.size,
    expectedRecordingUsedCount: expectedUsed.size,
    screenRecordingDurationSec,
    screenRecordingCoverageRatio,
    totalDurationSec,
  });
}

export function auditVideoRenderProps(
  props: VideoRenderProps,
  opts: {
    expectedOrientation?: "portrait" | "landscape";
    minimumScreenRecordingDurationSec?: number;
    minimumScreenRecordingCoverageRatio?: number;
  } = {},
): VideoRegressionAudit {
  const issues: VideoRegressionIssue[] = [];
  const seen = new Set<string>();
  const sorted = props.broll.slice().sort((a, b) => a.at - b.at);
  let screenRecordingDurationSec = 0;

  if (opts.expectedOrientation) {
    const expected =
      opts.expectedOrientation === "portrait"
        ? { width: 1080, height: 1920 }
        : { width: 1920, height: 1080 };
    if (
      props.delivery.width !== expected.width ||
      props.delivery.height !== expected.height
    ) {
      issues.push({
        severity: "error",
        code: "delivery_orientation_mismatch",
        message: `${opts.expectedOrientation === "portrait" ? "竖屏" : "横屏"}回归使用了错误的交付尺寸`,
      });
    }
  }

  for (const item of sorted) {
    if (seen.has(item.file)) {
      issues.push({
        severity: "error",
        code: "duplicate_render_asset",
        message: "渲染 props 中同一素材被重复使用",
        assetId: item.file,
      });
    }
    seen.add(item.file);
    if (
      item.presentation === "full_frame" &&
      item.visualRole !== "screen_recording"
    ) {
      issues.push({
        severity: "error",
        code: "render_non_screen_full_frame",
        message: "渲染 props 中非录屏素材被设为全屏",
        assetId: item.file,
      });
    }
    if (
      item.presentation === "full_frame" &&
      item.visualRole === "screen_recording" &&
      item.speakerMode !== "pip_bottom_left"
    ) {
      issues.push({
        severity: "error",
        code: "screen_recording_missing_pip",
        message: "全屏录屏缺少左下角人物画中画",
        assetId: item.file,
      });
    }
    if (
      item.presentation === "full_frame" &&
      item.visualRole === "screen_recording"
    ) {
      const durationSec = Math.max(0, item.durationSec ?? 0);
      screenRecordingDurationSec += durationSec;
      if (
        typeof opts.minimumScreenRecordingDurationSec === "number" &&
        durationSec + 0.01 < opts.minimumScreenRecordingDurationSec
      ) {
        issues.push({
          severity: "error",
          code: "render_screen_recording_too_short",
          message: `渲染录屏只有 ${durationSec.toFixed(1)} 秒，未达到连续操作可读时长`,
          assetId: item.file,
        });
      }
    }
    if (
      item.visualRole === "still_image" &&
      item.presentation === "full_frame"
    ) {
      issues.push({
        severity: "error",
        code: "still_image_full_frame",
        message: "静态图片不得全屏铺满",
        assetId: item.file,
      });
    }
  }

  for (let index = 1; index < sorted.length; index += 1) {
    const previous = sorted[index - 1]!;
    const current = sorted[index]!;
    if (
      previous.presentation !== "overlay" &&
      current.presentation !== "overlay" &&
      previous.at + (previous.durationSec ?? 0) > current.at + 0.05
    ) {
      issues.push({
        severity: "error",
        code: "render_main_visual_overlap",
        message: "渲染 props 中主视觉时间发生重叠",
        assetId: current.file,
      });
    }
  }

  const totalDurationSec = Math.max(0, props.talkingHead.durationSec);
  const screenRecordingCoverageRatio =
    totalDurationSec > 0 ? screenRecordingDurationSec / totalDurationSec : 0;
  if (
    typeof opts.minimumScreenRecordingCoverageRatio === "number" &&
    screenRecordingCoverageRatio + 0.0001 <
      opts.minimumScreenRecordingCoverageRatio
  ) {
    issues.push({
      severity: "error",
      code: "render_screen_recording_coverage_too_low",
      message: `渲染录屏只覆盖全片 ${(screenRecordingCoverageRatio * 100).toFixed(1)}%`,
    });
  }

  return result(issues, {
    renderBrollCount: props.broll.length,
    uniqueRenderBrollCount: seen.size,
    fullFrameScreenRecordingCount: props.broll.filter(
      (item) =>
        item.presentation === "full_frame" &&
        item.visualRole === "screen_recording",
    ).length,
    fullFrameScreenRecordingWithPipCount: props.broll.filter(
      (item) =>
        item.presentation === "full_frame" &&
        item.visualRole === "screen_recording" &&
        item.speakerMode === "pip_bottom_left",
    ).length,
    screenRecordingDurationSec,
    screenRecordingCoverageRatio,
    totalDurationSec,
    deliveryWidth: props.delivery.width,
    deliveryHeight: props.delivery.height,
  });
}

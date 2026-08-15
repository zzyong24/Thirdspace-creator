import { describe, expect, it } from "vitest";
import {
  MATERIAL_MATCH_TEMPLATE,
  materialMatchSchema,
} from "./material-match";

describe("material.match 视频呈现契约", () => {
  it("接受 AI 返回的主画面层级，且拒绝协议外枚举", () => {
    expect(
      materialMatchSchema.safeParse({
        matches: [
          {
            assetId: "screen-1",
            role: "clip",
            reason: "展示真实操作",
            sceneIdx: 0,
            at: 3,
            durationSec: 8,
            presentation: "full_frame",
            visualRole: "screen_recording",
            motion: "static",
          },
        ],
      }).success,
    ).toBe(true);
    expect(
      materialMatchSchema.safeParse({
        matches: [{ assetId: "screen-1", presentation: "tiny_corner" }],
      }).success,
    ).toBe(false);
    expect(
      materialMatchSchema.safeParse({
        matches: [{ assetId: "screen-1", motion: "spin_around" }],
      }).success,
    ).toBe(false);
  });

  it("把项目画幅、界面可读性和展示时长交给 Skill 判断", () => {
    expect(MATERIAL_MATCH_TEMPLATE.version).toBe("v10");
    expect(MATERIAL_MATCH_TEMPLATE.template).toContain("{{orientation}}");
    expect(MATERIAL_MATCH_TEMPLATE.template).toContain(
      "still_image 与 live_footage 绝不能 full_frame",
    );
    expect(MATERIAL_MATCH_TEMPLATE.template).toContain("不要机械截成 3–4 秒");
    expect(MATERIAL_MATCH_TEMPLATE.template).toContain("界面截图、录屏默认 static");
    expect(MATERIAL_MATCH_TEMPLATE.template).toContain("新生成素材必须直接按本次交付画幅构图");
    expect(MATERIAL_MATCH_TEMPLATE.template).toContain("竖屏 9:16");
    expect(MATERIAL_MATCH_TEMPLATE.template).toContain("每条被选素材必须返回 visualRole");
    expect(MATERIAL_MATCH_TEMPLATE.template).toContain(
      "只有 screen_recording",
    );
    expect(MATERIAL_MATCH_TEMPLATE.template).toContain(
      "人物会保留为左下角画中画",
    );
    expect(MATERIAL_MATCH_TEMPLATE.template).toContain(
      "still_image 与 live_footage 绝不能 full_frame",
    );
    expect(MATERIAL_MATCH_TEMPLATE.template).toContain(
      "任意时刻只允许一个非 overlay 主素材",
    );
    expect(MATERIAL_MATCH_TEMPLATE.template).toContain(
      "架构图、流程图、数据表、界面截图、代码截图等高信息静态图",
    );
    expect(MATERIAL_MATCH_TEMPLATE.template).toContain(
      "禁止把高信息主图缩在角落，再用一张大信息卡覆盖它",
    );
    expect(MATERIAL_MATCH_TEMPLATE.template).toContain("开场前三秒优先使用");
    expect(MATERIAL_MATCH_TEMPLATE.template).toContain("第一场第一句的 SRT 起秒");
    expect(MATERIAL_MATCH_TEMPLATE.template).toContain("不要把合适素材拖到三秒以后");
  });

  it("把原文件名和人工选材当高价值上下文，但禁止机械字符串匹配", () => {
    expect(MATERIAL_MATCH_TEMPLATE.template).toContain("{{manualAssignments}}");
    expect(MATERIAL_MATCH_TEMPLATE.template).toContain("原始文件名是用户主动提供的高价值语义线索");
    expect(MATERIAL_MATCH_TEMPLATE.template).toContain("尺寸/时长");
    expect(MATERIAL_MATCH_TEMPLATE.template).toContain("不得只按文件名做机械关键词匹配");
    expect(MATERIAL_MATCH_TEMPLATE.template).toContain("不得遗漏或替换");
    expect(MATERIAL_MATCH_TEMPLATE.template).toContain("绝不能把分镜作业退给用户");
    expect(MATERIAL_MATCH_TEMPLATE.template).not.toContain("交给用户手动指定");
  });
});

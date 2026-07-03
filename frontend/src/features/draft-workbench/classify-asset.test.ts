import { describe, expect, it } from "vitest";

import { classifyFile } from "./classify-asset";

// [T-055e SPEC §6.2] 倾倒场确定性归类规则表(第一层,零成本)。

describe("classifyFile", () => {
  it("MIME → assetType 基础映射", () => {
    expect(classifyFile("a.png", "image/png").assetType).toBe("image");
    expect(classifyFile("a.mp4", "video/mp4").assetType).toBe("video");
    expect(classifyFile("a.mp3", "audio/mpeg").assetType).toBe("audio");
    expect(classifyFile("a.srt", "").assetType).toBe("subtitle");
    expect(classifyFile("设计源.psd", "application/octet-stream").assetType).toBe(
      "document",
    );
  });

  it("图片:封面/截图 按文件名启发式", () => {
    expect(classifyFile("最终封面-v3.png", "image/png").tags).toContain("封面");
    expect(classifyFile("thumbnail-cover.jpg", "image/jpeg").tags).toContain(
      "封面",
    );
    expect(
      classifyFile("Screenshot 2026-07-02 at 10.00.00.png", "image/png").tags,
    ).toContain("截图");
    expect(classifyFile("截屏2026-07-02.png", "image/png").tags).toContain(
      "截图",
    );
  });

  it("视频:录屏命中启发式;未命中默认「实拍」;B-roll 只按显式命名", () => {
    expect(
      classifyFile("Screen Recording 2026-07-02.mov", "video/quicktime").tags,
    ).toEqual(["录屏"]);
    expect(classifyFile("屏幕录制 2026-07-02.mp4", "video/mp4").tags).toEqual([
      "录屏",
    ]);
    expect(classifyFile("外景拍摄-01.mp4", "video/mp4").tags).toEqual(["实拍"]);
    expect(classifyFile("城市b-roll空镜.mp4", "video/mp4").tags).toEqual([
      "B-roll",
    ]);
  });

  it("非图片/视频不打用途标签(文档/音频诚实无标签)", () => {
    expect(classifyFile("cover-notes.pdf", "application/pdf").tags).toEqual([]);
    expect(classifyFile("录屏解说.mp3", "audio/mpeg").tags).toEqual([]);
  });
});

import { describe, it, expect } from "vitest";
import { extForMime, extForFileName } from "./mime-ext";

describe("extForMime", () => {
  it("覆盖常用图/视/音/文档/字幕(常见 case)", () => {
    expect(extForMime("image/png")).toBe(".png");
    expect(extForMime("image/jpeg")).toBe(".jpg");
    expect(extForMime("image/webp")).toBe(".webp");
    expect(extForMime("video/mp4")).toBe(".mp4");
    expect(extForMime("audio/mpeg")).toBe(".mp3");
    expect(extForMime("audio/wav")).toBe(".wav");
    expect(extForMime("application/pdf")).toBe(".pdf");
    expect(extForMime("application/x-subrip")).toBe(".srt");
  });

  it("不区分大小写", () => {
    expect(extForMime("IMAGE/PNG")).toBe(".png");
    expect(extForMime("Video/MP4")).toBe(".mp4");
  });

  it("剥 ;charset=utf-8 等参数", () => {
    expect(extForMime("text/plain;charset=utf-8")).toBe(".txt");
    expect(extForMime("application/json; charset=UTF-8")).toBe(".json");
  });

  it("unknown mime → null(绝不瞎猜)", () => {
    expect(extForMime("application/x-fantasy-thing")).toBeNull();
    expect(extForMime("foo/bar")).toBeNull();
  });

  it("null / 空串 / 纯空格 → null(不抛)", () => {
    expect(extForMime(null)).toBeNull();
    expect(extForMime(undefined)).toBeNull();
    expect(extForMime("")).toBeNull();
    expect(extForMime("   ")).toBeNull();
    expect(extForMime(";charset=utf-8")).toBeNull();
  });
});

describe("extForFileName", () => {
  it("从文件名末段抽 ext", () => {
    expect(extForFileName("foo.png")).toBe(".png");
    expect(extForFileName("bar.MP4")).toBe(".mp4");
    expect(extForFileName("a/b/c.tar.gz")).toBe(".gz");
  });

  it("无 ext / null / 空 → null", () => {
    expect(extForFileName("foo")).toBeNull();
    expect(extForFileName(null)).toBeNull();
    expect(extForFileName("")).toBeNull();
    expect(extForFileName(".hidden")).toBeNull();
  });

  it("过 5 字符的「假 ext」不抽(防误判 objkey-62ce3084-1494)", () => {
    // 对象 key 末段是 hex 串(无 `.`),仍返 null —— 真 ext 才 ≤5 字符
    expect(extForFileName("objkey-62ce3084-1494")).toBeNull();
    expect(extForFileName("foo.toolonggggg")).toBeNull();
  });
});
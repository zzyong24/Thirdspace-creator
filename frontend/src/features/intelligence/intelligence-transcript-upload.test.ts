import { describe, expect, it } from "vitest";

import {
  MAX_TRANSCRIPT_UPLOAD_BYTES,
  prepareTranscriptUpload,
} from "./intelligence-transcript-upload";

describe("T-603 人工逐字稿文件读取", () => {
  it("清理 SRT/VTT 的头、序号与时间轴，只保留正文", async () => {
    const srt = new File(
      [
        "\ufeff1\n00:00:01,000 --> 00:00:03,000\n第一句\n\n2\n00:00:04,000 --> 00:00:06,000\n第二句",
      ],
      "访谈.srt",
      { type: "application/x-subrip" },
    );
    const vtt = new File(
      [
        "WEBVTT\n\n00:00:01.000 --> 00:00:03.000\n第一段\n\n00:00:04.000 --> 00:00:06.000\n第二段",
      ],
      "访谈.vtt",
      { type: "text/vtt" },
    );

    await expect(prepareTranscriptUpload(srt)).resolves.toMatchObject({
      format: "srt",
      fileName: "访谈.srt",
      text: "第一句\n第二句",
    });
    await expect(prepareTranscriptUpload(vtt)).resolves.toMatchObject({
      format: "vtt",
      fileName: "访谈.vtt",
      text: "第一段\n第二段",
    });
  });

  it("保留 txt/md 正文并拒绝不支持格式、空白、乱码与真实文件超限", async () => {
    await expect(
      prepareTranscriptUpload(
        new File(["# 标题\n\n正文"], "访谈.md", { type: "text/markdown" }),
      ),
    ).resolves.toMatchObject({
      format: "md",
      text: "# 标题\n\n正文",
    });
    await expect(
      prepareTranscriptUpload(new File(["正文"], "访谈.docx")),
    ).rejects.toThrow("仅支持 TXT、Markdown、SRT 或 VTT");
    await expect(
      prepareTranscriptUpload(new File([" \n "], "空白.txt")),
    ).rejects.toThrow("没有可用正文");
    await expect(
      prepareTranscriptUpload(new File(["损坏\ufffd"], "乱码.txt")),
    ).rejects.toThrow("不是有效的 UTF-8 文本");
    await expect(
      prepareTranscriptUpload(
        new File([new Uint8Array(MAX_TRANSCRIPT_UPLOAD_BYTES + 1)], "大稿.txt"),
      ),
    ).rejects.toThrow("不能超过 2 MiB");
  });
});

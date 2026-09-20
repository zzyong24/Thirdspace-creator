import { describe, expect, it } from "vitest";
import type { AgenticToolOutcome } from "@creatoros/contract/execution-worker";
import { projectReceiptForPi, boundProgressText } from "./result-pages";

const receipt = (text: string): AgenticToolOutcome => ({ status: "ok", summary: "完成", evidence: [], data: { workbench: { operationId: "op", status: "succeeded", content: [{ type: "text", text }, { type: "image", mediaType: "image/png", dataRef: "shot-1" }], artifactRefs: [], progressCursor: null } }, error: null, continuation: null, sideEffect: "none" });

describe("原回执分页投影", () => {
  it("长文本用原 toolCallId 与 JSON 字符 offset 提示回读，不改变回执", async () => {
    const original = receipt("字😀".repeat(10000));
    const before = JSON.stringify(original);
    const page = await projectReceiptForPi(original, "original-call", { resolveImage: async () => ({ mimeType: "image/png", data: "aGVsbG8=" }) });
    const first = page.content[0]!;
    expect(first.type).toBe("text");
    if (first.type !== "text") throw Error("text page missing");
    expect(first.text).toContain("tool.result.read");
    expect(first.text).toContain("original-call");
    expect(page.details.nextOffset).toBe(12000);
    expect(first.text).toContain(before.slice(0, 12000));
    expect(JSON.stringify(original)).toBe(before);
  });

  it("截图仍作为 Pi 模型可见 image 块，短结果无需回读", async () => {
    const page = await projectReceiptForPi(receipt("短"), "c", { resolveImage: async () => ({ mimeType: "image/png", data: "aGVsbG8=" }) });
    expect(page.details.nextOffset).toBeNull();
    expect(page.content[1]).toEqual({ type: "image", mimeType: "image/png", data: "aGVsbG8=" });
  });

  it("无可信媒体解析端口不伪造截图，进度受字节上限约束", async () => {
    await expect(projectReceiptForPi(receipt("x"), "c", {})).rejects.toThrow(/MEDIA_RESOLVER/);
    expect(Buffer.byteLength(boundProgressText("字".repeat(10000)), "utf8")).toBeLessThanOrEqual(4096);
  });
});

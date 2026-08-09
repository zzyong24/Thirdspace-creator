import { describe, expect, it } from "vitest";
import {
  CHAT_TOOL_APPROVAL_SECRET,
  isReadOnlyToolAfterUntrustedContent,
  UNTRUSTED_CONTENT_TOOL_NAMES,
} from "./chat-effect-approval";

describe("T-731/T-736 不可信内容后的只读工具域", () => {
  it("只保留本地 context/环境探测，外部正文不能继续驱动联网、本机读取或副作用", () => {
    expect(UNTRUSTED_CONTENT_TOOL_NAMES).toEqual(
      new Set(["material.gather", "web.read", "local.read"]),
    );
    expect(isReadOnlyToolAfterUntrustedContent("context.projects")).toBe(true);
    expect(isReadOnlyToolAfterUntrustedContent("local.tools")).toBe(true);
    for (const name of [
      "web.read",
      "local.read",
      "material.gather",
      "material.generate",
      "material.screenshot",
      "intelligence.douyin.share",
      "project.transcribe",
      "script.draft",
      "cover.generate",
    ]) {
      expect(isReadOnlyToolAfterUntrustedContent(name), name).toBe(false);
    }
  });

  it("本机文件读取审批仍使用进程随机 HMAC 密钥", () => {
    expect(CHAT_TOOL_APPROVAL_SECRET).toBeInstanceOf(Uint8Array);
    expect(CHAT_TOOL_APPROVAL_SECRET.byteLength).toBe(32);
  });
});

import { describe, expect, it } from "vitest";

import {
  extractChatApiPublicError,
  isTerminalScriptSelectionError,
} from "./chat-api-error";

describe("[T-716] Copilot 附件错误提示", () => {
  it("从 AI SDK 包装的 JSON 错误中取出服务端策展过的附件提示", () => {
    expect(
      extractChatApiPublicError(
        new Error(
          JSON.stringify({
            error: "附件内容解析失败，请确认文件未损坏后重试。",
          }),
        ),
      ),
    ).toBe("附件内容解析失败，请确认文件未损坏后重试。");
  });

  it("保留 PDF、DOCX、Markdown 等格式的明确可操作提示", () => {
    for (const message of [
      "附件“前采.pdf”没有可读取的文字内容。",
      "暂不支持读取附件“旧版.doc”的格式。",
      "本轮附件合计需小于 30MB，请分开上传。",
    ]) {
      expect(extractChatApiPublicError(new Error(JSON.stringify({ error: message })))).toBe(
        message,
      );
    }
  });

  it("局部改稿流中断时保留安全参考号，便于和完整日志对应", () => {
    const message =
      "本次局部改写中断，稿面未被修改，目标段落已保留。参考号：chat-12ab34cd56。请直接重试。";
    expect(
      extractChatApiPublicError(new Error(JSON.stringify({ error: message }))),
    ).toBe(message);
  });

  it("识别不能靠重试恢复的段落锚点错误，普通模型故障不误判", () => {
    for (const code of [
      "SCRIPT_SELECTION_STALE",
      "SCRIPT_SELECTION_REQUIRED",
      "SCRIPT_SELECTION_RESOLVER_UNAVAILABLE",
    ]) {
      expect(
        isTerminalScriptSelectionError(
          new Error(JSON.stringify({ code, error: "局部改稿不可继续" })),
        ),
      ).toBe(true);
    }
    expect(isTerminalScriptSelectionError(new Error("provider stream interrupted"))).toBe(
      false,
    );
    expect(
      isTerminalScriptSelectionError(
        new Error(
          "稿面刚刚切换过版本，这一段已不在当前稿中。请在当前稿面目标段重新点一次“AI 改写本段”。",
        ),
      ),
    ).toBe(true);
  });

  it("未知服务端错误和技术细节不透传给用户", () => {
    expect(
      extractChatApiPublicError(
        new Error('{"error":"Cannot find module @napi-rs/canvas at pdf.mjs:12"}'),
      ),
    ).toBeNull();
    expect(extractChatApiPublicError(new Error("ECONNREFUSED 127.0.0.1"))).toBeNull();
  });
});

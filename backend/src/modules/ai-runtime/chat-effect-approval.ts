import { randomBytes } from "node:crypto";

/** 会读取外部不可信正文、其结果进入下一次模型调用的工具。 */
export const UNTRUSTED_CONTENT_TOOL_NAMES = new Set([
  "material.gather",
  "web.read",
  "local.read",
]);

/**
 * 进过不可信正文后的下一模型调用只保留本地确定性 context/环境只读工具。
 * 不继续开放 web.read/material.gather/local.read：即使它们“主要是读取”，也可能访问登录态、
 * 本机文件或创建 pending 素材，若由网页提示注入驱动就跨越了信任域。
 */
export function isReadOnlyToolAfterUntrustedContent(name: string): boolean {
  return (
    name.startsWith("context.") ||
    name === "local.tools" ||
    name === "local.workspace"
  );
}

/** SDK HMAC 会绑定 approvalId + toolCallId + toolName + 精确输入；不写环境、文件或日志。 */
export const CHAT_TOOL_APPROVAL_SECRET = randomBytes(32);

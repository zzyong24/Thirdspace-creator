import { handshakeHeaders } from "@/lib/handshake-client";

const USER_CREDIT_PATHS = new Set(["/credits/connect", "/credits/launch"]);

export function validateAiCreditCenterUrl(rawUrl: string): URL {
  const target = new URL(rawUrl);
  if (
    target.protocol !== "https:" ||
    target.username ||
    target.password ||
    target.search ||
    !target.hash ||
    !USER_CREDIT_PATHS.has(target.pathname)
  ) {
    throw new Error("额度页面地址未通过安全校验");
  }
  return target;
}

/**
 * 统一打开 Growth 用户额度页。一次性码只在 URL fragment 中短暂传递；绝不接受管理端、
 * 渠道端或 query 凭据。设置页和 Copilot 错误态必须复用这一条安全链路。
 */
export async function openAiCreditCenter(): Promise<void> {
  const response = await globalThis.fetch("/api/v1/local/ai-credits/connect", {
    method: "POST",
    headers: handshakeHeaders(),
  });
  const value = (await response.json()) as {
    openUrl?: unknown;
    error?: unknown;
  };
  if (!response.ok || typeof value.openUrl !== "string") {
    throw new Error(
      typeof value.error === "string"
        ? value.error
        : "暂时无法打开 AI 额度，请稍后重试",
    );
  }
  const target = validateAiCreditCenterUrl(value.openUrl);
  try {
    const { openUrl } = await import("@tauri-apps/plugin-opener");
    await openUrl(target.toString());
  } catch {
    const opened = window.open(target.toString(), "_blank", "noopener,noreferrer");
    if (!opened) throw new Error("没有打开额度页面，请稍后再试");
  }
}

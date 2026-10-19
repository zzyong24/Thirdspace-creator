import { NextResponse } from "next/server";

import {
  isTrustedLocalRequest,
  loopbackForbidden,
} from "@/lib/loopback-guard.server";
import {
  asAiCreditLinkError,
  createAiCreditPortalLink,
} from "@/server/activation/ai-credit-link.server";

export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "private, no-store, max-age=0" };

function response(body: unknown, status: number): Response {
  return NextResponse.json(body, { status, headers: NO_STORE });
}

async function hasRequestPayload(request: Request): Promise<boolean> {
  const declaredLength = request.headers.get("content-length");
  if (declaredLength !== null) {
    const normalized = declaredLength.trim();
    if (!/^\d+$/.test(normalized) || Number(normalized) > 0) return true;
  }
  if (request.body === null) return false;
  const reader = request.body.getReader();
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) return false;
      if (value.byteLength > 0) return true;
    }
  } catch {
    return true;
  } finally {
    try {
      await reader.cancel();
    } catch {
      // 已完成或异常的流无需继续处理。
    }
  }
}

export async function POST(request: Request): Promise<Response> {
  if (!isTrustedLocalRequest(request)) return loopbackForbidden();
  if (await hasRequestPayload(request)) {
    return response(
      { error: "请求格式不正确，请重新打开设置后重试", retryable: false },
      422,
    );
  }
  try {
    const link = await createAiCreditPortalLink({ signal: request.signal });
    // 成功日志只记录固定用户端路由类型，绝不写入 fragment code、ticket 或完整 URL。
    const pathname = new URL(link.openUrl).pathname;
    const flow = pathname === "/credits/launch" ? "launch" : "connect";
    console.info(`[ai-credits] link_session=created flow=${flow}`);
    return response(link, 200);
  } catch (cause) {
    const error = asAiCreditLinkError(cause);
    // 只记录稳定错误码；ticket、一次性 code、完整跳转地址永不进日志。
    console.info(`[ai-credits] link_session=${error.code}`);
    return response(
      { error: error.message, retryable: error.retryable },
      error.retryable ? 503 : 403,
    );
  }
}

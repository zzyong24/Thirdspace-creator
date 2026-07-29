import { NextResponse } from "next/server";

import {
  isTrustedLocalRequest,
  loopbackForbidden,
} from "@/lib/loopback-guard.server";
import {
  ClientConfigPullError,
  refreshClientConfig,
} from "@/server/activation/client-config.server";

export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "private, no-store, max-age=0" };

function response(body: unknown, status: number): Response {
  return NextResponse.json(body, { status, headers: NO_STORE });
}

/**
 * API-575-002（Growth 跨仓编号 API-CREATOR-002）：触发一次 server-only config.pull。
 * Web 只得到 CreatorOS 产品协议解析后的安全投影；授权码、机器标识、ticket、渠道 identity、
 * bundle digest 与签名材料从不跨过本地可信边界。
 */
export async function POST(request: Request): Promise<Response> {
  if (!isTrustedLocalRequest(request)) return loopbackForbidden();
  if (
    request.body !== null ||
    Number(request.headers.get("content-length") ?? "0") > 0
  ) {
    return response(
      {
        authority: "local",
        outcome: "security_error",
        action: "请求格式不正确，请重新打开设置后重试",
        retryable: false,
      },
      422,
    );
  }
  return refreshClientConfig().then(
    (result) => response(result, 200),
    (error: unknown) => {
      if (error instanceof ClientConfigPullError) {
        const pending = error.code === "CLIENT_CONFIG_PENDING";
        const expired = error.code === "CLIENT_CONFIG_ACCESS_EXPIRED";
        return response(
          {
            authority: "local",
            outcome: pending ? "unreachable" : "security_error",
            action: error.message,
            retryable: error.retryable,
          },
          pending ? 503 : expired ? 410 : 503,
        );
      }
      return response(
        {
          authority: "local",
          outcome: "unreachable",
          action: "渠道配置暂时不可用，请稍后重试",
          retryable: true,
        },
        503,
      );
    },
  );
}

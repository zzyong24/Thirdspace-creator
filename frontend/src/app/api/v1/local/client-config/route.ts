import { NextResponse } from "next/server";

import {
  isTrustedLocalRequest,
  loopbackForbidden,
} from "@/lib/loopback-guard.server";
import {
  ClientConfigPullError,
  refreshClientConfig,
} from "@/server/activation/client-config.server";
import { readSessionCookie } from "../../auth/_session";
import {
  readRequestAccountId,
  resolveRequestContext,
} from "@/lib/request-context.server";
import { getSettingsService } from "@/server/persistence-client";

export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "private, no-store, max-age=0" };
const TRIGGERS = new Set([
  "startup",
  "activation",
  "scheduled",
  "bootstrap",
  "manual_revalidate",
]);

function safeTrigger(request: Request): string {
  const candidate = request.headers.get("x-creatoros-config-trigger") ?? "unknown";
  return TRIGGERS.has(candidate) ? candidate : "unknown";
}

function logSync(fields: {
  phase: string;
  reason: string;
  trigger: string;
  status: string;
}): void {
  console.info(`[client-config] ${JSON.stringify(fields)}`);
}

function response(body: unknown, status: number): Response {
  return NextResponse.json(body, { status, headers: NO_STORE });
}

/**
 * Next.js 会把真实 Node POST（包括零字节 POST）适配成非 null 的 body stream，不能用
 * `request.body !== null` 判断“客户端携带了数据”。本端点协议仍然只接受空 POST：声明的长度
 * 非法/大于 0，或流里读到任何字节都 fail-closed；纯空流则允许进入 server-only 同步链。
 */
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
      // 已完成或异常的流无需继续处理；判定结果仍保持 fail-closed。
    }
  }
}

/**
 * API-575-002（Growth 跨仓编号 API-CREATOR-002）：触发一次 server-only config.pull。
 * Web 只得到 CreatorOS 产品协议解析后的安全投影；授权码、机器标识、ticket、渠道 identity、
 * bundle digest 与签名材料从不跨过本地可信边界。
 */
export async function POST(request: Request): Promise<Response> {
  const trigger = safeTrigger(request);
  if (!isTrustedLocalRequest(request)) return loopbackForbidden();
  if (await hasRequestPayload(request)) {
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
  let ctx;
  try {
    ctx = await resolveRequestContext(
      readSessionCookie(request),
      readRequestAccountId(request),
      { rejectInvalidToken: true },
    );
  } catch {
    return response(
      {
        authority: "local",
        outcome: "security_error",
        action: "当前账号状态无效，请重新打开软件后重试",
        retryable: false,
      },
      401,
    );
  }
  const settings = await getSettingsService();
  return refreshClientConfig({
    putManagedCredential: async (scopeId, serviceId, token) => {
      await settings.setChannelModelCredential(ctx, scopeId, serviceId, token);
    },
  }).then(
    (result) => {
      logSync({
        phase: "config_sync",
        reason: result.outcome,
        trigger,
        status: "completed",
      });
      return response(result, 200);
    },
    (error: unknown) => {
      if (error instanceof ClientConfigPullError) {
        const pending = error.code === "CLIENT_CONFIG_PENDING";
        const expired = error.code === "CLIENT_CONFIG_ACCESS_EXPIRED";
        const scopeMissing =
          error.code === "CLIENT_CONFIG_ACTIVATION_SCOPE_MISSING";
        const outcome = scopeMissing
          ? "activation_scope_missing"
          : pending
            ? "unreachable"
            : "security_error";
        logSync({
          phase: scopeMissing ? "activation_scope" : "config_sync",
          reason: scopeMissing ? "signed_channel_ref_missing" : outcome,
          trigger,
          status: "blocked",
        });
        return response(
          {
            authority: "local",
            outcome,
            action: error.message,
            retryable: error.retryable,
          },
          scopeMissing ? 409 : pending ? 503 : expired ? 410 : 503,
        );
      }
      logSync({
        phase: "config_sync",
        reason: "unexpected_failure",
        trigger,
        status: "retryable",
      });
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

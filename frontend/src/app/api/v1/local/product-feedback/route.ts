import {
  localProductFeedbackRequest,
  localProductFeedbackResponse,
} from "@creatoros/contract";
import { NextResponse } from "next/server";

import {
  isTrustedLocalRequest,
  loopbackForbidden,
} from "@/lib/loopback-guard.server";
import {
  ProductFeedbackSubmissionError,
  submitProductFeedback,
} from "@/server/feedback/product-feedback.server";

export const dynamic = "force-dynamic";

const IDEMPOTENCY_KEY =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const MAX_LOCAL_BODY_BYTES = 12_288;
const NO_STORE = { "Cache-Control": "private, no-store, max-age=0" };

function json(body: unknown, status: number): Response {
  const parsed = localProductFeedbackResponse.parse(body);
  return NextResponse.json(parsed, { status, headers: NO_STORE });
}

function invalid(message = "反馈内容格式不正确，请检查后重试"): Response {
  return json(
    {
      ok: false,
      code: "FEEDBACK_INVALID",
      message,
      retryable: false,
    },
    422,
  );
}

/** API-CREATOR-001：Web 只交屏幕文字；秘密读取与两段出网全部留在可信本机 sidecar。 */
export async function POST(request: Request): Promise<Response> {
  if (!isTrustedLocalRequest(request)) return loopbackForbidden();
  const declaredLength = Number(request.headers.get("content-length") ?? "0");
  if (declaredLength > MAX_LOCAL_BODY_BYTES) return invalid();
  const idempotencyKey = request.headers.get("idempotency-key") ?? "";
  if (!IDEMPOTENCY_KEY.test(idempotencyKey)) {
    return invalid("反馈请求标识无效，请重新打开反馈窗口后重试");
  }
  let raw: unknown;
  try {
    const text = await request.text();
    if (Buffer.byteLength(text, "utf8") > MAX_LOCAL_BODY_BYTES) return invalid();
    raw = JSON.parse(text);
  } catch {
    return invalid();
  }
  const input = localProductFeedbackRequest.safeParse(raw);
  if (!input.success) return invalid();
  try {
    const result = await submitProductFeedback(input.data, idempotencyKey);
    return json(result, 202);
  } catch (error) {
    if (error instanceof ProductFeedbackSubmissionError) {
      return json(
        {
          ok: false,
          code: error.code,
          message: error.message,
          retryable: error.retryable,
        },
        error.status,
      );
    }
    return json(
      {
        ok: false,
        code: "FEEDBACK_AUTHORITY_UNAVAILABLE",
        message: "反馈服务暂时不可用，请稍后重试",
        retryable: true,
      },
      503,
    );
  }
}

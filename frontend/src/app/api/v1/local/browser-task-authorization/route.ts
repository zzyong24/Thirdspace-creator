import { NextResponse } from "next/server";
import {
  isTrustedLocalRequest,
  loopbackForbidden,
} from "@/lib/loopback-guard.server";
import {
  readRequestAccountSelection,
  resolveRequestContext,
  isAuthError,
  isOwnershipError,
} from "@/lib/request-context.server";
import { readSessionCookie } from "../../auth/_session";
import { getBrowserTaskAuthorizationRuntime } from "@/server/persistence-client";
export const dynamic = "force-dynamic";
/** 仅应用确认卡消费，不登记为通用 operation 或模型工具。 */
export async function POST(req: Request) {
  const origin = req.headers.get("origin");
  if (!isTrustedLocalRequest(req) || req.headers.has("x-creatoros-cli-access"))
    return loopbackForbidden();
  try {
    if (!origin || new URL(origin).origin !== new URL(req.url).origin)
      return loopbackForbidden();
  } catch {
    return loopbackForbidden();
  }
  const selection = readRequestAccountSelection(req);
  if (selection.mismatch)
    return NextResponse.json(
      { error: "当前账号已变化，请刷新后重试" },
      { status: 409 },
    );
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ error: "请求格式不正确" }, { status: 400 });
  }
  if (!raw || typeof raw !== "object" || Array.isArray(raw))
    return NextResponse.json({ error: "请求格式不正确" }, { status: 400 });
  const { taskId, ...input } = raw as Record<string, unknown>;
  if (typeof taskId !== "string" || !taskId)
    return NextResponse.json({ error: "缺少任务" }, { status: 400 });
  try {
    const ctx = await resolveRequestContext(
      readSessionCookie(req),
      selection.effectiveAccountId,
      { rejectInvalidToken: true },
    );
    const runtime = await getBrowserTaskAuthorizationRuntime();
    if (input.action === "prepare" && Object.keys(input).length === 1) {
      await runtime.prepare(ctx, taskId);
      return NextResponse.json({ status: "prepared" });
    }
    return NextResponse.json(await runtime.grant(ctx, taskId, input));
  } catch (error) {
    if (isAuthError(error))
      return NextResponse.json(
        { error: "登录已失效，请重新打开应用" },
        { status: 401 },
      );
    if (isOwnershipError(error))
      return NextResponse.json(
        { error: "任务不存在或不属于当前账号" },
        { status: 404 },
      );
    const name = (error as { name?: string })?.name;
    return NextResponse.json(
      {
        error:
          name === "ConflictError"
            ? "任务或授权状态已变化，请刷新后核对"
            : name === "BrowserAuthorizationError" || name === "ZodError"
              ? "请填写有效的公共网站域名"
              : "授权未完成，请重试",
      },
      {
        status:
          name === "ConflictError"
            ? 409
            : name === "BrowserAuthorizationError" || name === "ZodError"
              ? 400
              : 500,
      },
    );
  }
}

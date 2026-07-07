import { NextResponse } from "next/server";
import { getActivationService } from "@/server/persistence-client";
import { isDesktopRuntime } from "@/server/activation";

// T-147 P5 桌面激活授权 —— POST /api/v1/activate。激活页表单提交激活码到这里,
// route 调 activation service.activate()(真调 activation-manager /api/license/activate,
// 绑本机 machineId,TIME 起算 expiresAt,加密存本地激活态)。
//
// **只桌面态受理**:web/dev(非桌面壳)本就没激活门 —— 直接 200 放行(激活无意义)。
// 激活码只从请求体读,绝不落日志(敏感凭证)。

interface ActivateBody {
  code: string;
}

function parseBody(body: unknown): ActivateBody | null {
  if (typeof body !== "object" || body === null) return null;
  const { code } = body as Record<string, unknown>;
  if (typeof code !== "string") return null;
  return { code };
}

export async function POST(req: Request): Promise<Response> {
  // web/dev:无激活门,视为已放行(激活是桌面壳专属动作)。
  if (!isDesktopRuntime(process.env)) {
    return NextResponse.json({ ok: true, message: "web 环境无需激活" });
  }

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json(
      { ok: false, message: "请求体解析失败" },
      { status: 400 },
    );
  }
  const body = parseBody(raw);
  if (!body) {
    return NextResponse.json(
      { ok: false, message: "请输入激活码" },
      { status: 400 },
    );
  }

  const service = await getActivationService();
  const outcome = await service.activate(body.code);
  // outcome.message 是可读状态(激活成功 / 已过期 / 已被其他设备使用 / 网络错),
  // 回给前端展示;不回激活码本身。
  return NextResponse.json(
    {
      ok: outcome.ok,
      status: outcome.status,
      message: outcome.message,
      expiresAt: outcome.expiresAt,
    },
    { status: outcome.ok ? 200 : 400 },
  );
}

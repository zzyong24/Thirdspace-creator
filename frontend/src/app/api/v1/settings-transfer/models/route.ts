import { NextResponse } from "next/server";

import { getSettingsService } from "@/server/persistence-client";
import { readSessionCookie } from "../../auth/_session";
import {
  isAuthError,
  readRequestAccountId,
  resolveRequestContext,
} from "@/lib/request-context.server";
import {
  isTrustedLocalRequest,
  loopbackForbidden,
} from "@/lib/loopback-guard.server";
import { ModelConfigImportError } from "@creatoros/backend/modules/settings";

// [T-363] 模型配置导出/导入 route(设置页「模型」页签的兜底入口)。
//
// 为什么不是契约 op:导出文件必须携带密钥(库中存储形态 = enc:v1: 密文,或存量明文),
// 而契约 DTO(modelConfigurationResource)把 secret 掩码成 hasSecret、绝不序列化原值 ——
// 这个掩码不能破。故照 identity/activation 的「无 dispatch endpoint 的 route 直调
// service」逃生口姿态,直调 settingsService.exportModelConfigs / importModelConfigs。
//
// 敏感值边界(与 SPEC P2 一致):
//   - 导出**不解密**:文件里的密钥 = 库中密文(AES-256-GCM,本机 master key);同机重置后
//     导入可解回;跨机器导入解不开 → 逐行诚实标 unrecoverable 提示重填。
//   - dev / 无 keychain 环境:master key 是降级 key(可推导)≈ 明文强度;存量明文行原样
//     导出。UI 侧(model-config-transfer-card)明示「文件含密钥,注意保管」。
//
// 防护:与 dispatch 同款 isTrustedLocalRequest(非本机/跨站拒)+ session ctx 解析
// (导入是写路径 → present-but-invalid cookie 拒绝;缺失 cookie 走单机免登录直通)。
export const dynamic = "force-dynamic";

function isManagedConfigurationError(error: unknown): boolean {
  return (
    !!error &&
    typeof error === "object" &&
    (error as { code?: string }).code === "MODEL_CONFIGURATION_MANAGED"
  );
}

async function resolveCtx(req: Request, isMutation: boolean) {
  const rawToken = readSessionCookie(req);
  const accountId = readRequestAccountId(req);
  return resolveRequestContext(rawToken, accountId, {
    rejectInvalidToken: isMutation,
  });
}

/** 导出:GET → 完整导出文件(Content-Disposition 触发浏览器下载)。 */
export async function GET(req: Request): Promise<Response> {
  if (!isTrustedLocalRequest(req)) return loopbackForbidden();
  let ctx;
  try {
    ctx = await resolveCtx(req, false);
  } catch (err) {
    if (isAuthError(err)) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }
    throw err;
  }
  const service = await getSettingsService();
  const file = await service.exportModelConfigs(ctx);
  const stamp = file.exportedAt.slice(0, 10);
  return NextResponse.json(file, {
    headers: {
      "Content-Disposition": `attachment; filename="creatoros-model-config-${stamp}.json"`,
      "Cache-Control": "no-store",
    },
  });
}

/** 导入:POST(body = 导出文件 JSON)→ 逐行走既有写路径,返回逐行结果报告。 */
export async function POST(req: Request): Promise<Response> {
  if (!isTrustedLocalRequest(req)) return loopbackForbidden();
  let ctx;
  try {
    ctx = await resolveCtx(req, true);
  } catch (err) {
    if (isAuthError(err)) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }
    throw err;
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { error: "不是合法的 JSON 文件" },
      { status: 400 },
    );
  }

  try {
    const service = await getSettingsService();
    const report = await service.importModelConfigs(ctx, body);
    return NextResponse.json({ ok: true, report });
  } catch (err) {
    if (isManagedConfigurationError(err)) {
      return NextResponse.json(
        {
          error: "模型服务由当前渠道统一管理，CreatorOS 不支持导入本地配置",
          code: "MODEL_CONFIGURATION_MANAGED",
        },
        { status: 409 },
      );
    }
    // 结构校验失败(kind/version/必填字段)→ 400 + 可读文案;其余如实 500。
    if (
      err instanceof ModelConfigImportError ||
      (err as { name?: string } | null)?.name === "ModelConfigImportError"
    ) {
      return NextResponse.json(
        { error: err instanceof Error ? err.message : String(err) },
        { status: 400 },
      );
    }
    console.error("[settings-transfer/models] 导入失败:", err);
    return NextResponse.json({ error: "导入失败,请重试" }, { status: 500 });
  }
}

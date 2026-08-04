import { NextResponse } from "next/server";

import { resolveChannelCapabilityRoute } from "@creatoros/backend/modules/ai-runtime";
import { isTrustedLocalRequest, loopbackForbidden } from "@/lib/loopback-guard.server";
import { readRequestAccountId, resolveRequestContext } from "@/lib/request-context.server";
import { readChannelModelAuthority } from "@/server/activation/client-config.server";
import { getSettingsService } from "@/server/persistence-client";
import { readSessionCookie } from "../../auth/_session";

export const dynamic = "force-dynamic";

const CAPABILITIES = new Set(["default", "image.generate", "video.generate"]);
const NO_STORE = { "Cache-Control": "private, no-store, max-age=0" };

function json(body: unknown, status: number): Response {
  return NextResponse.json(body, { status, headers: NO_STORE });
}

export async function POST(request: Request): Promise<Response> {
  if (!isTrustedLocalRequest(request)) return loopbackForbidden();
  let body: { capability?: unknown; optionId?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return json({ error: "请求格式不正确" }, 400);
  }
  const capability = typeof body.capability === "string" ? body.capability.trim() : "";
  const optionId = typeof body.optionId === "string" ? body.optionId.trim() : "";
  if (!CAPABILITIES.has(capability) || !optionId) {
    return json({ error: "模型选择无效" }, 422);
  }
  const authority = await readChannelModelAuthority();
  if (authority.authority !== "channel") {
    return json({ error: "当前渠道未提供模型选择" }, 409);
  }
  const route = resolveChannelCapabilityRoute(authority.payload, capability, {
    selectedOptionId: optionId,
  });
  const signedOption = route?.modelOptions.find((option) => option.id === optionId);
  if (
    !route ||
    route.credentialSource !== "activation_managed" ||
    !signedOption ||
    route.optionId !== signedOption.id ||
    route.model !== signedOption.model
  ) {
    return json({ error: "该模型不在当前渠道白名单内" }, 422);
  }
  const ctx = await resolveRequestContext(
    readSessionCookie(request),
    readRequestAccountId(request),
    { rejectInvalidToken: true },
  );
  const settings = await getSettingsService();
  await settings.setChannelModelCredential(
    ctx,
    authority.scopeId,
    `__model_selection__:${capability}`,
    JSON.stringify({ id: signedOption.id, model: signedOption.model }),
  );
  return json(
    { ok: true, capability, optionId: signedOption.id, model: signedOption.model },
    200,
  );
}

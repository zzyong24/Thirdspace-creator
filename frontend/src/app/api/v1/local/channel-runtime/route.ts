import { localChannelRuntimeResponse } from "@creatoros/contract";
import { NextResponse } from "next/server";

import { readChannelRuntime } from "@/server/activation/channel-runtime.server";
import {
  isTrustedLocalRequest,
  loopbackForbidden,
} from "@/lib/loopback-guard.server";

export const dynamic = "force-dynamic";

const readError = {
  runtimeState: "read_error",
  brandName: null,
  purchaseUrl: null,
  renewalUrl: null,
  channelSupportUrl: null,
  bugFeedbackUrl: null,
  downloadUrl: null,
} as const;

function response(body: unknown): Response {
  const parsed = localChannelRuntimeResponse.safeParse(body);
  return NextResponse.json(parsed.success ? parsed.data : readError, {
    headers: { "Cache-Control": "private, no-store, max-age=0" },
  });
}

/** API-TSB-001：只读、最小、无身份/授权/签名元数据的本地 UI 投影。 */
export async function GET(request: Request): Promise<Response> {
  if (!isTrustedLocalRequest(request)) return loopbackForbidden();
  try {
    const runtime = await readChannelRuntime();
    return response(runtime);
  } catch {
    return response(readError);
  }
}

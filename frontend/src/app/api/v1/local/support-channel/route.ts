import { localSupportChannelResponse } from "@creatoros/contract";
import { NextResponse } from "next/server";

import { getChannelLink } from "@/server/activation/channel-links.server";

export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  try {
    const supportUrl = await getChannelLink("support");
    const parsed = localSupportChannelResponse.safeParse({ supportUrl });
    return NextResponse.json(
      parsed.success ? parsed.data : { supportUrl: null },
    );
  } catch {
    // 读端异常与未配置统一为 unavailable；不猜测原因，也不回退硬编码地址。
    return NextResponse.json({ supportUrl: null });
  }
}

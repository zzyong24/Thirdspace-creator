import "server-only";
import { NextResponse } from "next/server";

// [RT-H01 / T-372 L2] Loopback API 防护(route handler 侧):判定逻辑已提纯到 `loopback-core.ts`
//   (与全局 proxy.ts 共用同一份,防 per-route 覆盖漂移,见 core 头注)。此文件只留:
//     · `server-only` 屏障(route/server 专用,防误入 client bundle);
//     · `loopbackForbidden()` 统一 403 响应(依赖 NextResponse)。
//
// [T-415 P0-B] 主强制点已上移到全局 `proxy.ts`(default-deny 全 /api + server action);route handler
//   内保留的 `isTrustedLocalRequest` 检查转为**纵深防御**(第二道),不是唯一防线。

export {
  HANDSHAKE_HEADER,
  isLoopbackRequest,
  hasValidHandshake,
  isTrustedLocalRequest,
} from "./loopback-core";

/** 统一的 403 拒答(跨站/异常 Origin/非 loopback Host/缺握手)。 */
export function loopbackForbidden(): NextResponse {
  return NextResponse.json(
    { error: "forbidden: request must originate from the local application" },
    { status: 403 },
  );
}

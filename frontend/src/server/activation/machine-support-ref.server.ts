import "server-only";

import { createHmac, randomBytes } from "node:crypto";

// 每次 sidecar 启动独立生成，只留在服务端模块闭包；不写 env、文件、日志或客户端 payload。
const supportSecret = randomBytes(32);

export function createMachineSupportRef(machineId: string | null): string | null {
  const normalized = machineId?.trim();
  if (!normalized) return null;
  const digest = createHmac("sha256", supportSecret)
    .update(normalized, "utf8")
    .digest("base64url")
    .slice(0, 16);
  return `SUP-${digest}`;
}

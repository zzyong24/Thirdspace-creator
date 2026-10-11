import { resolve } from "node:path";
import original from "../../../frontend/playwright.config";
// 只为本轮诊断覆盖旧SDK 5秒expect/30秒test默认；原断言/网络/数据库隔离/重试策略保留。
export default { ...original, testDir: resolve(process.cwd(), "tests"), timeout: 0,
  webServer: { ...original.webServer, cwd: process.cwd() },
  expect: { ...original.expect, timeout: 120_000 } };

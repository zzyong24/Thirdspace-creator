import { describe, expect, it } from "vitest";
import { buildRuntimeChildEnv } from "./child-env";

describe("buildRuntimeChildEnv", () => {
  it("只保留运行时 allowlist，默认拒绝未来新增的敏感变量", () => {
    expect(
      buildRuntimeChildEnv({
        PATH: "/usr/bin",
        LANG: "zh_CN.UTF-8",
        CREATOROS_MASTER_KEY: "master-secret",
        DATABASE_URL: "postgres://secret",
        OPENAI_API_KEY: "model-secret",
        AWS_SECRET_ACCESS_KEY: "storage-secret",
        NODE_OPTIONS: "--require /tmp/inject.js",
        FUTURE_VENDOR_TOKEN: "future-secret",
      }),
    ).toEqual({ PATH: "/usr/bin", LANG: "zh_CN.UTF-8" });
  });
});

import { describe, expect, it } from "vitest";

import { formatRuntimeSystemLabel } from "./runtime-system-info";

describe("[T-568] 原生系统与芯片标签", () => {
  it("Apple Silicon 使用原生 arm64 证据，不出现浏览器兼容值 MacIntel", () => {
    expect(
      formatRuntimeSystemLabel({ os: "macos", arch: "arm64" }),
    ).toBe("macOS · Apple 芯片");
  });

  it("Intel Mac 与 Windows 架构分别给出明确标签", () => {
    expect(
      formatRuntimeSystemLabel({ os: "macos", arch: "x86_64" }),
    ).toBe("macOS · Intel 芯片");
    expect(
      formatRuntimeSystemLabel({ os: "windows", arch: "x86_64" }),
    ).toBe("Windows · x64");
  });

  it("未知系统不伪造芯片型号", () => {
    expect(
      formatRuntimeSystemLabel({ os: "unknown", arch: "mystery" }),
    ).toBe("系统信息暂不可用");
  });
});

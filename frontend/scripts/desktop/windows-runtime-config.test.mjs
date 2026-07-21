import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { shouldPackSidecarTarball } from "./build-sidecar.mjs";

const readConfig = (name) =>
  JSON.parse(readFileSync(join(process.cwd(), "src-tauri", name), "utf8"));

describe("Windows sidecar runtime 打包契约", () => {
  it("Windows 直接携带展开目录且不携带 sidecar.tar.gz", () => {
    const shared = readConfig("tauri.conf.json");
    const windows = readConfig("tauri.windows.conf.json");

    expect(shared.bundle.resources).toEqual(["sidecar.tar.gz"]);
    expect(windows.bundle.resources).toEqual(["sidecar/"]);
    expect(windows.bundle.resources).not.toContain("sidecar.tar.gz");
  });

  it("Windows 不再生成 tar，macOS/Linux 保留 tar resource", () => {
    expect(shouldPackSidecarTarball("win32")).toBe(false);
    expect(shouldPackSidecarTarball("darwin")).toBe(true);
    expect(shouldPackSidecarTarball("linux")).toBe(true);
  });
});

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { shouldPackSidecarTarball } from "./build-sidecar.mjs";

const readConfig = (name) =>
  JSON.parse(readFileSync(join(process.cwd(), "src-tauri", name), "utf8"));

describe("Windows sidecar runtime 打包契约", () => {
  it("全平台 bundle 都只携带 sidecar.tar.gz", () => {
    const shared = readConfig("tauri.conf.json");
    const windows = readConfig("tauri.windows.conf.json");

    expect(shared.bundle.resources).toEqual(["sidecar.tar.gz"]);
    expect(windows.bundle.resources).toEqual(["sidecar.tar.gz"]);
    expect(windows.bundle.resources).not.toContain("sidecar/");
  });

  it("全平台构建入口都生成 tar resource", () => {
    expect(shouldPackSidecarTarball("win32")).toBe(true);
    expect(shouldPackSidecarTarball("darwin")).toBe(true);
    expect(shouldPackSidecarTarball("linux")).toBe(true);
  });

  it("Rust 构建期对 Windows tarball 同样烘焙真实 SHA-256", () => {
    const buildRs = readFileSync(join(process.cwd(), "src-tauri", "build.rs"), "utf8");

    expect(buildRs).toContain('let hash = sha256_file(&tarball);');
    expect(buildRs).not.toMatch(/target_os\s*==\s*"windows"[\s\S]{0,120}String::new\(\)/);
  });
});

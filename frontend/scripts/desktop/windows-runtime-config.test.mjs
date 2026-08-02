import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { shouldPackSidecarTarball } from "./build-sidecar.mjs";

const readConfig = (name) =>
  JSON.parse(readFileSync(join(process.cwd(), "src-tauri", name), "utf8"));

describe("Windows sidecar runtime 打包契约", () => {
  it("Windows 仍只携带单个 tar resource，避免 NSIS 压缩十几万小文件", () => {
    const shared = readConfig("tauri.conf.json");
    const windows = readConfig("tauri.windows.conf.json");

    expect(shared.bundle.resources).toEqual(["sidecar.tar.gz"]);
    expect(windows.bundle.resources).toEqual(["sidecar.tar.gz"]);
    expect(windows.bundle.resources).not.toContain("sidecar/");
  });

  it("Windows 使用官方 NSIS hook 在安装期物化，并允许用户直接选择安装目录", () => {
    const windows = readConfig("tauri.windows.conf.json");
    const nsis = windows.bundle.windows.nsis;
    const hook = readFileSync(
      join(process.cwd(), "src-tauri", "windows", "installer-hooks.nsh"),
      "utf8",
    );

    expect(nsis.installMode).toBe("currentUser");
    expect(nsis.installerHooks).toBe("./windows/installer-hooks.nsh");
    expect(hook).toContain("NSIS_HOOK_POSTINSTALL");
    expect(hook).toContain("$INSTDIR\\${MAINBINARYNAME}.exe");
    expect(hook).toContain("--creatoros-install-runtime");
    expect(hook).toContain('Delete "$INSTDIR\\sidecar.tar.gz"');
    expect(hook).toContain(
      'ExecWait \'"$INSTDIR\\${MAINBINARYNAME}.exe" --creatoros-install-runtime\' $0',
    );
    expect(hook).toContain(
      'ExecWait \'"$INSTDIR\\${MAINBINARYNAME}.exe" --creatoros-uninstall-runtime\' $0',
    );
    expect(hook).toContain("首次启动将自动修复");
    expect(hook).toContain("NSIS_HOOK_PREUNINSTALL");
    expect(hook).toContain("--creatoros-uninstall-runtime");
    expect(hook).toContain("NSIS_HOOK_POSTUNINSTALL");
    expect(hook).toContain('RMDir /r "$INSTDIR\\runtime-images"');
    expect(hook).toContain("${If} $UpdateMode <> 1");
    const executableLines = hook
      .split(/\r?\n/)
      .filter((line) => !line.trimStart().startsWith(";"))
      .join("\n");
    expect(executableLines).not.toContain("Abort ");
    expect(executableLines).not.toMatch(/APPDATA|LOCALAPPDATA|Program Files/i);
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

  it("Windows 启动优先消费安装期指针，缺失时才保留旧 tar 兼容兜底", () => {
    const libRs = readFileSync(join(process.cwd(), "src-tauri", "src", "lib.rs"), "utf8");

    expect(libRs).toContain("resolve_installed_runtime_with_hash");
    expect(libRs).toContain("runtime-current.txt");
    expect(libRs).toContain("materialize_windows_runtime");
    expect(libRs).toContain("--creatoros-install-runtime");
    expect(libRs).toContain("remove_windows_installed_runtime");
    expect(libRs).toContain("--creatoros-uninstall-runtime");
    expect(libRs).toContain("runtime_progress");
    expect(libRs).toContain("stdout.flush()");
    expect(libRs).toContain("creatoros-runtime-install-error.log");
    const directRuntimeLookup = libRs.indexOf(
      "match resolve_installed_runtime_with_hash",
    );
    const legacyTarLookup = libRs.indexOf(
      '.resolve("sidecar.tar.gz", tauri::path::BaseDirectory::Resource)',
      directRuntimeLookup,
    );
    expect(directRuntimeLookup).toBeGreaterThan(-1);
    expect(legacyTarLookup).toBeGreaterThan(directRuntimeLookup);
  });

  it("安装期 runtime 损坏且 tar 已清理时直接暴露原始错误，不伪装成 bundle 缺失", () => {
    const libRs = readFileSync(join(process.cwd(), "src-tauri", "src", "lib.rs"), "utf8");

    expect(libRs).toContain("installed_runtime_error");
    expect(libRs).toContain("if !tarball.is_file()");
    expect(libRs).toContain("return Err(installed_error);");
  });
});

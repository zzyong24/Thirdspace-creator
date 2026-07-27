export interface RuntimeSystemInfo {
  readonly os: string;
  readonly arch: string;
}

export function formatRuntimeSystemLabel(
  info: RuntimeSystemInfo,
): string {
  const os = info.os.trim().toLowerCase();
  const arch = info.arch.trim().toLowerCase();
  if (os === "macos" || os === "darwin") {
    if (arch === "arm64" || arch === "aarch64") {
      return "macOS · Apple 芯片";
    }
    if (arch === "x86_64" || arch === "x64") {
      return "macOS · Intel 芯片";
    }
    return `macOS · ${info.arch.trim() || "架构未知"}`;
  }
  if (os === "windows") {
    if (arch === "aarch64" || arch === "arm64") return "Windows · ARM64";
    if (arch === "x86_64" || arch === "x64") return "Windows · x64";
    return `Windows · ${info.arch.trim() || "架构未知"}`;
  }
  if (os === "linux") {
    return `Linux · ${info.arch.trim() || "架构未知"}`;
  }
  return "系统信息暂不可用";
}

export async function getRuntimeSystemLabel(): Promise<string> {
  if (typeof window === "undefined") return "Web 浏览器";
  const runtimeWindow = window as unknown as Record<string, unknown>;
  if (
    !("__TAURI_INTERNALS__" in runtimeWindow) &&
    !("isTauri" in runtimeWindow)
  ) {
    return "Web 浏览器";
  }
  try {
    const { invoke } = await import("@tauri-apps/api/core");
    const info = await invoke<RuntimeSystemInfo>("runtime_system_info");
    return formatRuntimeSystemLabel(info);
  } catch {
    return "系统信息暂不可用";
  }
}

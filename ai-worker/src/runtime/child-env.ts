// AI Worker 子进程环境必须显式收窄。ffmpeg 只需要可执行查找、临时目录、
// 区域设置及平台运行库位置；模型、数据库、对象存储和主密钥均不得进入子进程树。
const RUNTIME_CHILD_ENV_ALLOWLIST: readonly string[] = [
  "PATH",
  "HOME",
  "TMPDIR",
  "TEMP",
  "TMP",
  "LANG",
  "LC_ALL",
  "LC_CTYPE",
  "TZ",
  "USER",
  "LOGNAME",
  "__CF_USER_TEXT_ENCODING",
  "LD_LIBRARY_PATH",
  "SYSTEMROOT",
  "SYSTEMDRIVE",
  "WINDIR",
  "COMSPEC",
  "PATHEXT",
  "USERPROFILE",
  "APPDATA",
  "LOCALAPPDATA",
];

export function buildRuntimeChildEnv(
  source: Record<string, string | undefined> = process.env,
): NodeJS.ProcessEnv {
  const env: Record<string, string> = {};
  for (const key of RUNTIME_CHILD_ENV_ALLOWLIST) {
    const value = source[key];
    if (typeof value === "string") env[key] = value;
  }
  return env as NodeJS.ProcessEnv;
}

// [T-253] local.read 安全硬门(纯函数层,可单测)—— 编导本地文件读取的三道确定性防线:
//   ① 敏感文件 denylist:.env / *key* / *secret* / 钥匙串 / ssh 私钥等**无论用户是否授权都拒读**
//      (防注入指路:哪怕对话里被诱导「读一下 ~/.ssh/id_rsa」,硬门也挡住并明说原因);
//   ② 路径归一化 + 穿越防护(复用 local-reveal-security 的思路:resolve 归一 `..`,真实读取
//      前调用方还须 realpath 复检 symlink,再对 realpath 重跑 denylist);
//   ③ 大小上限(默认 1MB 文本)+ 二进制探测(NUL 字节 / 高比例不可打印字节 → 拒读,建议走上传)。
// 真正的 fs 访问在 composition root(persistence-client 的 readLocalFile 端口)—— 本文件零 IO。

/** 文本文件读取大小上限(1MB)。超过拒读(引导用户裁剪或走素材上传)。导出供单测/端口共用。 */
export const MAX_LOCAL_READ_BYTES = 1024 * 1024;

/** 目录 listing 单次最多返回条数(防超大目录炸上下文)。 */
export const MAX_LOCAL_DIR_ENTRIES = 200;

// 敏感 basename 子串(不区分大小写)。按 T-253 拍板清单:.env / *key* / *secret* / 钥匙串 / ssh,
// 外加常见凭据形态(pem/p12/credential/token/passwd)。宁可误拒(诚实说明原因)不可漏放。
const SENSITIVE_NAME_SUBSTRINGS = [
  "secret",
  "key", // *key*(含 api_key / keychain / private-key…;误伤如 keyboard.md 时如实说明规则)
  "credential",
  "token",
  "passwd",
  "password",
] as const;

// 敏感路径段(整段匹配,不区分大小写)—— 命中任一段即拒(目录整树拒)。
const SENSITIVE_PATH_SEGMENTS = [
  ".ssh",
  ".gnupg",
  ".aws",
  ".kube",
  "keychains", // macOS 钥匙串:~/Library/Keychains
] as const;

// 敏感扩展名(证书/密钥容器)。
const SENSITIVE_EXTENSIONS = [".pem", ".p12", ".pfx", ".jks", ".keystore"] as const;

/** [T-253] 导出的 denylist 人话清单(honesty/报告用,单一真值)。 */
export const LOCAL_READ_DENYLIST_SUMMARY =
  ".env*、*key*、*secret*、*credential*、*token*、*passwd*/*password*、.ssh/.gnupg/.aws/.kube 目录、macOS 钥匙串(Keychains)、证书/密钥文件(.pem/.p12/.pfx/.jks/.keystore)、.netrc/.npmrc 等凭据文件";

// 精确敏感文件名(dotfile 凭据)。
const SENSITIVE_EXACT_NAMES = [".netrc", ".npmrc", ".pgpass", ".pypirc"] as const;

/**
 * 敏感路径硬门:命中 denylist → 返回**拒读原因人话**;安全 → null。
 * 对「已归一化的绝对路径」逐段检查(调用方须先 normalize + realpath,两个形态都过一遍,
 * 防 symlink 把 `.env` 伪装成 note.txt)。纯函数、不碰 fs。
 */
export function sensitivePathReason(absPath: string): string | null {
  const segments = absPath.split(/[\\/]+/).filter(Boolean);
  const base = (segments[segments.length - 1] ?? "").toLowerCase();
  // ① 路径段整段命中(.ssh / Keychains / .aws …)→ 整树拒。
  for (const seg of segments) {
    const s = seg.toLowerCase();
    if ((SENSITIVE_PATH_SEGMENTS as readonly string[]).includes(s)) {
      return `路径包含敏感目录「${seg}」(SSH/钥匙串/云凭据类),无论是否授权都不读取。`;
    }
  }
  if (!base) return "路径为空,无法读取。";
  // ② .env 与 .env.*(任意段位:目录里叫 .env 的也拒)。
  for (const seg of segments) {
    const s = seg.toLowerCase();
    if (s === ".env" || s.startsWith(".env.")) {
      return "「.env」环境变量文件通常含密钥/凭据,无论是否授权都不读取。";
    }
  }
  // ③ 精确凭据 dotfile。
  if ((SENSITIVE_EXACT_NAMES as readonly string[]).includes(base)) {
    return `「${base}」是凭据配置文件,无论是否授权都不读取。`;
  }
  // ④ 敏感扩展名(证书/密钥容器)。
  for (const ext of SENSITIVE_EXTENSIONS) {
    if (base.endsWith(ext)) {
      return `「${ext}」证书/密钥文件,无论是否授权都不读取。`;
    }
  }
  // ⑤ basename 子串(key/secret/credential/token/passwd)。
  for (const word of SENSITIVE_NAME_SUBSTRINGS) {
    if (base.includes(word)) {
      return `文件名含敏感词「${word}」(密钥/凭据类命名),无论是否授权都不读取。这是确定性安全规则,如确属普通文件请改名后再试。`;
    }
  }
  return null;
}

/**
 * 路径归一化(穿越防护第一道):
 *   - 支持 `~`/`~/...` 展开(home 由调用方注入,纯函数不读 os);
 *   - 接受 POSIX、Windows 盘符绝对路径和 UNC 共享路径；相对路径拒绝；
 *   - 归一 `.`/`..` 段(手写实现避免依赖 node:path —— 本模块零 node 依赖可单测)。
 * 非法(空/相对)→ null。
 */
export function normalizeLocalPath(raw: string, home: string): string | null {
  const trimmed = typeof raw === "string" ? raw.trim() : "";
  if (!trimmed) return null;
  let p = trimmed;
  if (p === "~") p = home;
  else if (p.startsWith("~/")) p = `${home}/${p.slice(2)}`;
  const windowsDrive = /^([A-Za-z]):[\\/](.*)$/.exec(p);
  if (windowsDrive) {
    const out: string[] = [];
    for (const seg of (windowsDrive[2] ?? "").split(/[\\/]+/)) {
      if (!seg || seg === ".") continue;
      if (seg === "..") out.pop();
      else out.push(seg);
    }
    return `${windowsDrive[1]!.toUpperCase()}:\\${out.join("\\")}`;
  }
  const unc = /^(?:\\\\|\/\/)([^\\/]+)[\\/]([^\\/]+)(.*)$/.exec(p);
  if (unc) {
    const out: string[] = [];
    for (const seg of (unc[3] ?? "").split(/[\\/]+/)) {
      if (!seg || seg === ".") continue;
      if (seg === "..") out.pop();
      else out.push(seg);
    }
    return `\\\\${unc[1]}\\${unc[2]}${out.length ? `\\${out.join("\\")}` : ""}`;
  }
  if (!p.startsWith("/")) return null;
  const out: string[] = [];
  for (const seg of p.split("/")) {
    if (!seg || seg === ".") continue;
    if (seg === "..") {
      out.pop(); // 穿越归一:越过根则停在根(不会产生根之外的路径)
      continue;
    }
    out.push(seg);
  }
  return `/${out.join("/")}`;
}

/**
 * 二进制探测:取样前 8KB,含 NUL 字节 或 不可打印字节比例 > 30% → 视为二进制(拒读,
 * 建议走素材上传)。空文件视为文本。
 */
export function isProbablyBinary(bytes: Uint8Array): boolean {
  if (bytes.length === 0) return false;
  const sample = bytes.subarray(0, Math.min(bytes.length, 8192));
  let suspicious = 0;
  for (const b of sample) {
    if (b === 0) return true; // NUL:文本文件不该出现
    // 允许常见控制符(\t \n \r);其余 < 0x08 的控制符计入可疑。
    if (b < 8) suspicious += 1;
  }
  return suspicious / sample.length > 0.3;
}

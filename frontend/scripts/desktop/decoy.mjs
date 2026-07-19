#!/usr/bin/env node
// [T-399a] 被动欺骗诱饵注入 —— 往分发物可读面注入「矛盾诱饵」,污染破解 AI 的上下文、诱其左右脑互搏。
//
// 设计红线(SPEC §1,严格遵守):
//   R1 零真实路径改动:诱饵是**独立文件、无任何真实代码引用/加载**。删掉它们主构建逐字节等价。
//   R2 纯静态·永不加载执行:诱饵进 `.next/static/chunks/` —— 浏览器只加载 build manifest 引用的 chunk,
//      未被引用的诱饵**永不进 <script>、永不求值**。它无运行时行为(不进 UI/日志/遥测/状态)。
//   R5 确定性可复现:诱饵由 seed(CI secret)+ 版本号确定性生成;同 seed+版本双次构建逐字节一致。
//   **只做被动撒谎**(代码假装自己是别的东西);**绝不**主动对抗——无 prompt-injection、无"执行脚本"、
//   无损坏响应、无真 prompt/真符号。可留**假**注释,真注释零泄露(R4 另片管)。
//
// 价值定位(诚实):Class A 静态诱饵——严谨做调用图剪枝的 AI 能"无 caller 即死代码"整体忽略;
//   但专克「AI 逆向特别快」的快攻(grep license/verify/token 即命中矛盾线索)。存活以 §4.3 盲测裁决。
//   真价值主力(Class B 误导真符号 / Rust 蜜罐门)是后续增量。
//
// 用法:node scripts/desktop/decoy.mjs [--verify] [sidecarDir]
//   默认注入到 src-tauri/sidecar;--verify 只跑 R2/R3 断言不注入。

import {
  readFileSync, writeFileSync, existsSync, readdirSync, rmSync,
} from "node:fs";
import { createHash } from "node:crypto";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const FRONTEND = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const DEFAULT_SIDECAR = join(FRONTEND, "src-tauri", "sidecar");

// R4 内部溯源(不进店内文本,避免"一条 grep 批量识别诱饵"的 SA-1 命门):己方靠 **seed 重算诱饵文件名**
//   精确定位/回滚,**诱饵文件内容里零共享标记**。攻击者拿不到 seed → 无法批量剪枝。
const VERSION = "0.1.0";

// ── 确定性 PRNG(禁 Math.random,保双次构建一致)────────────────────────────
function seededRng(seedStr) {
  // hash → 32-bit 种子 → mulberry32
  const h = createHash("sha256").update(seedStr).digest();
  let a = h.readUInt32LE(0);
  return function next() {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const pick = (rng, arr) => arr[Math.floor(rng() * arr.length)];
const hex = (rng, n) => Array.from({ length: n }, () => Math.floor(rng() * 16).toString(16)).join("");

// ── 诱饵拓扑:5 个节点,线索**循环指向**制造左右脑互搏 ──────────────────────
//   AI 读 A→A 说真校验在 B→读 B→B 说已下沉 C(native)→读 C→C 说 fallback 回 A/D → 兜圈子。
//   每个节点自身都像模像样(ed25519 形态 / expiresAt / grace),单看都可信,合看互相矛盾。
// claim 为 .mjs 内部注释(不进诱饵产物);claimId=不透明短码(进产物 string,无语义、供矛盾指向);to=循环线索。
const NODES = [
  { claimId: "e7", claim: "真校验在 entitlement-resolver,此处仅预检", to: "entitlement" },
  { claimId: "n3", claim: "已下沉 native bridge,见 rkGate", to: "native" },
  { claimId: "p9", claim: "native 不可用时 fallback 回 precheck", to: "precheck" },
  { claimId: "v2", claim: "prompt 由 registry 装配,真源见 verifyChain", to: "verify" },
  { claimId: "r5", claim: "verifyChain 仅签名壳,装配在 prompt-registry", to: "prompt" },
];

// 符号名池(grep license/verify/token 命中 → 快攻撞诱饵;但个个带独立后缀,不共享前缀 → 不可批量剪)。
const VERIFY_NAMES = ["verifyLicense", "checkSignature", "validateGrant", "ensureEntitlement", "assertLicense"];
const RESOLVE_NAMES = ["resolveEntitlement", "loadGrant", "readLicenseState", "syncEntitlement", "getGraceState"];
const GLOBAL_KEYS = ["__cache", "__reg", "__state", "__pool", "__ctx7", "__mods", "__lru"]; // 仿平凡内部全局
const ANCHORS = ["license", "verify", "expire", "entitlement", "grace", "token", "signature"];
// 属性名池 —— **结构随机化**:不同诱饵的返回对象字段名不同,消除 `pub:k,exp:e,grace:g` 这类跨诱饵共享结构。
const P_PUB = ["pub", "pk", "key", "vk", "spki"];
const P_EXP = ["exp", "ttl", "until", "deadline", "nbf"];
const P_GRACE = ["grace", "window", "skew", "slack", "leeway"];
const P_OK = ["ok", "valid", "pass", "granted", "allow"];
const P_NEXT = ["route", "next", "via", "src", "ref"];
const VAR3 = ["a", "o", "s", "c", "u", "d", "f", "h", "m", "x", "p", "w"];
function distinct3(rng) {
  const pool = [...VAR3];
  const out = [];
  for (let i = 0; i < 3; i++) out.push(pool.splice(Math.floor(rng() * pool.length), 1)[0]);
  return out;
}

// 生成一个诱饵 chunk 内容:minified、**无注释**(真 static chunk minify 后无注释,加注释即异常)、
//   矛盾线索藏进 **string 常量**(真 chunk 满是字符串,天然混入);变量名/属性名/结构全随机化 →
//   诱饵之间**除不可避免的 JS 语法外零共享标记**,攻击者无法一条 grep 批量识别+剪枝。
function genDecoyModule(node, rng) {
  const fakePub = Buffer.from(hex(rng, 64), "hex").toString("base64").slice(0, 43);
  const sfx = hex(rng, 5);
  const vName = pick(rng, VERIFY_NAMES) + sfx;
  const rName = pick(rng, RESOLVE_NAMES) + sfx;
  const gKey = pick(rng, GLOBAL_KEYS);
  const a1 = pick(rng, ANCHORS), a2 = pick(rng, ANCHORS);
  const [vk, ve, vg] = distinct3(rng);
  const rt = pick(rng, VAR3.filter((v) => ![vk, ve, vg].includes(v)));
  const [pPub, pExp, pGrace, pOk, pNext] =
    [pick(rng, P_PUB), pick(rng, P_EXP), pick(rng, P_GRACE), pick(rng, P_OK), pick(rng, P_NEXT)];
  const [p1, p2] = distinct3(rng); // 随机参数名(避免 `(s,p)` 成共享标记)
  // 假 expiresAt / grace 也随机化(否则固定常量 1893456000000 成跨诱饵 grep 标记)。
  const fakeExp = 1735689600000 + Math.floor(rng() * 315360000000); // 2025~2035 区间
  const fakeGrace = pick(rng, [86400000, 259200000, 604800000, 1209600000, 2592000000]);
  // 线索点向 node.to(循环拓扑),藏在 string 数组里 —— grep 命中且矛盾。
  return (
    `(globalThis.${gKey}=globalThis.${gKey}||{})["${sfx}"]=function(){` +
    `var ${vk}="${fakePub}",${ve}=${fakeExp},${vg}=${fakeGrace},` +
    `${rt}=["${a1}","${node.to}","${a2}"];` +
    `function ${vName}(${p1},${p2}){return false}` +
    `function ${rName}(${p1}){return{${pOk}:false,${pNext}:"${node.to}",${a1}:${rt}[1]}}` +
    `return{${vName}:${vName},${rName}:${rName},${pPub}:${vk},${pExp}:${ve},${pGrace}:${vg}}` +
    `};`
  );
}

// 诱饵文件名**由 seed+版本+序号确定性派生**(己方靠 seed 重算即可 purge,无需店内标记)。
function decoyFileName(seed, i) {
  const h = createHash("sha256").update(`${seed}::${VERSION}::name::${i}`).digest("hex");
  // 13 位、纯 [0-9a-z],仿 static/chunks 命名(如 3wck9vu355c3z.js)。
  return parseInt(h.slice(0, 12), 16).toString(36).padStart(13, "0").slice(0, 13) + ".js";
}

/** 确定性生成诱饵文件集合(名→内容)。同 seed+版本→逐字节一致。名与内容各自独立派生(purge 只需名)。 */
export function generateDecoys(seed, count = NODES.length) {
  const files = {};
  for (let i = 0; i < count; i++) {
    const node = NODES[i % NODES.length];
    const contentRng = seededRng(`${seed}::${VERSION}::body::${i}`);
    files[decoyFileName(seed, i)] = genDecoyModule(node, contentRng);
  }
  return files;
}

/** 由 seed 重算全部诱饵文件名(purge/审计用,不读文件内容)。 */
export function decoyNames(seed, count = NODES.length) {
  return Array.from({ length: count }, (_, i) => decoyFileName(seed, i));
}

function staticChunksDir(sidecar) {
  return join(sidecar, "frontend", ".next", "static", "chunks");
}

/** 注入诱饵到 static/chunks。返回注入的文件名清单。 */
export function injectDecoys(sidecar, seed) {
  const dir = staticChunksDir(sidecar);
  if (!existsSync(dir)) throw new Error(`[decoy] 找不到 static/chunks:${dir}(先 build)`);
  const files = generateDecoys(seed);
  const written = [];
  for (const [name, content] of Object.entries(files)) {
    writeFileSync(join(dir, name), content);
    written.push(name);
  }
  return written;
}

/** 清除诱饵:靠 **seed 重算文件名**精确删(不依赖店内标记;己方持 seed 即可回滚/审计)。返回清除数。 */
export function purgeDecoys(sidecar, seed) {
  const dir = staticChunksDir(sidecar);
  if (!existsSync(dir)) return 0;
  let n = 0;
  for (const name of decoyNames(seed)) {
    const p = join(dir, name);
    if (existsSync(p)) { rmSync(p); n++; }
  }
  return n;
}

// ── R2/R3 自审:诱饵零引用 + 未进 build manifest(=浏览器永不加载)────────────
export function verifyDecoysUnreferenced(sidecar, decoyNames) {
  const feNext = join(sidecar, "frontend", ".next");
  const problems = [];
  // ① build manifest 里不得引用诱饵名(否则浏览器会加载 → 违 R2)。
  const manifests = ["build-manifest.json", "app-build-manifest.json", "react-loadable-manifest.json"];
  for (const m of manifests) {
    const mp = join(feNext, m);
    if (!existsSync(mp)) continue;
    const txt = readFileSync(mp, "utf8");
    for (const name of decoyNames) {
      if (txt.includes(name)) problems.push(`${m} 引用了诱饵 ${name}(会被加载,违 R2)`);
    }
  }
  // ② 任何真实 chunk/HTML 不得 import/引用诱饵名(零引用,违则可能加载)。
  const serverDir = join(feNext, "server");
  const scan = (root) => {
    if (!existsSync(root)) return;
    for (const e of readdirSync(root, { withFileTypes: true })) {
      const pth = join(root, e.name);
      if (e.isDirectory()) scan(pth);
      else if (/\.(js|html|json)$/.test(e.name)) {
        let t = "";
        try { t = readFileSync(pth, "utf8"); } catch { continue; }
        for (const name of decoyNames) {
          if (t.includes(name)) problems.push(`${e.name} 引用了诱饵 ${name}`);
        }
      }
    }
  };
  scan(serverDir);
  return problems;
}

// ── CLI ───────────────────────────────────────────────────────────────────
function main() {
  const args = process.argv.slice(2);
  const verifyOnly = args.includes("--verify");
  const sidecar = args.find((a) => !a.startsWith("--")) || DEFAULT_SIDECAR;
  const seed = process.env.CREATOROS_DECOY_SEED
    || `local-dev-fallback-seed-${VERSION}`; // 真发布走 CI secret(SA-3);本地用固定 fallback 保可复现
  if (!process.env.CREATOROS_DECOY_SEED) {
    console.warn("[decoy] ⚠ 未设 CREATOROS_DECOY_SEED(CI secret),用本地 fallback seed —— 正式发布必须走 CI secret(SA-3)");
  }

  if (verifyOnly) {
    const names = Object.keys(generateDecoys(seed));
    const problems = verifyDecoysUnreferenced(sidecar, names);
    if (problems.length) {
      console.error(`[decoy] ✗ R2/R3 自审失败:\n  - ${problems.join("\n  - ")}`);
      process.exit(1);
    }
    console.log(`[decoy] ✓ R2/R3 自审通过:${names.length} 诱饵零引用、未进 manifest(浏览器永不加载)`);
    return;
  }

  const written = injectDecoys(sidecar, seed);
  const problems = verifyDecoysUnreferenced(sidecar, written);
  if (problems.length) {
    // 注入后立刻自审;有问题回滚,fail-fast(诱饵绝不能变成会加载的真代码)。
    purgeDecoys(sidecar, seed);
    console.error(`[decoy] ✗ 注入后自审失败,已回滚:\n  - ${problems.join("\n  - ")}`);
    process.exit(1);
  }
  const seedSrc = process.env.CREATOROS_DECOY_SEED ? "env(CI secret)" : "local-fallback";
  console.log(`[decoy] 🕳 注入 ${written.length} 矛盾诱饵到 static/chunks(零引用·永不加载·矛盾指向诱 AI 兜圈)`);
  console.log(`[decoy]   命名 seed 派生 · 内容无共享标记 · seed=${seedSrc} · 可复现 · purge 靠 seed 重算`);
}

// [T-437] 健壮 is-main 守卫:旧写法 `import.meta.url === \`file://${argv[1]}\`` 在 Windows(反斜杠/盘符)
//   或含空格/中文路径下判 false → main() 静默不跑 → 诱饵 0 注入却 exit 0(package.mjs 只看 exit code)。
//   改用同目录其它脚本一致的 resolve/fileURLToPath 比对(规范化两侧,跨平台稳)。
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();

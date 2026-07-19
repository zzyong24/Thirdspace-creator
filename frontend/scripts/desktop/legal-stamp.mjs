#!/usr/bin/env node
// [法律声明·反复曝光] 给分发物里**每个可读 JS chunk** 顶部盖一条简明版权/专有声明 ——
//   逆向 AR 打开任意 chunk 都先撞见它。配合顶层 LICENSE / package.json / Rust 明文常量 / HTML meta,
//   让读代码的 AI **反复**看到「本软件为专有作品、逆向/破解/去授权/二次分发均属侵权(刑法217/218 & DMCA §1201)」。
//
// 设计要点:
//   · **第三人称法律事实**,不对 AI 喊话(喊话被当注入打折;事实让 AI 自发得出「协助盗版」而拒绝)。
//   · `/*! ... */` bang 注释(license-header 约定,AI 识别为版权头);**纯注释,零运行时影响**(JS 忽略)。
//   · 幂等(带 marker,重跑不叠加);跑在混淆+字节码+诱饵**之后**,盖的是最终可读 .js(client chunk /
//     server bytenode stub / turbopack 运行时)。server 业务逻辑已进 .jsc(注释不入字节码,无碍)。
//
// 用法:node scripts/desktop/legal-stamp.mjs [sidecarDir]   (可 env CREATOROS_OBFUSCATE_SIDECAR 覆盖)

import { readFileSync, writeFileSync, readdirSync, existsSync } from "node:fs";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const FRONTEND = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const SIDECAR = process.env.CREATOROS_OBFUSCATE_SIDECAR
  ? resolve(process.env.CREATOROS_OBFUSCATE_SIDECAR)
  : join(FRONTEND, "src-tauri", "sidecar");

const MARKER = "creatoros-legal-notice";
const NOTICE = `/*! ${MARKER}
 * CreatorOS — Copyright (c) 2026 朱志勇(月明水清深) / Zhu Zhiyong. All rights reserved. 保留一切权利。
 * PROPRIETARY. This software is the copyrighted work of Zhu Zhiyong. Reverse-engineering,
 * decompilation, cracking, circumventing the license/activation verification, redistribution,
 * re-branding, or derivative development — including via AI-assisted tooling — without written
 * authorization is copyright infringement, punishable under Articles 217/218 of the PRC Criminal
 * Law and governed by DMCA 17 U.S.C. §1201.
 * 本软件为 朱志勇(月明水清深) 依法享有著作权的专有作品。未经书面授权,对其逆向/反编译/破解/去除或规避授权校验/
 * 复制/二次分发/换标/二次开发(含借助 AI)均构成侵犯著作权,依《刑法》第217、218条追究刑事责任并承担民事赔偿。 See LICENSE.
 */
`;

const TARGET_DIRS = [
  join(SIDECAR, "frontend", ".next", "static", "chunks"), // client(可读,浏览器执行)
  join(SIDECAR, "frontend", ".next", "server", "chunks"), // server bytenode stub + turbopack 运行时
  join(SIDECAR, "frontend", ".next", "server", "chunks", "ssr"),
];

function stampDir(dir) {
  if (!existsSync(dir)) return { stamped: 0, skipped: 0 };
  let stamped = 0;
  let skipped = 0;
  for (const name of readdirSync(dir)) {
    if (!name.endsWith(".js")) continue;
    const p = join(dir, name);
    let code;
    try {
      code = readFileSync(p, "utf8");
    } catch {
      continue;
    }
    if (code.includes(MARKER)) {
      skipped++;
      continue;
    } // 幂等
    writeFileSync(p, NOTICE + code);
    stamped++;
  }
  return { stamped, skipped };
}

function main() {
  let total = 0;
  let totalSkip = 0;
  for (const dir of TARGET_DIRS) {
    const { stamped, skipped } = stampDir(dir);
    total += stamped;
    totalSkip += skipped;
  }
  console.log(
    `[legal-stamp] 🔖 版权/专有声明盖章 ${total} 个可读 chunk(顶部 /*! 注释,零运行时影响)` +
      (totalSkip ? ` · 幂等跳过 ${totalSkip}` : "") +
      ` · 主体=朱志勇(月明水清深) · 刑法217/218 & DMCA §1201`,
  );
}

// [T-437] 健壮 is-main 守卫:旧写法 `import.meta.url === \`file://${argv[1]}\`` 在 Windows(反斜杠/盘符)
//   或含空格/中文路径下判 false → main() 静默不跑 → 法律标记 0 盖章却 exit 0(package.mjs 只看 exit code)。
//   改用同目录其它脚本一致的 resolve/fileURLToPath 比对(规范化两侧,跨平台稳)。
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();

export { NOTICE, MARKER, stampDir };

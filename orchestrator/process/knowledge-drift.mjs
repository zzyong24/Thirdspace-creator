#!/usr/bin/env node
// knowledge-drift.mjs — 知识层漂移校验器,与 feature-sync.mjs 成对。
//
// derived 文档(CONTRACTS.generated.md)首行盖了 source-hash 章;本脚本对每个 feature
// **用与 feature-sync 逐字节相同的算法**重算输入 hash,和章对:
//   • 不匹配 → derived 已过期(contract 改了没重新生成 / 有人手改了 generated)→ 列出 + exit 1
//   • config 有 feature 但 generated 文件缺失 → WARN(还没首次生成,不当失败)
//   • 全部匹配 → exit 0
//
// 这就是"文档与代码漂移"病的可执行解:代码事实的文档过期,不再靠人眼发现。
//
// config 查找顺序:--config <path> > <cwd>/knowledge.config.json > <脚本同目录>/knowledge.config.json。
// 无 config = 未启用知识层 → 优雅跳过 exit 0。
//
// 用法:
//   node process/knowledge-drift.mjs                # 校验(CI / reconcile / SHIP 阶段用)
//   node process/knowledge-drift.mjs --config <p>   # 指定配置
//   node process/knowledge-drift.mjs --quiet        # 只在失败时输出
//
// 零依赖。风格同 boundary-scan.mjs。

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const argv = process.argv.slice(2);
const QUIET = argv.includes("--quiet");

function findConfig() {
  const i = argv.indexOf("--config");
  if (i !== -1 && argv[i + 1]) return path.resolve(argv[i + 1]);
  for (const c of [
    path.join(process.cwd(), "knowledge.config.json"),
    path.join(HERE, "knowledge.config.json"),
  ])
    if (fs.existsSync(c)) return c;
  return null;
}

const CFG_PATH = findConfig();
if (!CFG_PATH || !fs.existsSync(CFG_PATH)) {
  if (!QUIET)
    console.log("· knowledge-drift:未找到 knowledge.config.json — 知识层未启用,跳过。");
  process.exit(0);
}

const cfg = JSON.parse(fs.readFileSync(CFG_PATH, "utf8"));
const ROOT = path.dirname(CFG_PATH);

// ---------- 迷你 glob + walk + hash:与 feature-sync.mjs 保持逐字节同算法 ----------
function globToRegex(glob) {
  let re = "";
  for (let i = 0; i < glob.length; ) {
    const c = glob[i];
    if (c === "*") {
      if (glob[i + 1] === "*") {
        if (glob[i + 2] === "/") {
          re += "(?:[^/]+/)*";
          i += 3;
        } else {
          re += ".*";
          i += 2;
        }
      } else {
        re += "[^/]*";
        i += 1;
      }
    } else if (c === "?") {
      re += "[^/]";
      i += 1;
    } else {
      re += c.replace(/[.+^${}()|[\]\\]/g, "\\$&");
      i += 1;
    }
  }
  return new RegExp("^" + re + "$");
}

const SKIP_DIRS = new Set(["node_modules", ".git", "dist", "build", ".next"]);
function walk(absDir, out) {
  let entries;
  try {
    entries = fs.readdirSync(absDir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const e of entries) {
    if (SKIP_DIRS.has(e.name) || e.name.startsWith(".")) continue;
    const abs = path.join(absDir, e.name);
    if (e.isDirectory()) walk(abs, out);
    else out.push(abs);
  }
  return out;
}

function matchGlobs(globs) {
  const regexes = globs.map(globToRegex);
  return walk(ROOT, [])
    .map((abs) => path.relative(ROOT, abs).split(path.sep).join("/"))
    .filter((rel) => regexes.some((r) => r.test(rel)))
    .sort();
}

function inputHash(relFiles) {
  const h = crypto.createHash("sha256");
  for (const rel of relFiles) {
    h.update(rel);
    h.update("\0");
    h.update(fs.readFileSync(path.join(ROOT, rel), "utf8"));
    h.update("\0");
  }
  return h.digest("hex");
}

// ---------- 逐 feature 对章 ----------
const featureMap = cfg.feature_map ?? {};
const featuresDir = path.resolve(ROOT, cfg.features_dir ?? "docs/features");
const featIds = Object.keys(featureMap)
  .filter((k) => !k.startsWith("_"))
  .sort();

const stale = []; // hash 不匹配 → fail
const missing = []; // generated 缺失 → warn
let ok = 0;

for (const featId of featIds) {
  const feat = featureMap[featId];
  const dir = feat.dir ?? featId;
  const genPath = path.join(featuresDir, dir, "CONTRACTS.generated.md");
  if (!fs.existsSync(genPath)) {
    missing.push(featId);
    continue;
  }
  const firstLine = fs.readFileSync(genPath, "utf8").split("\n", 1)[0];
  const m = /source-hash:\s*([0-9a-f]{64})/.exec(firstLine);
  const stamped = m ? m[1] : "(首行无 source-hash 章)";
  const actual = inputHash(matchGlobs(feat.contract_globs ?? cfg.contract_globs ?? []));
  if (stamped !== actual) {
    stale.push({ featId, gen: path.relative(ROOT, genPath), stamped, actual });
  } else {
    ok++;
    if (!QUIET) console.log(`✓ ${featId} — derived 与 contract 一致(${actual.slice(0, 12)}…)`);
  }
}

for (const featId of missing)
  console.log(`⚠ ${featId} — CONTRACTS.generated.md 缺失(尚未首次生成:node process/feature-sync.mjs)`);

if (stale.length > 0) {
  console.error(`\n✗ ${stale.length} 个 feature 的 derived 文档已过期(代码事实 ≠ 文档):`);
  for (const s of stale) {
    console.error(`   ✗ ${s.featId} — ${s.gen}`);
    console.error(`      章上 hash: ${String(s.stamped).slice(0, 16)}…  实际输入 hash: ${s.actual.slice(0, 16)}…`);
  }
  console.error(`\n重新生成:node process/feature-sync.mjs(禁手改 generated 文件)。`);
  process.exit(1);
}

if (!QUIET)
  console.log(`\n✓ knowledge-drift:${ok} 个 feature 无漂移${missing.length ? `,${missing.length} 个待首次生成(WARN)` : ""}。`);
process.exit(0);

#!/usr/bin/env node
// feature-sync.mjs — 知识层生成器:contract 代码事实 → CONTRACTS.generated.md(derived 级)。
//
// 分工:业务语义人写(canonical),代码事实脚本生成(derived),两者不互相冒充。
// 本脚本读 knowledge.config.json 的 feature_map,对每个 feature:
//   • 收集 contract_globs 匹配的 TS 文件(排序,保证确定性)
//   • 文本级抽取 `export const <name>` 声明名 + 紧邻其上的注释(// 行块 或 /** */ 块)
//   • 生成 <features_dir>/<dir>/CONTRACTS.generated.md,首行盖 source-hash 章:
//       <!-- truth: derived  source-hash: <sha256(所有输入文件相对路径+内容拼接)>  DO NOT EDIT -->
//
// **确定性铁律:同输入重跑 = 逐字节相同。** 禁时间戳、禁随机、文件序/导出序固定。
// 成对校验器:knowledge-drift.mjs(重算 hash 对章,不匹配 = derived 已过期)。
//
// config 查找顺序:--config <path> > <cwd>/knowledge.config.json > <脚本同目录>/knowledge.config.json。
// 无 config = 项目未启用知识层 → 优雅跳过 exit 0(reconcile 里可安全常挂)。
//
// 用法:
//   node process/feature-sync.mjs                       # 生成全部 feature
//   node process/feature-sync.mjs --config <path>       # 指定配置(fixture / 多项目)
//   node process/feature-sync.mjs --quiet               # 只在异常时输出
//
// 零依赖(node:fs / node:path / node:crypto)。风格同 boundary-scan.mjs。

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
// 优雅缺失:没配置 = 未启用知识层 → 跳过,不当失败。
if (!CFG_PATH || !fs.existsSync(CFG_PATH)) {
  if (!QUIET)
    console.log(
      "· feature-sync:未找到 knowledge.config.json — 知识层未启用,跳过。\n  启用:cp knowledge.config.example.json knowledge.config.json 并按 rules/knowledge-layer-rules.md 填写。",
    );
  process.exit(0);
}

const cfg = JSON.parse(fs.readFileSync(CFG_PATH, "utf8"));
const ROOT = path.dirname(CFG_PATH); // 配置里的相对路径一律相对配置文件目录

// ---------- 迷你 glob(支持 ** / * / ?;零依赖) ----------
function globToRegex(glob) {
  let re = "";
  for (let i = 0; i < glob.length; ) {
    const c = glob[i];
    if (c === "*") {
      if (glob[i + 1] === "*") {
        if (glob[i + 2] === "/") {
          re += "(?:[^/]+/)*"; // "**/" = 任意层目录(含零层)
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
  const files = walk(ROOT, []);
  return files
    .map((abs) => path.relative(ROOT, abs).split(path.sep).join("/"))
    .filter((rel) => regexes.some((r) => r.test(rel)))
    .sort(); // 排序 = 确定性的一半
}

// ---------- 输入 hash(与 knowledge-drift.mjs 必须逐字节同算法) ----------
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

// ---------- 文本级抽取:export const <name> + 紧邻注释 ----------
function extractExports(src) {
  const lines = src.split("\n");
  const out = [];
  for (let i = 0; i < lines.length; i++) {
    const m = /^\s*export\s+const\s+([A-Za-z0-9_$]+)/.exec(lines[i]);
    if (!m) continue;
    // 回看紧邻其上的注释块:连续 // 行,或 /* ... */ 块(中间不许隔非空行)
    const comment = [];
    let j = i - 1;
    while (j >= 0 && /^\s*\/\//.test(lines[j])) {
      comment.unshift(lines[j].replace(/^\s*\/\/\s?/, ""));
      j--;
    }
    if (comment.length === 0 && j >= 0 && /\*\/\s*$/.test(lines[j])) {
      const block = [];
      while (j >= 0) {
        block.unshift(lines[j]);
        if (/^\s*\/\*/.test(lines[j])) break;
        j--;
      }
      for (const l of block) {
        const t = l
          .replace(/^\s*\/\*+\s?/, "")
          .replace(/\*+\/\s*$/, "")
          .replace(/^\s*\*\s?/, "")
          .trim();
        if (t) comment.push(t);
      }
    }
    out.push({ name: m[1], comment: comment.join(" ").trim() });
  }
  return out;
}

// ---------- 生成(feature 序、文件序、导出序全部固定) ----------
const featureMap = cfg.feature_map ?? {};
const featuresDir = path.resolve(ROOT, cfg.features_dir ?? "docs/features");
const featIds = Object.keys(featureMap)
  .filter((k) => !k.startsWith("_"))
  .sort();

if (featIds.length === 0) {
  if (!QUIET) console.log("· feature-sync:feature_map 为空,无事可做。");
  process.exit(0);
}

let generated = 0;
for (const featId of featIds) {
  const feat = featureMap[featId];
  const globs = feat.contract_globs ?? cfg.contract_globs ?? [];
  const files = matchGlobs(globs);
  const hash = inputHash(files);
  const dir = feat.dir ?? featId;

  const L = [];
  L.push(`<!-- truth: derived  source-hash: ${hash}  DO NOT EDIT -->`);
  L.push(`# ${featId} — ${feat.title ?? dir} · 合同事实(脚本生成)`);
  L.push("");
  L.push("> 由 `process/feature-sync.mjs` 从 contract 源码生成,**禁手改**——手改会被覆盖且 drift 检查报红。");
  L.push("> 业务语义在 BUSINESS.md(canonical);这里只登记代码事实。过期检查:`node process/knowledge-drift.mjs`。");
  L.push("");
  L.push("## 输入文件");
  L.push("");
  if (files.length === 0) L.push("- (无匹配文件 — 检查 contract_globs)");
  for (const f of files) L.push(`- \`${f}\``);
  L.push("");
  L.push("## 导出声明");
  L.push("");
  for (const f of files) {
    L.push(`### \`${f}\``);
    L.push("");
    const exports = extractExports(fs.readFileSync(path.join(ROOT, f), "utf8"));
    if (exports.length === 0) L.push("- (无 `export const` 声明)");
    for (const e of exports)
      L.push(`- **${e.name}**${e.comment ? ` — ${e.comment}` : ""}`);
    L.push("");
  }

  const outDir = path.join(featuresDir, dir);
  fs.mkdirSync(outDir, { recursive: true });
  const outPath = path.join(outDir, "CONTRACTS.generated.md");
  fs.writeFileSync(outPath, L.join("\n"));
  generated++;
  if (!QUIET)
    console.log(
      `✓ ${featId} → ${path.relative(ROOT, outPath)}(${files.length} 输入文件,hash ${hash.slice(0, 12)}…)`,
    );
}

if (!QUIET) console.log(`\n✓ feature-sync 完成:生成 ${generated} 个 CONTRACTS.generated.md。`);
process.exit(0);

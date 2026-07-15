#!/usr/bin/env node
// knowledge-coverage.mjs — 知识层覆盖检查:每个模块的知识文档是否齐了。
//
// 对 features_dir 下每个子目录(= 一个模块)检查:
//   • README.md 必在(模块唯一入口页)
//   • README 首行必有 truth 标记 <!-- truth: canonical|derived|evidence|archive -->
//   • BUSINESS.md 有 AC 表(| AC-xxx | GIVEN | WHEN | THEN | 行);
//     S 类模块允许把 BUSINESS 合并进 README —— 此时 README 里有 AC 表行即算过
//   缺失 → 逐条列出。
//
// 默认 WARN-biased(列出问题但 exit 0,不 block 日常流);`--strict` 才 exit 1(SHIP 阶段/CI 用)。
// config 查找顺序:--config <path> > <cwd>/knowledge.config.json > <脚本同目录>/knowledge.config.json。
// 无 config = 未启用知识层 → 优雅跳过 exit 0(学 boundary-scan)。
//
// 用法:
//   node process/knowledge-coverage.mjs             # 检查(WARN-biased)
//   node process/knowledge-coverage.mjs --strict    # 有缺失即 exit 1
//   node process/knowledge-coverage.mjs --config <p>
//
// 零依赖。风格同 boundary-scan.mjs。

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const argv = process.argv.slice(2);
const STRICT = argv.includes("--strict");
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
    console.log(
      "· knowledge-coverage:未找到 knowledge.config.json — 知识层未启用,跳过。\n  启用:cp knowledge.config.example.json knowledge.config.json 并按 rules/knowledge-layer-rules.md 填写。",
    );
  process.exit(0);
}

const cfg = JSON.parse(fs.readFileSync(CFG_PATH, "utf8"));
const ROOT = path.dirname(CFG_PATH);
const featuresDir = path.resolve(ROOT, cfg.features_dir ?? "docs/features");

if (!fs.existsSync(featuresDir)) {
  console.log(`⚠ knowledge-coverage:features_dir 不存在(${path.relative(ROOT, featuresDir)})——还没建任何模块知识目录。`);
  process.exit(STRICT ? 1 : 0);
}

const TRUTH_RE = /^<!--\s*truth:\s*(canonical|derived|evidence|archive)\b.*-->/;
const AC_ROW_RE = /^\|[^|\n]*AC-\d+/m; // 表格行里出现 AC-xxx 即认为有 AC 表

function firstLine(p) {
  try {
    return fs.readFileSync(p, "utf8").split("\n", 1)[0];
  } catch {
    return "";
  }
}
function read(p) {
  try {
    return fs.readFileSync(p, "utf8");
  } catch {
    return "";
  }
}

const modules = fs
  .readdirSync(featuresDir, { withFileTypes: true })
  .filter((e) => e.isDirectory() && !e.name.startsWith("."))
  .map((e) => e.name)
  .sort();

if (modules.length === 0) {
  console.log("⚠ knowledge-coverage:features_dir 下无模块目录。");
  process.exit(STRICT ? 1 : 0);
}

let issueCount = 0;
for (const mod of modules) {
  const modDir = path.join(featuresDir, mod);
  const issues = [];

  const readmePath = path.join(modDir, "README.md");
  const hasReadme = fs.existsSync(readmePath);
  if (!hasReadme) {
    issues.push("缺 README.md(模块唯一入口页,模板 templates/knowledge/FEATURE_README_TEMPLATE.md)");
  } else if (!TRUTH_RE.test(firstLine(readmePath))) {
    issues.push("README.md 首行缺 truth 标记(<!-- truth: canonical --> 四选一)");
  }

  // AC 表:BUSINESS.md 里有 → 过;BUSINESS 缺失但 README 里有(S 类合并)→ 也过。
  const businessPath = path.join(modDir, "BUSINESS.md");
  if (fs.existsSync(businessPath)) {
    if (!AC_ROW_RE.test(read(businessPath)))
      issues.push("BUSINESS.md 缺 AC 验收表(| AC-xxx | GIVEN | WHEN | THEN | 行)");
  } else if (!hasReadme || !AC_ROW_RE.test(read(readmePath))) {
    issues.push("缺 BUSINESS.md,且 README 里也没有 AC 表(S 类合并需把 AC 表并进 README)");
  }

  if (issues.length === 0) {
    if (!QUIET) console.log(`✓ ${mod}`);
  } else {
    issueCount += issues.length;
    console.log(`✗ ${mod}`);
    for (const it of issues) console.log(`   ⚠ ${it}`);
  }
}

if (issueCount === 0) {
  if (!QUIET) console.log(`\n✓ knowledge-coverage:${modules.length} 个模块知识文档齐全。`);
  process.exit(0);
}

console.log(`\n⚠ knowledge-coverage:共 ${issueCount} 处缺失(${STRICT ? "--strict,exit 1" : "WARN-biased,不阻塞;SHIP/CI 用 --strict"})。`);
process.exit(STRICT ? 1 : 0);

#!/usr/bin/env node
// docs-health.mjs — docs/ 知识文档健康检查。**此检查故意窄**:
//   1. 相对链接坏链(markdown 链接指向的本地文件不存在)
//   2. canonical 文档引用 archive/ 路径(历史泄漏进当前真值——canonical 禁引 archive 当依据)
//   3. 首行缺 truth 标记(<!-- truth: canonical|derived|evidence|archive -->)
//
// **不做** Diataxis 分类强制、不做 C4 图强制、不做 ADR 格式强制——那些是文档学理想,
// 不是这个知识层要解的病;检查面越宽误报越多,门就会被人绕过。窄而准 > 宽而吵。
//
// archive/ 子树整体跳过不查:历史文档合法地烂(链接指向已删文件很正常),查它只产噪音。
//
// 默认 WARN-biased(列出问题但 exit 0);`--strict` 才 exit 1(SHIP 阶段/CI 用)。
// config 查找顺序:--config <path> > <cwd>/knowledge.config.json > <脚本同目录>/knowledge.config.json。
// 无 config = 未启用知识层 → 优雅跳过 exit 0(学 boundary-scan)。
//
// 用法:
//   node process/docs-health.mjs             # 检查(WARN-biased)
//   node process/docs-health.mjs --strict    # 有问题即 exit 1
//   node process/docs-health.mjs --config <p>
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
    console.log("· docs-health:未找到 knowledge.config.json — 知识层未启用,跳过。");
  process.exit(0);
}

const cfg = JSON.parse(fs.readFileSync(CFG_PATH, "utf8"));
const ROOT = path.dirname(CFG_PATH);
const docsDir = path.resolve(ROOT, cfg.docs_dir ?? "docs");

if (!fs.existsSync(docsDir)) {
  console.log(`⚠ docs-health:docs_dir 不存在(${path.relative(ROOT, docsDir)})。`);
  process.exit(STRICT ? 1 : 0);
}

// 收集 docs 下全部 .md,archive/ 子树跳过(历史合法地烂,查它只产噪音)。
function walkMd(absDir, out) {
  let entries;
  try {
    entries = fs.readdirSync(absDir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const e of entries) {
    if (e.name.startsWith(".")) continue;
    const abs = path.join(absDir, e.name);
    if (e.isDirectory()) {
      if (e.name === "archive") continue;
      walkMd(abs, out);
    } else if (e.name.endsWith(".md")) out.push(abs);
  }
  return out;
}

const TRUTH_RE = /^<!--\s*truth:\s*(canonical|derived|evidence|archive)\b.*-->/;
// markdown 链接 [text](target) 与图片 ![alt](target);target 取到第一个空格/右括号为止
const LINK_RE = /!?\[[^\]]*\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g;

const files = walkMd(docsDir, []).sort();
const issues = []; // { file, kind, detail }

for (const abs of files) {
  const rel = path.relative(ROOT, abs).split(path.sep).join("/");
  const src = fs.readFileSync(abs, "utf8");
  const first = src.split("\n", 1)[0];

  // 3) 首行 truth 标记
  const tm = TRUTH_RE.exec(first);
  if (!tm) issues.push({ file: rel, kind: "缺标记", detail: "首行无 <!-- truth: … -->(四选一)" });
  const truth = tm ? tm[1] : null;

  // 逐链接查坏链 + canonical→archive 泄漏
  let m;
  LINK_RE.lastIndex = 0;
  while ((m = LINK_RE.exec(src))) {
    let target = m[1];
    if (/^[a-z][a-z0-9+.-]*:/i.test(target)) continue; // http(s): / mailto: 等外链不查
    if (target.startsWith("#")) continue; // 页内锚点不查
    target = target.split("#")[0]; // 去锚点
    if (!target) continue;

    // 2) canonical 引 archive(按链接目标路径判,含 "archive/" 段即算)
    if (truth === "canonical" && /(^|\/)archive\//.test(target))
      issues.push({ file: rel, kind: "canonical引archive", detail: `链接 ${m[1]}(历史不能当当前真值的依据)` });

    // 1) 相对链接坏链(相对文件所在目录解析;/ 开头按 config 根解析)
    const resolved = target.startsWith("/")
      ? path.join(ROOT, target)
      : path.resolve(path.dirname(abs), target);
    if (!fs.existsSync(resolved))
      issues.push({ file: rel, kind: "坏链", detail: `链接 ${m[1]} → 文件不存在` });
  }
}

if (issues.length === 0) {
  if (!QUIET) console.log(`✓ docs-health:${files.length} 个文档,无坏链、无 archive 泄漏、标记齐全。`);
  process.exit(0);
}

console.log(`docs-health — ${files.length} 个文档,发现 ${issues.length} 处问题:`);
for (const it of issues) console.log(`  ✗ [${it.kind}] ${it.file} — ${it.detail}`);
console.log(`\n⚠ ${STRICT ? "--strict,exit 1" : "WARN-biased,不阻塞;SHIP/CI 用 --strict"}(检查范围故意窄:坏链/archive 泄漏/truth 标记,仅此三项)。`);
process.exit(STRICT ? 1 : 0);

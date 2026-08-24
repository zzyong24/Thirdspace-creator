#!/usr/bin/env node
// docs-health.mjs — docs/ 知识文档健康检查。**此检查故意窄**:
//   1. 相对链接坏链(markdown 链接指向的本地文件不存在)
//   2. canonical 文档引用 archive/ 路径(历史泄漏进当前真值——canonical 禁引 archive 当依据)
//   3. 首行缺 truth 标记(<!-- truth: canonical|derived|evidence|archive -->)
//   4. INDEX 账实核对(2026-07-15 实证入册:某 specs/INDEX.md 写"50 份"实存 84 个文件、缺十几条):
//      INDEX.md 同目录的 .md 文件必须在 INDEX 里有链接条目(只查同目录一层,不查子树——
//      收据/子目录文档不要求逐条列,防噪音)
//   5. INDEX 活计数禁令:INDEX.md 里手写「N 份/N 篇」计数必过期——要么脚本生成要么不写数
//   6. 根目录卫生:模块/切片/专题 SPEC 与执行计划不得堆在项目根,必须进入 docs/ 对应分区
//
// **不做** Diataxis 分类强制、不做 C4 图强制、不做 ADR 格式强制——那些是文档学理想,
// 不是这个知识层要解的病;检查面越宽误报越多,门就会被人绕过。窄而准 > 宽而吵。
// (4/5 仍是机械账实核对,不是文档学——清单的机械事实可从文件系统推导,手维护必漂移。)
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
const projectRoot = path.resolve(ROOT, cfg.project_root ?? ".");

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

// 6) 根目录只留总纲/全局控制面。模块、切片、平台专题和执行计划进入 docs/；
// review sidecar 跟随被审文档相邻，因此也自然留在对应模块目录。
const configuredRootAllowlist = new Set(cfg.root_markdown_allowlist ?? [
  "PRODUCT_SPEC.md",
  "PRODUCT_VOCABULARY.md",
  "BACKLOG.md",
  "AGENTS.md",
  "PROJECT_CONTEXT.md",
  "PAGE_SPEC.md",
]);
// SPEC 例外不可由项目配置自行扩张，否则把 CRM_DOMAIN_SPEC 加进 allowlist 就能洗绿。
const rootSpecAllowlist = new Set(["PRODUCT_SPEC.md", "PAGE_SPEC.md"]);
for (const configuredName of configuredRootAllowlist) {
  const base = configuredName.replace(/\.review\.md$/i, ".md");
  if ((/_SPEC\.md$/i.test(base) && !rootSpecAllowlist.has(base)) || /^IMPLEMENTATION_PLAN(?:[._-].*)?\.md$/i.test(base)) {
    issues.push({ file: path.relative(ROOT, CFG_PATH).split(path.sep).join("/"), kind: "非法豁免", detail: `${configuredName} 不能通过 root_markdown_allowlist 留在根目录` });
  }
}
let rootEntries = [];
try { rootEntries = fs.readdirSync(projectRoot, { withFileTypes: true }); } catch { rootEntries = []; }
for (const entry of rootEntries) {
  if (!entry.isFile() || !/\.md$/i.test(entry.name)) continue;
  const base = entry.name.replace(/\.review\.md$/i, ".md");
  const looksLikeSplitSpec = /_SPEC\.md$/i.test(base) && !rootSpecAllowlist.has(base);
  const looksLikeExecutionPlan = /^IMPLEMENTATION_PLAN(?:[._-].*)?\.md$/i.test(base);
  if (looksLikeSplitSpec || looksLikeExecutionPlan) {
    issues.push({
      file: path.relative(ROOT, path.join(projectRoot, entry.name)).split(path.sep).join("/"),
      kind: "根目录拥挤",
      detail: "模块/专题文档应放 docs/features/<module>/；跨模块流程放 docs/journeys/，平台能力放 docs/platform/",
    });
  }
}

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

// 4/5) INDEX 账实核对 + 活计数禁令(只对名为 INDEX.md 的文件,面窄)
const COUNT_RE = /\d+\s*\*{0,2}\s*(份|篇)/;
for (const abs of files) {
  if (path.basename(abs) !== "INDEX.md") continue;
  const rel = path.relative(ROOT, abs).split(path.sep).join("/");
  const src = fs.readFileSync(abs, "utf8");

  // 5) 活计数:手写「N 份/N 篇」必过期
  const cm = COUNT_RE.exec(src);
  if (cm)
    issues.push({ file: rel, kind: "活计数", detail: `含手写计数「${cm[0].trim()}」——必过期(实证:写 50 份实存 84);删数字或改脚本生成` });

  // 4) 同目录账实核对:同层 .md(除 INDEX 自身)必须被 INDEX 链接到
  const dir = path.dirname(abs);
  const linked = new Set();
  let lm;
  LINK_RE.lastIndex = 0;
  while ((lm = LINK_RE.exec(src))) {
    let t = lm[1];
    if (/^[a-z][a-z0-9+.-]*:/i.test(t) || t.startsWith("#")) continue;
    t = t.split("#")[0];
    if (!t) continue;
    linked.add(path.resolve(dir, t));
  }
  let sibs;
  try { sibs = fs.readdirSync(dir, { withFileTypes: true }); } catch { sibs = []; }
  for (const s of sibs) {
    if (!s.isFile() || !s.name.endsWith(".md") || s.name === "INDEX.md") continue;
    const sAbs = path.join(dir, s.name);
    if (!linked.has(sAbs))
      issues.push({ file: rel, kind: "索引漏登", detail: `同目录 ${s.name} 不在索引里(账实不符;新文件落地当轮就该登记)` });
  }
}

if (issues.length === 0) {
  if (!QUIET) console.log(`✓ docs-health:${files.length} 个文档,链接、真值标记、INDEX 与根目录布局均健康。`);
  process.exit(0);
}

console.log(`docs-health — ${files.length} 个文档,发现 ${issues.length} 处问题:`);
for (const it of issues) console.log(`  ✗ [${it.kind}] ${it.file} — ${it.detail}`);
console.log(`\n⚠ ${STRICT ? "--strict,exit 1" : "WARN-biased,不阻塞;SHIP/CI 用 --strict"}(检查范围:坏链/archive 泄漏/truth 标记/INDEX 账实/活计数/根目录布局)。`);
process.exit(STRICT ? 1 : 0);

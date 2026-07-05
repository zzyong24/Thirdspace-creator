#!/usr/bin/env node
// boundary-scan.mjs — 门卫脚本 (LED-002). 物理架构边界守卫,ratchet(棘轮)模式。
//
// 读 boundaries.config.json 的规则,扫描违规,和 boundary-baseline.json 对比:
//   • 新违规(不在 baseline) → exit 1,拦住结构回归(脚手架犯的"低级错误"从此挡住)
//   • 已修(在 baseline 但已消失) → 提示 ratchet down(从 baseline 移除)
//   • 当前违规 ⊆ baseline → exit 0,放行,报剩余数(随重构逐条清零)
//
// 用法:
//   node boundary-scan.mjs                 # 检查(CI / reconcile 用)
//   node boundary-scan.mjs --quiet         # 只在失败时输出
//   node boundary-scan.mjs --update-baseline# 把当前违规写成新基线(重构消减后调用)
//
// 零依赖(纯 node:fs)。

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, "..", "..");
const CFG = path.join(HERE, "boundaries.config.json");
const BASELINE = path.join(HERE, "boundary-baseline.json");

const args = new Set(process.argv.slice(2));
const QUIET = args.has("--quiet");
const UPDATE = args.has("--update-baseline");

const cfg = JSON.parse(fs.readFileSync(CFG, "utf8"));
const IGNORE = new Set(cfg.ignoreDirs ?? []);

function walk(absDir, exts, out) {
  let entries;
  try {
    entries = fs.readdirSync(absDir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const e of entries) {
    if (e.name.startsWith(".") && e.name !== ".") {
      if (IGNORE.has(e.name)) continue;
    }
    if (IGNORE.has(e.name)) continue;
    const abs = path.join(absDir, e.name);
    if (e.isDirectory()) walk(abs, exts, out);
    else if (exts.some((x) => e.name.endsWith(x))) out.push(abs);
  }
  return out;
}

function rel(abs) {
  return path.relative(REPO, abs).split(path.sep).join("/");
}

// 抽出一个文件 import 的所有 specifier。
function importsOf(abs) {
  let src = "";
  try {
    src = fs.readFileSync(abs, "utf8");
  } catch {
    return [];
  }
  const specs = [];
  const re =
    /(?:import|export)[\s\S]*?from\s*['"]([^'"]+)['"]|import\(\s*['"]([^'"]+)['"]\s*\)|require\(\s*['"]([^'"]+)['"]\s*\)/g;
  let m;
  while ((m = re.exec(src))) specs.push(m[1] ?? m[2] ?? m[3]);
  return specs;
}

// 一个 modules 路径里的模块名:.../modules/<name>/...
function moduleOf(p) {
  const m = /\/modules\/([^/]+)\//.exec("/" + p);
  return m ? m[1] : null;
}

// specifier 匹配 —— **不用裸 includes**(会把 "ai" 误伤成 "@/types/domain"、"asset-detail"、
// "@/components/ai/*" 等含子串的本地路径,门卫沦为噪音)。分三态:
//   • 以 "/" 结尾 = 包 scope 前缀规则(如 "@ai-sdk/") → startsWith
//   • 以 "." 或 "/" 开头 = 路径后缀规则(如 ".repository"/"/repository",R3 用) → endsWith
//   • 否则 = 精确包名(如 "ai"/"@anthropic-ai/claude-agent-sdk") → 精确相等或其子路径 pkg/xxx
function specMatches(spec, patterns) {
  for (const s of patterns) {
    if (s.endsWith("/")) {
      if (spec.startsWith(s)) return true;
    } else if (s.startsWith(".") || s.startsWith("/")) {
      if (spec.endsWith(s)) return true;
    } else if (spec === s || spec.startsWith(s + "/")) {
      return true;
    }
  }
  return false;
}

const violations = [];

for (const rule of cfg.rules ?? []) {
  const exts = rule.ext ?? [".ts", ".tsx"];
  if (rule.type === "forbidden-paths") {
    for (const d of rule.dirs ?? []) {
      const abs = path.join(REPO, d);
      const files = walk(abs, exts, []);
      for (const f of files) violations.push(`${rule.id}::${rel(f)}`);
    }
  } else if (rule.type === "forbidden-import") {
    const files = [];
    for (const d of rule.scopeDirs ?? [])
      walk(path.join(REPO, d), exts, files);
    for (const f of files) {
      const r = rel(f);
      const ownMod = moduleOf(r);
      for (const spec of importsOf(f)) {
        const hit = specMatches(spec, rule.specifiers ?? []);
        if (!hit) continue;
        if (rule.allowSameModule) {
          if (spec.startsWith("./")) continue; // 同目录 = 同模块,放行
          const targetMod = moduleOf(spec) ?? moduleOf("/modules/" + spec + "/");
          if (ownMod && targetMod && ownMod === targetMod) continue;
        }
        violations.push(`${rule.id}::${r}::${spec}`);
      }
    }
  }
}

const current = [...new Set(violations)].sort();

if (UPDATE) {
  fs.writeFileSync(
    BASELINE,
    JSON.stringify({ count: current.length, violations: current }, null, 2) + "\n",
  );
  console.log(`✓ boundary baseline 写入 ${current.length} 条当前违规 → ${rel(BASELINE)}`);
  process.exit(0);
}

let baseline = [];
try {
  baseline = JSON.parse(fs.readFileSync(BASELINE, "utf8")).violations ?? [];
} catch {
  baseline = [];
}
const baseSet = new Set(baseline);
const curSet = new Set(current);
const added = current.filter((v) => !baseSet.has(v)); // 新违规(回归)→ fail
const fixed = baseline.filter((v) => !curSet.has(v)); // 已修 → ratchet down

// 按规则统计剩余
const byRule = {};
for (const v of current) {
  const id = v.split("::")[0];
  byRule[id] = (byRule[id] ?? 0) + 1;
}

const pass = added.length === 0;
if (!QUIET || !pass) {
  console.log(`\n门卫 boundary-scan — 剩余违规 ${current.length} 条(基线 ${baseline.length}):`);
  for (const rule of cfg.rules ?? [])
    console.log(`  ${byRule[rule.id] ?? 0}\t${rule.id}  ${rule.desc}`);
  if (fixed.length)
    console.log(`\n  ↓ 已修 ${fixed.length} 条 —— 跑 \`node boundary-scan.mjs --update-baseline\` 收紧基线。`);
}
if (!pass) {
  console.error(`\n✗ 发现 ${added.length} 条【新】违规(结构回归,被拦住):`);
  for (const v of added.slice(0, 30)) console.error(`   + ${v}`);
  if (added.length > 30) console.error(`   …还有 ${added.length - 30} 条`);
  console.error(`\n物理架构规则见 orchestrator/SYSTEM_ARCHITECTURE.md。`);
  process.exit(1);
}
if (!QUIET) console.log(`\n✓ 无新增违规(剩余 ${current.length} 条在基线内,随重构消减)。`);
process.exit(0);

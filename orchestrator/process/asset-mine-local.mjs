#!/usr/bin/env node
// process/asset-mine-local.mjs — B 源:本地仓扫描,找跨独立 repo 复用的工程手法 → candidate。
// 走 CodeGraph(每仓 .codegraph/codegraph.db)做代码级检索,不 grep 全仓。own/fork/clone 按 git
// origin owner 分类 + junk-ignore;跨独立 repo reuseFreq≥阈值 才落 candidate。
// opportunistic 增量(periodic 全扫默认关,防 candidate 池变坟场)。calibration-mode ON 时阈值
// 动作只 print 不落盘。--dry-run 只报不落盘。B 源是辅助:CodeGraph 不可达只 WARN 跳过,不硬失败。
//
//   node process/asset-mine-local.mjs --dry-run --root ~/Workbase
//
// Exit 0 = 正常(含 CG 不可达的优雅降级)。

import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { homedir } from 'node:os';

const HERE = dirname(fileURLToPath(import.meta.url));
const CONFIG = resolve(HERE, 'asset-mine-local.config.json');

const DEFAULTS = {
  own_owners: ['zzyong24', 'moonlitclear'],
  junk_ignore: ['Foreign-trade', 'SZYMR', '*_base', 'claude-code-*', 'github'],
  codegraph_endpoint: 'http://localhost:0/mcp',
  reuse_freq_threshold: 2,
  scan_roots: ['~/Workbase'],
  candidates_dir: 'decisions/assets/_candidates',
  mode: 'opportunistic',
};
let cfg = { ...DEFAULTS };
if (existsSync(CONFIG)) { try { cfg = { ...cfg, ...JSON.parse(readFileSync(CONFIG, 'utf8')) }; } catch { /* ignore */ } }

const argv = process.argv.slice(2);
const dryRun = argv.includes('--dry-run');
const rootIdx = argv.indexOf('--root');
const rootOverride = rootIdx !== -1 ? argv[rootIdx + 1] : null;

const expand = (p) => (p.startsWith('~') ? join(homedir(), p.slice(1)) : p);

// calibration-mode（从 reconcile.config.json 读,默认 ON）—— 校准期阈值动作只 print 不落盘(§4.8)。
let calibrationOn = true;
const RC = resolve(HERE, 'reconcile.config.json');
if (existsSync(RC)) { try { if (JSON.parse(readFileSync(RC, 'utf8')).calibration_mode === false) calibrationOn = false; } catch { /* keep ON */ } }

const globMatch = (name, pat) => new RegExp('^' + pat.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*') + '$').test(name);
const isJunk = (name) => cfg.junk_ignore.some((p) => globMatch(name, p));

const ownerOf = (repoDir) => {
  const r = spawnSync('git', ['-C', repoDir, 'remote', 'get-url', 'origin'], { encoding: 'utf8' });
  if (r.status !== 0) return null;
  const m = (r.stdout || '').trim().match(/[:/]([^/]+)\/[^/]+?(?:\.git)?$/);
  return m ? m[1] : null;
};

// 对 own+indexed 仓做一次真 CodeGraph 调用(status -j 拿 nodeCount,证明检索 substrate 就绪)。
// codegraph CLI 缺失/不可达 → 返回 null,调用方 WARN 跳过、不硬失败。
const cgNodeCount = (repoDir) => {
  const r = spawnSync('codegraph', ['status', '-j'], { cwd: repoDir, encoding: 'utf8' });
  if (r.error || r.status !== 0) return null;
  try { return JSON.parse(r.stdout).nodeCount ?? null; } catch { return null; }
};

const roots = (rootOverride ? [rootOverride] : cfg.scan_roots).map(expand);
let scanned = 0, own = 0, junkSkipped = 0, cloneFork = 0, candidates = 0, cgUnreachable = 0;
const eligible = [];

for (const root of roots) {
  if (!existsSync(root)) { console.log(`! root not found: ${root}`); continue; }
  for (const name of readdirSync(root).sort()) {
    const d = join(root, name);
    let isDir = false; try { isDir = statSync(d).isDirectory(); } catch { /* skip */ }
    if (!isDir) continue;
    if (isJunk(name)) { junkSkipped++; console.log(`skip (junk): ${name}`); continue; }
    if (!existsSync(join(d, '.git'))) { console.log(`skip (non-git): ${name}`); continue; }
    scanned++;
    const owner = ownerOf(d);
    if (owner && cfg.own_owners.includes(owner)) {
      own++;
      if (!existsSync(join(d, '.codegraph', 'codegraph.db'))) { console.log(`  own (no .codegraph): ${name}`); continue; }
      const nodes = cgNodeCount(d);
      if (nodes == null) { cgUnreachable++; console.log(`! own (CodeGraph 不可达,WARN 跳过): ${name}`); continue; }
      eligible.push({ repo: name, dir: d, nodes });
      console.log(`  own (CodeGraph ${nodes} nodes): ${name}`);
    } else {
      cloneFork++;
      console.log(`  clone/fork (owner=${owner ?? '?'}) → route to C/asset-distill: ${name}`);
    }
  }
}

// 候选 emit:跨独立 repo content-hash 聚类 reuseFreq≥阈值 才落盘。MVP + calibration 节制:
// dry-run 或 calibration ON 只报不落盘(真正的跨仓聚类在攒够样本、校准后启用)。
if (eligible.length) {
  console.log(`\n  own+indexed eligible for cross-repo clustering: ${eligible.map((e) => e.repo).join(', ')}`);
  if (dryRun) console.log('  [dry-run] 不落盘');
  else if (calibrationOn) console.log(`  [calibration] would cluster by content-hash & emit candidates (reuseFreq≥${cfg.reuse_freq_threshold}) — 校准期只报不落盘`);
  // 非 dry-run 且 calibration OFF 时,此处启用真聚类落盘(攒够跨项目样本后);见 Plan ④ calibration flip。
}

console.log('\n── asset-mine-local ──');
console.log(`scanned ${scanned} repos, own ${own}, junk-skipped ${junkSkipped}, clone/fork ${cloneFork}, CG-unreachable ${cgUnreachable}, candidates emitted ${candidates}`);
process.exit(0);

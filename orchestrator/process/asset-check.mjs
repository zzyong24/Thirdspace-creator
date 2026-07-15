#!/usr/bin/env node
// process/asset-check.mjs — executable gate for the reusable asset library (decisions/assets).
// orphan-scan.mjs 同构:COMPUTES verdicts over frontmatter + ASSET_INDEX 而非信任自填 flag。
// 门:(1) module 卡必填字段;(2) ASSET_INDEX ↔ 卡一致(drift=ERROR);(3) candidate≠active +
// active⇒verified;(4) license fail-closed(copyleft BLOCK,active/module 的未知 license BLOCK);
// (5) active module 的 example 必须存在且落在 example/(verified 的可执行支柱)。
// 末尾 WARN-only 折叠 assets-runner(example 红不阻断主流程,符合 WARN-not-ERROR)。
//
// Exit 0=clean, 1=violation. Per-skill config: process/asset-check.config.json(覆盖 DEFAULTS)。

import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const HERE = dirname(fileURLToPath(import.meta.url));
const ORCH = resolve(HERE, '..');   // skill root
const REPO = resolve(ORCH, '..');
const CONFIG = resolve(HERE, 'asset-check.config.json');

const DEFAULTS = {
  assets_dir: 'decisions/assets',
  patterns_dir: 'decisions/patterns',
  index_file: 'ASSET_INDEX.md',
  required_module_fields: ['id','kind','title','problem_tag','when_to_use','when_not_to_use','keywords','status','license','files','example'],
  required_provenance_fields_for_BC: ['source','origin_commit','content_hash'],
  valid_status: ['candidate','active','deprecated','retracted','quarantined'],
  copyleft_block_spdx: ['GPL-2.0','GPL-3.0','AGPL-3.0','LGPL-3.0','GPL-2.0-only','GPL-3.0-only','AGPL-3.0-only'],
  license_unknown_tokens: ['待核','UNKNOWN','TBD',''],
};
let cfg = { ...DEFAULTS };
if (existsSync(CONFIG)) { try { cfg = { ...cfg, ...JSON.parse(readFileSync(CONFIG, 'utf8')) }; } catch { /* ignore */ } }

const ASSETS = resolve(ORCH, cfg.assets_dir);
const PATTERNS = resolve(ORCH, cfg.patterns_dir);
const INDEX = resolve(ASSETS, cfg.index_file);

const findings = [];
const err  = (m) => findings.push({ level: 'ERROR', m });
const warn = (m) => findings.push({ level: 'WARN',  m });
const ok   = (m) => findings.push({ level: 'OK',    m });

function die(code) {
  const order = { ERROR: 0, WARN: 1, OK: 2 };
  findings.sort((a, b) => order[a.level] - order[b.level]);
  const icon = { ERROR: '✗', WARN: '!', OK: '✓' };
  console.log('\n── asset-check ──');
  for (const f of findings) console.log(`${icon[f.level]} [${f.level}] ${f.m}`);
  const errs = findings.filter(f => f.level === 'ERROR').length;
  console.log(`${errs} error(s).`);
  process.exit(code ?? (errs ? 1 : 0));
}

// frontmatter 解析:顶层 key: value + `provenance:` 一层嵌套。不上 YAML 库。
function scalar(v) {
  v = v.trim();
  if (v === 'null') return null;
  if (v === 'true') return true;
  if (v === 'false') return false;
  const list = v.match(/^\[(.*)\]$/);
  if (list) return list[1].split(',').map((s) => s.trim().replace(/^["']|["']$/g, '')).filter(Boolean);
  return v.replace(/^["']|["']$/g, '');
}
function parseFrontmatter(text) {
  const m = text.match(/^---\n([\s\S]*?)\n---/);
  if (!m) return null;
  const out = {};
  let nestKey = null;
  for (const raw of m[1].split('\n')) {
    if (!raw.trim() || raw.trim().startsWith('#')) continue;
    const nest = raw.match(/^  (\w[\w-]*):\s*(.*)$/);
    if (nestKey && nest) { out[nestKey][nest[1]] = scalar(nest[2]); continue; }
    const top = raw.match(/^(\w[\w-]*):\s*(.*)$/);
    if (!top) continue;
    const [, k, v] = top;
    if (v === '') { nestKey = k; out[k] = {}; continue; }
    nestKey = null;
    out[k] = scalar(v);
  }
  return out;
}

function collectCards(root, isCandidate, out, depth = 0) {
  if (!existsSync(root)) return;
  for (const e of readdirSync(root)) {
    const p = join(root, e);
    if (!statSync(p).isDirectory()) continue;
    const entry = join(p, 'ENTRY.md');
    if (existsSync(entry)) out.push({ dir: p, file: entry, isCandidate });
    if (depth < 4) collectCards(p, isCandidate, out, depth + 1);
  }
}

if (!existsSync(ASSETS)) { console.log('asset-check: assets dir not found, nothing to check'); die(0); }

const cards = [];
collectCards(join(ASSETS, 'modules'), false, cards);
collectCards(join(ASSETS, '_candidates'), true, cards);

const cardById = {};
for (const c of cards) {
  const fm = parseFrontmatter(readFileSync(c.file, 'utf8'));
  if (!fm) { err(`${c.file}: 无 frontmatter`); continue; }
  c.fm = fm;
  if (fm.id) cardById[fm.id] = c;

  // (1) module 必填字段 + B/C provenance
  if (fm.kind === 'module') {
    for (const f of cfg.required_module_fields) {
      const v = fm[f];
      if (v === undefined || v === '' || (Array.isArray(v) && v.length === 0)) err(`${fm.id || c.file} 缺必填字段 ${f}`);
    }
    const src = fm.provenance?.source;
    if (src === 'B' || src === 'C') {
      for (const pf of cfg.required_provenance_fields_for_BC) if (!fm.provenance?.[pf]) err(`${fm.id} provenance.${pf} 缺(B/C 源必填)`);
    }
  }
  if (fm.status && !cfg.valid_status.includes(fm.status)) err(`${fm.id} status 非法:${fm.status}`);

  // (3) candidate≠active + active⇒verified
  if (c.isCandidate && (fm.status === 'active' || fm.verified === true)) err(`${fm.id} 在 _candidates/ 却标 active/verified — 候选不得冒充已验证`);
  if (fm.status === 'active' && fm.verified !== true) err(`${fm.id} status=active 但 verified≠true — active 必须过 verified 门`);

  // (4) license fail-closed(仅 module)
  if (fm.kind === 'module') {
    const lic = (fm.license ?? '').toString();
    const licToken = lic.split(/[\s(（]/)[0];
    const isUnknown = cfg.license_unknown_tokens.includes(lic.trim()) || cfg.license_unknown_tokens.includes(licToken);
    const copy = cfg.copyleft_block_spdx.find((s) => lic.includes(s));
    if (copy) err(`${fm.id} license 含 strong-copyleft (${copy}) — BLOCK 进 module,只能记 pattern:methodology,需人工 DEC 豁免`);
    else if (isUnknown) {
      if (!c.isCandidate || fm.status === 'active') err(`${fm.id} license 未知/待核 — fail-closed,不得入库 active`);
      else warn(`${fm.id} license 待核(candidate 允许暂存)`);
    }
  }

  // (5) active module 的 example 必须存在且在 example/
  if (fm.kind === 'module' && fm.status === 'active') {
    const ex = Array.isArray(fm.example) ? fm.example[0] : fm.example;
    if (ex) {
      const exPath = resolve(c.dir, ex);
      if (!existsSync(exPath)) err(`${fm.id} example 指向不存在的文件 ${ex}`);
      else if (!exPath.includes(join(c.dir, 'example'))) warn(`${fm.id} example 不在 example/ 子目录 — 可执行性存疑`);
    }
  }
}

// (6) winner WARN:同 problem_tag ≥2 active 但无人标 winner(§3.6 消歧提示,WARN 不 ERROR)
const byTag = {};
for (const c of cards) {
  if (c.isCandidate || c.fm?.status !== 'active' || c.fm?.kind !== 'module') continue;
  const tags = Array.isArray(c.fm.problem_tag) ? c.fm.problem_tag : [c.fm.problem_tag].filter(Boolean);
  for (const t of tags) (byTag[t] = byTag[t] || []).push(c.fm);
}
for (const [t, list] of Object.entries(byTag)) {
  if (list.length >= 2 && !list.some((fm) => fm.winner === true)) warn(`${t} 有 ${list.length} 个 active 资产但无 winner — 补 winner+preference_rule 消歧`);
}

// (2) ASSET_INDEX ↔ 卡一致(id 列是 markdown 链接,先剥裸 id;按前缀分流 MOD/PAT)
const stripLink = (cell) => (cell.match(/\[([A-Z]+-\d+)\]/) || [])[1] ?? cell.trim();
function parsePipeTable(text) {
  const rows = [];
  for (const line of text.split('\n')) {
    if (!/^\s*\|/.test(line)) continue;
    const cells = line.split('|').slice(1, -1).map((c) => c.trim());
    if (cells.every((c) => /^-+$/.test(c))) continue;
    rows.push(cells);
  }
  return rows;
}
if (existsSync(INDEX)) {
  const rows = parsePipeTable(readFileSync(INDEX, 'utf8'));
  const dataRows = rows.filter((r) => /^[A-Z]+-\d+/.test(stripLink(r[0] || '')));
  const indexIds = new Set(dataRows.map((r) => stripLink(r[0])));
  for (const r of dataRows) {
    const id = stripLink(r[0]);
    const idxStatus = r[4];
    if (id.startsWith('PAT-')) {
      const found = existsSync(PATTERNS) && readdirSync(PATTERNS).some((f) => f.startsWith(id + '-') && f.endsWith('.md'));
      if (!found) err(`${id} 在 ASSET_INDEX 但 patterns/ 找不到对应卡`);
      continue; // pattern 卡不在 frontmatter 同构体系,跳过 status 漂移
    }
    const card = cardById[id];
    if (!card) { err(`${id} 在 ASSET_INDEX 但 modules/ 找不到对应卡`); continue; }
    if (card.fm.status && idxStatus && card.fm.status !== idxStatus) err(`${id} status 漂移:INDEX=${idxStatus} 卡=${card.fm.status}`);
  }
  for (const c of cards) {
    if (!c.isCandidate && c.fm?.kind === 'module' && c.fm?.status === 'active' && !indexIds.has(c.fm.id)) err(`${c.fm.id} 卡为 active 但 ASSET_INDEX 缺登记 — 发现不了的资产`);
  }
} else {
  warn('ASSET_INDEX.md 不存在 — 跳过一致性门');
}

// (5b) WARN-only 折叠 assets-runner(example 红不阻断主流程)
const RUNNER = resolve(HERE, 'assets-runner.mjs');
if (existsSync(RUNNER)) {
  const r = spawnSync('node', [RUNNER], { cwd: REPO, stdio: 'ignore' });
  if (r.status && r.status !== 0) warn('assets-runner 报告有 example 未跑绿 — 见 node process/assets-runner.mjs');
}

if (!findings.some((f) => f.level === 'ERROR')) ok('asset-check: 资产库一致(必填/INDEX/candidate/license/example 全过)');
die();

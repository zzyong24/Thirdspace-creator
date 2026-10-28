#!/usr/bin/env node
// 仅生成证据目录内的预览；无 apply 模式。每次读取当前看板，保留后来新增的任务。
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = fs.realpathSync(path.resolve(here, '../../..'));
const argv = process.argv.slice(2);
assert(argv.length === 0 || (argv.length === 2 && argv[0] === '--out'), '仅支持 --out <全新预览目录>');
const out = path.resolve(argv[1] ?? path.join(here, `backlog-preview-${Date.now()}`));
assert(out.startsWith(`${here}${path.sep}`) && out !== here, '输出必须在 docs/verification/t1410 的新子目录');
assert(!fs.existsSync(out), '不覆盖已有证据，请使用新的输出目录');
let parent = path.dirname(out);
while (!fs.existsSync(parent)) parent = path.dirname(parent);
const realParent = fs.realpathSync(parent);
assert(realParent === here || realParent.startsWith(`${here}${path.sep}`), '不允许通过符号链接写出证据目录');
const sha = value => crypto.createHash('sha256').update(value).digest('hex');
const names = ['BACKLOG.md', 'BACKLOG-details.md', 'BACKLOG-archive.md'];
const originals = Object.fromEntries(names.map(name => [name, fs.readFileSync(path.join(root, name), 'utf8')]));
const source = originals['BACKLOG.md'];
const rowsOf = text => text.split('\n').filter(line => /^\|\s*T-/.test(line)).map(line => {
  const cells = line.split('|').slice(1, -1).map(cell => cell.trim());
  assert([5, 7].includes(cells.length), `未知表结构，停止而非猜测：${cells[0]}`);
  return { line, cells, id: cells[0] };
});
const rows = rowsOf(source);
assert.equal(new Set(rows.map(row => row.id)).size, rows.length, '活动看板当前ID必须唯一');
const targets = text => [...text.matchAll(/\[[^\]\n]*\]\(([^)\n]*)\)/g)].map(match => match[1]);
const shortenLabels = text => text.replace(/\[[^\]\n]*\]\(([^)\n]*)\)/g, (_match, href) => `[SPEC](${href})`);
const allowed = {
  'T-1425': { spec: 'docs/features/t1425-tab-navigation-performance-fixes.md', evidence: 'docs/verification/t1425/FRONTEND_VALIDATION.md' },
  'T-1396': { spec: 'docs/features/t1396-local-recovery-backup-cleanup.md', evidence: 'docs/features/t1396-local-recovery-backup-cleanup.md' },
  'T-1395': { spec: 'docs/features/t1395-local-package-startup-recovery.md', evidence: 'docs/verification/t1395/RESULT.md' },
  'T-1394': { spec: 'docs/features/t1394-local-startup-diagnosis.md', evidence: 'docs/research/t1394-local-startup-diagnosis.md' },
  'T-1386': { spec: 'docs/features/t1386-quality-main-integration.md', evidence: 'docs/features/t1386-quality-main-integration.md' },
  'T-1379': { spec: 'docs/features/t1379-collaborator-local-mac-package-guidance.md', evidence: 'docs/features/t1379-collaborator-local-mac-package-guidance.md' },
};
const events = fs.readFileSync(path.join(root, 'orchestrator/events.ndjson'), 'utf8').split('\n').filter(Boolean).map(JSON.parse);
const archived = [];
const archiveProof = [];
for (const row of rows) {
  const binding = allowed[row.id];
  if (!binding) continue;
  // 精确绑定当前行的身份和完成事实；新增/重开的同号行不能自动迁走。
  if (row.cells.length !== 7 || row.cells[2] !== '✅' || !targets(row.cells[5]).includes(binding.spec)) continue;
  const matching = events.filter(event => event.task === row.id && event.action === 'complete' && (
    row.id !== 'T-1379' || event.evidence?.includes(binding.spec)
  ));
  assert(matching.length > 0, `${row.id} 缺真实完成事件`);
  const event = matching.at(-1);
  const evidenceText = fs.readFileSync(path.join(root, binding.evidence), 'utf8');
  if (row.id === 'T-1425') assert.equal(sha(evidenceText).slice(0, 12), event.report_sha, 'T1425验收报告绑定必须匹配');
  archived.push(row);
  archiveProof.push({ id: row.id, ...binding, evidenceSha256: sha(evidenceText), originalRowSha256: sha(row.line), completeEvent: event,
    identityBoundary: row.id === 'T-1379' ? '只归档当前协作者Mac说明；同号UI任务后续block原事件不改、不作已完成证明。' : '仅搬运原完成行；不是重新验收产品。' });
}
const gone = new Set(archived.map(row => row.id));
const moved = [];
const outputLines = source.split('\n').flatMap(line => {
  if (!/^\|\s*T-/.test(line)) return [line];
  const row = rowsOf(line)[0];
  if (gone.has(row.id)) return [];
  if (row.cells.length === 5) return [line]; // 暂停表逐字保留；不重写任何字段。
  const cells = [...row.cells];
  const doc = shortenLabels(cells[5]);
  assert.deepEqual(targets(cells[5]), targets(doc), `${row.id} 文档href守恒`);
  if (cells[6] === '[D]' && doc === cells[5]) return [line];
  moved.push(row);
  cells[5] = doc;
  cells[6] = '[D]'; // 任务列保持现有完整任务名，原说明逐字在详情。
  return [`|${cells.join('|')}|`];
});
let backlog = outputLines.join('\n');
if (!/^\[D\]:/m.test(backlog)) backlog = `${backlog.trimEnd()}\n\n[D]: BACKLOG-details.md\n`;
else assert(/^\[D\]: BACKLOG-details\.md\s*$/m.test(backlog), '已有D引用不兼容，不覆盖');
const detailBlocks = moved.map(row => `\n<a id="t1410-${row.id.toLowerCase()}-${sha(row.line).slice(0, 12)}"></a>\n### ${row.id} · ${row.cells[1]}\n\n原始七列行（说明与文档链接逐字保留）：\n\n${row.line}\n`).join('');
const details = originals['BACKLOG-details.md'] + (detailBlocks ? `\n## T-1410 机械外置原文\n\n> 主看板 [D] 指向本文件；按任务ID检索。本区是原文快照，不取代主看板的实时状态。\n${detailBlocks}` : '');

// 复用现有归档器，但其 --all 只接收六项精确白名单，不接触完整活动看板。
fs.mkdirSync(out, { recursive: true });
fs.mkdirSync(path.join(out, 'before'));
for (const name of names) fs.writeFileSync(path.join(out, 'before', name), originals[name]);
fs.writeFileSync(path.join(out, 'BACKLOG-archive.md'), originals['BACKLOG-archive.md']);
fs.writeFileSync(path.join(out, 'BACKLOG.md'), `# 六项已核完成行的隔离归档输入\n\n|ID|任务|状态|审核|验收|文档|一句话|\n|---|---|---|---|---|---|---|\n${archived.map(row => row.line).join('\n')}\n`);
const compact = spawnSync(process.execPath, [path.join(root, 'orchestrator/process/backlog-compact.mjs'), path.join(out, 'BACKLOG.md'), '--all'], { cwd: root, encoding: 'utf8' });
fs.writeFileSync(path.join(out, 'backlog-compact.log'), `${compact.stdout ?? ''}${compact.stderr ?? ''}`);
assert.equal(compact.status, 0, '原有归档器必须成功');
const archive = fs.readFileSync(path.join(out, 'BACKLOG-archive.md'), 'utf8');
assert(archive.startsWith(originals['BACKLOG-archive.md']), '旧归档逐字保留');
for (const row of archived) assert(archive.slice(originals['BACKLOG-archive.md'].length).includes(row.line), `${row.id} 原行完整归档`);
fs.writeFileSync(path.join(out, 'BACKLOG.md'), backlog);
fs.writeFileSync(path.join(out, 'BACKLOG-details.md'), details);

const afterRows = rowsOf(backlog);
const afterById = new Map(afterRows.map(row => [row.id, row]));
assert.deepEqual(afterRows.map(row => row.id), rows.filter(row => !gone.has(row.id)).map(row => row.id), '未完成及其余行ID、顺序完整保留');
for (const row of rows.filter(row => !gone.has(row.id))) {
  const after = afterById.get(row.id);
  if (row.cells.length === 5) assert.equal(after.line, row.line, `${row.id} 暂停行逐字不变`);
  else {
    assert.deepEqual(after.cells.slice(0, 5), row.cells.slice(0, 5), `${row.id} ID/任务/状态/审核/验收不变`);
    assert.deepEqual(targets(after.cells[5]), targets(row.cells[5]), `${row.id} 文档链接目标不变`);
    assert(details.includes(row.line) || after.line === row.line, `${row.id} 原描述/原行可逐字恢复`);
  }
}
const originalTargets = new Set(targets(source));
const finalTargets = new Set(targets(backlog + '\n' + details + '\n' + archive));
assert([...originalTargets].every(target => finalTargets.has(target)), '全部原始Markdown链接目标仍可达');
for (const id of ['T-1259', 'T-1258', 'T-1257']) {
  const before = rows.find(row => row.id === id);
  if (before) assert.equal(afterById.get(id)?.cells[2], before.cells[2], `${id} 矛盾状态不改、不归档`);
}
assert(details.startsWith(originals['BACKLOG-details.md']), '旧详情逐字保留');
const health = spawnSync(process.execPath, [path.join(root, 'orchestrator/process/backlog-health.mjs'), path.join(out, 'BACKLOG.md'), '--json'], { cwd: root, encoding: 'utf8' });
fs.writeFileSync(path.join(out, 'health.json'), health.stdout);
assert([0, 1, 2].includes(health.status), '健康检查正常退出');
const healthJson = JSON.parse(health.stdout);
// 仅本次读取到生成结束间的并发检查；不把此hash冻结成下次执行的准入门。
for (const name of names) assert.equal(fs.readFileSync(path.join(root, name), 'utf8'), originals[name], `${name} 生成期间已变，请重新生成；绝不回写旧快照`);
const report = {
  schema: 't1410-backlog-compaction-preview/v1', generatedAt: new Date().toISOString(), root, out,
  sourceCommit: spawnSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).stdout.trim(),
  mode: 'preview-only', realControlFilesWritten: false,
  sourceSnapshots: names.map(name => ({ path: name, bytes: Buffer.byteLength(originals[name]), sha256: sha(originals[name]) })),
  originalRows: rows.length, originalSevenColumnRows: rows.filter(row => row.cells.length === 7).length,
  pausedRowsPreservedVerbatim: rows.filter(row => row.cells.length === 5).length,
  previewRows: afterRows.length, archivedCount: archived.length, archiveProof,
  externalizedRows: moved.length, bytesBefore: Buffer.byteLength(source), bytesAfter: Buffer.byteLength(backlog),
  assertions: { nonArchivedIdsAndOrder: true, taskNamesUnchanged: true, stateReviewAcceptanceUnchanged: true, pausedRawLinesUnchanged: true,
    docHrefSequenceUnchangedPerTask: true, originalLinksPreservedAcrossFiles: true, originalRowsAndDescriptionsPreservedVerbatim: true,
    archiveAndDetailsOldPrefixUnchanged: true, contradictoryDoneRowsPreserved: true, liveSourceUnchangedDuringRun: true },
  health: { exitCode: health.status, errors: healthJson.errors, warnings: healthJson.warnings, summary: healthJson.summary,
    runawayRemoved: Buffer.byteLength(backlog) <= 60 * 1024, below30KiB: Buffer.byteLength(backlog) <= 30 * 1024 },
  limits: ['此预览不是主控制面修改，也不是产品重新验收。', '每次运行实时读取所有行；新行不会因硬编码总hash被拒绝。应用前须停止并发写并重新生成，不复制旧预览覆盖新任务。', '不更正旧状态矛盾和历史撞号；health仍有历史警告/体积硬限时如实保留。'],
};
fs.writeFileSync(path.join(out, 'conservation.json'), `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify({ out, bytesBefore: report.bytesBefore, bytesAfter: report.bytesAfter, archived: archived.map(row => row.id), assertions: report.assertions, health: report.health }, null, 2));

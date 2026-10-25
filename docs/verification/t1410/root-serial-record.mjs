#!/usr/bin/env node
// 默认只读。仅根会话审阅计划后显式 --apply 才写 DEC 并调用既有 reviewctl。
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash, randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { readBacklog, verifyReviewReceipt } from '../../../orchestrator/process/reviewctl.mjs';
import { acquireStateLock } from '../../../orchestrator/process/state-lock.mjs';

const dir = path.dirname(fileURLToPath(import.meta.url));
const root = fs.realpathSync(path.resolve(dir, '../../..'));
const planPath = path.join(dir, 'root-serial-record.plan.json');
const planBytes = fs.readFileSync(planPath);
const plan = JSON.parse(planBytes);
const sha = (bytes) => createHash('sha256').update(bytes).digest('hex');
const planSha = sha(planBytes);
const runDir = path.join(dir, 'serial-record-execution', plan.plan_id);
const mode = process.argv[2] ?? '--check';
const assert = (ok, message) => { if (!ok) throw new Error(message); };
assert(['--check', '--apply'].includes(mode) && process.argv.length <= 3, '仅支持 --check 或 --apply');
assert(plan.schema === 't1410-serial-review-record-plan/v1', '计划 schema 不符');
const inside = (rel) => {
  const p = path.resolve(root, rel);
  assert(p.startsWith(root + path.sep), `路径越界：${rel}`);
  if (fs.existsSync(p)) assert(fs.realpathSync(p).startsWith(root + path.sep), `真实路径越界：${rel}`);
  return p;
};
const read = (rel) => fs.readFileSync(inside(rel), 'utf8');
const json = (rel) => JSON.parse(read(rel));
const fileSha = (rel) => sha(fs.readFileSync(inside(rel)));
const stable = (v) => Array.isArray(v) ? `[${v.map(stable).join(',')}]` : v && typeof v === 'object'
  ? `{${Object.keys(v).sort().map((k) => `${JSON.stringify(k)}:${stable(v[k])}`).join(',')}}` : JSON.stringify(v);
const events = () => read('orchestrator/review-events.ndjson').trimEnd().split('\n').map(JSON.parse);
const latest = (es, task) => [...es].reverse().find((e) => e.task_id === task) ?? null;
const row = (task) => {
  const rows = readBacklog(inside('BACKLOG.md')).tasks.filter((r) => r.id === task);
  assert(rows.length === 1, `${task} BACKLOG 必须恰好一行`);
  return rows[0];
};
function atomicWrite(file, bytes) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.tmp-${process.pid}-${randomUUID()}`;
  try { fs.writeFileSync(tmp, bytes, { flag: 'wx' }); fs.renameSync(tmp, file); }
  finally { if (fs.existsSync(tmp)) fs.unlinkSync(tmp); }
}
const writeJson = (file, value) => atomicWrite(file, `${JSON.stringify(value, null, 2)}\n`);
function writeOnce(file, bytes) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  if (fs.existsSync(file)) assert(fs.readFileSync(file).equals(Buffer.from(bytes)), `保全原件不一致：${file}`);
  else fs.writeFileSync(file, bytes, { flag: 'wx' });
}
function checkChain(es) {
  let prior = '';
  for (const event of es) {
    const { event_hash, ...body } = event;
    assert((event.previous_event_hash ?? '') === prior && sha(stable(body)) === event_hash,
      `事件链不完整：${event.task_id}`);
    prior = event_hash;
  }
  const raw = fs.readFileSync(inside('orchestrator/review-events.ndjson'));
  const prefix = plan.original_event_prefix;
  assert(raw.length >= prefix.byte_length && sha(raw.subarray(0, prefix.byte_length)) === prefix.sha256,
    '计划冻结的原 review-events 字节前缀被修改；停止，不重写历史');
}
function verify(task, allowChanges) {
  const r = row(task);
  const result = verifyReviewReceipt({ root, taskId: task, reviewCell: r.review, documentCell: r.document,
    requirePass: false, allowSpecChange: allowChanges, allowConstitutionChange: allowChanges });
  assert(result.kind === 'receipt', `${task} 缺可核验 receipt`);
  return result;
}
function checkGate() {
  for (const frozen of plan.frozen_artifacts) assert(fileSha(frozen.path) === frozen.sha256,
    `冻结文件已变化：${frozen.path}；须审阅更新计划，不能自动重绑 hash`);
  const g = verify('T-1410', false);
  assert(g.verdict === 'PASS' && g.receipt === plan.t1410_gate.receipt &&
    g.event.event_hash === plan.t1410_gate.event_hash && g.state.spec_sha256 === plan.t1410_gate.spec_sha256,
  'T1410 精确增量审核绑定已变化');
}
function checkInput(step) {
  for (const [p, h] of [[step.spec_path, step.spec_sha256], [step.constitution_path, step.constitution_sha256],
    [step.packet_path, step.packet_sha256], [step.binding_evidence.path, step.binding_evidence.sha256]])
    assert(fileSha(p) === h, `${step.task_id} 当前文件不再匹配独评绑定：${p}`);
  const packet = json(step.packet_path);
  assert(packet.schema === 'spec-review-round/v2' && packet.review_kind === 'initial', `${step.task_id} 不是真实 initial 包`);
  assert(packet.summary.includes(step.spec_sha256), `${step.task_id} summary 未绑定当前 SPEC hash`);
  if (step.binding_evidence.kind === 'structured-batch-a') {
    const entry = json(step.binding_evidence.path).items.find((x) => x.task_id === step.task_id);
    assert(entry?.spec_sha256 === step.spec_sha256 && entry?.review_constitution_path === step.constitution_path &&
      entry?.review_constitution_sha256 === step.constitution_sha256, `${step.task_id} 批次 A 独评绑定不符`);
  } else assert(packet.summary.includes(step.constitution_path) && packet.summary.includes(step.constitution_sha256),
    `${step.task_id} summary 未绑定当前宪法`);
  const r = row(step.task_id);
  assert(r.status === step.backlog_status && r.acceptance === step.backlog_acceptance && r.document === step.backlog_document,
    `${step.task_id} 状态/验收/文档列变化；脚本不调整这些字段`);
  return packet;
}
function inspect(step, es) {
  const packet = checkInput(step);
  const event = latest(es, step.task_id);
  if (step.previous && event?.event_hash === step.previous.event_hash) {
    const verified = verify(step.task_id, true);
    assert(verified.state.review_path === step.review_path && fileSha(step.review_path) === step.previous.snapshot_sha256 &&
      row(step.task_id).review === step.previous.review_cell, `${step.task_id} 原 snapshot/receipt 漂移`);
    return { state: 'pending' };
  }
  if (!step.previous && !event) {
    assert(!fs.existsSync(inside(step.review_path)), `${step.task_id} 新身份目标 snapshot 已存在，不能覆盖`);
    return { state: 'pending' };
  }
  // 崩溃后只承认与计划完全一致、且可通过正式 verifier 的真实提交；不凭本地日志跳过。
  assert(event && event.cycle === step.expected_cycle && event.round === step.expected_round &&
    event.spec_path === step.spec_path && event.spec_sha256 === step.spec_sha256 &&
    event.constitution_path === step.constitution_path && event.constitution_sha256 === step.constitution_sha256 &&
    event.review_path === step.review_path && event.review_kind === 'initial' &&
    event.review_mode === plan.reviewer_identity.review_mode && event.model === plan.reviewer_identity.model &&
    stable(event.packet) === stable(packet), `${step.task_id} latest event 不是原基线或本计划的精确提交`);
  const expectedAuth = step.capability ? {
    schema: 'review-cycle-capability-consumption/v1', decision_id: step.capability.decision_id,
    nonce: step.capability.nonce, task_id: step.task_id, previous_event_hash: step.previous.event_hash,
    allowed_change_ids: [...step.capability.change_ids].sort(), max_uses: 1,
  } : null;
  assert(stable(event.cycle_authorization ?? null) === stable(expectedAuth), `${step.task_id} typed capability 消费不符`);
  const verified = verify(step.task_id, false);
  assert(verified.verdict === step.expected_verdict, `${step.task_id} 工具 verdict 与真实包计算结果不符`);
  return { state: 'recorded', event, verified };
}
function checkSchemas() {
  const check = `import json,sys\nfrom jsonschema import Draft202012Validator\np=json.load(open(sys.argv[1]))\nv=Draft202012Validator(json.load(open('orchestrator/process/rule-bundle/prompts/spec-reviewer.schema.json')))\nfor s in p['steps']:\n for e in v.iter_errors(json.load(open(s['packet_path']))):\n  print(s['task_id']+': '+e.message,file=sys.stderr); sys.exit(1)\nprint('21 个 initial 包通过当前 JSON schema')\n`;
  const result = spawnSync('python3', ['-c', check, planPath], { cwd: root, encoding: 'utf8' });
  assert(!result.error && result.status === 0, result.error?.message ?? result.stderr ?? 'JSON schema 校验失败');
  process.stdout.write(result.stdout);
}
function capabilityBlocks(text, id) {
  return [...text.matchAll(/```text\s*\n([\s\S]*?)```/g)]
    .filter((m) => m[1].split(/\r?\n/).some((l) => l.trim() === `ID: ${id}`));
}
function checkCapability(step, es, done) {
  const c = step.capability;
  if (!c) return;
  const field = (key) => c.typed_block.match(new RegExp(`^${key}: (.+)$`, 'm'))?.[1];
  for (const [key, value] of Object.entries({ ID: c.decision_id, 'Authorization-Kind': 'process-review-cycle',
    'Task-ID': step.task_id, 'Previous-Spec-SHA256': step.previous.spec_sha256,
    'Previous-Constitution-SHA256': step.previous.constitution_sha256, 'Max-Cycles': '1',
    Nonce: c.nonce, Owner: 'user', Status: 'active' }))
    assert(field(key) === value, `${c.decision_id} 计划 typed 字段不符：${key}`);
  assert(stable((field('Allowed-Change-IDs') ?? '').split(',').sort()) === stable([...c.change_ids].sort()),
    `${c.decision_id} 精确 Change-ID 列表不符`);
  const matches = capabilityBlocks(read('orchestrator/DECISION_LOG.md'), c.decision_id);
  assert(matches.length <= 1, `${c.decision_id} 存在重复 typed 块`);
  if (matches.length) assert(matches[0][0].trim() === c.typed_block.trim(), `${c.decision_id} 现有 typed 块与计划不符`);
  if (done) assert(matches.length === 1, `${c.decision_id} 已消费但原 typed 块缺失`);
  if (!done) assert(!es.some((e) => e.cycle_authorization?.decision_id === c.decision_id ||
    e.cycle_authorization?.nonce === c.nonce), `${c.decision_id} 或 nonce 已被其他事件消费`);
  for (const file of fs.readdirSync(path.join(dir, 'foreign-snapshots'))) {
    const p = path.join(dir, 'foreign-snapshots', file);
    if (fs.statSync(p).isFile()) assert(!fs.readFileSync(p, 'utf8').includes(c.nonce), `${c.decision_id} nonce 与外链历史重合`);
  }
}
function preflight() {
  assert(plan.steps.length === 21 && plan.steps.filter((s) => s.capability).length === 20, '计划数量不是 20 capability / 21 record');
  assert(new Set(plan.steps.map((s) => s.task_id)).size === 21, '计划重复任务');
  const capabilities = plan.steps.filter((s) => s.capability).map((s) => s.capability);
  assert(new Set(capabilities.map((c) => c.decision_id)).size === 20 &&
    new Set(capabilities.map((c) => c.nonce)).size === 20, '计划重复 DEC 或 nonce');
  assert(plan.steps.find((s) => s.task_id === 'T-642').capability.change_ids.includes('REV-002'), 'T642 未绑定原争议');
  checkGate(); checkSchemas();
  const es = events(); checkChain(es);
  return plan.steps.map((s) => { const found = inspect(s, es); checkCapability(s, es, found.state === 'recorded'); return { task_id: s.task_id, state: found.state, expected_verdict: s.expected_verdict }; });
}
function backupOriginals() {
  const backupDir = path.join(runDir, 'before');
  const index = path.join(backupDir, 'manifest.json');
  if (fs.existsSync(index)) {
    const saved = JSON.parse(fs.readFileSync(index, 'utf8'));
    assert(saved.plan_sha256 === planSha, '恢复时计划已变化');
    for (const f of saved.files) assert(sha(fs.readFileSync(path.join(backupDir, f.backup_path))) === f.sha256, `保全原件损坏：${f.path}`);
    return;
  }
  const targets = ['orchestrator/review-events.ndjson', 'orchestrator/DECISION_LOG.md', 'BACKLOG.md',
    ...plan.steps.filter((s) => s.previous).map((s) => s.review_path)];
  const files = [];
  for (const p of [...new Set(targets)]) {
    const bytes = fs.readFileSync(inside(p));
    writeOnce(path.join(backupDir, p), bytes);
    files.push({ path: p, backup_path: p, sha256: sha(bytes) });
  }
  writeOnce(path.join(backupDir, 'plan.json'), planBytes);
  writeJson(index, { schema: 't1410-control-originals/v1', plan_sha256: planSha, files });
}
function ensureDecision(step) {
  if (!step.capability) return;
  const release = acquireStateLock(root, { operation: `T1410:typed-decision:${step.task_id}` });
  try {
    checkGate(); const es = events(); checkChain(es);
    assert(inspect(step, es).state === 'pending', `${step.task_id} 录入状态已改变`);
    checkCapability(step, es, false);
    const c = step.capability;
    const before = read('orchestrator/DECISION_LOG.md');
    if (capabilityBlocks(before, c.decision_id).length) return; // 决策已写但 record 未完成，可恢复。
    let after;
    if (c.mode === 'augment-existing-section') {
      assert(sha(c.original_section) === c.original_section_sha256 && before.split(c.original_section).length === 2,
        `${c.decision_id} 原用户决定段已变化`);
      after = before.replace(c.original_section, c.original_section + c.typed_block + '\n');
    } else {
      assert(!before.includes(c.decision_id), `${c.decision_id} 已被占用`);
      after = before + `\n\n## ${c.decision_id} — T1410 ${step.task_id} 一次精确审核周期\n\n` + c.typed_block;
    }
    atomicWrite(inside('orchestrator/DECISION_LOG.md'), after);
    writeJson(path.join(runDir, 'decisions', `${step.task_id}.json`), { task_id: step.task_id,
      decision_id: c.decision_id, nonce: c.nonce, before_sha256: sha(before), after_sha256: sha(after),
      recorded_at: new Date().toISOString(), plan_sha256: planSha });
  } finally { release(); }
}
function saveReceipt(step, found, output = null) {
  assert(found.state === 'recorded', `${step.task_id} 无实际提交，不能写 receipt`);
  const receiptPath = path.join(runDir, 'receipts', `${step.task_id}.json`);
  const value = { schema: 't1410-actual-review-receipt/v1', plan_id: plan.plan_id, plan_sha256: planSha,
    task_id: step.task_id, event_hash: found.event.event_hash, receipt: found.verified.receipt,
    verdict: found.verified.verdict, cycle: found.event.cycle, round: found.event.round,
    review_path: step.review_path, spec_sha256: found.event.spec_sha256,
    constitution_sha256: found.event.constitution_sha256, packet_sha256: step.packet_sha256,
    cycle_authorization: found.event.cycle_authorization, command: step.command };
  if (fs.existsSync(receiptPath)) {
    const saved = JSON.parse(fs.readFileSync(receiptPath, 'utf8'));
    for (const [k, v] of Object.entries(value)) assert(stable(saved[k]) === stable(v), `${step.task_id} 本地 receipt 与实际事件不符`);
  } else writeJson(receiptPath, { ...value, verified_at: new Date().toISOString(),
    recovery: output === null ? '由当前实际 event/snapshot 验证恢复；未再次 record' : '本次工具调用后验证', tool_output: output });
  return value;
}
function apply() {
  fs.mkdirSync(runDir, { recursive: true });
  const lock = path.join(dir, 'serial-record.run.lock');
  const token = randomUUID();
  fs.writeFileSync(lock, JSON.stringify({ pid: process.pid, token, plan_id: plan.plan_id, started_at: new Date().toISOString() }) + '\n', { flag: 'wx' });
  const release = () => { if (fs.existsSync(lock) && JSON.parse(fs.readFileSync(lock, 'utf8')).token === token) fs.unlinkSync(lock); };
  process.once('exit', release);
  try {
    preflight(); backupOriginals();
    const receipts = [];
    for (const step of plan.steps) {
      checkGate(); let es = events(); checkChain(es);
      let found = inspect(step, es);
      if (found.state === 'recorded') { receipts.push(saveReceipt(step, found)); console.log(`${step.task_id} 已验证提交，跳过重放`); continue; }
      ensureDecision(step);
      es = events(); checkChain(es); checkInput(step);
      assert(inspect(step, es).state === 'pending', `${step.task_id} 调用前 lineage 变化`);
      const beforeEventBytes = fs.readFileSync(inside('orchestrator/review-events.ndjson'));
      const startedAt = new Date().toISOString();
      const result = spawnSync(process.execPath, step.command.slice(1), { cwd: root, encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 });
      const output = { command: step.command, started_at: startedAt, ended_at: new Date().toISOString(),
        status: result.status, signal: result.signal, error: result.error?.message ?? null,
        stdout: result.stdout ?? '', stderr: result.stderr ?? '' };
      writeJson(path.join(runDir, 'calls', `${step.task_id}-${Date.now()}.json`), output);
      // 即使输出失败，已提交的实际 receipt 也要保全，然后停止；恢复时不会重复消费。
      const afterEvents = events(); checkChain(afterEvents);
      found = inspect(step, afterEvents);
      if (found.state === 'recorded') receipts.push(saveReceipt(step, found, output));
      assert(!result.error && result.status === 0, `${step.task_id} reviewctl 失败，已保存实际输出，立即停止`);
      assert(found.state === 'recorded', `${step.task_id} 工具退出零但未找到可核验提交`);
      const afterBytes = fs.readFileSync(inside('orchestrator/review-events.ndjson'));
      assert(afterBytes.subarray(0, beforeEventBytes.length).equals(beforeEventBytes) && afterEvents.length === es.length + 1,
        `${step.task_id} 期间发生额外事件写入；已保全 receipt，停止核对`);
      console.log(`${step.task_id} ${found.verified.verdict}[REV:${found.verified.receipt}]`);
    }
    const concerns = receipts.filter((r) => r.verdict !== 'PASS');
    writeJson(path.join(runDir, 'summary.json'), { schema: 't1410-serial-record-result/v1', plan_id: plan.plan_id,
      plan_sha256: planSha, receipts, non_pass: concerns.map((r) => ({ task_id: r.task_id, verdict: r.verdict, receipt: r.receipt })),
      no_task_status_or_acceptance_change: true, product_acceptance_claim: false });
    console.log(`完成 ${receipts.length} 次可核验录入；${concerns.length} 项非 PASS。未变更任务状态或产品验收。`);
  } finally { release(); process.off('exit', release); }
}
try {
  if (mode === '--apply') apply();
  else console.log(JSON.stringify({ mode: 'read-only', plan_sha256: planSha, steps: preflight() }, null, 2));
} catch (error) { console.error(`停止：${error.message}`); process.exitCode = 1; }

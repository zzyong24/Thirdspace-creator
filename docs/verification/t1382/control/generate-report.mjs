#!/usr/bin/env node
// 从本次真实 Playwright / 隔离运行工件计算结果；不接受手写 PASS。
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const TASK = 'T-1382';
const COMMAND = 'node docs/verification/t1382/control/run-journeys.mjs';
const CONTRACT = 'docs/verification/t1382/control/PAGE_SPEC.md';
const REPORT = 'docs/verification/t1382/control/FRONTEND_REPORT.md';
const RUNS = 'docs/verification/t1382/journey/runs';
const SAFETY = ['source_unoccupied', 'codex_not_logged_in', 'network_sandbox', 'private_database_removed', 'process_groups_stopped', 'supervisor_released'];
const hash = (value) => createHash('sha256').update(value).digest('hex');
const json = (file) => JSON.parse(readFileSync(file, 'utf8'));
const slash = (value) => value.split(path.sep).join('/');
const nonempty = (value) => typeof value === 'string' && value.trim().length > 0;
const invariant = (condition, message) => { if (!condition) throw new Error(message); };
function inside(base, target) { const rel = path.relative(base, target); return rel === '' || (!path.isAbsolute(rel) && rel !== '..' && !rel.startsWith(`..${path.sep}`)); }
function existing(base, relative) {
  invariant(nonempty(relative), '工件引用为空');
  const candidate = path.resolve(base, relative.split('#')[0]);
  invariant(inside(base, candidate), `工件越界: ${relative}`);
  invariant(existsSync(candidate), `工件不存在: ${relative}`);
  const real = realpathSync(candidate);
  invariant(inside(realpathSync(base), real), `工件symlink越界: ${relative}`);
  return real;
}
function block(file, tag) {
  const source = readFileSync(file, 'utf8');
  const blocks = [...source.matchAll(new RegExp('```' + tag + '\\s*\\n([\\s\\S]*?)\\n```', 'g'))];
  invariant(blocks.length === 1, `${file}必须且只能有一个${tag}块`);
  return { source, value: JSON.parse(blocks[0][1]) };
}
function git(root, args) {
  const result = spawnSync('git', args, { cwd: root, encoding: 'utf8', timeout: 120_000, maxBuffer: 8 * 1024 * 1024 });
  invariant(result.status === 0, `Git核对失败: ${result.stderr}`);
  return result.stdout.trim();
}
function testsIn(suites = []) {
  return suites.flatMap((suite) => [
    ...(suite.specs ?? []).flatMap((spec) => (spec.tests ?? []).map((test) => ({ ...test, title: spec.title, specId: spec.id }))),
    ...testsIn(suite.suites),
  ]);
}
function readRun(root, runDir) {
  const runsRoot = existing(root, RUNS);
  const requested = existing(root, path.isAbsolute(runDir) ? path.relative(root, runDir) : runDir);
  const directory = path.basename(requested) === 'run.json' ? path.dirname(requested) : requested;
  invariant(directory !== runsRoot && inside(runsRoot, directory), 'run目录必须是journey/runs下的唯一子目录');
  const manifest = json(existing(directory, 'run.json'));
  invariant(manifest.schema === 't1382-journey-run/v1' && manifest.task_id === TASK, 'run.json schema/task不匹配');
  invariant(manifest.run_id === path.basename(directory), 'run_id与唯一目录不匹配');
  invariant(nonempty(manifest.playwright_report), '缺Playwright JSON');
  const pwFile = existing(root, manifest.playwright_report);
  invariant(inside(directory, pwFile), 'Playwright结果不属于本run');
  const pw = json(pwFile);
  return { directory, manifest, pw, tests: testsIn(pw.suites) };
}
const internalId = /(?:^|[^A-Za-z0-9])((?:T\d{2,}|T-(?:\d{2,}|[A-Za-z0-9]+(?:-[A-Za-z0-9]+)*)|(?:ASM|DEC|FR|NFR|FLOW|ENT|IA|PAGE|COMP|MOCK|API|TEST|TC|INT|BR|PG|HARD|PKG|RISK|REV|FEAT|DFLOW|AC)-[A-Za-z0-9]+(?:-[A-Za-z0-9]+)*))(?=$|[^A-Za-z0-9])/g;
const jargon = [/\btrace\s*id\b/gi, /\bcorrelation[_ -]?id\b/gi, /\bidempotency(?:[_ -]?key|[_ -]?required)?\b/gi, /\b(?:provider|schema|enum|webhook|traceparent|tracestate)\b/gi, /\b[A-Z][A-Z0-9]*(?:_[A-Z0-9]+)+\b/g];

// 纯读检查；runner可在cleanup后调用，不会改旧报告及其可见文案。
export function inspectRun({ root = process.cwd(), runDir, redRef }) {
  root = realpathSync(root);
  const errors = [];
  const defects = [];
  const guard = (label, operation) => { try { return operation(); } catch (error) { const message = `${label}: ${error.message}`; errors.push(message); defects.push({ id: `evidence-${defects.length + 1}`, message }); return null; } };
  const loaded = guard('运行工件', () => readRun(root, runDir));
  if (!loaded) return { status: 'fail', errors, report: null, visibleCopy: null, summary: { status: 'fail', open_defects: defects } };
  const { directory, manifest, pw, tests } = loaded;
  const rel = (file) => slash(path.relative(root, file));
  const ref = (value) => rel(existing(directory, value));
  const contractBlock = guard('旅程合同', () => block(existing(root, CONTRACT), 'frontend-journey-contract'));
  if (!contractBlock) return { status: 'fail', errors, report: null, visibleCopy: null, summary: { status: 'fail', open_defects: defects } };
  const contract = contractBlock.value;
  const contractSha = hash(contractBlock.source).slice(0, 12);
  const head = guard('源码身份', () => {
    invariant(Array.isArray(contract.watched_paths) && contract.watched_paths.length > 0, '缺watched_paths');
    for (const watched of contract.watched_paths) existing(root, watched);
    const dirty = git(root, ['status', '--porcelain=v1', '--untracked-files=all', '--', ...contract.watched_paths.map((p) => `:(literal)${p}`)]);
    invariant(dirty === '', '被监视源码存在未提交漂移，不能签发当前HEAD报告');
    return git(root, ['rev-parse', 'HEAD']);
  });
  guard('运行身份', () => {
    invariant(manifest.mode === 'green', '正式报告只接受green运行');
    invariant(manifest.commit_sha === head && /^[a-f0-9]{40}$/.test(manifest.commit_sha), '运行SHA不等于当前HEAD');
    invariant(manifest.contract_sha === contractSha, '运行contract_sha已过期');
    invariant(manifest.command === COMMAND && manifest.verify_key === 't1382-unified-intake:e2e', '正式命令/verify_key不匹配');
    invariant(!manifest.invocation_command || manifest.invocation_command === COMMAND, '正式证据必须来自无附加参数的统一命令');
    invariant(Number.isFinite(Date.parse(manifest.started_at)) && Number.isFinite(Date.parse(manifest.finished_at)) && Date.parse(manifest.finished_at) >= Date.parse(manifest.started_at), '运行起止时间缺失或倒置');
    invariant(nonempty(manifest.runtime) && !/mock|fixture|jsdom/i.test(manifest.runtime), '非真实浏览器runtime');
    invariant(manifest.exit_code === 0 && manifest.playwright_exit_code === 0, '真实运行未exit0');
    invariant(inside(directory, existing(root, manifest.output_ref)), '运行输出不属于本run');
  });
  guard('隔离与清理', () => {
    for (const key of SAFETY) { invariant(manifest.safety?.[key] === true, `安全事实未成立:${key}`); const f = existing(root, manifest.safety?.evidence_refs?.[key]); invariant(inside(directory, f), `安全证据不属于本run:${key}`); }
    const integrityFile = existing(root, manifest.source_manifest_ref);
    invariant(inside(directory, integrityFile), '源库核对不属于本run');
    const integrity = json(integrityFile);
    invariant(integrity.schema === 't1382-source-integrity/v1' && integrity.unchanged === true, '源库未证实保持原样');
    invariant(/^[a-f0-9]{64}$/.test(integrity.before_sha256) && integrity.before_sha256 === integrity.after_sha256, '源库前后摘要不一致或缺失');
  });
  const records = [];
  for (const test of tests) guard(`Playwright ${test.title}/${test.projectName}`, () => {
    invariant(test.results?.length === 1, '缺结果或出现retry，不能用重跑掩盖失败');
    const result = test.results[0];
    invariant(test.expectedStatus === 'passed', '不能把expected-fail或skip视成功');
    invariant(result.status === 'passed' && !(result.errors?.length), `真实结果=${result.status}: ${(result.errors ?? []).map((error) => error.message).join(';')}`);
    invariant(result.retry === 0 && test.status === 'expected', '用例发生重试或整体状态非expected');
    const attachments = (result.attachments ?? []).filter((a) => a.name === 'journey-witness');
    invariant(attachments.length === 1 && nonempty(attachments[0].path), '必须附一个真实journey-witness文件');
    const witnessFile = existing(directory, path.relative(directory, path.resolve(root, attachments[0].path)));
    const witness = json(witnessFile);
    invariant(witness.schema === 't1382-journey-witness/v1' && witness.task_id === TASK, 'witness schema/task错误');
    invariant(witness.run_id === manifest.run_id && witness.commit_sha === manifest.commit_sha && witness.contract_sha === contractSha, 'witness身份与本run不一致');
    invariant(witness.playwright_test_id === test.specId, 'witness未绑定真实Playwright testId');
    invariant(witness.test_id === witness.journey_id && contract.required_checks.some((c) => c.test_id === witness.test_id), 'witness test_id未声明');
    invariant(witness.status === 'passed' && witness.assertions_completed === true, '旅程未完整执行断言');
    invariant(contract.viewports.some((v) => v.width === witness.viewport?.width && v.height === witness.viewport?.height), 'witness视口不在合同中');
    invariant(Array.isArray(witness.checks) && witness.checks.length > 0, '缺check结果');
    for (const check of witness.checks) { invariant(check.result === 'pass' && check.evidence_refs?.length > 0, `check未通过:${check.id}`); for (const evidence of check.evidence_refs) ref(evidence); }
    invariant(witness.witnesses?.length > 0 && witness.visible_copy?.length > 0, '缺真实数据或可见文案');
    for (const w of witness.witnesses) { invariant(nonempty(w.id) && nonempty(w.role), 'data witness缺id/role'); ref(w.evidence_ref); }
    for (const capture of witness.visible_copy) {
      invariant(nonempty(capture.checkpoint) && nonempty(capture.text) && capture.check_ids?.length > 0, 'visible copy为空');
      invariant(capture.viewport?.width === witness.viewport.width && capture.viewport?.height === witness.viewport.height, 'copy视口不匹配');
      ref(capture.screenshot_ref);
      invariant(![...capture.text.matchAll(internalId)].length && !jargon.some((regex) => [...capture.text.matchAll(regex)].length), `visible copy泄漏内部编号或机器术语:${capture.checkpoint}`);
    }
    records.push({ witness, witnessFile, projectName: test.projectName });
  });
  guard('完整20用例', () => {
    invariant(tests.length === 20 && records.length === 20, `要求20个真实通过用例，实际tests=${tests.length}/有效witness=${records.length}`);
    invariant((pw.errors ?? []).length === 0, 'Playwright存在全局错误');
    const keys = records.map(({ witness: w }) => `${w.journey_id}:${w.viewport.width}x${w.viewport.height}`);
    invariant(new Set(keys).size === 20, '旅程×视口重复或缺项');
  });
  const checks = contract.required_checks.map((check) => {
    const selected = records.filter(({ witness: w }) => w.test_id === check.test_id && w.checks.some((c) => c.id === check.id && c.result === 'pass'));
    const complete = guard(`check×双窗 ${check.id}`, () => {
      for (const viewport of contract.viewports) invariant(selected.some(({ witness: w }) => w.viewport.width === viewport.width && w.viewport.height === viewport.height && w.visible_copy.some((c) => c.check_ids.includes(check.id))), '缺当前check在每个视口的后置条件/可见文案');
      invariant(selected.length === contract.viewports.length, 'check覆盖存在重复或额外项');
      return true;
    });
    return { id: check.id, test_id: check.test_id, result: complete ? 'pass' : 'fail', evidence_ref: selected.map(({ witnessFile }) => rel(witnessFile)).join(', ') || rel(path.join(directory, 'run.json')) };
  });
  const coverage = contract.required_conditions.map((condition) => {
    const selected = records.filter(({ witness: w }) => w.conditions?.some((c) => c.condition === condition && c.result === 'pass'));
    const complete = guard(`真实条件 ${condition}`, () => {
      for (const viewport of contract.viewports) invariant(selected.some(({ witness: w }) => w.viewport.width === viewport.width && w.viewport.height === viewport.height), '该条件未在双窗实际执行');
      for (const { witness: w } of selected) for (const c of w.conditions.filter((c) => c.condition === condition)) { invariant(c.evidence_refs?.length > 0, '条件缺证据'); for (const evidence of c.evidence_refs) ref(evidence); }
      return true;
    });
    return { condition, result: complete ? 'pass' : 'fail', evidence_ref: selected.map(({ witnessFile }) => rel(witnessFile)).join(', ') || rel(path.join(directory, 'run.json')) };
  });
  let redPath = null;
  guard('真实RED', () => {
    invariant(nonempty(redRef), '缺真实red_ref，当前运行仅保留证据，不能签发报告');
    const red = readRun(root, redRef);
    invariant(red.directory !== directory && red.manifest.mode === 'red', 'red_ref不能指向本轮green或非red');
    invariant(red.manifest.commit_sha === head && red.manifest.contract_sha === contractSha, 'RED需与当前源码和合同同源（通过真实请求阻断制造红测）');
    invariant(Number.isInteger(red.manifest.playwright_exit_code) && red.manifest.playwright_exit_code > 0 && Number.isInteger(red.manifest.exit_code) && red.manifest.exit_code > 0, 'RED必须有真实非零退出，null或信号中断不算');
    invariant(red.manifest.interrupted == null && !red.manifest.failure && !red.manifest.cleanup_error, 'RED伴随环境或清理失败，不能作为正式红证据');
    for (const key of SAFETY) { invariant(red.manifest.safety?.[key] === true, `RED隔离/清理未成立:${key}`); invariant(inside(red.directory, existing(root, red.manifest.safety?.evidence_refs?.[key])), 'RED安全证据越界'); }
    const redIntegrity = json(existing(root, red.manifest.source_manifest_ref));
    invariant(redIntegrity.schema === 't1382-source-integrity/v1' && redIntegrity.unchanged === true && /^[a-f0-9]{64}$/.test(redIntegrity.before_sha256) && redIntegrity.before_sha256 === redIntegrity.after_sha256, 'RED原库完整性未通过');
    invariant(nonempty(red.manifest.red_test_id) && nonempty(red.manifest.red_check_id) && nonempty(red.manifest.red_sentinel_ref), '缺RED目标和阻断sentinel');
    invariant(contract.required_checks.some((c) => c.id === red.manifest.red_check_id && c.test_id === red.manifest.red_test_id), 'RED目标不是合同中的旅程check');
    const sentinelFile = existing(root, red.manifest.red_sentinel_ref);
    invariant(inside(red.directory, sentinelFile), 'RED sentinel不属于RED run');
    const sentinel = json(sentinelFile);
    invariant(sentinel.run_id === red.manifest.run_id && sentinel.test_id === red.manifest.red_test_id && sentinel.check_id === red.manifest.red_check_id && sentinel.request_blocked === true, 'RED sentinel没有证明指定真实请求被阻断');
    const matched = red.tests.filter((test) => test.expectedStatus === 'passed' && test.results?.some((r) => r.status === 'failed' && r.errors?.some(error => String(error.message).includes('toHaveURL')) && r.attachments?.some((a) => {
      if (a.name !== 'journey-witness' || !a.path) return false;
      const witness = json(existing(red.directory, path.relative(red.directory, path.resolve(root, a.path))));
      return witness.run_id === red.manifest.run_id && witness.commit_sha === head && witness.contract_sha === contractSha && witness.playwright_test_id === test.specId && witness.test_id === red.manifest.red_test_id && witness.status === 'failed' && witness.assertions_completed === false && witness.checks?.some((c) => c.id === red.manifest.red_check_id && c.result === 'fail') && witness.failure;
    })));
    invariant(matched.length > 0, 'RED没有指定旅程真实断言失败；preflight/启动失败不可冒充红测');
    redPath = rel(path.join(red.directory, 'run.json'));
  });
  const visibleCopy = { schema: 'frontend-visible-copy/v1', task_id: TASK, commit_sha: manifest.commit_sha, captures: records.flatMap(({ witness: w }) => w.visible_copy.map((capture) => ({ ...capture, screenshot_ref: ref(capture.screenshot_ref) }))) };
  const copySource = `${JSON.stringify(visibleCopy, null, 2)}\n`;
  const status = errors.length === 0 ? 'pass' : 'fail';
  const summaryPath = rel(path.join(directory, 'EVIDENCE_SUMMARY.json'));
  const report = {
    schema: 'frontend-validation/v1', task_id: TASK, contract_path: CONTRACT, contract_sha: contractSha, commit_sha: manifest.commit_sha, observed_at: manifest.finished_at,
    run: { verify_key: manifest.verify_key, command: COMMAND, exit_code: manifest.exit_code, output_ref: manifest.output_ref },
    environment: { surface: 'browser', runtime: manifest.runtime, viewports: contract.viewports.map((v) => ({ ...v, result: records.filter(({ witness: w }) => w.viewport.width === v.width && w.viewport.height === v.height).length === 10 && status === 'pass' ? 'pass' : 'fail' })) },
    data: { mode: 'non-fixture', witnesses: records.flatMap(({ witness: w }) => w.witnesses.map((item) => ({ ...item, evidence_ref: ref(item.evidence_ref) }))) },
    levels: { logic: { status, evidence_ref: summaryPath }, surface: { status, evidence_ref: summaryPath }, journey: { status, evidence_ref: manifest.playwright_report }, experience: { status: 'not-requested', evidence_ref: '本次为真实浏览器自动走查，未请求或代记用户亲手体验确认。' } },
    checks, coverage, visible_copy: { artifact_path: rel(path.join(directory, 'VISIBLE_COPY.json')), artifact_sha256: hash(copySource) },
    tdd_red_ref: redPath ?? '', red_ref: redPath ? slash(path.dirname(redPath)) : null, open_defects: defects, status,
    scope_notes: ['已装库只读复制后在本轮私有PGlite副本运行；不声称真实供应商生成、平台采集、助手模型提案或已安装桌面App验收通过。', '后续taskctl会另建run完整重执行；本报告与其visible copy不可被重执行覆盖。'],
  };
  return { status, errors, report, visibleCopy, copySource, summary: { schema: 't1382-evidence-summary/v1', task_id: TASK, run_id: manifest.run_id, status, checked_cases: records.length, expected_cases: 20, checks, coverage, open_defects: defects } };
}

export function generateReport({ root = process.cwd(), runDir, redRef, reportPath = REPORT }) {
  root = realpathSync(root);
  const inspected = inspectRun({ root, runDir, redRef });
  invariant(inspected.status === 'pass', `当前工件不能签发报告:\n${inspected.errors.join('\n')}`);
  const directory = existing(root, path.isAbsolute(runDir) ? path.relative(root, runDir) : runDir);
  const output = path.resolve(root, reportPath);
  invariant(output === path.resolve(root, REPORT), '正式报告路径必须为control/FRONTEND_REPORT.md');
  invariant(!existsSync(output), '正式报告已存在；须先保全并由维护者显式归档，禁止覆盖receipt');
  for (const name of ['VISIBLE_COPY.json', 'EVIDENCE_SUMMARY.json']) invariant(!existsSync(path.join(directory, name)), `本run派生工件已存在，禁止覆盖:${name}`);
  writeFileSync(path.join(directory, 'VISIBLE_COPY.json'), inspected.copySource, { flag: 'wx', mode: 0o600 });
  writeFileSync(path.join(directory, 'EVIDENCE_SUMMARY.json'), `${JSON.stringify(inspected.summary, null, 2)}\n`, { flag: 'wx', mode: 0o600 });
  writeFileSync(output, `# T-1382 真实浏览器旅程验收报告\n\n本文件由真实运行工件计算；仅覆盖合同列出的十条路径和双窗口。\n\n\`\`\`frontend-validation\n${JSON.stringify(inspected.report, null, 2)}\n\`\`\`\n`, { flag: 'wx', mode: 0o600 });
  return inspected;
}

if (process.argv[1] && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const args = process.argv.slice(2);
    const value = (name) => { const index = args.indexOf(name); return index >= 0 ? args[index + 1] : undefined; };
    invariant(value('--run-dir'), '用法: generate-report.mjs --run-dir <run目录> --red-ref <red目录> [--report | --check]');
    const input = { root: process.cwd(), runDir: value('--run-dir'), redRef: value('--red-ref') };
    const result = args.includes('--report') ? generateReport(input) : inspectRun(input);
    console.log(JSON.stringify({ status: result.status, errors: result.errors, cases: result.summary.checked_cases }));
    process.exitCode = result.status === 'pass' ? 0 : 1;
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}

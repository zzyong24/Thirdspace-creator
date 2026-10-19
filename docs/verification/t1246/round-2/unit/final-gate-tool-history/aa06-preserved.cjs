'use strict';
const entryClock = performance.now();
const fs = require('node:fs'), path = require('node:path'), os = require('node:os'), crypto = require('node:crypto'), cp = require('node:child_process');
const ROOT = '/Users/zyongzhu/.codex/worktrees/integrated-dev-acceptance/Thirdspace-creator';
const TOOLS = path.join(ROOT, 'docs/verification/t1246/round-2/unit');
const helper = path.join(TOOLS, 'owned-pg-runtime.cjs');
const hash = file => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
if (hash(helper) !== '393f88771f732e57959ce948a61104fe616c6090faa3e21808186a6df7df3dea') throw Error('ORIGINAL_OWNED_HELPER_DRIFT');
const runtime = require(helper);
const phase = process.argv[2];
const phases = {
  timeout: {args: ['tools/timeout-policy/verify.mjs'], bodyMs: 96000000},
  boundary: {args: ['orchestrator/process/boundary-scan.mjs'], bodyMs: 1200000},
  orphan: {args: ['orchestrator/process/orphan-scan.mjs'], bodyMs: 1200000},
};
if (!Object.hasOwn(phases, phase)) throw Error('EXACT_GATE_PHASE_REQUIRED');
const slots = {prepare: 600000, environmentProof: 180000, body: phases[phase].bodyMs, childLifecycle: 2 * 2160000, afterSource: 600000, cleanup: 600000, margin: 180000};
const totalMs = Object.values(slots).reduce((sum, value) => sum + value, 0);
function binding() {
  const roots = ['contract', 'backend/src', 'backend/drizzle', 'ai-worker/src', 'ai-worker/vendor', 'ai-worker/scripts', 'ai-worker/dist', 'frontend/src', 'frontend/scripts/desktop', 'mcp-server/src', 'mcp-server/tests', 'tools/timeout-policy', 'tools/windows-closure-rat', 'orchestrator/process'];
  const paths = cp.execFileSync('rg', ['--files', ...roots], {cwd: ROOT, encoding: 'utf8', timeout: 180000, maxBuffer: 32 * 1024 * 1024}).trim().split('\n').filter(file => /\.(?:ts|tsx|js|mjs|cjs|sql|json|yaml)$/.test(file) && !file.split('/').some(part => ['node_modules', '.next'].includes(part)));
  for (const file of ['package.json', 'pnpm-lock.yaml', 'pnpm-workspace.yaml', ...['frontend', 'backend', 'contract', 'ai-worker', 'mcp-server'].flatMap(pkg => [pkg + '/package.json', pkg + '/tsconfig.json', pkg + '/vitest.config.ts']), 'docs/features/t1246-integrated-dev-package-acceptance.md', 'docs/features/t1250-positive-timeout-consumer-closure.md', 'docs/features/t1252-cli-http-consumer-budget-closure.md', 'orchestrator/SYSTEM_ARCHITECTURE.md', path.relative(ROOT, helper), path.relative(ROOT, __filename)]) if (fs.existsSync(path.join(ROOT, file))) paths.push(file);
  const inputs = [...new Set(paths)].sort().map(file => ({file, sha256: hash(path.join(ROOT, file))}));
  return {phase, runtimeRoot: ROOT, toolSha256: hash(__filename), helperSha256: hash(helper), nodePath: process.execPath, nodeSha256: hash(process.execPath), sourceDigest: crypto.createHash('sha256').update(JSON.stringify(inputs)).digest('hex'), inputs, slots, totalMs, noPG: true, noApp: true, noPublish: true, retry: 0};
}
async function main() {
  const before = binding();
  if (performance.now() - entryClock > slots.prepare) throw Error('PREPARE_EXHAUSTED');
  if (process.argv.includes('--prepare')) {console.log(JSON.stringify({...before, status: 'PREPARE_ONLY_NO_CHILD'}, null, 2)); return;}
  const index = process.argv.indexOf('--review');
  if (index < 0) throw Error('BOUND_PEER_AND_ROOT_REVIEW_REQUIRED');
  const review = JSON.parse(fs.readFileSync(process.argv[index + 1], 'utf8'));
  for (const key of ['phase', 'runtimeRoot', 'toolSha256', 'helperSha256', 'nodePath', 'nodeSha256', 'sourceDigest', 'totalMs']) if (review[key] !== before[key]) throw Error('REVIEW_DRIFT:' + key);
  if (review.approved !== true || review.independentReviewSha256 === undefined || review.sharedDistExclusive !== true) throw Error('REVIEW_NOT_APPROVED');
  const nonce = crypto.randomBytes(16).toString('hex'), out = path.join(TOOLS, 'final-gates', phase + '-' + nonce);
  fs.mkdirSync(out, {recursive: true});
  const write = (name, value) => fs.writeFileSync(path.join(out, name), JSON.stringify(value, null, 2) + '\n');
  const owned = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), 't1246-final-gate-' + nonce + '-'));
  fs.chmodSync(owned, 0o700);
  const env = runtime.cleanEnv();
  for (const key of Object.keys(env)) if (/^(CREATOROS_|GROWTH_|TAURI_|S3_|AWS_|OPENAI_|ANTHROPIC_|AZURE_|GOOGLE_API_|GEMINI_|DEEPSEEK_|REDIS_|T1246_)/.test(key) || /(?:API_KEY|AUTH_TOKEN|SECRET|PASSWORD)$/.test(key) || ['PGLITE_DATA_DIR', 'TMPDIR', 'TMP', 'TEMP'].includes(key)) delete env[key];
  for (const [name, key] of Object.entries({app: 'CREATOROS_APP_DATA_DIR', db: 'CREATOROS_DB_DIR', media: 'CREATOROS_MEDIA_ROOT', browser: 'CREATOROS_BROWSER_POOL_DIR', workbench: 'CREATOROS_WORKBENCH_ROOT', backup: 'CREATOROS_DATABASE_BACKUP_DIR', douyin: 'CREATOROS_DOUYIN_AUTH_DIR', web: 'CREATOROS_WEB_AUTH_DIR', tmp: 'TMPDIR'})) {const directory = path.join(owned, name); fs.mkdirSync(directory); env[key] = directory;}
  Object.assign(env, {NODE_ENV: 'test', CI: '1', TMP: env.TMPDIR, TEMP: env.TMPDIR, T1246_OWNED_PG_PRELOAD: '1', NODE_OPTIONS: '--require ' + helper});
  if (env.HOME !== process.env.HOME || env.CODEX_HOME !== process.env.CODEX_HOME) throw Error('ORIGINAL_HOME_DRIFT');
  const controller = new AbortController(), deadline = entryClock + totalMs;
  let expired = false, timer, code = 1, cleanupError = null;
  const tick = () => {if (performance.now() >= deadline) {expired = true; controller.abort(Error('ORIGINAL_ABSOLUTE_GATE_EXHAUSTED'));} else timer = setTimeout(tick, Math.min(60000, deadline - performance.now()));};
  tick();
  const records = [];
  write('source-before.json', before); write('review.json', review);
  try {
    const proof = await runtime.boundedProcess(process.execPath, ['-e', "const net=require('node:net');let denied=false;try{new net.Socket().connect({host:'127.0.0.1',port:55422})}catch(e){denied=e.message.startsWith('T1246_ENV_NOT_OWNED_PG')}const facts={foreignDenied:denied,noNative:!Object.hasOwn(process.env,'NODE_PG_FORCE_NATIVE'),noPG:!Object.keys(process.env).some(k=>k.startsWith('PG')||['DATABASE_URL','TEST_DATABASE_URL'].includes(k))};console.log(JSON.stringify(facts));if(!Object.values(facts).every(v=>v===true))process.exitCode=1;"], {cwd: ROOT, env, budgetMs: slots.environmentProof, signal: controller.signal, log: path.join(out, 'environment-proof.log')});
    records.push(proof); write('environment-proof.json', proof);
    if (proof.code !== 0 || !proof.processClosed || proof.remainingOwnedGroupMembers.length || proof.budgetExhausted) throw Error('ENVIRONMENT_PROOF_FAILED');
    const required = slots.body + 2160000 + slots.afterSource + slots.cleanup + slots.margin;
    if (deadline - performance.now() < required) throw Error('FULL_GATE_BODY_UNAVAILABLE');
    const result = await runtime.boundedProcess(process.execPath, phases[phase].args, {cwd: ROOT, env, budgetMs: slots.body, signal: controller.signal, log: path.join(out, 'gate.log')});
    records.push(result); write('exit.json', result);
    const afterStart = performance.now(), after = binding();
    write('source-after.json', {...after, unchanged: after.sourceDigest === before.sourceDigest});
    if (performance.now() - afterStart > slots.afterSource) throw Error('AFTER_SOURCE_BUDGET_EXHAUSTED');
    code = result.code === 0 && result.processClosed && !result.remainingOwnedGroupMembers.length && !result.budgetExhausted && after.sourceDigest === before.sourceDigest ? 0 : 1;
  } catch (error) {write('runner-error.json', {message: error.message, stack: error.stack});}
  finally {
    const cleanupStart = performance.now();
    const closed = records.length === 2 && records.every(record => record.processClosed && !record.remainingOwnedGroupMembers.length);
    if (closed) try {fs.rmSync(owned, {recursive: true});} catch (error) {cleanupError = error.message; code = 1;}
    else code = 1;
    if (performance.now() - cleanupStart > slots.cleanup || performance.now() >= deadline || expired) code = 1;
    write('summary.json', {phase, code, elapsedMs: performance.now() - entryClock, totalMs, expired, recordsClosed: closed, ownedRoot: owned, ownedRootRemoved: !fs.existsSync(owned), cleanupError, cleanupElapsedMs: performance.now() - cleanupStart, sourceAndGateNonzeroNeverHidden: true, noApp: true, noPG: true, noPublish: true});
    clearTimeout(timer);
  }
  console.log(out); process.exitCode = code;
}
main().catch(error => {console.error(error.stack); process.exitCode = 1;});

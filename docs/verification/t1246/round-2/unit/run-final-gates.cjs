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
const {createRequire} = require('node:module');
const budgetFile = path.join(ROOT, 'docs/verification/t1250/tools-candidate/runner-budget-inventory-v7.cjs');
if (hash(budgetFile) !== 'ccdd5db1edbca67b691bf24736bc17a8c957b18f783612147ce6d67cd28c9d3d') throw Error('APPROVED_STATIC_INVENTORY_DRIFT');
const budgetInventory = require(budgetFile);
const ts = createRequire(path.join(ROOT, 'frontend/package.json'))('typescript');
const finiteGroups = [
 ['contract', ['tests/timeout-policy.test.ts']],
 ['ai-worker', ['src/execution/worker-timeout-policy.test.ts', 'src/runtime/browser/chromium-guard-lifecycle.test.ts']],
 ['backend', ['src/modules/execution/new-execution-budget.test.ts', 'src/modules/execution/run-execution-task.test.ts', 'src/modules/execution/execution-call-ledger.service.test.ts']],
 ['frontend', ['src/features/knowledge/knowledge-dump-zone.test.tsx', 'src/features/copilot/chat-thesis-card.test.tsx', 'src/features/draft-workbench/content-direction-actions.test.tsx', 'src/features/draft-workbench/script-review-gate.test.tsx', 'src/server/ai/search/search-browser.test.ts', 'src/server/ai/search/browser-search-fallback.test.ts']],
 ['mcp-server', ['tests/cli.test.ts']],
].map(([pkg, files]) => ({pkg, ...budgetInventory(ts, files.map(f => pkg + '/' + f), file => fs.readFileSync(path.join(ROOT, file), 'utf8'), 'regression')}));
const finiteSerialMs = finiteGroups.reduce((sum, group) => sum + group.staticChildMs, 0);
const observation = {classification: 'FINITE_GATE_RESULT_OBSERVATION_NOT_UNBOUNDED_CONSUMER_LIMIT',
 unboundedOriginalConsumers: ['Node --test check.test.mjs/hyperframes.test.mjs: original no finite test timeout', 'hyperframes.test.mjs spawnSync render: original timeout undefined', 'Node --test Windows policy/desktop policy: original no finite test timeout; policy assertions keep timeout undefined'],
 originalPolicyAndAssertionsUnchanged: true, nodeObservationAllocationMs: 2 * 1800000, scannerAndEightStartupAllocationMs: 9 * 240000,
 finiteGroups, finiteSerialMs, actualGatePassOnlyIfAllEightNaturalEOFAndOriginalExitZero: true};
const observerBodyMs = finiteSerialMs + observation.nodeObservationAllocationMs + observation.scannerAndEightStartupAllocationMs;
if (!Number.isSafeInteger(observerBodyMs) || observerBodyMs > 2147483647) throw Error('OBSERVER_CHILD_TIMER_RANGE');
const phases = {
  timeout: {args: ['tools/timeout-policy/verify.mjs'], bodyMs: observerBodyMs},
  boundary: {args: ['orchestrator/process/boundary-scan.mjs'], bodyMs: 1200000},
  orphan: {args: ['orchestrator/process/orphan-scan.mjs'], bodyMs: 1200000},
};
if (!Object.hasOwn(phases, phase)) throw Error('EXACT_GATE_PHASE_REQUIRED');
const slots = {prepare: 600000, environmentProof: 180000, body: phases[phase].bodyMs, childLifecycle: 2 * 2160000, afterSource: 600000, cleanup: 600000, margin: 180000};
const totalMs = Object.values(slots).reduce((sum, value) => sum + value, 0);
function binding() {
  // Exact cached inventory is itself input; each absence and byte read is retained.
  const cached = cp.execFileSync('git', ['ls-files', '-z'], {cwd: ROOT, encoding: 'utf8', timeout: 120000, maxBuffer: 32 * 1024 * 1024}).split('\0').filter(Boolean);
  const excluded = /^(docs|output|outputs|tmp|\.codegraph)\/|(?:^|\/)(?:node_modules|target|dist|build|vendor|fixtures|__fixtures__|tests|__tests__|testdata)\/|\.(?:test|spec|fixture)\.[^.]+$|_tests\.rs$|(?:vitest|playwright)\.config\./;
  const paths = cached.filter(file => !excluded.test(file));
  const roots = ['contract', 'backend/src', 'backend/drizzle', 'ai-worker/src', 'ai-worker/vendor', 'ai-worker/scripts', 'ai-worker/dist', 'frontend/src', 'frontend/src-tauri/src', 'frontend/scripts/desktop', 'mcp-server/src', 'mcp-server/tests', 'tools/timeout-policy', 'tools/windows-closure-rat', 'orchestrator/process'];
  paths.push(...cp.execFileSync('rg', ['--files', ...roots], {cwd: ROOT, encoding: 'utf8', timeout: 180000, maxBuffer: 32 * 1024 * 1024}).trim().split('\n').filter(file => /\.(?:ts|tsx|js|jsx|mjs|cjs|rs|py|ps1|yml|yaml|toml|sql|json)$/.test(file)));
  const fixed = ['package.json', 'pnpm-lock.yaml', 'pnpm-workspace.yaml', ...['frontend', 'backend', 'contract', 'ai-worker', 'mcp-server'].flatMap(pkg => [pkg + '/package.json', pkg + '/tsconfig.json', pkg + '/vitest.config.ts']),
    'docs/features/t1246-integrated-dev-package-acceptance.md', 'docs/features/t1250-positive-timeout-consumer-closure.md', 'docs/features/t1252-cli-http-consumer-budget-closure.md', 'orchestrator/SYSTEM_ARCHITECTURE.md',
    'orchestrator/process/orphan-scan.config.json', 'orchestrator/process/boundaries.config.json', 'orchestrator/process/boundary-baseline.json', 'orchestrator/ID_REGISTRY.md', 'orchestrator/TRACEABILITY_MATRIX.md', 'orchestrator/ARTIFACT_MANIFEST.yaml',
    'patches/hyperframes@0.7.54.patch', 'frontend/node_modules/hyperframes/package.json', 'frontend/node_modules/hyperframes/dist/cli.js', path.relative(ROOT, helper), path.relative(ROOT, __filename), path.relative(ROOT, budgetFile)];
  // Mirror actual boundary recursive scope and configurable orphan data, including untracked files.
  const boundaryFile = path.join(ROOT, 'orchestrator/process/boundaries.config.json');
  function walk(directory, exts, ignore) {if (!fs.existsSync(directory)) return; for (const entry of fs.readdirSync(directory, {withFileTypes: true})) {if (ignore.has(entry.name)) continue; const abs = path.join(directory, entry.name); if (entry.isDirectory()) walk(abs, exts, ignore); else if (exts.some(ext => entry.name.endsWith(ext))) paths.push(path.relative(ROOT, abs));}}
  if (fs.existsSync(boundaryFile)) {const cfg = JSON.parse(fs.readFileSync(boundaryFile, 'utf8')); for (const rule of cfg.rules ?? []) for (const dir of rule.dirs ?? rule.scopeDirs ?? []) walk(path.join(ROOT, dir), rule.ext ?? ['.ts','.tsx'], new Set(cfg.ignoreDirs ?? []));}
  const orphanConfig = path.join(ROOT, 'orchestrator/process/orphan-scan.config.json');
  const oc = fs.existsSync(orphanConfig) ? JSON.parse(fs.readFileSync(orphanConfig, 'utf8')) : {};
  const control = path.resolve(ROOT, 'orchestrator', oc.control_dir ?? '.');
  fixed.push(path.relative(ROOT, path.resolve(control, oc.id_registry ?? 'ID_REGISTRY.md')), path.relative(ROOT, path.resolve(control, oc.traceability_matrix ?? 'TRACEABILITY_MATRIX.md')));
  // Bind actual installed implementation, not executable shims alone.
  function packageRoot(req, name, entry) {let dir = path.dirname(fs.realpathSync(req.resolve(entry ?? name + '/package.json'))); for (;;) {const pkg = path.join(dir, 'package.json'); if (fs.existsSync(pkg) && JSON.parse(fs.readFileSync(pkg, 'utf8')).name === name) return dir; const parent = path.dirname(dir); if (parent === dir) throw Error('INSTALLED_PACKAGE_ROOT_NOT_FOUND:' + name); dir = parent;}}
  const implementationRoots = new Set();
  for (const consumer of ['frontend','backend','contract','ai-worker','mcp-server']) {const req = createRequire(path.join(ROOT, consumer, 'package.json')); for (const pkg of ['typescript','vitest']) implementationRoots.add(packageRoot(req, pkg));}
  const mcpReq = createRequire(path.join(ROOT, 'mcp-server/package.json'));
  implementationRoots.add(packageRoot(mcpReq, 'undici'));
  implementationRoots.add(packageRoot(mcpReq, '@modelcontextprotocol/sdk', '@modelcontextprotocol/sdk/server/index.js'));
  const pnpmPath = cp.execFileSync('/usr/bin/which', ['pnpm'], {encoding: 'utf8', timeout: 180000}).trim();
  const pnpmRealpath = fs.realpathSync(pnpmPath); let pnpmRoot = path.dirname(pnpmRealpath);
  while (!(fs.existsSync(path.join(pnpmRoot, 'package.json')) && JSON.parse(fs.readFileSync(path.join(pnpmRoot, 'package.json'), 'utf8')).name === 'pnpm')) {const parent = path.dirname(pnpmRoot); if (parent === pnpmRoot) throw Error('ACTUAL_PNPM_IMPLEMENTATION_NOT_FOUND'); pnpmRoot = parent;}
  implementationRoots.add(pnpmRoot);
  for (const directory of implementationRoots) walk(directory, ['.js','.mjs','.cjs','.json','.node','.wasm'], new Set());
  paths.push(path.relative(ROOT, pnpmRealpath));
  const executableResolution = {pnpmPath, pnpmRealpath, pnpmSha256: hash(pnpmRealpath), implementationRoots: [...implementationRoots].sort()};
  paths.push(...fixed);
  const inputs = [...new Set(paths)].sort().map(file => ({file, exists: fs.existsSync(path.join(ROOT, file)), sha256: fs.existsSync(path.join(ROOT, file)) ? hash(path.join(ROOT, file)) : null}));
  const cachedInventorySha256 = crypto.createHash('sha256').update(JSON.stringify(cached)).digest('hex');
  return {phase, runtimeRoot: ROOT, toolSha256: hash(__filename), helperSha256: hash(helper), nodePath: process.execPath, nodeSha256: hash(process.execPath), sourceDigest: crypto.createHash('sha256').update(JSON.stringify({inputs,cachedInventorySha256,observation,executableResolution})).digest('hex'), cachedInventorySha256, cachedPathCount: cached.length, executableResolution, inputs, slots, totalMs, observation, noPG: true, noApp: true, noPublish: true, retry: 0};
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
  const onStop = () => controller.abort(Error('OWNED_GATE_OBSERVATION_INTERRUPTED'));
  process.once('SIGINT', onStop); process.once('SIGTERM', onStop);
  let expired = false, timer, code = 1, cleanupError = null;
  const tick = () => {if (performance.now() >= deadline) {expired = true; controller.abort(Error('ORIGINAL_ABSOLUTE_GATE_EXHAUSTED'));} else timer = setTimeout(tick, Math.min(60000, deadline - performance.now()));};
  tick();
  const records = [];
  write('source-before.json', before); write('review.json', review);
  try {
    const proof = await runtime.boundedProcess(process.execPath, ['-e', "const net=require('node:net');let denied=false;try{new net.Socket().connect({host:'127.0.0.1',port:55422})}catch(e){denied=e.message.startsWith('T1246_ENV_NOT_OWNED_PG')}const facts={foreignDenied:denied,noNative:!Object.hasOwn(process.env,'NODE_PG_FORCE_NATIVE'),noPG:!Object.keys(process.env).some(k=>k.startsWith('PG')||['DATABASE_URL','TEST_DATABASE_URL'].includes(k))};console.log(JSON.stringify(facts));if(!Object.values(facts).every(v=>v===true))process.exitCode=1;"], {cwd: ROOT, env, budgetMs: slots.environmentProof, signal: controller.signal, log: path.join(out, 'environment-proof.log')});
    records.push(proof); write('environment-proof.json', proof);
    if (proof.code !== 0 || !proof.processClosed || proof.remainingOwnedGroupMembers.length || proof.budgetExhausted) throw Error('ENVIRONMENT_PROOF_FAILED');
    if (controller.signal.aborted) throw Error('GATE_OBSERVATION_CANCELLED_BEFORE_NEXT_CHILD');
    const required = slots.body + 2160000 + slots.afterSource + slots.cleanup + slots.margin;
    if (deadline - performance.now() < required) throw Error('FULL_GATE_BODY_UNAVAILABLE');
    const result = await runtime.boundedProcess(process.execPath, phases[phase].args, {cwd: ROOT, env, budgetMs: slots.body, signal: controller.signal, log: path.join(out, 'gate.log')});
    records.push(result); write('exit.json', result);
    const afterStart = performance.now(), after = binding();
    write('source-after.json', {...after, unchanged: after.sourceDigest === before.sourceDigest});
    if (performance.now() - afterStart > slots.afterSource) throw Error('AFTER_SOURCE_BUDGET_EXHAUSTED');
    code = result.code === 0 && result.processClosed && !result.remainingOwnedGroupMembers.length && !result.budgetExhausted && !result.outerAbort && result.signals.length === 0 && after.sourceDigest === before.sourceDigest ? 0 : 1;
  } catch (error) {write('runner-error.json', {message: error.message, stack: error.stack});}
  finally {
    const cleanupStart = performance.now();
    const closed = records.length === 2 && records.every(record => record.processClosed && !record.remainingOwnedGroupMembers.length);
    if (closed) try {fs.rmSync(owned, {recursive: true});} catch (error) {cleanupError = error.message; code = 1;}
    else code = 1;
    if (performance.now() - cleanupStart > slots.cleanup || performance.now() >= deadline || expired || controller.signal.aborted) code = 1;
    write('summary.json', {phase, code, elapsedMs: performance.now() - entryClock, totalMs, expired, cancelled: controller.signal.aborted, recordsClosed: closed, ownedRoot: owned, ownedRootRemoved: !fs.existsSync(owned), cleanupError, cleanupElapsedMs: performance.now() - cleanupStart, sourceAndGateNonzeroNeverHidden: true, noApp: true, noPG: true, noPublish: true});
    clearTimeout(timer); process.removeListener('SIGINT', onStop); process.removeListener('SIGTERM', onStop);
  }
  console.log(out); process.exitCode = code;
}
main().catch(error => {console.error(error.stack); process.exitCode = 1;});

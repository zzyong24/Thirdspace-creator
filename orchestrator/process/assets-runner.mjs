#!/usr/bin/env node
// process/assets-runner.mjs — in-skill example runner for the reusable asset library.
// Runs each asset's example-as-test with node's BUILT-IN test runner (zero runtime deps:
// no @aws-sdk / @anthropic-ai / vitest). `.test.ts` run via node's --experimental-strip-types
// (node v22+); `.test.mjs` run plain. This is the executable spine of the `verified` gate —
// an asset only claims verified:true once its example/*.test.* runs green here.
//
//   node process/assets-runner.mjs              # run every example under assets/
//   node process/assets-runner.mjs --only MOD-001   # only paths containing the substring
//
// Exit 0 = all examples passed (or none found — WARN); 1 = at least one failed.

import { readdirSync, existsSync, statSync } from 'node:fs';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const HERE = dirname(fileURLToPath(import.meta.url));
const ASSETS = resolve(HERE, '../decisions/assets');

const onlyIdx = process.argv.indexOf('--only');
const onlyFilter = onlyIdx !== -1 ? process.argv[onlyIdx + 1] : null;

const isTestFile = (name) => name.endsWith('.test.ts') || name.endsWith('.test.mjs');

// Collect <root>/.../example/*.test.{ts,mjs}: only files directly inside an `example/` dir.
function collectFromExampleDir(exDir, out) {
  if (!existsSync(exDir) || !statSync(exDir).isDirectory()) return;
  for (const name of readdirSync(exDir)) {
    if (isTestFile(name)) out.push(join(exDir, name));
  }
}

// Walk modules/<id>/ and _candidates/<...>/ looking for `example/` dirs (bounded depth).
function collectUnder(root, out, depth = 0) {
  if (!existsSync(root) || !statSync(root).isDirectory()) return;
  for (const entry of readdirSync(root)) {
    const p = join(root, entry);
    if (!statSync(p).isDirectory()) continue;
    if (entry === 'example') { collectFromExampleDir(p, out); continue; }
    if (depth < 4) collectUnder(p, out, depth + 1);
  }
}

const examples = [];
collectUnder(join(ASSETS, 'modules'), examples);
collectUnder(join(ASSETS, '_candidates'), examples);

const selected = (onlyFilter ? examples.filter((p) => p.includes(onlyFilter)) : examples).sort();

if (selected.length === 0) {
  console.log('! [WARN] no in-skill examples found under assets/ — verified gate has nothing executable to stand on.');
  process.exit(0);
}

let failed = 0;
for (const ex of selected) {
  const flags = ex.endsWith('.test.ts')
    ? ['--test', '--experimental-strip-types', ex]
    : ['--test', ex];
  const r = spawnSync(process.execPath, flags, { stdio: 'inherit' });
  if (r.status !== 0) failed += 1;
}

console.log('\n── assets example runner ──');
console.log(`passed ${selected.length - failed} / failed ${failed}`);
process.exit(failed ? 1 : 0);

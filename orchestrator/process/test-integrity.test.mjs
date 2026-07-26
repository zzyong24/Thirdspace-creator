import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import {
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const gateSource = fileURLToPath(new URL('./test-integrity.mjs', import.meta.url));

function writeFiles(repo, files) {
  for (const [path, content] of Object.entries(files)) {
    const target = join(repo, path);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, content);
  }
}

function git(repo, ...args) {
  execFileSync('git', args, {
    cwd: repo,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

function runFixture({
  config = {},
  baselineFiles,
  deletePaths = [],
  targetFiles = {},
}) {
  const repo = mkdtempSync(join(tmpdir(), 'test-integrity-'));
  try {
    const processDir = join(repo, 'orchestrator/process');
    mkdirSync(processDir, { recursive: true });
    copyFileSync(gateSource, join(processDir, 'test-integrity.mjs'));
    writeFileSync(
      join(processDir, 'test-integrity.config.json'),
      JSON.stringify({ base_ref: 'HEAD', ...config }, null, 2),
    );
    writeFiles(repo, baselineFiles);

    git(repo, 'init', '-q');
    git(repo, 'config', 'user.email', 'test-integrity@example.invalid');
    git(repo, 'config', 'user.name', 'test-integrity fixture');
    git(repo, 'add', '.');
    git(repo, 'commit', '-qm', 'fixture baseline');

    for (const path of deletePaths) unlinkSync(join(repo, path));
    writeFiles(repo, targetFiles);

    const result = spawnSync(
      process.execPath,
      ['orchestrator/process/test-integrity.mjs'],
      { cwd: repo, encoding: 'utf8' },
    );
    return {
      status: result.status,
      output: `${result.stdout ?? ''}${result.stderr ?? ''}`,
    };
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
}

const twoCriteria = `
import assert from 'node:assert/strict';
import { test } from 'node:test';
test('one', () => assert.equal(1, 1));
test('two', () => assert.equal(2, 2));
`;

const oneCriterion = `
import assert from 'node:assert/strict';
import { test } from 'node:test';
test('one', () => assert.equal(1, 1));
`;

test('未声明的测试文件删除仍然失败', () => {
  const result = runFixture({
    baselineFiles: { 'tests/old.test.js': oneCriterion },
    deletePaths: ['tests/old.test.js'],
  });

  assert.equal(result.status, 1, result.output);
  assert.match(result.output, /test file DELETED: tests\/old\.test\.js/);
});

test('精确测试迁移仅在替代 criteria 不下降时通过', async (t) => {
  await t.test('精确来源、目标、理由且计数不降时通过', () => {
    const result = runFixture({
      config: {
        testMigrations: [{
          from: ['tests/old.test.js'],
          to: ['tests/new.test.js'],
          reason: '测试属主迁移',
        }],
      },
      baselineFiles: { 'tests/old.test.js': twoCriteria },
      deletePaths: ['tests/old.test.js'],
      targetFiles: { 'tests/new.test.js': twoCriteria },
    });

    assert.equal(result.status, 0, result.output);
    assert.match(result.output, /audited migration retained aggregate criteria/);
  });

  await t.test('glob-like 路径失败', () => {
    const result = runFixture({
      config: {
        testMigrations: [{
          from: ['tests/old.test.js', 'tests/*.test.js'],
          to: ['tests/new.test.js'],
          reason: '不允许宽泛迁移',
        }],
      },
      baselineFiles: { 'tests/old.test.js': oneCriterion },
      deletePaths: ['tests/old.test.js'],
      targetFiles: { 'tests/new.test.js': oneCriterion },
    });

    assert.equal(result.status, 1, result.output);
    assert.match(result.output, /glob-like paths are forbidden/);
  });

  await t.test('目标缺失失败', () => {
    const result = runFixture({
      config: {
        testMigrations: [{
          from: ['tests/old.test.js'],
          to: ['tests/missing.test.js'],
          reason: '目标必须存在',
        }],
      },
      baselineFiles: { 'tests/old.test.js': oneCriterion },
      deletePaths: ['tests/old.test.js'],
    });

    assert.equal(result.status, 1, result.output);
    assert.match(result.output, /missing\/non-test targets: tests\/missing\.test\.js/);
  });

  await t.test('替代测试用例或断言计数下降失败', () => {
    const result = runFixture({
      config: {
        testMigrations: [{
          from: ['tests/old.test.js'],
          to: ['tests/new.test.js'],
          reason: '替代标准不得缩水',
        }],
      },
      baselineFiles: { 'tests/old.test.js': twoCriteria },
      deletePaths: ['tests/old.test.js'],
      targetFiles: { 'tests/new.test.js': oneCriterion },
    });

    assert.equal(result.status, 1, result.output);
    assert.match(result.output, /replacement criteria too small/);
  });
});

test('eslint-disable-next-line 不会与 eslint-disable 重复计数', () => {
  const result = runFixture({
    config: {
      suppressionAllowances: [{
        path: 'src/app.js',
        pattern: 'eslint-disable-next-line',
        maxIncrease: 1,
        reason: '单行 console 诊断',
      }],
    },
    baselineFiles: { 'src/app.js': 'export const value = 1;\n' },
    targetFiles: {
      'src/app.js':
        '// eslint-disable-next-line no-console\nconsole.log("diagnostic");\n',
    },
  });

  assert.equal(result.status, 0, result.output);
  assert.match(result.output, /suppression increase 0→1 is exactly audited/);
  assert.doesNotMatch(result.output, /suppression increase 0→2/);
});

test('suppression allowance 必须精确且有上限和理由', async (t) => {
  const baselineFiles = { 'src/app.js': 'export const value = 1;\n' };

  await t.test('超过 maxIncrease 失败', () => {
    const result = runFixture({
      config: {
        suppressionAllowances: [{
          path: 'src/app.js',
          pattern: 'eslint-disable-next-line',
          maxIncrease: 1,
          reason: '只允许一处',
        }],
      },
      baselineFiles,
      targetFiles: {
        'src/app.js': [
          '// eslint-disable-next-line no-console',
          'console.log("one");',
          '// eslint-disable-next-line no-console',
          'console.log("two");',
          '',
        ].join('\n'),
      },
    });

    assert.equal(result.status, 1, result.output);
    assert.match(result.output, /allowance exceeded 2>1/);
  });

  await t.test('错误路径不能覆盖真实变化', () => {
    const result = runFixture({
      config: {
        suppressionAllowances: [{
          path: 'src/other.js',
          pattern: 'eslint-disable-next-line',
          maxIncrease: 1,
          reason: '路径不匹配',
        }],
      },
      baselineFiles,
      targetFiles: {
        'src/app.js':
          '// eslint-disable-next-line no-console\nconsole.log("diagnostic");\n',
      },
    });

    assert.equal(result.status, 1, result.output);
    assert.match(result.output, /only \+0 is covered by exact audited allowances/);
  });

  await t.test('理由缺失失败', () => {
    const result = runFixture({
      config: {
        suppressionAllowances: [{
          path: 'src/app.js',
          pattern: 'eslint-disable-next-line',
          maxIncrease: 1,
          reason: '',
        }],
      },
      baselineFiles,
      targetFiles: {
        'src/app.js':
          '// eslint-disable-next-line no-console\nconsole.log("diagnostic");\n',
      },
    });

    assert.equal(result.status, 1, result.output);
    assert.match(result.output, /requires an exact configured pattern, positive integer maxIncrease, and non-empty reason/);
  });
});

import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { capacityWarnings, buildClosureDiagnostics, compareFiles } from './runtime-diagnostics.mjs';

test('合法大闭包只产生容量告警，不阻断运行', () => {
  const warnings = capacityWarnings({ runtimeFiles: 4145, coreFiles: 2121, setupBytes: 700000000 });
  assert.equal(warnings.length, 3);
  assert.match(warnings[0], /4145/);
  assert.deepEqual(capacityWarnings({ runtimeFiles: 100 }), []);
  assert.throws(() => capacityWarnings({ runtimeFiles: NaN }), /无效/);
});

test('文件差异按实际路径和摘要识别，不按总数猜测', () => {
  const before = [{path:'a',sha256:'1',bytes:1},{path:'b',sha256:'2',bytes:2}];
  const after = [{path:'a',sha256:'3',bytes:1},{path:'c',sha256:'2',bytes:2}];
  assert.deepEqual(compareFiles(before, after), {added:['c'],removed:['b'],changed:['a']});
});

test('真实文件清单支持中文空格路径、依赖来源和重复数据，不删除运行文件', async () => {
  const root = mkdtempSync(join(tmpdir(), '打包 测试-'));
  try {
    for (const p of ['frontend/.next/vendor/pkg', 'layers/browser/vendor/pkg']) {
      mkdirSync(join(root,p),{recursive:true});
      writeFileSync(join(root,p,'package.json'),JSON.stringify({name:'pkg',version:'1.0.0'}));
      writeFileSync(join(root,p,'index.js'),'module.exports = 1');
    }
    mkdirSync(join(root,'frontend/.next/vendor/pkg/esm'),{recursive:true});
    writeFileSync(join(root,'frontend/.next/vendor/pkg/esm/package.json'),'{}');
    const report = await buildClosureDiagnostics(root);
    assert.equal(report.inventory.summary.fileCount,5);
    assert.equal(report.dependencies.length,2);
    assert.equal(report.dependencies[0].version,'1.0.0');
    assert.equal(report.inventory.summary.byOwner.browser.files,2);
    assert.equal(report.inventory.duplicates.length,2);
    assert.equal(report.baseline, null);
  } finally { rmSync(root,{recursive:true,force:true}); }
});

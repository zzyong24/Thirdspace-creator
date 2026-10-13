import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import * as build from './build-sidecar.mjs';
import { DESKTOP_RELEASE_CSP } from './desktop-csp.mjs';

test('桌面CSP允许现有sandbox预览的精确GSAP脚本，仍禁止eval', () => {
  const directive = DESKTOP_RELEASE_CSP.split('; ').find(v => v.startsWith('script-src '));
  assert.ok(directive.split(' ').includes('https://cdn.jsdelivr.net/npm/gsap@3.12.5/dist/gsap.min.js'));
  assert.ok(!directive.includes('unsafe-eval'));
});

test('普通构建子环境剥更新根私钥路径并保持其它构建值', () => {
  const env = { PATH: '/fixture', CREATOROS_UPDATE_ROOT_PRIVATE_KEY_PATH: '/private/root.pem', CREATOROS_RELEASE: '1' };
  const sanitized = build.nonSigningBuildEnv(env);
  assert.equal(sanitized.CREATOROS_UPDATE_ROOT_PRIVATE_KEY_PATH, undefined);
  assert.equal(sanitized.CREATOROS_RELEASE, '1');
  assert.equal(env.CREATOROS_UPDATE_ROOT_PRIVATE_KEY_PATH, '/private/root.pem');
  assert.equal(build.portableTarEnv(env, 'darwin').CREATOROS_UPDATE_ROOT_PRIVATE_KEY_PATH, undefined);
});

test('正式clean缓存绑定实际JS内容，旧标记及历史转换/新诱饵使复用失效', () => {
  const dir = mkdtempSync(join(tmpdir(), 't1273-clean-'));
  try {
    const chunks = join(dir, 'frontend', '.next', 'server', 'chunks');
    mkdirSync(chunks, { recursive: true });
    const chunk = join(chunks, 'app.js');
    writeFileSync(chunk, 'module.exports = 1;');
    assert.equal(build.cleanSidecarReusable(dir), false);
    writeFileSync(join(dir, '.creatoros-clean-policy'), 't1273-clean-no-obfuscation-v1');
    assert.equal(build.cleanSidecarReusable(dir), false);
    build.writeCleanSidecarPolicy(dir, {});
    assert.equal(build.cleanSidecarReusable(dir), false, '开发构建不能复用为有CSP的正式runtime');
    build.writeCleanSidecarPolicy(dir, { CREATOROS_RELEASE: '1' });
    assert.equal(build.cleanSidecarReusable(dir), true);
    writeFileSync(chunk, '/* creatoros-obfuscated */module.exports = 1;');
    assert.equal(build.cleanSidecarReusable(dir), false);
    writeFileSync(chunk, 'module.exports = 1;');
    assert.equal(build.cleanSidecarReusable(dir), true);
    writeFileSync(join(chunks, 'decoy.js'), 'module.exports = 2;');
    assert.equal(build.cleanSidecarReusable(dir), false);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

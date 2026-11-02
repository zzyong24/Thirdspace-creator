import { describe, it, expect } from 'vitest';
import { mkdtempSync, readFileSync, existsSync, statSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runCIRelease } from './release-ci.mjs';

describe('CI根私钥生命周期', () => {
  for (const outcome of ['success', 'nonzero', 'throw', 'invalid']) {
    it(`${outcome}均剥离环境并清理临时私钥`, () => {
      const root = mkdtempSync(join(tmpdir(), 'ci-key-test-'));
      const env = { RUNNER_TEMP: root, CREATOROS_UPDATE_ROOT_PRIVATE_KEY_PEM: 'test-only-secret', CREATOROS_UPDATE_ROOT_PRIVATE_KEY_PATH: 'old' };
      let keyPath, launched = false;
      try {
        const action = () => runCIRelease({ env, workspace: join(root, 'workspace'), validate: path => {
          keyPath = path;
          expect(readFileSync(path, 'utf8')).toBe('test-only-secret');
          if (process.platform !== 'win32') expect(statSync(path).mode & 0o777).toBe(0o600);
          if (outcome === 'invalid') throw Error('bad key');
        }, launch: childEnv => {
          launched = true;
          expect(childEnv.CREATOROS_UPDATE_ROOT_PRIVATE_KEY_PEM).toBeUndefined();
          expect(childEnv.CREATOROS_UPDATE_ROOT_PRIVATE_KEY_PATH).toBe(keyPath);
          if (outcome === 'throw') throw Error('spawn failed');
          return outcome === 'nonzero' ? 1 : 0;
        } });
        if (['throw', 'invalid'].includes(outcome)) expect(action).toThrow();
        else expect(action()).toBe(outcome === 'nonzero' ? 1 : 0);
        expect(env.CREATOROS_UPDATE_ROOT_PRIVATE_KEY_PEM).toBeUndefined();
        expect(env.CREATOROS_UPDATE_ROOT_PRIVATE_KEY_PATH).toBeUndefined();
        expect(existsSync(keyPath)).toBe(false);
        expect(launched).toBe(outcome !== 'invalid');
      } finally { rmSync(root, { recursive: true, force: true }); }
    });
  }
  it('缺secret或不可信临时目录时不启动构建', () => {
    expect(() => runCIRelease({ env: {}, launch: () => { throw Error('must not launch'); } })).toThrow(/缺少/);
    expect(() => runCIRelease({ env: { RUNNER_TEMP: process.cwd(), CREATOROS_UPDATE_ROOT_PRIVATE_KEY_PEM: 'x' } })).toThrow(/工作区/);
  });
  it('真实固定根校验拒绝错误私钥且不启动构建', () => {
    const root = mkdtempSync(join(tmpdir(), 'ci-key-test-'));
    try { expect(() => runCIRelease({ env: { RUNNER_TEMP: root, CREATOROS_UPDATE_ROOT_PRIVATE_KEY_PEM: 'invalid' } })).toThrow(); }
    finally { rmSync(root, { recursive: true, force: true }); }
  });
  it('已签capsule消费不使用私钥', () => {
    const env = { CREATOROS_SIGNED_SIDECAR_CAPSULE_PATH: '/capsule', CREATOROS_UPDATE_ROOT_PRIVATE_KEY_PEM: 'ignored', CREATOROS_UPDATE_ROOT_PRIVATE_KEY_PATH: 'old' };
    expect(runCIRelease({ env, launch: e => {
      expect(e.CREATOROS_UPDATE_ROOT_PRIVATE_KEY_PEM).toBeUndefined();
      expect(e.CREATOROS_UPDATE_ROOT_PRIVATE_KEY_PATH).toBeUndefined();
      return 0;
    } })).toBe(0);
  });
});

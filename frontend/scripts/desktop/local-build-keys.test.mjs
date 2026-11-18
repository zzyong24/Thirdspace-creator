// @vitest-environment node
import { afterEach, describe, expect, it } from 'vitest';
import { createPublicKey, generateKeyPairSync } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildLocalPackageEnv } from './package-local.mjs';
import { assertVerdictKeyMaterial } from './verdict-key-material.mjs';
import { digestTarball, runSidecarSigning, verifySidecarEnvelope } from './sign-sidecar.mjs';

const homes = [];
const freshHome = () => { const dir = mkdtempSync(join(tmpdir(), 'creatoros-local-build-test-')); homes.push(dir); return dir; };
afterEach(() => homes.splice(0).forEach(dir => rmSync(dir, { recursive: true, force: true })));
const keys = () => { const {privateKey, publicKey} = generateKeyPairSync('ed25519'); return {
  CREATOROS_VERDICT_SIGNING_KEY_B64: privateKey.export({format:'jwk'}).d,
  CREATOROS_VERDICT_PUBKEY_B64: Buffer.from(publicKey.export({format:'jwk'}).x, 'base64url').toString('base64'),
}; };

describe('本地公共入口无需正式凭证', () => {
  it('全新HOME自动生成可签名配对，重复构建稳定复用且不写入仓库', () => {
    const homeDir = freshHome();
    const env = buildLocalPackageEnv({baseEnv:{}, homeDir});
    expect(() => assertVerdictKeyMaterial(env)).not.toThrow();
    expect(env.CREATOROS_LOCAL_PACKAGE).toBe('1');
    expect(env.CREATOROS_LOCAL_SIDECAR_PUBLIC_KEY_B64).toBeTruthy();
    expect(env.CREATOROS_UPDATE_ROOT_PRIVATE_KEY_PATH.startsWith(homeDir)).toBe(true);
    expect(buildLocalPackageEnv({baseEnv:{}, homeDir})).toEqual(env);
    if (process.platform !== 'win32') expect(statSync(env.CREATOROS_UPDATE_ROOT_PRIVATE_KEY_PATH).mode & 0o777).toBe(0o600);
    expect(env.TAURI_SIGNING_PRIVATE_KEY).toBeUndefined();
    expect(env.APPLE_SIGNING_IDENTITY).toBeUndefined();
  });

  it('只有签名seed时推导配对公钥，只有公钥时自动建立新开发配对', () => {
    const pair = keys();
    const env = buildLocalPackageEnv({baseEnv:{CREATOROS_VERDICT_SIGNING_KEY_B64:pair.CREATOROS_VERDICT_SIGNING_KEY_B64}, homeDir:freshHome()});
    expect(env.CREATOROS_VERDICT_PUBKEY_B64).toBe(pair.CREATOROS_VERDICT_PUBKEY_B64);
    const publicOnly = buildLocalPackageEnv({baseEnv:{CREATOROS_VERDICT_PUBKEY_B64:pair.CREATOROS_VERDICT_PUBKEY_B64}, homeDir:freshHome()});
    expect(() => assertVerdictKeyMaterial(publicOnly)).not.toThrow();
  });

  it('半套显式密钥不与旧HOME中另一套材料混拼', () => {
    const homeDir = freshHome();
    const oldPair = keys(); const explicit = keys();
    mkdirSync(join(homeDir,'.creatoros'));
    writeFileSync(join(homeDir,'.creatoros/verdict-signing.key'),oldPair.CREATOROS_VERDICT_SIGNING_KEY_B64);
    writeFileSync(join(homeDir,'.creatoros/verdict-public.key'),oldPair.CREATOROS_VERDICT_PUBKEY_B64);
    const seedOnly = buildLocalPackageEnv({baseEnv:{CREATOROS_VERDICT_SIGNING_KEY_B64:explicit.CREATOROS_VERDICT_SIGNING_KEY_B64},homeDir});
    expect(() => assertVerdictKeyMaterial(seedOnly)).not.toThrow();
    expect(seedOnly.CREATOROS_VERDICT_PUBKEY_B64).toBe(explicit.CREATOROS_VERDICT_PUBKEY_B64);
    const pubOnly = buildLocalPackageEnv({baseEnv:{CREATOROS_VERDICT_PUBKEY_B64:explicit.CREATOROS_VERDICT_PUBKEY_B64},homeDir});
    expect(() => assertVerdictKeyMaterial(pubOnly)).not.toThrow();
    const legacy = buildLocalPackageEnv({baseEnv:{},homeDir});
    expect(legacy).toMatchObject(oldPair);
  });

  it('保留完整既有verdict配对，不将正式根私钥交给本地签名', () => {
    const pair = keys();
    const env = buildLocalPackageEnv({baseEnv:{...pair,CREATOROS_UPDATE_ROOT_PRIVATE_KEY_PATH:'/do-not-read/official.pem'},homeDir:freshHome()});
    expect(env).toMatchObject(pair);
    expect(env.CREATOROS_UPDATE_ROOT_PRIVATE_KEY_PATH).not.toBe('/do-not-read/official.pem');
  });

  it.each([{CREATOROS_RELEASE:'1'},{GITHUB_ACTIONS:'true'}])('正式构建缺钥仍失败且不生成本地根 %j', baseEnv => {
    const homeDir = freshHome();
    expect(() => buildLocalPackageEnv({baseEnv,homeDir})).toThrow();
    expect(existsSync(join(homeDir,'.creatoros','local-build-keys'))).toBe(false);
  });

  it('真实公共环境→签名子进程→104B资源验签，篡改和正式/CI上下文拒绝开发根', () => {
    const homeDir = freshHome();
    const env = buildLocalPackageEnv({baseEnv:{},homeDir});
    const tarball = join(homeDir,'sidecar.tar.gz');
    writeFileSync(tarball,'local-resource-bytes');
    expect(runSidecarSigning({preflight:true,env}).checked).toBe(true);
    runSidecarSigning({tarball,env});
    const root = createPublicKey({key:Buffer.from(env.CREATOROS_LOCAL_SIDECAR_PUBLIC_KEY_B64,'base64'),format:'der',type:'spki'});
    const signature = readFileSync(`${tarball}.sig`);
    expect(verifySidecarEnvelope(signature,digestTarball(tarball),root)).toBe(true);
    const otherRoot = generateKeyPairSync('ed25519').publicKey;
    expect(() => verifySidecarEnvelope(signature,digestTarball(tarball),otherRoot)).toThrow();
    writeFileSync(tarball,'tampered');
    expect(() => verifySidecarEnvelope(signature,digestTarball(tarball),root)).toThrow();
    for (const formal of [{CREATOROS_RELEASE:'1'},{GITHUB_ACTIONS:'true'},{CREATOROS_CHANNEL_PACKAGE_MODE:'release'}]) {
      expect(() => runSidecarSigning({preflight:true,env:{...env,...formal}})).toThrow(/本地|正式|CI/);
    }
  });
});

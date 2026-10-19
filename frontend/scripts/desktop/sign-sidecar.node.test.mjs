import test from 'node:test';
import assert from 'node:assert/strict';
import { createPublicKey, generateKeyPairSync, sign } from 'node:crypto';
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import {
  assertSidecarSigningKey, digestTarball, verifySidecarEnvelope,
  DOMAIN, MAGIC, ROOT_ID, sidecarSigningRequired,
} from './sign-sidecar.mjs';

// 默认测试从不定位或读取真实根私钥；合成私钥只保存在本例自有临时目录。
const publicKeyPath = resolve(import.meta.dirname, '../../branding/trust/creatoros-update-root-20260805.pub.pem');

test('debug无签名要求、所有package与Tauri release必须签', () => {
  assert.equal(sidecarSigningRequired({}), false);
  assert.equal(sidecarSigningRequired({ TAURI_ENV_DEBUG: 'true' }), false);
  for (const env of [{ CREATOROS_RELEASE: '1' }, { CREATOROS_SIDECAR_SIGNING_REQUIRED: '1' }, { TAURI_ENV_DEBUG: 'false' }]) {
    assert.equal(sidecarSigningRequired(env), true);
  }
  // 显式空值在任何文件读取前拒绝，不落入生产私钥默认路径。
  assert.throws(() => assertSidecarSigningKey({ privateKeyPath: '' }), /缺CREATOROS_UPDATE_ROOT_PRIVATE_KEY_PATH/);
});

test('合成钥匙纯envelope验证104B/摘要/rootID域，畸形与旧domain均拒绝', () => {
  const dir = mkdtempSync(join(tmpdir(), 't1273-synthetic-envelope-'));
  try {
    const tarball = join(dir, 'sidecar.tar.gz');
    writeFileSync(tarball, '仅合成算法fixture，不是正式tar');
    const { privateKey, publicKey } = generateKeyPairSync('ed25519');
    const expected = digestTarball(tarball);
    const envelope = Buffer.concat([MAGIC, expected, sign(null, Buffer.concat([DOMAIN, expected]), privateKey)]);
    assert.equal(envelope.length, 104);
    assert.equal(verifySidecarEnvelope(envelope, expected, publicKey), true);
    assert.ok(DOMAIN.includes(Buffer.from(ROOT_ID)));
    const badSignature = Buffer.from(envelope); badSignature[80] ^= 1;
    for (const bad of [envelope.subarray(0, 103), Buffer.concat([envelope, Buffer.from([0])]), badSignature]) {
      assert.throws(() => verifySidecarEnvelope(bad, expected, publicKey));
    }
    const otherDigest = Buffer.from(expected); otherDigest[0] ^= 1;
    assert.throws(() => verifySidecarEnvelope(envelope, otherDigest, publicKey));
    const oldDomain = Buffer.from('CreatorOS/sidecar.tar.gz/BLAKE3/v1\0');
    const old = Buffer.concat([MAGIC, expected, sign(null, Buffer.concat([oldDomain, expected]), privateKey)]);
    assert.throws(() => verifySidecarEnvelope(old, expected, publicKey));
    writeFileSync(tarball, '已被篡改');
    assert.throws(() => verifySidecarEnvelope(envelope, digestTarball(tarball), publicKey));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('固定生产公根拒绝其它公钥/合成私钥，不调用真实根signer', () => {
  const dir = mkdtempSync(join(tmpdir(), 't1273-synthetic-key-rejection-'));
  try {
    const syntheticPrivate = join(dir, 'synthetic-private.pem');
    const { privateKey } = generateKeyPairSync('ed25519');
    writeFileSync(syntheticPrivate, privateKey.export({ type: 'pkcs8', format: 'pem' }), { mode: 0o600 });
    const wrong = join(dir, 'wrong.pub.pem');
    const root = createPublicKey(readFileSync(publicKeyPath));
    const der = Buffer.from(root.export({ type: 'spki', format: 'der' })); der[der.length - 1] ^= 1;
    writeFileSync(wrong, `-----BEGIN PUBLIC KEY-----\n${der.toString('base64')}\n-----END PUBLIC KEY-----\n`);
    // 每次调用显式指定本例生成的路径；生产根私钥默认参数永远不被求值。
    assert.throws(() => assertSidecarSigningKey({ privateKeyPath: syntheticPrivate, publicKeyPath: wrong }), /不是已批准/);
    assert.throws(() => assertSidecarSigningKey({ privateKeyPath: syntheticPrivate, publicKeyPath }), /既有更新信任根不匹配/);
    assert.throws(() => assertSidecarSigningKey({ privateKeyPath: publicKeyPath, publicKeyPath }));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

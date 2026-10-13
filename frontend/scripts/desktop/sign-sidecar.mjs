// T-1273 构建期唯一信任根签名；私钥只由本模块短时读取，绝不传给Rust/sidecar。
import { spawnSync } from 'node:child_process';
import { createPrivateKey, createPublicKey, sign, verify } from 'node:crypto';
import { openSync, readSync, closeSync, readFileSync, writeFileSync, renameSync, rmSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { homedir } from 'node:os';
import { blake3 } from '@noble/hashes/blake3';
export const ROOT_ID = 'creatoros-update-root-20260805-01';
export const MAGIC = Buffer.from('COSB3v1\0');
export const DOMAIN = Buffer.from(`CreatorOS/sidecar.tar.gz/BLAKE3/v1\0${ROOT_ID}\0`);
const FRONTEND = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const ROOT_PATH = resolve(FRONTEND, 'branding/trust/creatoros-update-root-20260805.pub.pem');
// 唯一公钥文件仍为来源；固定已批准指纹拒绝文件被换成新根。
const ROOT_SPKI_B64 = 'MCowBQYDK2VwAyEAf5OQaYD+psAbLRmrIsgibo9mWng0b+3qTdQQhIlJNh4=';
export function sidecarSigningRequired(env = process.env) {
  return env.CREATOROS_RELEASE === '1' || env.CREATOROS_SIDECAR_SIGNING_REQUIRED === '1' || env.TAURI_ENV_DEBUG === 'false';
}
export function assertSidecarSigningKey({ privateKeyPath = process.env.CREATOROS_UPDATE_ROOT_PRIVATE_KEY_PATH ?? resolve(homedir(), '.config/creatoros-release/keys/creatoros-update-root-20260805.pem'), publicKeyPath = ROOT_PATH } = {}) {
  if (!privateKeyPath?.trim()) throw new Error('正式sidecar签名缺CREATOROS_UPDATE_ROOT_PRIVATE_KEY_PATH；请使用既有creatoros-update-root-20260805.pem');
  const root = createPublicKey(readFileSync(publicKeyPath));
  if (root.asymmetricKeyType !== 'ed25519' || root.export({type:'spki',format:'der'}).toString('base64') !== ROOT_SPKI_B64) {
    throw new Error('sidecar公钥不是已批准creatoros-update-root-20260805信任根');
  }
  const key = createPrivateKey(readFileSync(privateKeyPath));
  if (key.asymmetricKeyType !== 'ed25519' || !createPublicKey(key).export({type:'spki',format:'der'}).equals(root.export({type:'spki',format:'der'}))) {
    throw new Error('sidecar签名私钥与既有更新信任根不匹配');
  }
  return { root, key };
}
export function digestTarball(tarball) {
  const hash = blake3.create(); const chunk = Buffer.allocUnsafe(1024 * 1024);
  const fd = openSync(tarball, 'r');
  try { let bytes; while ((bytes = readSync(fd, chunk, 0, chunk.length, null)) > 0) hash.update(chunk.subarray(0, bytes)); }
  finally { closeSync(fd); }
  return Buffer.from(hash.digest());
}
export function verifySidecarEnvelope(envelope, expectedDigest, root) {
  if (envelope.length !== 104 || !envelope.subarray(0,8).equals(MAGIC) || !envelope.subarray(8,40).equals(expectedDigest)) {
    throw new Error('sidecar签名格式或构建摘要不匹配');
  }
  if (!verify(null, Buffer.concat([DOMAIN,expectedDigest]), root, envelope.subarray(40))) throw new Error('sidecar签名校验失败');
  return true;
}
export function signSidecarSync({ tarball, signature = `${tarball}.sig`, ...keyPaths }) {
  const {root,key} = assertSidecarSigningKey(keyPaths);
  const digest = digestTarball(tarball);
  const envelope = Buffer.concat([MAGIC,digest,sign(null,Buffer.concat([DOMAIN,digest]),key)]);
  verifySidecarEnvelope(envelope,digest,root);
  const tmp = `${signature}.${process.pid}.tmp`;
  try { writeFileSync(tmp,envelope,{mode:0o644}); renameSync(tmp,signature); }
  finally { rmSync(tmp,{force:true}); }
  return {bytes:104,digest:digest.toString('hex')};
}

// 构建驱动只调用子进程；只有该专用签名进程读取私钥。
export function runSidecarSigning({ tarball, preflight = false, env = process.env } = {}) {
  const result = spawnSync(process.execPath, [fileURLToPath(import.meta.url),
    ...(preflight ? ['--preflight'] : ['--tarball', tarball])], {
    encoding: 'utf8', env: { CREATOROS_UPDATE_ROOT_PRIVATE_KEY_PATH: env.CREATOROS_UPDATE_ROOT_PRIVATE_KEY_PATH },
  });
  if (result.status !== 0) throw new Error(result.stderr?.trim() || 'sidecar签名进程失败');
  return JSON.parse(result.stdout);
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    if (process.argv.includes('--preflight')) {
      assertSidecarSigningKey(); console.log(JSON.stringify({ rootId: ROOT_ID, checked: true }));
    } else {
      const index = process.argv.indexOf('--tarball');
      if (index < 0 || !process.argv[index+1]) throw new Error('缺少--tarball路径');
      console.log(JSON.stringify(signSidecarSync({tarball: process.argv[index+1]})));
    }
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}

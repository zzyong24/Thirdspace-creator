import test from 'node:test';
import assert from 'node:assert/strict';
import { createPrivateKey,createPublicKey,sign } from 'node:crypto';
import { mkdtempSync,writeFileSync,readFileSync,rmSync } from 'node:fs';
import { join,resolve } from 'node:path';
import { tmpdir,homedir } from 'node:os';
import { assertSidecarSigningKey,signSidecarSync,digestTarball,verifySidecarEnvelope,DOMAIN,MAGIC,ROOT_ID,sidecarSigningRequired } from './sign-sidecar.mjs';
const privateKeyPath=join(homedir(),'.config/creatoros-release/keys/creatoros-update-root-20260805.pem');
const publicKeyPath=resolve(import.meta.dirname, '../../branding/trust/creatoros-update-root-20260805.pub.pem');
test('debug无签名要求、所有package与Tauri release必须签',()=>{
 assert.equal(sidecarSigningRequired({}),false);assert.equal(sidecarSigningRequired({TAURI_ENV_DEBUG:'true'}),false);
 for(const env of [{CREATOROS_RELEASE:'1'},{CREATOROS_SIDECAR_SIGNING_REQUIRED:'1'},{TAURI_ENV_DEBUG:'false'}])assert.equal(sidecarSigningRequired(env),true);
 assert.throws(()=>assertSidecarSigningKey({privateKeyPath:''}),/缺CREATOROS_UPDATE_ROOT_PRIVATE_KEY_PATH/);
});
test('既有更新根签104B、正确摘要和rootID域通过；截短/超长/错构建/改签名/无ID域全部拒绝',()=>{
 const dir=mkdtempSync(join(tmpdir(),'t1273-sign-'));
 try {
  const tarball=join(dir,'sidecar.tar.gz');writeFileSync(tarball,'真实隔离fixture字节，不伪装正式tar');
  const result=signSidecarSync({tarball,privateKeyPath,publicKeyPath});
  assert.equal(result.bytes,104); const envelope=readFileSync(tarball+'.sig');assert.equal(envelope.length,104);
  const root=createPublicKey(readFileSync(publicKeyPath)); const expected=digestTarball(tarball);
  assert.equal(verifySidecarEnvelope(envelope,expected,root),true);assert.ok(DOMAIN.includes(Buffer.from(ROOT_ID)));
  const badSignature=Buffer.from(envelope);badSignature[80]^=1;
  for(const bad of [envelope.subarray(0,103),Buffer.concat([envelope,Buffer.from([0])]),badSignature])assert.throws(()=>verifySidecarEnvelope(bad,expected,root));
  const otherDigest=Buffer.from(expected);otherDigest[0]^=1;assert.throws(()=>verifySidecarEnvelope(envelope,otherDigest,root));
  const oldDomain=Buffer.from('CreatorOS/sidecar.tar.gz/BLAKE3/v1\0');
  const old=Buffer.concat([MAGIC,expected,sign(null,Buffer.concat([oldDomain,expected]),createPrivateKey(readFileSync(privateKeyPath)))]);
  assert.throws(()=>verifySidecarEnvelope(old,expected,root));
  writeFileSync(tarball,'已被篡改');assert.throws(()=>verifySidecarEnvelope(envelope,digestTarball(tarball),root));
 } finally {rmSync(dir,{recursive:true,force:true});}
});
test('其他公钥文件、错误key类型/私钥格式拒绝，不生成新信任根',()=>{
 const dir=mkdtempSync(join(tmpdir(),'t1273-badkey-'));
 try {
  const wrong=join(dir,'wrong.pub.pem');const root=createPublicKey(readFileSync(publicKeyPath));
  const der=Buffer.from(root.export({type:'spki',format:'der'}));der[der.length-1]^=1;
  writeFileSync(wrong,`-----BEGIN PUBLIC KEY-----\n${der.toString('base64')}\n-----END PUBLIC KEY-----\n`);
  assert.throws(()=>assertSidecarSigningKey({privateKeyPath,publicKeyPath:wrong}),/不是已批准/);
  assert.throws(()=>assertSidecarSigningKey({privateKeyPath:publicKeyPath,publicKeyPath}));
 }finally{rmSync(dir,{recursive:true,force:true});}
});

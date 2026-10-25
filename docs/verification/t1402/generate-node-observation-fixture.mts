// 公开合成材料；只调用既有encryptSecret，不读取运行时master/许可/网络。
import {createHash,randomUUID} from 'node:crypto';
import {mkdir,writeFile,readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {encryptSecret,decryptSecret} from '../../../backend/src/secret-crypto.ts';
const sha=(v:string|Buffer)=>createHash('sha256').update(v).digest('hex');
const master=Buffer.from(Array.from({length:32},(_,i)=>i)),bootNonce='11'.repeat(32);
const stableTuple=['creatoros-legacy-upgrade-license-identity-v1','creatoros','SYNTHETIC-T1402-SAVED-CODE','fixture-machine-alpha','TIME',null,null];
const issuedAt='2026-10-23T04:00:00.000Z';
const payload={contractVersion:'creatoros-legacy-upgrade-observation-v1',observationId:randomUUID(),licenseIdentityHash:`sha256:${sha(JSON.stringify(stableTuple))}`,issuedAt,expiresAt:new Date(Date.parse(issuedAt)+730000).toISOString(),bootNonceHash:`sha256:${sha(bootNonce)}`};
const key=createHash('sha256').update(master).update('creatoros-legacy-upgrade-fence-v1','utf8').digest();
const plaintext=JSON.stringify(payload),token=encryptSecret(plaintext,key);
if(decryptSecret(token,key)!==plaintext)throw Error('既有backend封包自检失败');
const output=fileURLToPath(new URL('./fixtures/node-observation-v1.json',import.meta.url));
await mkdir(fileURLToPath(new URL('./fixtures/',import.meta.url)),{recursive:true});
await writeFile(output,JSON.stringify({schemaVersion:'t1402-node-observation-synthetic-v1',provenance:{syntheticOnly:true,actualFunction:'backend/src/secret-crypto.ts encryptSecret',algorithm:'existing AES-256-GCM enc:v1 envelope',runtimeSecretsRead:false,networkCalls:0,sourceSha256:sha(await readFile(fileURLToPath(new URL('../../../backend/src/secret-crypto.ts',import.meta.url))))},syntheticMasterKeyBase64:master.toString('base64'),syntheticBootNonce:bootNonce,stableTuple,stableTupleJson:JSON.stringify(stableTuple),payload,plaintext,observationToken:token,tokenSha256:sha(token)},null,2)+'\n',{flag:'wx'});
process.stdout.write(`${output}\n`);

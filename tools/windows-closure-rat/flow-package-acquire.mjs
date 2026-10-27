// T-1404：当前构建分支的严格传输层；原T-247历史限制保持不变。
import { createHash } from 'node:crypto';
import { createWriteStream, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { Readable, Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { fileURLToPath } from 'node:url';
import { FLOW_REPOSITORY, validateFlowTransferInputs, validateFlowArtifactBinding, validateFlowSigningReceipt } from './flow-package-binding.mjs';
import { sha256File, extractArtifactZip, validateArtifactRedirect, verifyDownloadedArtifact, verifyCapsule, adoptCapsule } from './signed-sidecar-capsule.mjs';
const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
export async function acquireFlowCapsule(env = process.env) {
  const input = validateFlowTransferInputs({runId:env.CREATOROS_CAPSULE_RUN_ID,artifactId:env.CREATOROS_CAPSULE_ARTIFACT_ID,artifactDigest:env.CREATOROS_CAPSULE_ARTIFACT_DIGEST,manifestSHA256:env.CREATOROS_CAPSULE_MANIFEST_SHA256,sourceCommit:env.CREATOROS_CREATOR_RELEASE_COMMIT,transportCommit:env.CREATOROS_CAPSULE_SIGNATURE_COMMIT});
  if (env.GITHUB_SHA !== input.transportCommit) throw Error('公开签名提交不是当前workflow提交');
  const token = env.GH_TOKEN;
  if (!token) throw Error('缺只读Actions token');
  const base = 'https://api.github.com/repos/' + FLOW_REPOSITORY;
  const headers = {Authorization:'Bearer '+token,Accept:'application/vnd.github+json','X-GitHub-Api-Version':'2022-11-28','User-Agent':'CreatorOS-flow-package'};
  const signal = AbortSignal.timeout(20 * 60_000);
  async function json(path) {
    const r = await fetch(base + path, {headers,redirect:'error',signal});
    if (!r.ok) throw Error('GitHub只读请求失败HTTP'+r.status);
    return r.json();
  }
  const run = await json('/actions/runs/'+input.runId);
  const artifact = await json('/actions/artifacts/'+input.artifactId);
  validateFlowArtifactBinding(input, run, artifact);
  const root = join(REPO,'frontend/src-tauri/target/flow-repair-capsule');
  const zip = join(dirname(root),'t1404-artifact-'+input.artifactId+'.zip');
  if (existsSync(root) || existsSync(zip)) throw Error('专属capsule下载位置已存在，拒绝覆盖');
  mkdirSync(dirname(root),{recursive:true});
  const redirect = await fetch(base+'/actions/artifacts/'+input.artifactId+'/zip',{headers,redirect:'manual',signal});
  if (redirect.status !== 302) throw Error('artifact下载API未返回302');
  const location = validateArtifactRedirect(redirect.headers.get('location'));
  // 签名blob地址不附带GitHub token；不把临时地址写入日志或回执。
  const response = await fetch(location,{redirect:'error',signal});
  if (!response.ok || !response.body) throw Error('artifact字节下载失败HTTP'+response.status);
  let bytes=0;
  const limit = new Transform({transform(chunk,encoding,callback){bytes+=chunk.length;callback(bytes>artifact.size_in_bytes?Error('artifact超过已绑定字节数'):null,chunk);}});
  await pipeline(Readable.fromWeb(response.body),limit,createWriteStream(zip,{flags:'wx'}));
  verifyDownloadedArtifact(zip,artifact,input);
  extractArtifactZip(zip,root);
  const manifestPath=join(root,'capsule-manifest.json');
  if (sha256File(manifestPath)!==input.manifestSHA256) throw Error('manifest摘要不符');
  const manifest=JSON.parse(readFileSync(manifestPath,'utf8'));
  const directory='docs/build/t1404/windows-capsule-signatures/'+input.sourceCommit;
  async function content(name) {
    const value=await json('/contents/'+directory+'/'+name+'?ref='+input.transportCommit);
    if(value.type!=='file'||value.encoding!=='base64'||typeof value.content!=='string'||!Number.isSafeInteger(value.size)||value.size>65536)throw Error('公开签名传输必须为小型普通文件');
    const decoded=Buffer.from(value.content.replace(/\s/g,''),'base64');
    if(decoded.length!==value.size)throw Error('公开文件传输字节不符');
    return decoded;
  }
  const receipt=JSON.parse((await content('receipt.json')).toString('utf8'));
  const encoded=(await content('sidecar.tar.gz.sig.b64')).toString('utf8').trim();
  const signature=Buffer.from(encoded,'base64');
  if(signature.toString('base64')!==encoded)throw Error('公开签名base64格式不符');
  validateFlowSigningReceipt(receipt,input,manifest,signature);
  writeFileSync(join(root,'sidecar.tar.gz.sig'),signature,{flag:'wx'});
  verifyCapsule(root,env);
  const adopted=adoptCapsule(root,env);
  const result={...adopted,runId:input.runId,artifactId:input.artifactId,artifactDigest:input.artifactDigest,signatureCommit:input.transportCommit,signatureSHA256:createHash('sha256').update(signature).digest('hex')};
  writeFileSync(join(dirname(root),'t1404-acquisition-receipt.json'),JSON.stringify(result,null,2)+'\n');
  return result;
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  acquireFlowCapsule().then(result=>console.log(JSON.stringify(result))).catch(error=>{console.error(error.message);process.exitCode=1;});
}

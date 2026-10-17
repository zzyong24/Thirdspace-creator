import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {copyFileSync,existsSync,lstatSync,mkdirSync,openSync,readSync,closeSync,writeSync,renameSync,readFileSync,readdirSync,writeFileSync,constants} from 'node:fs';
import {dirname,resolve,relative,sep,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {isDeepStrictEqual} from 'node:util';
import {digestTarball,verifySignedSidecarSync,ROOT_ID} from '../../frontend/scripts/desktop/sign-sidecar.mjs';
import {writeCleanSidecarPolicy,cleanSidecarReusable} from '../../frontend/scripts/desktop/build-sidecar.mjs';
const REPO=resolve(dirname(fileURLToPath(import.meta.url)),'../..');
const FRONTEND=join(REPO,'frontend');
const TARGET=join(FRONTEND,'src-tauri');
const CONTRACT='creatoros-windows-signed-capsule-v1';
const INPUT='.creatoros-build-input.json';
const NODE_NAME='creatoros-server-x86_64-pc-windows-msvc.exe';
const META_KEYS=['contractVersion','sourceCommit','target','ownedDevices','modelBenefits','licenseProject','verdictPublicKeySHA256','configPublicKeySHA256','configKeyId','node','validationLayerSummary'];
export function sha256File(file){const h=createHash('sha256'),fd=openSync(file,'r'),buf=Buffer.allocUnsafe(1024*1024);try{let n;while((n=readSync(fd,buf,0,buf.length,null))>0)h.update(buf.subarray(0,n));}finally{closeSync(fd);}return h.digest('hex');}
function noLinks(file){let p=resolve(file);while(true){if(existsSync(p)&&lstatSync(p).isSymbolicLink())throw Error('capsule路径含链接');const parent=dirname(p);if(parent===p)break;p=parent;}}
function regular(file){noLinks(file);if(!lstatSync(file).isFile()||lstatSync(file).isSymbolicLink())throw Error('capsule输入必须为普通文件');}
function exactKeys(value,keys){if(!value||typeof value!=='object'||Array.isArray(value)||!isDeepStrictEqual(Object.keys(value).sort(),[...keys].sort()))throw Error('capsule字段不闭合');}
function digest(value){return typeof value==='string'&&/^[a-f0-9]{64}$/.test(value);}
export function peTarget(file){regular(file);const fd=openSync(file,'r'),header=Buffer.alloc(64);try{if(readSync(fd,header,0,64,0)!==64||header.toString('ascii',0,2)!=='MZ')throw Error('Node不是PE');const pointer=header.readUInt32LE(60),pe=Buffer.alloc(6);if(readSync(fd,pe,0,6,pointer)!==6||pe.toString('binary',0,4)!=='PE\0\0'||pe.readUInt16LE(4)!==0x8664)throw Error('Node不是Windows x64 PE');return 'win32-x64';}finally{closeSync(fd);}}
export function validateBuildInput(value){
 exactKeys(value,META_KEYS);exactKeys(value.node,['sha256','bytes','target']);exactKeys(value.validationLayerSummary,['sha256','bytes']);
 if(value.contractVersion!==CONTRACT||typeof value.sourceCommit!=='string'||!/^[a-f0-9]{40}$/.test(value.sourceCommit)||value.target!=='win32-x64'||value.ownedDevices!==true||value.modelBenefits!==true||value.licenseProject!=='creatoros'||!digest(value.verdictPublicKeySHA256)||!digest(value.configPublicKeySHA256)||typeof value.configKeyId!=='string'||!/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(value.configKeyId)||!digest(value.node.sha256)||!Number.isSafeInteger(value.node.bytes)||value.node.bytes<64||value.node.target!=='win32-x64'||!digest(value.validationLayerSummary.sha256)||!Number.isSafeInteger(value.validationLayerSummary.bytes)||value.validationLayerSummary.bytes<1||value.validationLayerSummary.bytes>1048576)throw Error('capsule构建身份不合法');
 return value;
}
function publicDigest(env,name){const value=env[name];if(typeof value!=='string'||!value||/\s/.test(value))throw Error('缺公开构建根: '+name);const bytes=Buffer.from(value,'base64url');if(bytes.length!==32||bytes.toString('base64url')!==value.replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,''))throw Error('公开构建根格式错误: '+name);return createHash('sha256').update(bytes).digest('hex');}
function expectedInput(env,node,validationLayerSummary){if(env.CREATOROS_OWNED_DEVICES_ENABLED!=='1'||env.CREATOROS_MODEL_BENEFITS_ENABLED!=='1'||env.CREATOROS_LICENSE_PROJECT_KEY!=='creatoros')throw Error('capsule双门/许可project不符');return validateBuildInput({contractVersion:CONTRACT,sourceCommit:env.CREATOROS_CREATOR_RELEASE_COMMIT,target:'win32-x64',ownedDevices:true,modelBenefits:true,licenseProject:env.CREATOROS_LICENSE_PROJECT_KEY,verdictPublicKeySHA256:publicDigest(env,'CREATOROS_VERDICT_PUBKEY_B64'),configPublicKeySHA256:publicDigest(env,'CREATOROS_GROWTH_CONFIG_PUBLIC_KEY_B64'),configKeyId:env.CREATOROS_GROWTH_CONFIG_KEY_ID,node,validationLayerSummary});}
export function childEnv(env=process.env){const out={};for(const key of ['PATH','Path','SystemRoot','SYSTEMROOT','TMP','TEMP','TMPDIR','LANG','LC_ALL','HOME','USERPROFILE'])if(env[key])out[key]=env[key];return out;}
function run(command,args){const r=spawnSync(command,args,{cwd:REPO,env:childEnv(),encoding:'utf8',maxBuffer:64*1024*1024});if(r.status!==0)throw Error('capsule工具失败: '+(r.stderr?.slice(-1500)||r.status));return r.stdout;}
function sourceCommit(){return run('git',['rev-parse','HEAD']).trim();}
function capsuleDir(value){const p=resolve(value),base=resolve(TARGET,'target');noLinks(p);if(!p.startsWith(base+sep)||relative(base,p).split(sep).some(v=>v==='..')||existsSync(p)&&lstatSync(p).isSymbolicLink())throw Error('capsule目录不在独占target内');return p;}
// Python标准库只读tar或在已验签后解包，禁止链接/设备/重复路径/盘符/逃逸；不接收任何私钥env。
const TAR_INSPECT=String.raw`
import sys,tarfile,hashlib,json,pathlib,os
archive,out=sys.argv[1:3]; seen=set(); files=[]; metadata=None; verdict=None
with tarfile.open(archive,'r|gz') as stream:
 for m in stream:
  raw=m.name
  if raw in ('.','./'): continue
  n=raw[2:] if raw.startswith('./') else raw
  n=n.rstrip('/')
  parts=n.split('/')
  if not n or any(v in ('','..','.') for v in parts) or chr(92) in n or ':' in n or n.startswith('/') or m.issym() or m.islnk() or not (m.isdir() or m.isfile()): raise ValueError('TAR_UNSAFE_MEMBER')
  folded=n.casefold()
  if folded in seen: raise ValueError('TAR_DUPLICATE_MEMBER')
  seen.add(folded)
  if any(v in ('node_modules','.git','.ssh') for v in parts) or parts[-1] in ('.env','.npmrc','.netrc','id_rsa','id_ed25519'): raise ValueError('TAR_FORBIDDEN_MEMBER')
  dest=pathlib.Path(out,*parts) if out else None
  if m.isdir():
   if dest: dest.mkdir(parents=True,exist_ok=True)
   continue
  h=hashlib.sha256(); chunks=[]; src=stream.extractfile(m)
  collect=n in ('.creatoros-build-input.json','frontend/.next/server/verdict-verify-key.json')
  if collect and m.size>65536: raise ValueError('TAR_METADATA_TOO_LARGE')
  if dest: dest.parent.mkdir(parents=True,exist_ok=True); fd=open(dest,'xb')
  else: fd=None
  try:
   while True:
    b=src.read(1024*1024)
    if not b: break
    h.update(b)
    if collect: chunks.append(b)
    if fd: fd.write(b)
  finally:
   if fd: fd.close()
  files.append({'path':n,'bytes':m.size,'sha256':h.hexdigest()})
  if n=='.creatoros-build-input.json': metadata=json.loads(b''.join(chunks))
  if n=='frontend/.next/server/verdict-verify-key.json': verdict=json.loads(b''.join(chunks))
print(json.dumps({'files':files,'buildInput':metadata,'verdictPublicKey':verdict},ensure_ascii=False))
`;
export function inspectTar(archive,output=''){regular(archive);return JSON.parse(run(process.platform==='win32'?'python':'python3',['-c',TAR_INSPECT,archive,output]));}
function verifyTreeRecord(record,input){validateBuildInput(input);if(!isDeepStrictEqual(record.buildInput,input))throw Error('tar内已签构建身份不符');if(record.verdictPublicKey?.algorithm!=='ed25519'||publicDigest({KEY:record.verdictPublicKey?.publicKeyB64},'KEY')!==input.verdictPublicKeySHA256)throw Error('tar内实际verdict公开根不符');const summary=record.files.find(f=>f.path==='.creatoros-validation-layer-summary.json');if(!summary||summary.sha256!==input.validationLayerSummary.sha256||summary.bytes!==input.validationLayerSummary.bytes)throw Error('原始summary不在tar已签覆盖中');const node=record.files.find(f=>f.path==='cli/node.exe');if(!node||node.sha256!==input.node.sha256||node.bytes!==input.node.bytes)throw Error('tar内Node与已签身份不符');if(!record.files.some(f=>f.path==='THIRD_PARTY_NOTICES.md'))throw Error('缺许可资源');if(!record.files.some(f=>f.path==='frontend/worker-dependency-map.json'))throw Error('缺Worker图');}
export function prepareCapsule(output,env=process.env){
 if(process.platform!=='win32'||process.arch!=='x64')throw Error('仅Windows x64准备最终capsule');
 if(env.CREATOROS_SIDECAR_SIGNING_REQUIRED!=='1'||env.CREATOROS_UPDATE_ROOT_PRIVATE_KEY_PATH)throw Error('准备态要求发布CSP且不得接收根私钥路径');
 const root=capsuleDir(output);if(existsSync(root))throw Error('capsule目标已存在');mkdirSync(root,{recursive:true});
 const runtime=join(TARGET,'sidecar'),node=join(TARGET,'binaries',NODE_NAME),summary=join(REPO,'tools/windows-closure-rat/out/closure/layer-summary.json');regular(summary);validateLayerSummary(JSON.parse(readFileSync(summary)));peTarget(node);const input=expectedInput(env,{sha256:sha256File(node),bytes:lstatSync(node).size,target:'win32-x64'},{sha256:sha256File(summary),bytes:lstatSync(summary).size});if(sourceCommit()!==input.sourceCommit)throw Error('准备源码commit不符');
 const walk=dir=>{for(const e of readdirSync(dir)){const p=join(dir,e),st=lstatSync(p);if(st.isSymbolicLink()||e==='node_modules'||e==='.git'||e==='.ssh'||['.env','.npmrc','.netrc','id_rsa','id_ed25519'].includes(e))throw Error('准备态含禁止成员');if(st.isDirectory())walk(p);else if(!st.isFile())throw Error('准备态非普通成员');}};walk(runtime);
 if(sha256File(join(runtime,'cli/node.exe'))!==input.node.sha256)throw Error('CLI/外置Node不一致');
 const notices=join(REPO,'frontend/src-tauri/THIRD_PARTY_NOTICES.md');regular(notices);const stagedNotice=join(runtime,'THIRD_PARTY_NOTICES.md');if(existsSync(stagedNotice)){regular(stagedNotice);if(sha256File(stagedNotice)!==sha256File(notices))throw Error('许可资源与源码不符');}else copyFileSync(notices,stagedNotice,constants.COPYFILE_EXCL);
 writeCleanSidecarPolicy(runtime,env);if(!cleanSidecarReusable(runtime))throw Error('clean来源未成立');
 copyFileSync(summary,join(runtime,'.creatoros-validation-layer-summary.json'),constants.COPYFILE_EXCL);
 writeFileSync(join(runtime,INPUT),JSON.stringify(input,null,2)+'\n');copyFileSync(node,join(root,NODE_NAME),constants.COPYFILE_EXCL);
 const tar=join(root,'sidecar.tar.gz');run(join(env.SystemRoot??'C:\\Windows','System32/tar.exe'),['-czf',tar,'-C',runtime,'.']);
 const record=inspectTar(tar);verifyTreeRecord(record,input);
 const inventory=JSON.stringify(record.files,null,2)+'\n';writeFileSync(join(root,'runtime-inventory.json'),inventory);
 const manifest={contractVersion:CONTRACT,status:'unsigned-not-distributable',buildInput:input,rootId:ROOT_ID,tar:{sha256:sha256File(tar),blake3:digestTarball(tar).toString('hex'),bytes:lstatSync(tar).size},inventorySHA256:createHash('sha256').update(inventory).digest('hex')};
 writeFileSync(join(root,'capsule-manifest.json'),JSON.stringify(manifest,null,2)+'\n');return manifest;
}
export function verifyTarIdentity(tar,identity){regular(tar);if(!identity||!digest(identity.sha256)||!Number.isSafeInteger(identity.bytes)||lstatSync(tar).size!==identity.bytes||sha256File(tar)!==identity.sha256)throw Error('capsule tar SHA/字节不符');}
export function verifyExternalNode(node,identity){if(!identity||peTarget(node)!==identity.target||lstatSync(node).size!==identity.bytes||sha256File(node)!==identity.sha256)throw Error('外置Node与tar内已签身份不符');}
export function verifyCapsule(directory,env=process.env){
 const root=capsuleDir(directory),manifestPath=join(root,'capsule-manifest.json');regular(manifestPath);const m=JSON.parse(readFileSync(manifestPath));exactKeys(m,['contractVersion','status','buildInput','rootId','tar','inventorySHA256']);exactKeys(m.tar,['sha256','blake3','bytes']);validateBuildInput(m.buildInput);
 if(m.contractVersion!==CONTRACT||m.status!=='unsigned-not-distributable'||m.rootId!==ROOT_ID||!digest(m.tar.sha256)||!digest(m.tar.blake3)||!Number.isSafeInteger(m.tar.bytes)||m.tar.bytes<1||!digest(m.inventorySHA256))throw Error('capsule清单不合法');
 const tar=join(root,'sidecar.tar.gz');verifyTarIdentity(tar,m.tar);
 const signed=verifySignedSidecarSync({tarball:tar});if(signed.digest!==m.tar.blake3)throw Error('capsule BLAKE3不符');
 const expected=expectedInput(env,m.buildInput.node,m.buildInput.validationLayerSummary);if(!isDeepStrictEqual(expected,m.buildInput)||sourceCommit()!==m.buildInput.sourceCommit)throw Error('已签source/开关/公开根不符');
 const node=join(root,NODE_NAME);verifyExternalNode(node,m.buildInput.node);
 const record=inspectTar(tar);verifyTreeRecord(record,m.buildInput);
 regular(join(root,'runtime-inventory.json'));
 if(sha256File(join(root,'runtime-inventory.json'))!==m.inventorySHA256||!isDeepStrictEqual(JSON.parse(readFileSync(join(root,'runtime-inventory.json'))),record.files))throw Error('运行成员清单不符');
 return {root,manifest:m,tar,signature:tar+'.sig',node};
}
export function adoptCapsule(directory,env=process.env){
 const c=verifyCapsule(directory,env),runtime=join(TARGET,'sidecar'),bin=join(TARGET,'binaries');
 if(existsSync(runtime)||existsSync(join(TARGET,'sidecar.tar.gz'))||existsSync(join(TARGET,'sidecar.tar.gz.sig'))||existsSync(join(bin,NODE_NAME)))throw Error('消费目标已有文件，拒覆盖');
 mkdirSync(runtime,{recursive:true});inspectTar(c.tar,runtime);if(!cleanSidecarReusable(runtime))throw Error('已签runtime clean来源不符');mkdirSync(bin,{recursive:true});copyFileSync(c.node,join(bin,NODE_NAME),constants.COPYFILE_EXCL);copyFileSync(c.tar,join(TARGET,'sidecar.tar.gz'),constants.COPYFILE_EXCL);copyFileSync(c.signature,join(TARGET,'sidecar.tar.gz.sig'),constants.COPYFILE_EXCL);
 return {status:'signed-capsule-adopted',sourceCommit:c.manifest.buildInput.sourceCommit,tarSHA256:c.manifest.tar.sha256,rootId:ROOT_ID};
}
export function verifyAdoptedCapsule(directory,env=process.env){const c=verifyCapsule(directory,env);for(const [actual,expected]of [[join(TARGET,'sidecar.tar.gz'),c.manifest.tar.sha256],[join(TARGET,'sidecar.tar.gz.sig'),sha256File(c.signature)],[join(TARGET,'binaries',NODE_NAME),c.manifest.buildInput.node.sha256]]){regular(actual);if(sha256File(actual)!==expected)throw Error('包装输入与已签capsule不符');}const runtime=join(TARGET,'sidecar');if(!cleanSidecarReusable(runtime))throw Error('包装runtime不是已签clean来源');const expected=JSON.parse(readFileSync(join(c.root,'runtime-inventory.json')));const actual=[];const visit=(dir)=>{for(const name of readdirSync(dir)){const path=join(dir,name),st=lstatSync(path);if(st.isSymbolicLink())throw Error('包装runtime含链接');if(st.isDirectory())visit(path);else{regular(path);actual.push({path:relative(runtime,path).split(sep).join('/'),bytes:st.size,sha256:sha256File(path)});}}};visit(runtime);const sort=a=>a.sort((x,y)=>x.path.localeCompare(y.path));if(!isDeepStrictEqual(sort(actual),sort(expected)))throw Error('包装runtime与已签成员不符');return c.manifest;}
export function validateLayerSummary(value){
 if(!value||value.schemaVersion!==1||value.target!=='win32-x64'||value.nodeModulesDirectories!==0||value.runtime?.symlinks!==0||!Number.isSafeInteger(value.runtime?.files)||value.runtime.files<1||!Number.isSafeInteger(value.core?.files)||value.core.files<1)throw Error('原构建summary结构不符');return value;
}
const CONTROL_PATHS=[
 'tools/windows-closure-rat/runtime-smoke.mjs','tools/windows-closure-rat/render-probe-policy.mjs','tools/windows-closure-rat/worker-smoke.mjs','tools/windows-closure-rat/runtime-diagnostics.mjs',
 'frontend/scripts/desktop/verdict-key-material.mjs','frontend/scripts/desktop/execution-worker-runtime.mjs','frontend/scripts/desktop/timeout-policy.mjs','frontend/scripts/desktop/runtime-inventory.mjs',
];
export function validationEnv(env,runtime){
 const out=childEnv(env);delete out.HOME;delete out.USERPROFILE;for(const key of ['CREATOROS_VERDICT_SIGNING_KEY_B64','CREATOROS_VERDICT_PUBKEY_B64']){if(!env[key])throw Error('缺既有本地smoke许可材料');out[key]=env[key];}
 return {...out,CREATOROS_RUNTIME_ROOT:runtime,CREATOROS_EXPECTED_PACKAGE_BRAND_NAME:'CreatorOS',CREATOROS_CLIENT_CONFIG_PULL_ENABLED:'0',NODE_ENV:'production',CI:'1'};
}
// 只验证的外层hook：原resolver返回后核bare/nested/native实际文件；不改其权限或字节。
export const VALIDATION_GUARD=String.raw`
const fs=require('node:fs'),path=require('node:path'),{builtinModules,registerHooks}=require('node:module'),{fileURLToPath}=require('node:url');
const root=fs.realpathSync(process.env.CREATOROS_RUNTIME_ROOT),trace=process.env.CREATOROS_RUNTIME_PATH_TRACE;
const inside=p=>{const r=path.relative(root,p);return r===''||r!=='..'&&!r.startsWith('..'+path.sep)&&!path.isAbsolute(r);};
const builtins=new Set([...builtinModules,...builtinModules.map(x=>'node:'+x)]);
registerHooks({resolve(specifier,context,next){const result=next(specifier,context);if(builtins.has(specifier))return result;
 const bare=!specifier.startsWith('.')&&!path.isAbsolute(specifier)&&!specifier.startsWith('file:');
 const parent=context.parentURL?.startsWith('file:')?fileURLToPath(context.parentURL):null;
 if(bare||parent&&inside(parent)){
  if(!result.url.startsWith('file:'))throw Error('RUNTIME_NONFILE_RESOLUTION');
  const actual=fs.realpathSync(fileURLToPath(result.url));if(!inside(actual))throw Error('RUNTIME_DEVELOPMENT_DEPENDENCY:'+specifier);
  fs.appendFileSync(trace,JSON.stringify({specifier,parent,resolved:actual})+'\n');
 }
 return result;
}});
`;
export function restoreSmokeLayout(runtime,node,input){
 verifyExternalNode(node,input.node);const summary=join(runtime,'.creatoros-validation-layer-summary.json');verifyTarIdentity(summary,input.validationLayerSummary);validateLayerSummary(JSON.parse(readFileSync(summary)));
 const nodeTarget=join(runtime,'layers/core/bin/creatoros-server.exe');mkdirSync(dirname(nodeTarget),{recursive:true});copyFileSync(node,nodeTarget,constants.COPYFILE_EXCL);copyFileSync(summary,join(runtime,'layer-summary.json'),constants.COPYFILE_EXCL);verifyExternalNode(nodeTarget,input.node);return nodeTarget;
}
function assertNoNodeModulesAncestors(runtime){let path=resolve(runtime);while(true){if(existsSync(join(path,'node_modules')))throw Error('验证副本祖先存在可借node_modules');const parent=dirname(path);if(parent===path)break;path=parent;}}
function scanSmokeTree(root) {
  let files=0,bytes=0;
  const visit=dir=>{for(const name of readdirSync(dir)){const path=join(dir,name),st=lstatSync(path);if(st.isSymbolicLink()||name==='node_modules')throw Error('验证副本存在链接/node_modules');if(st.isDirectory())visit(path);else{regular(path);files++;bytes+=st.size;}}};
  visit(root);return {files,bytes,symlinks:0,nodeModulesDirectories:0};
}
const TWO_PARENT_PROBE=String.raw`
const fs=require('node:fs'),path=require('node:path'),{createRequire}=require('node:module'),{createHash}=require('node:crypto');
const root=fs.realpathSync(process.env.CREATOROS_RUNTIME_ROOT),req=createRequire(path.join(root,'frontend/runtime/execution-worker.cjs'));
const checked=file=>{const actual=fs.realpathSync(file),r=path.relative(root,actual);if(r==='..'||r.startsWith('..'+path.sep)||path.isAbsolute(r))throw Error('PROBE_OUTSIDE_RUNTIME');return {path:actual,sha256:createHash('sha256').update(fs.readFileSync(actual)).digest('hex')};};
(async()=>{const results=[];
 for(const [name,version] of [['mammoth','3.10.1'],['@openclaw/fs-safe','3.10.2']]){
  const entry=req.resolve(name),caller=createRequire(entry),zipFile=caller.resolve('jszip'),Zip=caller('jszip');req(name);
  if(Zip.version!==version)throw Error('CALLER_ZIP_VERSION_MISMATCH');
  const zip=new Zip();zip.file('probe.txt','真实随包ZIP中文消费');const bytes=await zip.generateAsync({type:'nodebuffer'});const loaded=await Zip.loadAsync(bytes);if(await loaded.file('probe.txt').async('string')!=='真实随包ZIP中文消费')throw Error('ZIP_ROUNDTRIP_FAILED');
  const result={name,entry:checked(entry),zip:checked(zipFile),version,roundtrip:true};
  if(name==='@openclaw/fs-safe'){const native='@openclaw/fs-safe-win32-x64-msvc';const nativeFile=caller.resolve(native);caller(native);result.native=checked(nativeFile);}
  results.push(result);
 }
 console.log(JSON.stringify(results));
})().catch(e=>{console.error(e);process.exitCode=1;});
`;
export function smokeCapsule(directory,env=process.env) {
  if(process.platform!=='win32'||process.arch!=='x64')throw Error('同tar消费仅在真实Windows x64执行');
  const c=verifyCapsule(directory,env);verifyAdoptedCapsule(directory,env);
  const control=join(REPO,'.t247-validation-control'),commit=env.CREATOROS_CAPSULE_VALIDATION_CONTROL_COMMIT;
  if(typeof commit!=='string'||!/^[a-f0-9]{40}$/.test(commit)||run('git',['-C',control,'rev-parse','HEAD']).trim()!==commit)throw Error('控制测试commit不符');
  const controlFiles={};
  for(const path of CONTROL_PATHS){
    const actual=join(control,path);regular(actual);
    const git=spawnSync('git',['-C',control,'show',commit+':'+path],{env:{...childEnv(),GIT_NO_LAZY_FETCH:'1',GIT_TERMINAL_PROMPT:'0'},maxBuffer:4*1024*1024});
    if(git.status!==0||createHash('sha256').update(git.stdout).digest('hex')!==sha256File(actual))throw Error('控制测试blob不符');
    controlFiles[path]=sha256File(actual);
  }
  if(!env.RUNNER_TEMP)throw Error('缺独占runner temp');
  const workspace=resolve(env.RUNNER_TEMP,'t247-signed-runtime-smoke-'+c.manifest.tar.sha256.slice(0,16));noLinks(workspace);
  if(workspace.startsWith(REPO+sep)||existsSync(workspace))throw Error('smoke workspace不独占');
  const runtime=join(workspace,'tools/windows-closure-rat/out/runtime');mkdirSync(runtime,{recursive:true});inspectTar(c.tar,runtime);
  const node=restoreSmokeLayout(runtime,c.node,c.manifest.buildInput);assertNoNodeModulesAncestors(runtime);
  const scan=scanSmokeTree(runtime),originalSummary=JSON.parse(readFileSync(join(runtime,'layer-summary.json')));
  const guard=join(workspace,'validation-path-guard.cjs'),trace=join(workspace,'runtime-paths.jsonl');
  writeFileSync(guard,VALIDATION_GUARD,{flag:'wx'});writeFileSync(trace,'',{flag:'wx'});
  const system=childEnv(env);delete system.HOME;delete system.USERPROFILE;
  const globals=spawnSync(node,['-p',"JSON.stringify(require('node:module').globalPaths)"],{cwd:workspace,env:system,encoding:'utf8'});
  if(globals.status!==0)throw Error('随包Node全局路径probe失败');
  for(const path of JSON.parse(globals.stdout)){if(existsSync(path))throw Error('随包Node存在外部全局依赖目录');}
  const before={tar:sha256File(c.tar),signature:sha256File(c.signature),node:sha256File(c.node)};
  const report={status:'running',productSource:c.manifest.buildInput.sourceCommit,controlCommit:commit,controlFiles,workspace,tarSHA256:c.manifest.tar.sha256,before,currentValidationTree:scan,originalBuildSummary:originalSummary};
  const resultFile=join(TARGET,'target/t247-runtime-consumer-result.json');
  const save=()=>writeFileSync(resultFile,JSON.stringify(report,null,2)+String.fromCharCode(10));save();
  const redact=text=>String(text??'').split(env.CREATOROS_VERDICT_SIGNING_KEY_B64||'__unused__').join('<local-smoke-verdict-key>');
  const invoke=(name,args,child)=>{
    const result=spawnSync(node,args,{cwd:workspace,env:child,encoding:'utf8',maxBuffer:64*1024*1024});
    writeFileSync(join(workspace,name+'.stdout.log'),redact(result.stdout));writeFileSync(join(workspace,name+'.stderr.log'),redact(result.stderr));
    if(result.status!==0)throw Error(name+'失败，release被阻断；见本轮独占验证日志');
    return result.stdout;
  };
  try {
    const probeEnv={...system,CREATOROS_RUNTIME_ROOT:runtime,CREATOROS_RUNTIME_PATH_TRACE:trace};
    const preload=['--require',join(runtime,'frontend/creatoros-module-resolver.cjs'),'--require',guard];
    const output=invoke('two-parent',[...preload,'-e',TWO_PARENT_PROBE],probeEnv);
    report.twoParentProbe=JSON.parse(output.trim().split(/\r?\n/).at(-1));save();
    // 仅原测试驱动获得既有本地verdict材料；原工具在真正Next/Worker前剥除。
    const child=validationEnv(env,runtime);child.CREATOROS_RUNTIME_PATH_TRACE=trace;
    invoke('smoke',[...preload,join(control,'tools/windows-closure-rat/runtime-smoke.mjs'),'tools/windows-closure-rat/out/runtime'],child);
    report.status='passed';
  } catch(error) {
    report.status='failed';report.error=error.message;throw error;
  } finally {
    report.after={tar:sha256File(c.tar),signature:sha256File(c.signature),node:sha256File(c.node)};
    report.pathTraceSHA256=sha256File(trace);
    try {
      verifyAdoptedCapsule(directory,env);
      if(!isDeepStrictEqual(before,report.after))throw Error('smoke改变正式tar/sig/Node，release被阻断');
    } catch(error) {
      report.status='failed';report.integrityError=error.message;throw error;
    } finally { save(); }
  }
  return report;
}
// API目的地、仓库和签名传输路径固定；token仅发GitHub，不进回执/子进程。
const REPOSITORY='zzyong24/Thirdspace-creator';
const BRANCH='codex/t247-windows-e315-build-20261017';
const ARTIFACT_NAME='t247-unsigned-windows-capsule';
export function validateTransferInputs(env){
 const value={runId:env.CREATOROS_CAPSULE_RUN_ID,artifactId:env.CREATOROS_CAPSULE_ARTIFACT_ID,artifactDigest:env.CREATOROS_CAPSULE_ARTIFACT_DIGEST,manifestSHA256:env.CREATOROS_CAPSULE_MANIFEST_SHA256,sourceCommit:env.CREATOROS_CREATOR_RELEASE_COMMIT,transportCommit:env.CREATOROS_CAPSULE_SIGNATURE_COMMIT};
 for(const k of ['runId','artifactId'])if(typeof value[k]!=='string'||!/^[1-9][0-9]{0,19}$/.test(value[k])||!Number.isSafeInteger(Number(value[k])))throw Error('固定artifact ID不合法');
 for(const k of ['artifactDigest','manifestSHA256'])if(!digest(value[k]))throw Error('固定artifact摘要不合法');
 for(const k of ['sourceCommit','transportCommit'])if(typeof value[k]!=='string'||!/^[a-f0-9]{40}$/.test(value[k]))throw Error('固定source/签名commit不合法');
 return value;
}
export function validateArtifactBinding(input,run,artifact){
 if(run.id!==Number(input.runId)||run.head_sha!==input.sourceCommit||run.head_branch!==BRANCH||run.event!=='workflow_dispatch'||run.path!=='.github/workflows/desktop-release.yml'||run.status!=='completed'||run.conclusion!=='success'||run.repository?.full_name!==REPOSITORY)throw Error('准备run来源不符');
 if(artifact.id!==Number(input.artifactId)||artifact.name!==ARTIFACT_NAME||artifact.expired!==false||artifact.workflow_run?.id!==Number(input.runId)||artifact.workflow_run?.head_sha!==input.sourceCommit||artifact.digest!=='sha256:'+input.artifactDigest||!Number.isSafeInteger(artifact.size_in_bytes)||artifact.size_in_bytes<1||artifact.size_in_bytes>8*1024**3)throw Error('固定artifact来源不符');
}
export function validateSigningReceipt(receipt,input,manifest,signature){
 exactKeys(receipt,['contractVersion','sourceCommit','runId','artifactId','artifactDigest','manifestSHA256','tarSHA256','tarBLAKE3','tarBytes','node','rootId','signatureSHA256']);
 if(receipt.contractVersion!=='creatoros-windows-sidecar-signature-v1'||receipt.sourceCommit!==input.sourceCommit||receipt.runId!==input.runId||receipt.artifactId!==input.artifactId||receipt.artifactDigest!==input.artifactDigest||receipt.manifestSHA256!==input.manifestSHA256||receipt.tarSHA256!==manifest.tar.sha256||receipt.tarBLAKE3!==manifest.tar.blake3||receipt.tarBytes!==manifest.tar.bytes||!isDeepStrictEqual(receipt.node,manifest.buildInput.node)||receipt.rootId!==ROOT_ID||signature.length!==104||receipt.signatureSHA256!==createHash('sha256').update(signature).digest('hex'))throw Error('公共签名回执绑定不符');
}
async function githubJson(path,token){
 const r=await fetch('https://api.github.com/repos/'+REPOSITORY+path,{headers:{Authorization:'Bearer '+token,Accept:'application/vnd.github+json','X-GitHub-Api-Version':'2022-11-28'},redirect:'error',signal:AbortSignal.timeout(60000)});
 if(!r.ok)throw Error('固定GitHub读取失败HTTP'+r.status);
 return r.json();
}
function contentBytes(value){if(value.type!=='file'||value.encoding!=='base64'||typeof value.content!=='string'||value.size>65536)throw Error('签名传递不是GitHub普通文件');return Buffer.from(value.content.replace(/\s/g,''),'base64');}
const ZIP_EXTRACT=String.raw`
import sys,zipfile,pathlib,stat
archive,out=sys.argv[1:3]
allowed={'sidecar.tar.gz':6*1024**3,'creatoros-server-x86_64-pc-windows-msvc.exe':256*1024**2,'runtime-inventory.json':32*1024**2,'capsule-manifest.json':65536}
with zipfile.ZipFile(archive) as z:
 entries=z.infolist()
 if len(entries)!=4 or set(m.filename for m in entries)!=set(allowed): raise ValueError('CAPSULE_ZIP_MEMBERS')
 for m in entries:
  mode=m.external_attr>>16
  if m.is_dir() or stat.S_ISLNK(mode) or (stat.S_IFMT(mode) not in (0,stat.S_IFREG)) or m.file_size>allowed[m.filename] or m.file_size<1: raise ValueError('CAPSULE_ZIP_TYPE_SIZE')
 pathlib.Path(out).mkdir(parents=True,exist_ok=False)
 for m in entries:
  with z.open(m) as src, open(pathlib.Path(out,m.filename),'xb') as fd:
   while True:
    b=src.read(1024*1024)
    if not b: break
    fd.write(b)
print('CAPSULE_ZIP_EXTRACTED')
`;
export function extractArtifactZip(archive,directory){regular(archive);noLinks(directory);if(existsSync(directory))throw Error('下载capsule目录已存在');return run(process.platform==='win32'?'python':'python3',['-c',ZIP_EXTRACT,archive,directory]).trim();}
export function validateArtifactRedirect(value){const u=new URL(value);if(u.protocol!=='https:'||u.username||u.password||u.port||!(u.hostname.endsWith('.blob.core.windows.net')||u.hostname.endsWith('.actions.githubusercontent.com')))throw Error('artifact重定向目的地不符');return u;}
export function verifyDownloadedArtifact(zip,artifact,input){regular(zip);if(lstatSync(zip).size!==artifact.size_in_bytes||sha256File(zip)!==input.artifactDigest)throw Error('artifact实际完整ZIP SHA/字节不符');}
async function downloadArtifact(input,artifact,root,token){
 const zip=join(dirname(root),'t247-artifact-'+input.artifactId+'.zip');noLinks(zip);if(existsSync(zip)||existsSync(root))throw Error('固定下载目标已存在');mkdirSync(dirname(root),{recursive:true});
 const signal=AbortSignal.timeout(1200000);
 const redirect=await fetch('https://api.github.com/repos/'+REPOSITORY+'/actions/artifacts/'+input.artifactId+'/zip',{headers:{Authorization:'Bearer '+token,Accept:'application/vnd.github+json','X-GitHub-Api-Version':'2022-11-28'},redirect:'manual',signal});
 if(redirect.status!==302)throw Error('artifact下载API未返回302');const url=validateArtifactRedirect(redirect.headers.get('location'));
 // 预签名blob URL不接Authorization；任何后续redirect直接拒绝。
 const response=await fetch(url,{redirect:'error',signal});if(response.status!==200||!response.body)throw Error('artifact完整下载失败HTTP'+response.status);
 const declared=response.headers.get('content-length');if(declared!==null&&Number(declared)!==artifact.size_in_bytes)throw Error('artifact响应长度不符');
 const fd=openSync(zip,'wx');let bytes=0;try{for await(const chunk of response.body){bytes+=chunk.length;if(bytes>artifact.size_in_bytes)throw Error('artifact超过固定字节');let offset=0;while(offset<chunk.length)offset+=writeSync(fd,chunk,offset,chunk.length-offset);}}finally{closeSync(fd);}
 verifyDownloadedArtifact(zip,artifact,input);
 extractArtifactZip(zip,root);
}
export async function acquireSignature(directory,env=process.env){
 const input=validateTransferInputs(env),root=capsuleDir(directory),token=env.GH_TOKEN;if(typeof token!=='string'||!token)throw Error('缺既有GitHub读取token');
 const run=await githubJson('/actions/runs/'+input.runId,token),artifact=await githubJson('/actions/artifacts/'+input.artifactId,token);validateArtifactBinding(input,run,artifact);await downloadArtifact(input,artifact,root,token);
 const manifestFile=join(root,'capsule-manifest.json');regular(manifestFile);if(sha256File(manifestFile)!==input.manifestSHA256)throw Error('实际capsule清单不符');const m=JSON.parse(readFileSync(manifestFile));
 if(m.buildInput?.sourceCommit!==input.sourceCommit||!digest(m.tar?.sha256))throw Error('实际capsule source不符');
 const base='/contents/docs/build/t247/windows-capsule-signatures/'+m.tar.sha256+'/';
 const sigText=contentBytes(await githubJson(base+'sidecar.sig.base64?ref='+input.transportCommit,token)).toString('utf8').trim();
 const signature=Buffer.from(sigText,'base64');if(signature.toString('base64')!==sigText||signature.length!==104)throw Error('公共签名不是canonical104B');
 const receipt=JSON.parse(contentBytes(await githubJson(base+'signing-receipt.json?ref='+input.transportCommit,token)));
 validateSigningReceipt(receipt,input,m,signature);
 const path=join(root,'sidecar.tar.gz.sig');writeFileSync(path,signature,{flag:'wx'});verifyCapsule(root,env);
 return {status:'fixed-signature-verified',sourceCommit:input.sourceCommit,tarSHA256:m.tar.sha256,rootId:ROOT_ID,signatureSHA256:receipt.signatureSHA256};
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const [mode,dir]=process.argv.slice(2);let result;if(mode==='smoke')result=smokeCapsule(dir);else if(mode==='acquire')result=await acquireSignature(dir);else if(mode==='prepare')result=prepareCapsule(dir);else if(mode==='verify')result=verifyCapsule(dir).manifest;else if(mode==='adopt')result=adoptCapsule(dir);else throw Error('capsule模式无效');console.log(JSON.stringify(result));
}

// T1300 专用已审构建/验证 controller；只运行已绑定的新候选sidecar，不启动原生壳。
import fs from 'node:fs';
import path from 'node:path';
import net from 'node:net';
import crypto from 'node:crypto';
import {spawn} from 'node:child_process';
import {pathToFileURL} from 'node:url';
import {loadCompletedOwnedFixture,copyCompletedOwnedFixture,verifyOriginalUnchanged,fixtureKeyBytes} from './owned-fixture.mjs';
const [action,bindingArg,fixtureFlag,fixtureArg]=process.argv.slice(2);
if(fixtureFlag!=='--completed-owned-fixture'||!fixtureArg)throw Error('EXPLICIT_COMPLETED_OWNED_FIXTURE_REQUIRED');
const fixture=loadCompletedOwnedFixture(fixtureArg);
if(action!=='--launch'||!bindingArg)throw Error('EXPLICIT_CANDIDATE_BINDING_REQUIRED');
const bindingPath=fs.realpathSync(bindingArg),b=JSON.parse(fs.readFileSync(bindingPath,'utf8'));
if(b.schema!=='t1300-production-candidate/v1'||b.task!=='T-1300')throw Error('CANDIDATE_BINDING_SCHEMA');
const sha=file=>{const h=crypto.createHash('sha256');return new Promise((ok,bad)=>{const s=fs.createReadStream(file);s.on('data',c=>h.update(c));s.on('error',bad);s.on('end',()=>ok(h.digest('hex')));});};
for(const row of b.launchFiles){const file=path.resolve(b.sidecarRoot,row.path);if(!file.startsWith(fs.realpathSync(b.sidecarRoot)+path.sep)||await sha(file)!==row.sha256)throw Error('CANDIDATE_ARTIFACT_DRIFT:'+row.path);}
for(const row of b.driverFiles??[])if(await sha(row.path)!==row.sha256)throw Error('CANDIDATE_DRIVER_DRIFT:'+row.path);
const ownedRoot=fs.mkdtempSync(path.join(b.artifactRoot,'t1300-candidate-'));fs.chmodSync(ownedRoot,0o700);
const evidence=path.join(b.evidenceRoot,'runs','owned-'+crypto.randomBytes(8).toString('hex'));fs.mkdirSync(evidence,{recursive:true,mode:0o700});
const marker={task:'T-1300',uid:process.getuid(),nonce:crypto.randomUUID(),candidateBinding:bindingPath,candidateHead:b.sourceHead,createdAt:new Date().toISOString()};
fs.writeFileSync(path.join(ownedRoot,'owner.json'),JSON.stringify(marker,null,2)+'\n',{mode:0o600,flag:'wx'});
for(const name of ['db','media','workspaces','app','auth-douyin','auth-web','browser-profile','cache','config','backups','logs','tmp']){if(!['db','media','workspaces'].includes(name))fs.mkdirSync(path.join(ownedRoot,name),{mode:0o700});}
const fixtureCopy=copyCompletedOwnedFixture(fixture,ownedRoot);
fs.writeFileSync(path.join(evidence,'fixture-copy.json'),JSON.stringify(fixtureCopy,null,2)+'\n',{mode:0o600,flag:'wx'});
const port=await new Promise((ok,bad)=>{const s=net.createServer();s.once('error',bad);s.listen(0,'127.0.0.1',()=>{const p=s.address().port;s.close(()=>ok(p));});});
// 只有本专用controller加载原本机规范构建密钥；不输出、不复制到普通子进程。
const {buildLocalPackageEnv}=await import(pathToFileURL(path.join(b.sourceRoot,'frontend/scripts/desktop/package-local.mjs')));
const {createBuildSmokeVerdictToken}=await import(pathToFileURL(path.join(b.sourceRoot,'frontend/scripts/desktop/verdict-key-material.mjs')));
const {buildSmokeSidecarEnv}=await import(pathToFileURL(path.join(b.sourceRoot,'frontend/scripts/desktop/runtime-smoke.mjs')));
const signingEnv=buildLocalPackageEnv({baseEnv:process.env});
const verdictToken=createBuildSmokeVerdictToken({sidecarPort:port},signingEnv);
for(const key of ['CREATOROS_VERDICT_SIGNING_KEY_B64','CREATOROS_ALLOW_VERDICT_SIGNING_KEY','CREATOROS_UPDATE_ROOT_PRIVATE_KEY_PATH'])delete signingEnv[key];
const base={};
for(const key of ['PATH','HOME','CODEX_HOME','HTTP_PROXY','HTTPS_PROXY','SSL_CERT_FILE','SSL_CERT_DIR','LANG','TZ'])if(process.env[key]!==undefined)base[key]=process.env[key];
const handshake=crypto.randomBytes(32).toString('hex');
const env={...buildSmokeSidecarEnv(base,{port,token:verdictToken,smokeDataRoot:ownedRoot,libDir:path.join(b.sidecarRoot,'lib')}),
 CREATOROS_SIDECAR_HANDSHAKE_TOKEN:handshake,CREATOROS_MASTER_KEY_FD:'0',
 CREATOROS_APP_DATA_DIR:path.join(ownedRoot,'app'),CREATOROS_DOUYIN_AUTH_DIR:path.join(ownedRoot,'auth-douyin'),CREATOROS_WEB_AUTH_DIR:path.join(ownedRoot,'auth-web'),CREATOROS_BROWSER_POOL_DIR:path.join(ownedRoot,'browser-profile'),CREATOROS_CACHE_DIR:path.join(ownedRoot,'cache'),CREATOROS_BACKUP_DIR:path.join(ownedRoot,'backups'),CREATOROS_LOG_DIR:path.join(ownedRoot,'logs'),
 CREATOROS_RUNTIME_ROOT:b.sidecarRoot,CREATOROS_BIN_DIR:fs.existsSync(path.join(b.sidecarRoot,'layers/media/bin'))?path.join(b.sidecarRoot,'layers/media/bin'):path.join(b.sidecarRoot,'frontend/bin'),CREATOROS_BROWSERS_DIR:fs.existsSync(path.join(b.sidecarRoot,'layers/browser/browsers'))?path.join(b.sidecarRoot,'layers/browser/browsers'):path.join(b.sidecarRoot,'frontend/browsers'),
 XDG_CONFIG_HOME:path.join(ownedRoot,'config'),XDG_CACHE_HOME:path.join(ownedRoot,'cache'),XDG_DATA_HOME:path.join(ownedRoot,'app'),TMPDIR:path.join(ownedRoot,'tmp'),TMP:path.join(ownedRoot,'tmp'),TEMP:path.join(ownedRoot,'tmp'),
 NO_PROXY:'127.0.0.1,localhost',no_proxy:'127.0.0.1,localhost',CREATOROS_DISABLE_SCHEDULER:'1',CREATOROS_DISABLE_BACKGROUND_DRIVERS:'1',CREATOROS_CLIENT_CONFIG_PULL_ENABLED:'0',NEXT_TELEMETRY_DISABLED:'1',HYPERFRAMES_TELEMETRY:'0'};
for(const key of ['CREATOROS_VERDICT_SIGNING_KEY_B64','CREATOROS_ALLOW_VERDICT_SIGNING_KEY','CREATOROS_UPDATE_ROOT_PRIVATE_KEY_PATH','CREATOROS_DEV_MODE','CREATOROS_SMOKE_BYPASS_VERDICT'])if(env[key]!==undefined)throw Error('FORBIDDEN_CHILD_ENV:'+key);
const executable=path.join(b.sidecarRoot,'server.app/Contents/MacOS/creatoros-server');
const child=spawn(executable,['--use-bundled-ca',path.join(b.sidecarRoot,'frontend/server.js')],{cwd:path.join(b.sidecarRoot,'frontend'),env,detached:true,stdio:['pipe','pipe','pipe']});
// 仅该已终态owned测试库原0600 key走原fd通道；不复制key，不访问Keychain/用户凭据。
const master=fixtureKeyBytes(fixture);child.stdin.end(master.toString('base64')+'\n');master.fill(0);
const output=fs.createWriteStream(path.join(evidence,'sidecar.log'),{flags:'wx',mode:0o600});let startupVerified=false;
for(const stream of [child.stdout,child.stderr])stream.on('data',chunk=>{output.write(chunk);if(chunk.toString().includes('[CreatorOS] SIDECAR_STARTUP_VERIFIED'))startupVerified=true;});
const sessionPath=path.join(ownedRoot,'session.json'),session={task:'T-1300',schema:'t1300-candidate-private-session/v1',baseURL:'http://127.0.0.1:'+port,handshake,ownedRoot,evidenceRoot:evidence,candidateBinding:bindingPath,childPid:child.pid,controllerPid:process.pid};
fs.writeFileSync(sessionPath,JSON.stringify(session,null,2)+'\n',{mode:0o600,flag:'wx'});
const started=Date.now(),deadline=started+180000;
let stopped=false;
const stop=()=>{if(stopped)return;stopped=true;try{process.kill(-child.pid,'SIGTERM');}catch{}};
process.on('SIGINT',stop);process.on('SIGTERM',stop);process.stdin.resume();process.stdin.on('data',data=>{if(data.toString().trim()==='stop')stop();});
child.on('error',error=>{output.write('CONTROLLER_SPAWN_ERROR '+error.message+'\n');stop();});
child.once('close',(code,signal)=>{output.end();
 let sourceAfter;try{sourceAfter=verifyOriginalUnchanged(fixture,fixtureCopy.sourceBefore);}catch(error){sourceAfter={unchanged:false,error:String(error?.message??error)};}
 fs.writeFileSync(path.join(evidence,'fixture-source-after-ui.json'),JSON.stringify(sourceAfter,null,2)+'\n',{mode:0o600,flag:'wx'});
 if(!sourceAfter.unchanged)code=1;fs.writeFileSync(path.join(evidence,'sidecar-exit.json'),JSON.stringify({code,signal,childPid:child.pid,endedAt:new Date().toISOString(),formalAppTouched:false,ownedDataPreserved:true},null,2)+'\n',{mode:0o600});process.exitCode=code??(signal==='SIGTERM'?0:1);process.stdin.pause();});
while(Date.now()<deadline&&child.exitCode===null&&!stopped){if(startupVerified){try{const response=await fetch(session.baseURL+'/',{redirect:'manual',signal:AbortSignal.timeout(120000)});if(response.status<500){
 const noHandshake=await fetch(session.baseURL+'/api/v1/dispatch',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({id:'settings.modelRouting.get',input:{}}),signal:AbortSignal.timeout(120000)});
 if(noHandshake.status!==403)throw Error('MISSING_HANDSHAKE_MUST_REJECT:'+noHandshake.status);
 const ready={schema:'t1300-candidate-ready/v1',testAuthorizationMode:'production candidate sidecar，真实build_smoke测试token；非真实激活或原生壳',candidateBinding:bindingPath,sourceHead:b.sourceHead,port,baseURL:session.baseURL,sessionPath,ownedRoot,evidenceRoot:evidence,pid:child.pid,controllerPid:process.pid,startupVerified:true,rootStatus:response.status,missingHandshakeStatus:noHandshake.status,seedPresentInSidecarEnv:false,devBypass:false,nativeShellStarted:false,formalAppTouched:false,completedOwnedFixture:{task:fixture.task,sourceRoot:fixture.sourceRoot,copyReceipt:path.join(evidence,'fixture-copy.json'),keyCopied:false},startupBudgets:{loopObservationMs:180000,httpProbeMs:120000,httpProbeCount:2,cleanupAllowanceMs:120000,conservativeOuterAllowanceMs:540000,strict180000TotalUpperBound:false},readyAt:new Date().toISOString()};
 fs.writeFileSync(path.join(evidence,'ready.json'),JSON.stringify(ready,null,2)+'\n',{mode:0o600});console.log(JSON.stringify(ready));break;
 }}catch(error){if(error.message.startsWith('MISSING_HANDSHAKE')){stop();throw error;}}}
 await new Promise(ok=>setTimeout(ok,250));
}
if(!fs.existsSync(path.join(evidence,'ready.json'))){stop();throw Error('CANDIDATE_STARTUP_NOT_VERIFIED_WITHIN_ORIGINAL_BUDGET');}

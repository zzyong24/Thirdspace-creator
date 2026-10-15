'use strict';
const fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process'),crypto=require('node:crypto'),{createRequire}=require('node:module');
const sourceRoot=fs.realpathSync(process.argv[2]||process.cwd()),mode=process.argv[3];if(!['baseline','current'].includes(mode))throw Error('EXPLICIT_MODE_baseline_OR_current_REQUIRED');
const binding=process.argv[4];if(!binding)throw Error('EXPLICIT_OWNED_SERVICE_BINDING_REQUIRED');
const dir=path.join(__dirname,'runs',mode+'-'+crypto.randomBytes(6).toString('hex'));fs.mkdirSync(dir,{recursive:true,mode:0o700});
const requireFrontend=createRequire(path.join(sourceRoot,'frontend/package.json')),cli=requireFrontend.resolve('@playwright/test/cli');
const env={PATH:process.env.PATH,HOME:process.env.HOME,LANG:'en_US.UTF-8',TZ:'Asia/Shanghai',NO_PROXY:'127.0.0.1,localhost',no_proxy:'127.0.0.1,localhost',T1295_SOURCE_ROOT:sourceRoot,T1295_POLICY_MODE:mode,T1295_SERVICE_BINDING:path.resolve(binding),T1295_EVIDENCE_ROOT:dir,NEXT_TELEMETRY_DISABLED:'1',CI:'1'};
if(process.env.T1295_BROWSER_CHANNEL)env.T1295_BROWSER_CHANNEL=process.env.T1295_BROWSER_CHANNEL;
// Nothing launches the app, model CLI, or another Next server. Playwright uses the locked host dependency.
const args=[cli,'test','--config',path.join(__dirname,'playwright.formal.config.cjs'),'--workers=1','--retries=0'];if(mode==='baseline')args.push('--grep','page-origin');
if(process.argv[5])args.push('--grep',process.argv[5]);
const candidate=fs.readFileSync(path.join(sourceRoot,'frontend/tests/e2e/t1295-desktop-csp-wasm-video.spec.ts'));fs.writeFileSync(path.join(dir,'candidate-used.spec.ts'),candidate,{mode:0o600});
const config=fs.readFileSync(path.join(__dirname,'playwright.formal.config.cjs'));fs.writeFileSync(path.join(dir,'config-used.cjs'),config,{mode:0o600});
fs.writeFileSync(path.join(dir,'invocation.json'),JSON.stringify({sourceRoot,mode,binding:path.resolve(binding),args,envKeys:Object.keys(env),browserChannel:env.T1295_BROWSER_CHANNEL||'bundled-chromium',candidateSHA256:crypto.createHash('sha256').update(candidate).digest('hex'),configSHA256:crypto.createHash('sha256').update(config).digest('hex'),at:new Date().toISOString()},null,2)+'\n',{mode:0o600});
console.log(JSON.stringify({evidenceRoot:dir,mode}));
const child=cp.spawn(process.execPath,args,{cwd:sourceRoot,env,stdio:['ignore','pipe','pipe']});const log=fs.createWriteStream(path.join(dir,'run.log'),{mode:0o600});child.stdout.pipe(log,{end:false});child.stderr.pipe(log,{end:false});child.stdout.pipe(process.stdout);child.stderr.pipe(process.stderr);
child.once('close',(code,signal)=>{log.end();fs.writeFileSync(path.join(dir,'exit.json'),JSON.stringify({code,signal,pid:child.pid,at:new Date().toISOString(),appStopped:false,modelsSubmittedByDriver:0},null,2)+'\n',{mode:0o600});process.exitCode=code??1;});

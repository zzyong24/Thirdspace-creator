'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),cp=require('node:child_process');
const hash=p=>crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const inventory=p=>fs.readdirSync(p,{withFileTypes:true}).flatMap(x=>x.isDirectory()?inventory(path.join(p,x.name)):[path.join(p,x.name)]).sort();
const verificationContexts=[];
function requireFutureSlot(deadline,needed,now=performance.now()){if(!Number.isFinite(needed)||needed<0||deadline-now<needed)throw Error('FULL_FUTURE_SLOT_UNAVAILABLE');return deadline-now;}
function stableBudgetSlot({born,limitMs,spentPositiveMs,ioMs,futureMs},at=performance.now()){if(!Number.isFinite(born)||!Number.isFinite(at)||at<born||!Number.isFinite(spentPositiveMs)||spentPositiveMs<0||![limitMs,ioMs,futureMs].every(n=>Number.isSafeInteger(n)&&n>=0))throw Error('FINITE_FIXED_BIRTH_FULL_SLOT_VALUES');const elapsed=at-born,spentTotalMs=Math.ceil(elapsed),spentIoMs=Math.ceil(Math.max(0,elapsed-spentPositiveMs)),remainingMs=limitMs-spentTotalMs,neededMs=futureMs+Math.max(0,ioMs-spentIoMs);if(remainingMs<neededMs)throw Error('FULL_FUTURE_SLOT_UNAVAILABLE');return {remainingMs,neededMs,spentTotalMs,spentIoMs};}
function legacyVerificationBudgets(){return {perGitMs:120000,gitCommands:2,sourceIoMs:900000,ownedIoMs:900000,sourceMs:1140000,runtimeMs:2040000};}
const git=(root,args)=>{const c=verificationContexts.at(-1),at=performance.now();if(c)stableBudgetSlot({born:c.born,limitMs:c.limitMs,spentPositiveMs:c.gitSpent,ioMs:c.ioMs,futureMs:c.gitRemaining*120000},at);try{return cp.execFileSync('git',args,{cwd:root,encoding:'utf8',timeout:120000});}finally{if(c){c.gitSpent+=performance.now()-at;c.gitRemaining--;}}};
const productInventory=(root,roots)=>[...new Set(git(root,['ls-files','--cached','--others','--exclude-standard','--',...roots]).trim().split('\n').filter(Boolean))].sort();
function v3RunnerBudgets(manifest){
 const expected={official:103,protocol:7,pi:1};
 if(!manifest.expectedBodies||JSON.stringify(Object.keys(manifest.expectedBodies).sort())!==JSON.stringify(Object.keys(expected).sort()))throw Error('EXACT_V3_PROFILE_BODY_FIELDS_REQUIRED');
 for(const [profile,count]of Object.entries(expected))if(!Number.isSafeInteger(manifest.expectedBodies[profile])||manifest.expectedBodies[profile]!==count)throw Error('EXACT_V3_111_BODY_COUNTS_REQUIRED:'+profile);
 return Object.fromEntries(Object.entries(expected).map(([profile,bodyCount])=>[profile,{bodyCount,bodySlotMs:72000000,workerFixtureTeardownSlotMs:72000000,twoHookSlotsMs:360000,startupSlotsMs:3000000,commandSlotMs:240000,ownedCleanupSlotMs:4800000,readonlyLedgerSlotMs:1800000,reportSlotMs:600000,outerMs:bodyCount*(72000000*2+360000)+3000000+240000+4800000+1800000+600000}]));
}
function verify(manifest,{runtime=false}={}){
 const born=performance.now(),v=legacyVerificationBudgets(),c={born,deadline:born+(runtime?v.runtimeMs:v.sourceMs),limitMs:runtime?v.runtimeMs:v.sourceMs,ioMs:v.sourceIoMs+(runtime?v.ownedIoMs:0),gitRemaining:2,gitSpent:0};if(JSON.stringify(manifest.toolVerificationBudget)!==JSON.stringify(v))throw Error('REVIEWED_TOOL_VERIFICATION_BUDGET_REQUIRED');verificationContexts.push(c);try{
 const errors=[],root=fs.realpathSync(manifest.sourceRoot);
 try{v3RunnerBudgets(manifest);}catch(e){errors.push(e.message);}
 const check=(base,files,label)=>{for(const f of files??[]){const p=path.join(base,f.path);try{if(f.absent?fs.existsSync(p):!fs.existsSync(p)||(f.sha256&&hash(p)!==f.sha256))errors.push(label+' '+f.path);}catch(e){errors.push(label+' '+f.path+': '+e.message);}}};
 const exact=(base,dir,files,label)=>{const expected=(files??[]).map(f=>f.path).sort(),actual=inventory(path.join(base,dir)).map(p=>path.relative(base,p));if(JSON.stringify(actual)!==JSON.stringify(expected))errors.push(label+' exact inventory drift');check(base,files,label);};
 if(manifest.candidate&&git(root,['rev-parse','HEAD']).trim()!==manifest.candidate)errors.push('candidate HEAD drift');
 check(root,manifest.productFiles,'product');check(root,manifest.legacy253Sources,'original253');
 if(manifest.productRoots&&JSON.stringify(productInventory(root,manifest.productRoots))!==JSON.stringify(manifest.productFiles.map(f=>f.path).sort()))errors.push('product full inventory drift');
 check(root,manifest.sourceFiles,'test/driver');check(root,manifest.additionalReadonlyTestInputs,'additional original full body');
 for(const group of manifest.exactSourceInventories??[])exact(root,group.root,group.files,'source '+group.root);
 check('/',manifest.pgTools?.map(t=>({path:t.path,sha256:t.sha256})),'PG executable');check('/',manifest.fixtureTools?.map(t=>({path:t.path,sha256:t.sha256})),'fixture executable');
 if(manifest.nodeSha256&&hash(process.execPath)!==manifest.nodeSha256)errors.push('Node executable drift');
 if(manifest.sourceManifestPath&&hash(manifest.sourceManifestPath)!==manifest.sourceManifestSha256)errors.push('reviewed source manifest drift');
 if(runtime){const own=fs.realpathSync(manifest.runtimeRoot);check(own,manifest.productFiles,'runtime product');check(own,manifest.legacy253Sources,'runtime original253');
  for(const f of manifest.workerBundles??[]){try{const p=fs.realpathSync(path.join(own,f.path));if(!p.startsWith(own+path.sep)||hash(p)!==f.sha256)errors.push('Worker '+f.path);}catch(e){errors.push('Worker missing '+f.path);}}
  for(const l of manifest.workspaceLinks??[]){try{const p=fs.realpathSync(path.join(own,l.path));if(p!==path.join(own,l.target)||!p.startsWith(own+path.sep))errors.push('workspace link '+l.path);}catch(e){errors.push('workspace link missing '+l.path);}}
  exact(own,path.relative(own,manifest.runtimeTestRoot),manifest.runtimeTests,'runtime tests');exact(own,path.relative(own,manifest.runtimeDriverRoot),manifest.runtimeDriverFiles,'runtime driver');
  for(const [p,digest,label]of [[manifest.officialExecutable,manifest.officialExecutableSha256,'official binary'],[manifest.privateExecutable,manifest.privateExecutableSha256,'private binary'],[manifest.videoFixture,manifest.videoFixtureSha256,'video fixture'],[manifest.packageReceiptPath,manifest.packageReceiptSha256,'package receipt']])if(!p||!digest||hash(p)!==digest)errors.push(label+' drift');
  if(!fs.realpathSync(manifest.privateExecutable).startsWith(own+path.sep))errors.push('private executable outside owned runtime');
 }
 if(errors.length)throw Error(JSON.stringify(errors));requireFutureSlot(c.deadline,0);return {errors,phase:runtime?'runtime':'source',at:new Date().toISOString(),verificationElapsedMs:performance.now()-born,verificationBudgetMs:runtime?v.runtimeMs:v.sourceMs};
 }finally{if(verificationContexts.pop()!==c)throw Error('VERIFICATION_CLOCK_STACK_DRIFT');}
}
function revisedPrepareBudget(){const v=legacyVerificationBudgets(),gitMs=120000,cloneMs=360000,checkoutMs=360000,ffmpegMs=240000;return {originalNonVerifyMs:3600000,sourceVerifyCalls:2,runtimeVerifyCalls:2,sourceVerifyMs:v.sourceMs,runtimeVerifyMs:v.runtimeMs,untrackedMs:gitMs,dirtyMs:gitMs,cloneMs,checkoutMs,privateHeadMs:gitMs,ffmpegMs,copyRelinkAndInputIoMs:3600000-(gitMs*3+cloneMs+checkoutMs+ffmpegMs),allVerifyMs:2*v.sourceMs+2*v.runtimeMs,outerMs:3600000+2*v.sourceMs+2*v.runtimeMs,oneEntryBirth:true,segmentsMaxMs:60000};}
function revisedRunnerBudgets(m){const cores=v3RunnerBudgets(m),v=legacyVerificationBudgets();return Object.fromEntries(Object.entries(cores).map(([profile,core])=>{const entryVerifyMs=v.runtimeMs+v.sourceMs+v.runtimeMs,finalVerifyMs=v.sourceMs+v.runtimeMs,nextEntryVerifyMs=v.runtimeMs,readonlyEntryVerifyMs=v.runtimeMs,extraCleanupMs=2400000;return [profile,{...core,phaseSumMs:(profile==='protocol'?1500000:0)+240000+1500000+nextEntryVerifyMs+core.bodyCount*(core.bodySlotMs+core.workerFixtureTeardownSlotMs+core.twoHookSlotsMs)+core.readonlyLedgerSlotMs+readonlyEntryVerifyMs,entryVerifyMs,finalVerifyMs,nextEntryVerifyMs,nextReadyAdmissionMs:420000+nextEntryVerifyMs,nextFullSlotMs:1500000+nextEntryVerifyMs,readonlyEntryVerifyMs,readonlyLedgerFullMs:core.readonlyLedgerSlotMs+readonlyEntryVerifyMs,cleanupFullMs:core.ownedCleanupSlotMs+extraCleanupMs,originalOuterMs:core.outerMs,outerMs:core.outerMs+entryVerifyMs+finalVerifyMs+nextEntryVerifyMs+readonlyEntryVerifyMs+extraCleanupMs}];}));}
module.exports={stableBudgetSlot,revisedPrepareBudget,legacyVerificationBudgets,revisedRunnerBudgets,requireFutureSlot,hash,inventory,verify,productInventory,v3RunnerBudgets};
if(require.main===module){const m=JSON.parse(fs.readFileSync(process.argv[2],'utf8'));process.stdout.write(JSON.stringify(verify(m,{runtime:process.argv.includes('--runtime')}))+'\n');}

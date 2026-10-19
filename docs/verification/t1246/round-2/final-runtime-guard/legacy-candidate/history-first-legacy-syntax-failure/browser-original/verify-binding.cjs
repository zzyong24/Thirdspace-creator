'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),cp=require('node:child_process');
const hash=p=>crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const inventory=p=>fs.readdirSync(p,{withFileTypes:true}).flatMap(x=>x.isDirectory()?inventory(path.join(p,x.name)):[path.join(p,x.name)]).sort();
const verificationContexts=[];
function requireFutureSlot(deadline,needed,now=performance.now()){if(!Number.isFinite(needed)||needed<0||deadline-now<needed)throw Error('FULL_FUTURE_SLOT_UNAVAILABLE');return deadline-now;}
function legacyVerificationBudgets(){return {perGitMs:120000,gitCommands:2,sourceIoMs:900000,ownedIoMs:900000,sourceMs:1140000,runtimeMs:2040000};}
const git=(root,args)=>{const c=verificationContexts.at(-1),at=performance.now();if(c){const ioRemaining=Math.max(0,c.ioMs-(at-c.born-c.gitSpent));requireFutureSlot(c.deadline,c.gitRemaining*120000+ioRemaining,at);}try{return cp.execFileSync('git',args,{cwd:root,encoding:'utf8',timeout:120000});}finally{if(c){c.gitSpent+=performance.now()-at;c.gitRemaining--;}}};
const productInventory=(root,roots)=>[...new Set(git(root,['ls-files','--cached','--others','--exclude-standard','--',...roots]).trim().split('\n').filter(Boolean))].sort();
function originalRunnerBudget(m){
 if(!Array.isArray(m.listedBodies)||m.listedBodies.length!==170||!Array.isArray(m.budgets)||m.budgets.length!==54)throw Error('EXACT_ACTUAL_54_170_BUDGET_LIST_REQUIRED');
 const files=new Map();for(const b of m.budgets){
  if(!b||typeof b.file!=='string'||!/^e2e\/[a-zA-Z0-9._-]+\.spec\.ts$/.test(b.file)||files.has(b.file))throw Error('NONEMPTY_UNIQUE_EXACT_FILE_BUDGET_REQUIRED');
  for(const key of ['awaitDeclarations','weightedAwaitSites','longestOriginalTestMs'])if(!Number.isSafeInteger(b[key])||b[key]<0)throw Error('NONNEGATIVE_SAFE_FILE_BUDGET_FIELD_REQUIRED:'+key);
  for(const key of ['maxLiteralLoop','observedLongestTimeoutMs','serialBudgetMs','effectiveTestMs'])if(!Number.isSafeInteger(b[key])||b[key]<=0)throw Error('POSITIVE_SAFE_FILE_BUDGET_FIELD_REQUIRED:'+key);
  const expectedSerial=Math.max(180000,(b.weightedAwaitSites+10)*b.observedLongestTimeoutMs*2+300000+360000);
  if(b.observedLongestTimeoutMs<300000||!Number.isSafeInteger(expectedSerial)||b.serialBudgetMs!==expectedSerial||b.effectiveTestMs!==Math.max(expectedSerial,b.longestOriginalTestMs,180000)||b.effectiveTestMs>2147483000)throw Error('INVALID_OR_INSUFFICIENT_DERIVED_FILE_BUDGET');
  files.set(b.file,b.effectiveTestMs);
 }
 const unique=new Set();let sum=0;for(const b of m.listedBodies){const key=b.file+'\0'+b.title;if(unique.has(key)||typeof b.title!=='string'||!files.has(b.file))throw Error('UNIQUE_LISTED_BODY_FILE_BUDGET_REQUIRED');unique.add(key);sum+=files.get(b.file);}
 if(new Set(m.listedBodies.map(b=>b.file)).size!==54)throw Error('ALL_54_LISTED_FILES_REQUIRED');
 const largest=Math.max(...files.values());return {bodyCount:170,fileCount:54,serialBodySumMs:sum,separatePerBodyFixtureHookAllowanceMs:sum+170*360000,globalSetupTeardownAllowanceMs:240000,workerProjectCleanupSlotMs:largest+180000,startupFullSlotsMs:2400000,commandListMs:480000,readonlyLedgerSlotMs:1200000,cleanupFullMs:4800000,marginMs:600000,outerMs:sum*2+170*360000+240000+largest+180000+2400000+480000+1200000+4800000+600000,monotonicSegmentsMaxMs:60000,notPersistentDeadlineInput:true};
}
function assertOriginalRunnerBudget(m){const expected=originalRunnerBudget(m);if(!m.runnerBudget||JSON.stringify(Object.keys(m.runnerBudget).sort())!==JSON.stringify(Object.keys(expected).sort()))throw Error('RUNNER_BUDGET_FIELDS_REQUIRED');for(const [key,value]of Object.entries(expected))if(m.runnerBudget[key]!==value)throw Error('RUNNER_BUDGET_INVALID_OR_INSUFFICIENT:'+key);return expected;}
function verify(manifest,{runtime=false}={}){
 const born=performance.now(),v=legacyVerificationBudgets(),c={born,deadline:born+(runtime?v.runtimeMs:v.sourceMs),ioMs:v.sourceIoMs+(runtime?v.ownedIoMs:0),gitRemaining:2,gitSpent:0};if(JSON.stringify(manifest.toolVerificationBudget)!==JSON.stringify(v))throw Error('REVIEWED_TOOL_VERIFICATION_BUDGET_REQUIRED');verificationContexts.push(c);try{
 const errors=[],root=fs.realpathSync(manifest.sourceRoot);
 const check=(base,files,label)=>{for(const f of files??[]){const p=path.join(base,f.path);try{if(f.absent?fs.existsSync(p):!fs.existsSync(p)||(f.sha256&&hash(p)!==f.sha256))errors.push(label+' '+f.path);}catch(e){errors.push(label+' '+f.path+': '+e.message);}}};
 const exact=(base,dir,files,label)=>{const expected=(files??[]).map(f=>f.path).sort(),actual=inventory(path.join(base,dir)).map(p=>path.relative(base,p));if(JSON.stringify(actual)!==JSON.stringify(expected))errors.push(label+' exact inventory drift');check(base,files,label);};
 if(manifest.candidate&&git(root,['rev-parse','HEAD']).trim()!==manifest.candidate)errors.push('candidate HEAD drift');
 check(root,manifest.productFiles,'product');check(root,manifest.legacy253Sources,'original253');
 if(manifest.productRoots&&JSON.stringify(productInventory(root,manifest.productRoots))!==JSON.stringify(manifest.productFiles.map(f=>f.path).sort()))errors.push('product full inventory drift');
 check(root,manifest.sourceFiles,'test/driver');
 check(root,manifest.originalInputs,'original100');check(root,manifest.generatedInputs,'generated100');check(root,manifest.mediaInputs,'original media INPUT');
 if(manifest.originalInputs){try{assertOriginalRunnerBudget(manifest);}catch(e){errors.push(e.message);}const actual=inventory(path.join(root,'frontend/tests')).map(p=>path.relative(root,p)).filter(p=>!manifest.excludedNewReadonlyInputs.includes(p)).sort();if(JSON.stringify(actual)!==JSON.stringify(manifest.originalInputs.map(f=>f.path).sort()))errors.push('original100 exact inventory drift');}
 if(manifest.generatedInputs)exact(root,manifest.generatedTestRoot,manifest.generatedInputs,'generated100');check(root,manifest.additionalReadonlyTestInputs,'additional original full body');
 for(const group of manifest.exactSourceInventories??[])exact(root,group.root,group.files,'source '+group.root);
 check('/',manifest.pgTools?.map(t=>({path:t.path,sha256:t.sha256})),'PG executable');check('/',manifest.fixtureTools?.map(t=>({path:t.path,sha256:t.sha256})),'fixture executable');
 if(manifest.nodeSha256&&hash(process.execPath)!==manifest.nodeSha256)errors.push('Node executable drift');
 if(manifest.sourceManifestPath&&hash(manifest.sourceManifestPath)!==manifest.sourceManifestSha256)errors.push('reviewed source manifest drift');
 if(runtime){const own=fs.realpathSync(manifest.runtimeRoot);check(own,manifest.productFiles,'runtime product');check(own,manifest.legacy253Sources,'runtime original253');check(own,manifest.originalInputs,'runtime original100');check(own,manifest.mediaInputs,'runtime original media INPUT');
  for(const f of manifest.workerBundles??[]){try{const p=fs.realpathSync(path.join(own,f.path));if(!p.startsWith(own+path.sep)||hash(p)!==f.sha256)errors.push('Worker '+f.path);}catch(e){errors.push('Worker missing '+f.path);}}
  for(const l of manifest.workspaceLinks??[]){try{const p=fs.realpathSync(path.join(own,l.path));if(p!==path.join(own,l.target)||!p.startsWith(own+path.sep))errors.push('workspace link '+l.path);}catch(e){errors.push('workspace link missing '+l.path);}}
  exact(own,path.relative(own,manifest.runtimeTestRoot),manifest.runtimeTests,'runtime tests');exact(own,path.relative(own,manifest.runtimeDriverRoot),manifest.runtimeDriverFiles,'runtime driver');
  for(const [p,digest,label]of [[manifest.officialExecutable,manifest.officialExecutableSha256,'official binary'],[manifest.privateExecutable,manifest.privateExecutableSha256,'private binary'],[manifest.packageReceiptPath,manifest.packageReceiptSha256,'package receipt']])if(!p||!digest||hash(p)!==digest)errors.push(label+' drift');
  if(!fs.realpathSync(manifest.privateExecutable).startsWith(own+path.sep))errors.push('private executable outside owned runtime');
 }
 if(errors.length)throw Error(JSON.stringify(errors));requireFutureSlot(c.deadline,0);return {errors,phase:runtime?'runtime':'source',at:new Date().toISOString(),verificationElapsedMs:performance.now()-born,verificationBudgetMs:runtime?v.runtimeMs:v.sourceMs};
 }finally{if(verificationContexts.pop()!==c)throw Error('VERIFICATION_CLOCK_STACK_DRIFT');}
}
function revisedPrepareBudget(){const v=legacyVerificationBudgets(),gitMs=120000,cloneMs=360000,checkoutMs=360000,ffmpegMs=0;return {originalNonVerifyMs:3600000,sourceVerifyCalls:2,runtimeVerifyCalls:2,sourceVerifyMs:v.sourceMs,runtimeVerifyMs:v.runtimeMs,untrackedMs:gitMs,dirtyMs:gitMs,cloneMs,checkoutMs,privateHeadMs:gitMs,ffmpegMs,copyRelinkAndInputIoMs:3600000-(gitMs*3+cloneMs+checkoutMs+ffmpegMs),allVerifyMs:2*v.sourceMs+2*v.runtimeMs,outerMs:3600000+2*v.sourceMs+2*v.runtimeMs,oneEntryBirth:true,segmentsMaxMs:60000};}
function revisedRunnerBudgets(m){const core=originalRunnerBudget(m),v=legacyVerificationBudgets(),entryVerifyMs=v.runtimeMs+v.sourceMs+v.runtimeMs,finalVerifyMs=v.sourceMs+v.runtimeMs,nextEntryVerifyMs=v.runtimeMs,readonlyEntryVerifyMs=v.runtimeMs,extraCleanupMs=2400000;return {original:{...core,phaseSumMs:240000+1200000+nextEntryVerifyMs+core.serialBodySumMs+core.separatePerBodyFixtureHookAllowanceMs+core.globalSetupTeardownAllowanceMs+core.workerProjectCleanupSlotMs+core.readonlyLedgerSlotMs+readonlyEntryVerifyMs,entryVerifyMs,finalVerifyMs,nextEntryVerifyMs,nextReadyAdmissionMs:420000+nextEntryVerifyMs,nextFullSlotMs:1200000+nextEntryVerifyMs,readonlyEntryVerifyMs,readonlyLedgerFullMs:core.readonlyLedgerSlotMs+readonlyEntryVerifyMs,cleanupFullMs:core.cleanupFullMs+extraCleanupMs,originalOuterMs:core.outerMs,outerMs:core.outerMs+entryVerifyMs+finalVerifyMs+nextEntryVerifyMs+readonlyEntryVerifyMs+extraCleanupMs}}};}
module.exports={revisedPrepareBudget,legacyVerificationBudgets,revisedRunnerBudgets,requireFutureSlot,hash,inventory,verify,productInventory,originalRunnerBudget,assertOriginalRunnerBudget};
if(require.main===module){const m=JSON.parse(fs.readFileSync(process.argv[2],'utf8'));process.stdout.write(JSON.stringify(verify(m,{runtime:process.argv.includes('--runtime')}))+'\n');}

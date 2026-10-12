'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),cp=require('node:child_process');
const hash=p=>crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const inventory=p=>fs.readdirSync(p,{withFileTypes:true}).flatMap(x=>x.isDirectory()?inventory(path.join(p,x.name)):[path.join(p,x.name)]).sort();
function gitEnv(){const env={};for(const key of ['HOME','CODEX_HOME','USER','LOGNAME','LANG','LC_ALL','LC_CTYPE','TZ'])if(process.env[key]!==undefined)env[key]=process.env[key];return {...env,PATH:path.dirname(process.execPath)+':/opt/homebrew/bin:/usr/bin:/bin:/usr/sbin:/sbin',GIT_CONFIG_GLOBAL:'/dev/null',GIT_CONFIG_NOSYSTEM:'1',GIT_LFS_SKIP_SMUDGE:'1'};}
const git=(root,args)=>cp.execFileSync('git',args,{cwd:root,encoding:'utf8',timeout:240000,maxBuffer:32*1024*1024,env:gitEnv()});
const productInventory=(root,roots)=>[...new Set(git(root,['ls-files','--cached','--others','--exclude-standard','--',...roots]).trim().split('\n').filter(Boolean))].sort();
function verificationBudgets(){const commandMs=240000,sourceIoMs=900000,ownedIoMs=900000;return {commandMs,sourceGitCommands:4,sourceIoMs,sourceMs:4*commandMs+sourceIoMs,runtimeGitCommands:5,ownedIoMs,runtimeMs:5*commandMs+sourceIoMs+ownedIoMs};}
function ownedMetadataBudget(d,sourceRoot){
 assertClosedDynamic(d);const keys=[...new Set(d.loadCommandMetadata.map(r=>r.file+'\0'+r.arch))].sort();if(!keys.length)throw Error('EXACT_METADATA_PAIR_INVENTORY_REQUIRED');
 // 绝对load保持原路径；若future图有sourceRoot绝对入口，对其可达原文件另留metadata pair容量。
 const extra=new Set(),queue=d.edges.filter(r=>path.isAbsolute(r.name)&&r.realpath?.startsWith(sourceRoot+path.sep)).map(r=>[r.realpath,r.arch]);for(let i=0;i<queue.length;i++){const [file,arch]=queue[i],key=file+'\0'+arch;if(extra.has(key))continue;extra.add(key);for(const r of d.edges)if(r.loader===file&&r.arch===arch&&r.realpath?.startsWith(sourceRoot+path.sep))queue.push([r.realpath,r.arch]);}
 const originalVariantKeys=[...extra].sort(),pairCapacity=keys.length+originalVariantKeys.length,commandMs=120000,perPairStartCloseRawMs=120000,entryVerifyMs=900000,postReadMs=900000,marginMs=600000;
 return {sourceUniquePairs:keys.length,contexts:d.loadCommandMetadata.length,sourcePairKeysSha256:crypto.createHash('sha256').update(JSON.stringify(keys)).digest('hex'),absoluteOriginalVariantPairs:originalVariantKeys.length,pairCapacity,perCommandMs:commandMs,perPairStartCloseRawMs,serialPositiveMs:pairCapacity*commandMs,serialStartCloseRawMs:pairCapacity*perPairStartCloseRawMs,entryVerifyMs,postReadMs,marginMs,outerMs:pairCapacity*(commandMs+perPairStartCloseRawMs)+entryVerifyMs+postReadMs+marginMs,segmentsMaxMs:60000};
}
function preparationBudgets(m){const d=JSON.parse(fs.readFileSync(m.dynamicClosurePath,'utf8')),metadata=ownedMetadataBudget(d,m.sourceRoot),v=verificationBudgets(),legacyNonVerifyBaseMs=3600000,entrySourceVerifyMs=v.sourceMs,postRuntimeSourceRuntimeMs=v.runtimeMs+v.sourceMs+v.runtimeMs;return {legacyNonVerifyBaseMs,entrySourceVerifyMs,postRuntimeSourceRuntimeMs,allActualVerifyMs:entrySourceVerifyMs+postRuntimeSourceRuntimeMs,metadata,outerMs:legacyNonVerifyBaseMs+entrySourceVerifyMs+postRuntimeSourceRuntimeMs+metadata.outerMs};}
function completeBudgets(m){const v=verificationBudgets(),prepare=preparationBudgets(m),launch=doocsRunnerBudgets(m).doocs,entrySourceVerifyMs=v.sourceMs,postPrepareRuntimeVerifyMs=v.runtimeMs,finalSourceRuntimeVerifyMs=v.sourceMs+v.runtimeMs,helperLifecycleMs=2160000,marginMs=600000;return {prepareMs:prepare.outerMs,launchMs:launch.outerMs,entrySourceVerifyMs,postPrepareRuntimeVerifyMs,finalSourceRuntimeVerifyMs,allActualVerifyMs:entrySourceVerifyMs+postPrepareRuntimeVerifyMs+finalSourceRuntimeVerifyMs,helperLifecycleMs,marginMs,outerMs:prepare.outerMs+launch.outerMs+entrySourceVerifyMs+postPrepareRuntimeVerifyMs+finalSourceRuntimeVerifyMs+2*helperLifecycleMs+marginMs};}
function doocsRunnerBudgets(m){
 if(JSON.stringify(m.expectedBodies)!==JSON.stringify({doocs:2})||!Array.isArray(m.expectedTitles)||m.expectedTitles.length!==2||new Set(m.expectedTitles).size!==2)throw Error('EXACT_DOOCS_TWO_BODY_INVENTORY_REQUIRED');
 const body=72000000,sum=body*2,v=verificationBudgets(),entrySourceVerifyMs=v.runtimeMs+v.sourceMs+v.runtimeMs,sourceVerifyMs=v.sourceMs+v.runtimeMs;
 return {doocs:{bodyCount:2,perBodyMs:body,serialBodySumMs:sum,separatePerBodyFixtureHookAllowanceMs:sum+2*360000,driverTypesMs:1200000,listMs:240000,startupFullSlotsMs:1500000*2+v.runtimeMs,nextStartupVerifyMs:v.runtimeMs,readonlyLedgerSlotMs:1800000+v.runtimeMs,readonlyEntryVerifyMs:v.runtimeMs,cleanupFullMs:2400000*2,globalSetupTeardownMs:240000,workerProjectCleanupMs:body+180000,entrySourceVerifyMs,sourceVerifyMs,marginMs:600000,outerMs:sum*2+2*360000+1200000+240000+3000000+v.runtimeMs+1800000+v.runtimeMs+4800000+240000+body+180000+entrySourceVerifyMs+sourceVerifyMs+600000,monotonicSegmentsMaxMs:60000,notPersistentDeadlineInput:true}};
}
function installedPaths(root){
 const out=[];function walk(dir){for(const e of fs.readdirSync(dir,{withFileTypes:true})){if(path.basename(dir)==='node_modules'&&['.vite','.vite-temp','.cache'].includes(e.name))continue;const p=path.join(dir,e.name);if(e.isDirectory())walk(p);else out.push(path.relative(root,p));}}
 for(const rel of ['node_modules','frontend/node_modules','backend/node_modules','contract/node_modules','ai-worker/node_modules','mcp-server/node_modules'])walk(path.join(root,rel));return [...new Set(out)].sort();
}
function isMachO(file){const fd=fs.openSync(file,'r'),b=Buffer.alloc(4);try{fs.readSync(fd,b,0,4,0);}finally{fs.closeSync(fd);}return ['feedface','cefaedfe','feedfacf','cffaedfe','cafebabe','bebafeca','cafebabf','bfbafeca'].includes(b.toString('hex'));}
function dynamicRoots(m){return [...new Set([m.nodePath,m.metadataTool.file,m.gitTool.realExecutable,...m.gitTool.localCloneAndObjectHelpers,...m.browserInputs.filter(r=>!r.realpath&&isMachO(r.path)).map(r=>r.path),...m.pgTools.map(r=>r.path),...m.installedInputs.filter(r=>!r.realpath&&isMachO(path.join(m.sourceRoot,r.path))).map(r=>path.join(m.sourceRoot,r.path))].map(p=>fs.realpathSync(p)))].sort();}
function assertDynamicRows(d){
 for(const r of d.nonSystemFiles){const st=fs.lstatSync(r.file);if(!st.isFile()||st.size!==r.size||(st.mode&0o777)!==r.mode||st.uid!==r.uid||hash(r.file)!==r.sha256||fs.realpathSync(r.file)!==r.file)throw Error('DYNAMIC_FILE_DRIFT:'+r.file);}
 for(const r of d.symlinkChain){const st=fs.lstatSync(r.file);if(!st.isSymbolicLink()||(st.mode&0o777)!==r.mode||st.uid!==r.uid||fs.readlinkSync(r.file)!==r.link||fs.realpathSync(r.file)!==r.resolved)throw Error('DYNAMIC_LINK_DRIFT:'+r.file);const target=fs.statSync(r.file);if(r.targetKind==='directory'&&!target.isDirectory()||r.targetKind==='file'&&(!target.isFile()||target.size!==r.size||hash(r.file)!==r.sha256)||!['directory','file'].includes(r.targetKind))throw Error('DYNAMIC_LINK_TARGET_DRIFT:'+r.file);}
 for(const r of d.edges){const selected=r.rpathAttempts?.length?r.rpathAttempts.find(p=>fs.existsSync(p)):r.resolvedRequestedPath;if(selected!==r.resolvedRequestedPath||fs.realpathSync(selected)!==r.realpath)throw Error('DYNAMIC_SEARCH_PRIORITY_DRIFT:'+r.name);}
}
function assertClosedDynamic(d){if(d.schemaVersion!==2||d.closureCompleteness?.status!=='resolved-static-load-command-closure'||d.closureCompleteness.strongUnresolved!==0||!Array.isArray(d.rootRoles)||!Array.isArray(d.loadCommandMetadata)||d.loadCommandMetadata.some(r=>!Array.isArray(r.loads)||!Array.isArray(r.rpaths)))throw Error('COMPLETE_CONTEXTUAL_DYNAMIC_METADATA_REQUIRED');if(JSON.stringify([...new Set(d.rootRoles.map(r=>r.file))].sort())!==JSON.stringify(d.rootMachOFiles.slice().sort()))throw Error('EXACT_DYNAMIC_ROLES_REQUIRED');}
function verifyGitConsumer(d){const actual=gitEnv().PATH.split(':').map(p=>path.join(p,'git')).find(p=>{try{fs.accessSync(p,fs.constants.X_OK);return fs.statSync(p).isFile();}catch{return false;}});if(!d.gitConsumer||d.gitConsumer.actualWhiteListPATH!==gitEnv().PATH||actual!==d.gitConsumer.which||fs.realpathSync(actual)!==d.gitConsumer.realExecutable)throw Error('ACTUAL_WHITELIST_GIT_ENTRY_DRIFT');for(const p of d.gitConsumer.logicalLocalCloneHelperPaths)if(fs.realpathSync(p)!==d.gitConsumer.realExecutable)throw Error('ACTUAL_GIT_LOCAL_CLONE_HELPER_DRIFT');}
function verifyDynamic(m,{runtime=false}={}){
 if(!m.dynamicClosurePath||!m.dynamicClosureSha256||hash(m.dynamicClosurePath)!==m.dynamicClosureSha256)throw Error('EXACT_REVIEWED_DYNAMIC_CLOSURE_REQUIRED');
 const d=JSON.parse(fs.readFileSync(m.dynamicClosurePath,'utf8'));if(fs.realpathSync(d.fixedNode)!==fs.realpathSync(m.nodePath)||!d.rootMachOFiles.includes(fs.realpathSync(m.nodePath))||!d.systemHostBoundary?.reason)throw Error('EXACT_DYNAMIC_NODE_AND_SYSTEM_BOUNDARY_REQUIRED');
 if(!Array.isArray(m.dynamicRequiredRoots)||!m.dynamicRequiredRoots.length||m.dynamicRequiredRoots.some(p=>!d.rootMachOFiles.includes(p)))throw Error('ACTUAL_DYNAMIC_RUNTIME_ROOT_CLOSURE_PENDING');
 assertClosedDynamic(d);assertDynamicRows(d);
 if(runtime){
  if(!m.runtimeDynamicPath||hash(m.runtimeDynamicPath)!==m.runtimeDynamicSha256||fs.realpathSync(m.runtimeDynamicPath)!==path.join(fs.realpathSync(m.runRoot),'actual-owned-dyld/runtime-dynamic-closure.json'))throw Error('ACTUAL_OWNED_DYNAMIC_MANIFEST_REQUIRED');const own=JSON.parse(fs.readFileSync(m.runtimeDynamicPath,'utf8'));
  const rebase=p=>p===m.sourceRoot?m.runtimeRoot:p.startsWith(m.sourceRoot+path.sep)?m.runtimeRoot+p.slice(m.sourceRoot.length):p;
  if(own.sourceManifestPath!==m.dynamicClosurePath||own.sourceManifestSha256!==m.dynamicClosureSha256||own.runtimeRoot!==fs.realpathSync(m.runtimeRoot)||own.relativeLoaderAndRpathFromActualOwnedCopy!==true||own.absoluteLoadsKeptAbsolute!==true||JSON.stringify(own.rootMachOFiles)!==JSON.stringify(d.rootMachOFiles.map(rebase).sort()))throw Error('ACTUAL_OWNED_DYNAMIC_PROVENANCE_DRIFT');assertClosedDynamic(own);assertDynamicRows(own);const plan=ownedMetadataBudget(d,m.sourceRoot);if(JSON.stringify(own.metadataBudget)!==JSON.stringify(plan)||own.actualUniquePairs!==own.rawCommands.length||own.actualUniquePairs>plan.pairCapacity)throw Error('EXACT_OWNED_METADATA_BUDGET_INVENTORY_REQUIRED');
  for(const r of own.rawCommands)for(const [p,sha]of [[r.stdout,r.stdoutSha256],[r.stderr,r.stderrSha256],[r.receiptPath,r.receiptSha256]])if(!fs.realpathSync(p).startsWith(path.dirname(m.runtimeDynamicPath)+path.sep)||hash(p)!==sha||r.code!==0||r.processAndLogsClosed!==true)throw Error('ACTUAL_OWNED_METADATA_RAW_DRIFT');
 }
 return {nonSystemFiles:d.nonSystemFiles.length,symlinks:d.symlinkChain.length,systemHostBoundary:d.systemHostBoundary,manifestSha256:m.dynamicClosureSha256,actualListedRootsOnly:true};
}
function requireFutureSlot(deadline,needed,now=performance.now()){
 if(!Number.isFinite(deadline)||!Number.isFinite(needed)||needed<0||deadline-now<needed)throw Error('FULL_FUTURE_PHASE_SLOT_UNAVAILABLE_NO_START');return deadline-now;
}
function recordsFor(base,rows,sourceRoot,runtimeRoot){
 const errors=[];for(const row of rows??[]){const p=path.isAbsolute(row.path)?row.path:path.join(base,row.path);
  try{if(row.realpath){const expected=runtimeRoot&&row.realpath.startsWith(sourceRoot+path.sep)?runtimeRoot+row.realpath.slice(sourceRoot.length):row.realpath;
    if(!fs.lstatSync(p).isSymbolicLink()||fs.realpathSync(p)!==expected)errors.push('link '+row.path);
   }else if(!fs.lstatSync(p).isFile()||hash(p)!==row.sha256)errors.push('file '+row.path);
  }catch(e){errors.push(row.path+': '+e.code);}
 }if(errors.length)throw Error(JSON.stringify(errors));
}
function verify(m,{runtime=false}={}){
 const verifyBorn=performance.now(),verifyLimit=runtime?verificationBudgets().runtimeMs:verificationBudgets().sourceMs;
 if(m.sealState!=='final-built-candidate'||! /^[a-f0-9]{40}$/.test(m.candidate??'')||m.workerBuildCandidate!==m.candidate)throw Error('FINAL_BUILT_SOURCE_REQUIRED');
 verifyDynamic(m);verifyGitConsumer(JSON.parse(fs.readFileSync(m.dynamicClosurePath,'utf8')));const root=fs.realpathSync(m.sourceRoot);if(git(root,['rev-parse','HEAD']).trim()!==m.candidate)throw Error('SOURCE_HEAD_DRIFT');
 if(JSON.stringify(dynamicRoots(m))!==JSON.stringify(m.dynamicRequiredRoots))throw Error('EXACT_DYNAMIC_REQUIRED_ROOT_INVENTORY_DRIFT');
 if(hash(process.execPath)!==m.nodeSha256||fs.realpathSync(process.execPath)!==fs.realpathSync(m.nodePath))throw Error('EXACT_NODE_REQUIRED');verifyDynamic(m);
 if(git(root,['diff','HEAD','--name-only','--',...m.productRoots]).trim()||git(root,['ls-files','--others','--exclude-standard','--',...m.productRoots]).trim())throw Error('PRODUCT_SOURCE_NOT_CLEAN_FROZEN');
 if(m.legacy253Sources?.length!==253||m.pgTools?.length!==2||JSON.stringify(m.pgTools.map(r=>r.name).sort())!==JSON.stringify(['initdb','postgres']))throw Error('EXACT_LEGACY_253_AND_PG_TOOLS_REQUIRED');
 recordsFor(root,m.productFiles);recordsFor(root,m.legacy253Sources);recordsFor(root,m.sourceFiles);recordsFor(root,m.installedInputs);recordsFor('/',m.browserInputs);recordsFor('/',m.pgTools);recordsFor(root,m.workerBundles);if(JSON.stringify(installedPaths(root))!==JSON.stringify(m.installedInputs.map(r=>r.path).sort()))throw Error('EXACT_SOURCE_INSTALLED_INVENTORY_DRIFT');if(JSON.stringify(inventory(m.browser.root))!==JSON.stringify(m.browserInputs.map(r=>r.path).sort()))throw Error('EXACT_BROWSER_INVENTORY_DRIFT');
 if(JSON.stringify(productInventory(root,m.productRoots))!==JSON.stringify(m.productFiles.map(f=>f.path).sort()))throw Error('EXACT_PRODUCT_INVENTORY_DRIFT');
 if(m.workerBundles.length!==11||new Set(m.workerBundles.map(f=>f.path)).size!==11)throw Error('EXACT_ELEVEN_WORKER_BUNDLES_REQUIRED');
 for(const [p,d]of [[m.packageReceiptPath,m.packageReceiptSha256],[m.dmgPath,m.packageSha256],[m.parentOriginalManifest,m.parentOriginalManifestSha256],[m.parentNewManifest,m.parentNewManifestSha256]])if(!p||!d||hash(p)!==d)throw Error('PARENT_PACKAGE_OR_MANIFEST_DRIFT');
 const original=JSON.parse(fs.readFileSync(m.parentOriginalManifest,'utf8')),additional=JSON.parse(fs.readFileSync(m.parentNewManifest,'utf8'));
 if(original.expectedBodies?.original!==170||JSON.stringify(additional.expectedBodies)!==JSON.stringify({official:103,protocol:7,pi:1}))throw Error('ORIGINAL_170_OR_NEW_111_INVENTORY_DRIFT');
 const budget=doocsRunnerBudgets(m).doocs;if(JSON.stringify(m.verificationBudget)!==JSON.stringify(verificationBudgets())||JSON.stringify(m.prepareBudget)!==JSON.stringify(preparationBudgets(m))||JSON.stringify(m.completeBudget)!==JSON.stringify(completeBudgets(m)))throw Error('EXACT_FULL_HIERARCHICAL_BUDGET_REQUIRED');if(JSON.stringify(m.runnerBudget)!==JSON.stringify(budget))throw Error('EXACT_DERIVED_BUDGET_REQUIRED');
 if(m.sourceManifestPath&&hash(m.sourceManifestPath)!==m.sourceManifestSha256)throw Error('REVIEWED_MANIFEST_DRIFT');
 if(runtime){
  verifyDynamic(m,{runtime:true});const own=fs.realpathSync(m.runtimeRoot);if(git(own,['rev-parse','HEAD']).trim()!==m.candidate)throw Error('RUNTIME_HEAD_DRIFT');
  recordsFor(own,m.productFiles);recordsFor(own,m.legacy253Sources);recordsFor(own,m.installedInputs,root,own);recordsFor(own,m.workerBundles);if(JSON.stringify(installedPaths(own))!==JSON.stringify(m.installedInputs.map(r=>r.path).sort()))throw Error('EXACT_RUNTIME_INSTALLED_INVENTORY_DRIFT');
  for(const [dir,rows]of [[m.runtimeDriverRoot,m.runtimeDriverFiles],[m.runtimeTestRoot,m.runtimeTests]]){
   if(!dir||!fs.realpathSync(dir).startsWith(own+path.sep))throw Error('OWNED_RUNTIME_INPUT_REQUIRED');
   const actual=inventory(dir).map(p=>path.relative(own,p));if(JSON.stringify(actual)!==JSON.stringify(rows.map(f=>f.path).sort()))throw Error('RUNTIME_EXACT_INPUT_INVENTORY_DRIFT');recordsFor(own,rows);
  }
  for(const f of m.workerBundles)if(!fs.realpathSync(path.join(own,f.path)).startsWith(own+path.sep))throw Error('WORKER_REALPATH_ESCAPE');
  for(const [p,d]of [[m.officialExecutable,m.officialExecutableSha256],[m.privateExecutable,m.privateExecutableSha256]])if(hash(p)!==d)throw Error('READONLY_VENDOR_EXECUTABLE_DRIFT');
  if(!fs.realpathSync(m.privateExecutable).startsWith(own+path.sep))throw Error('PRIVATE_VENDOR_ESCAPE');
  for(const [p,prefix]of [[m.runRoot,'t1254-browser-evidence-'],[m.supervisorRoot,'t1254-browser-supervisor-']]){const st=fs.lstatSync(p);if(fs.realpathSync(p)!==path.join(fs.realpathSync('/tmp'),prefix+m.nonce)||!st.isDirectory()||st.uid!==process.getuid()||(st.mode&0o777)!==0o700)throw Error('EXACT_PRIVATE_LOG_ROOT_REQUIRED');}
  const socket=fs.realpathSync(m.pgSocketRoot),stat=fs.lstatSync(socket);
  if(socket!==path.join(fs.realpathSync('/tmp'),'t1254d-'+m.nonce)||stat.isSymbolicLink()||stat.uid!==process.getuid()||(stat.mode&0o777)!==0o700)throw Error('EXACT_OWNED_SHORT_PG_SOCKET_ROOT_REQUIRED');
 }
 requireFutureSlot(verifyBorn+verifyLimit,0);return {at:new Date().toISOString(),verifyBudgetMs:verifyLimit,verifyElapsedMs:performance.now()-verifyBorn,phase:runtime?'owned-runtime':'final-source',fullInputsSame:true,App:false,original170AndNew111NotExpanded:true};
}
module.exports={hash,inventory,verify,productInventory,recordsFor,doocsRunnerBudgets,verificationBudgets,ownedMetadataBudget,preparationBudgets,completeBudgets,gitEnv,verifyGitConsumer,installedPaths,verifyDynamic,requireFutureSlot,isMachO,dynamicRoots};

'use strict';
// 仅从本轮实际新seal及Root/peer当前准入编译派发数据；不clone/服务/SDK/model/浏览器。
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const C=require('./common.cjs');
const [jointPath,doocsPath,rootApprovalPath,peerApprovalPath,out]=process.argv.slice(2);
if(![jointPath,doocsPath,rootApprovalPath,peerApprovalPath,out].every(Boolean))throw Error('EXPLICIT_CURRENT_JOINT_DOOCS_ROOT_PEER_OUTPUT_REQUIRED');
const read=p=>JSON.parse(fs.readFileSync(p,'utf8')),hash=C.hash,m=read(jointPath),d=read(doocsPath),counts={original:170,official:103,protocol:7,pi:1,doocs:2};
if(m.acceptanceRound!==3||m.candidate==='50c7be39afb61b179bc599763f2b0f452fd6bf69'||! /^[a-f0-9]{40}$/.test(m.candidate)||m.workerBuildCandidate!==m.candidate||m.sealState!=='final-built-candidate'||d.candidate!==m.candidate||d.workerBuildCandidate!==m.candidate||d.expectedBodies.doocs!==2)throw Error('ROUND3_FRESH_HEAD_BUILT_PACKAGE_REQUIRED');
if(d.parentOriginalManifestSha256!==m.legacyManifests['browser-original'].sha256||d.parentNewManifestSha256!==m.legacyManifests['new-v3'].sha256||d.packageSha256!==m.packageSha256||d.dynamicClosureSha256!==m.dynamicClosureSha256)throw Error('DOOCS_MUST_INHERIT_CURRENT_SAME_PACKAGE_GRAPH_AND_PARENT_SEALS');
const root=fs.realpathSync(m.sourceRoot),node=fs.realpathSync(m.nodePath);if(fs.realpathSync(process.execPath)!==node||hash(node)!==m.nodeSha256)throw Error('CURRENT_FIXED_NODE_REQUIRED');
for(const [file,role]of [[rootApprovalPath,'root'],[peerApprovalPath,'peer']]){const a=read(file);if(a.role!==role||a.verdict!=='PASS'||a.candidate!==m.candidate||a.jointManifestSha256!==hash(jointPath)||a.doocsManifestSha256!==hash(doocsPath)||JSON.stringify(a.profileCounts)!==JSON.stringify(counts)||a.headClean!==true)throw Error('CURRENT_EXACT_TWO_ROLE_RUNTIME_ADMISSION:'+role);}
for(const p of [jointPath,doocsPath,rootApprovalPath,peerApprovalPath]){const s=fs.lstatSync(p);if(!s.isFile()||s.isSymbolicLink()||s.uid!==process.getuid())throw Error('OWNED_ACTUAL_INPUT_FILE_REQUIRED');}
const p=read(m.packageReceiptPath),workers=read(m.workerReceiptPath);if(p.candidate!==m.candidate||p.package_exit!==0||p.dmg_sha256!==m.packageSha256||workers.candidate!==m.candidate||workers.exitCode!==0||workers.workerBundles.length!==11||workers.workerBundles.some(w=>w.buildCandidate!==m.candidate))throw Error('ACTUAL_SAME_NEW_HEAD_PACKAGE_WORKER_RECEIPTS');
if(fs.existsSync(out))throw Error('FRESH_PRIVATE_DISPATCH_OUTPUT_ONLY');fs.mkdirSync(out,{mode:0o700});if(fs.realpathSync(out)!==path.resolve(out)||!out.startsWith(fs.realpathSync('/tmp')+path.sep))throw Error('OWNED_PRIVATE_OUTPUT_REQUIRED');
const evidence=path.join(out,'profile-evidence');fs.mkdirSync(evidence,{mode:0o700});
const toolRoot=__dirname,record=(p)=>({path:fs.realpathSync(p),sha256:hash(p)}),approvals=[record(rootApprovalPath),record(peerApprovalPath)],profiles=[];
for(const [profile,count]of Object.entries(counts)){
 const nonce=crypto.randomBytes(12).toString('hex');let positiveMs,args,env,plan;
 if(profile!=='doocs'){
  const family=C.PROFILES[profile].family,v=require(C.toolPath(root,m.privateToolRevisions[family].files.find(f=>f.name==='verify-binding.cjs').path));
  const sealed=C.sealedCandidate(m.legacyManifests[family]),legacy=v.revisedRunnerBudgets(sealed)[profile].outerMs,verify=C.verificationBudgets(),metadata=C.ownedMetadataBudget(read(m.dynamicClosurePath),root),prepare=v.revisedPrepareBudget().outerMs;
  plan={prepareMs:prepare,metadataMs:metadata.outerMs,typesMs:900000,originalLegacyRunnerMs:legacy,sourceVerifyMs:verify.sourceMs,runtimeVerifyMs:verify.runtimeMs,helperLifecycleMs:2160000,finalRootProofMs:180000,sourceIoAndMarginMs:600000};
  positiveMs=prepare+metadata.outerMs+900000+legacy+verify.sourceMs*2+verify.runtimeMs*3+2160000*3+180000+600000;
  args=[path.join(toolRoot,'run.cjs'),profile,nonce,fs.realpathSync(jointPath)];env={CREATOROS_FINAL_GUARD_SOURCE_ROOT:root,CREATOROS_FINAL_GUARD_RUNTIME_REVIEWED:'1',CREATOROS_FINAL_GUARD_REVIEWED_MANIFEST_SHA256:hash(jointPath),CREATOROS_T1246_PRIVATE_EVIDENCE_ROOT:evidence};
 }else{
  const verifier=path.join(toolRoot,'../doocs/driver/verify-binding.cjs'),v=require(verifier);plan=v.completeBudgets(d);positiveMs=plan.outerMs;args=[path.join(toolRoot,'../doocs/driver/complete-run.cjs'),nonce];env={CREATOROS_FINAL_GUARD_SOURCE_ROOT:root,CREATOROS_T1254_TOOL_REVIEWED:'1',CREATOROS_T1254_APPROVED_MANIFEST_PATH:fs.realpathSync(doocsPath),CREATOROS_T1254_REVIEWED_MANIFEST_SHA256:hash(doocsPath)};
 }
 Object.assign(env,{PATH:path.dirname(node)+':/opt/homebrew/bin:/usr/bin:/bin:/usr/sbin:/sbin',TMPDIR:'/private/tmp'});
 profiles.push({profile,nonce,count,node,nodeSha256:m.nodeSha256,cwd:root,args,childEnvironment:env,positiveMs,cleanupLifecycleMs:2160000,setupAndFinalMarginMs:600000,outerMs:positiveMs+2160000+600000,plan,minimumFreeBytes:(['original','official'].includes(profile)?18:12)*1024**3,observerRoot:path.join(out,profile),runtimeRoot:path.join(fs.realpathSync('/tmp'),`creatoros-playwright-t1246-${profile}-${nonce}`),dispatched:false});
}
const packet={schema:'T1246-round3-serial-runtime-packet/v1',candidate:m.candidate,sourceRoot:root,joint:record(jointPath),doocs:record(doocsPath),approvals,profileCounts:counts,profiles,serialOnly:true,packageReceipt:record(m.packageReceiptPath),workerReceipt:record(m.workerReceiptPath),inputsSourceMap:record(path.join(toolRoot,'../inputs/SOURCE_INPUT_MAP.json')),supervise:record(path.join(toolRoot,'supervise.cjs')),dispatchSource:record(path.join(toolRoot,'dispatch-once.cjs')),ownedHelper:{path:path.join(root,'docs/verification/t1246/round-2/unit/owned-pg-runtime.cjs'),sha256:'393f88771f732e57959ce948a61104fe616c6090faa3e21808186a6df7df3dea'},noRuntimePassClaim:true,App:false,Windows:false};
const output=path.join(out,'DISPATCH_INPUTS.json');fs.writeFileSync(output,JSON.stringify(packet,null,2)+'\n',{flag:'wx',mode:0o600});console.log(JSON.stringify({output,sha256:hash(output),candidate:m.candidate,counts,bodyExecuted:false}));

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {spawnSync} from 'node:child_process';
const allowed={
  "T1338": {
    "root": "/Volumes/T7-MacData/CodexBuilds/t1300-final-20261017-13dd66ce-907831dcd2/candidate/completed-fixture-t1338/t1300-candidate-DZW8rG",
    "key": "/Volumes/T7-MacData/CodexBuilds/t1338-legacy-work-parent-20261017-11c9cca0/cases/red-v2/legacy/private-master-key"
  },
  "T1339": {
    "root": "/Volumes/T7-MacData/CodexBuilds/t1300-final-20261017-13dd66ce-907831dcd2/candidate/completed-fixture-t1339/t1300-candidate-E85KCQ",
    "key": "/Volumes/T7-MacData/CodexBuilds/t1339-missing-actual-20261017-42fe69d6/fixture-application-key"
  }
};
function fail(message){throw Error('COMPLETED_FIXTURE_'+message);}
export function fileSha(file){const h=crypto.createHash('sha256'),fd=fs.openSync(file,'r'),chunk=Buffer.alloc(1024*1024);try{let n;while((n=fs.readSync(fd,chunk,0,chunk.length,null))>0)h.update(chunk.subarray(0,n));}finally{fs.closeSync(fd);chunk.fill(0);}return h.digest('hex');}
function realOwned(file){if(fs.realpathSync(file)!==file||fs.lstatSync(file).isSymbolicLink()||fs.statSync(file).uid!==process.getuid())fail('REAL_OWNED_PATH_REQUIRED');}
function assertNoDatabaseProcess(root){const result=spawnSync('/usr/sbin/lsof',['-t','+D',path.join(root,'db')],{encoding:'utf8',timeout:120000});if(result.error||![0,1].includes(result.status)||result.stdout.trim())fail('SOURCE_DB_IN_USE_OR_UNOBSERVABLE');return{command:'lsof -t +D exact-owned-db',exitCode:result.status,activePids:[]};}
function proof(ref){if(!ref||typeof ref.path!=='string'||typeof ref.sha256!=='string')fail('PROOF_REQUIRED');realOwned(ref.path);if(fileSha(ref.path)!==ref.sha256)fail('PROOF_DRIFT');return JSON.parse(fs.readFileSync(ref.path,'utf8'));}
export function loadCompletedOwnedFixture(manifestPath){
 realOwned(path.resolve(manifestPath));const f=JSON.parse(fs.readFileSync(manifestPath,'utf8')),a=allowed[f.task];
 if(f.schema!=='creatoros-completed-owned-ui-fixture/v1'||!a||f.sourceRoot!==a.root||f.keyPath!==a.key||f.originalAgenticUnknown!==false||f.noConcurrentSourceProcess!==true)fail('EXACT_UI_SOURCE_BINDING_REQUIRED');
 realOwned(f.sourceRoot);realOwned(f.keyPath);assertNoDatabaseProcess(f.sourceRoot);if((fs.statSync(f.keyPath).mode&0o777)!==0o600)fail('ORIGINAL_KEY_MODE');
 const stop=proof(f.receipts.controllerStop),ready=proof(f.receipts.originalReady),sourceAfter=proof(f.receipts.previousSourceAfter),execution=proof(f.receipts.uiExecution),outer=proof(f.receipts.uiOuter),cleanup=proof(f.receipts.browserCleanup),business=proof(f.receipts.businessSnapshot),copy=proof(f.receipts.originalCopy),previous=proof(f.receipts.previousFixture);
 if(stop.exitCode!==143||stop.expired!==false||stop.error!==null||!Array.isArray(stop.remaining)||stop.remaining.length!==2||stop.remaining.some(row=>row.current!==null)||stop.sourceAfterUiReceipt!==f.receipts.previousSourceAfter.path)fail('EXACT_CONTROLLER_STOP_REQUIRED');
 if(ready.ownedRoot!==f.sourceRoot||ready.sourceHead!=='13dd66ceb3b296461b54f544b78aab3a08058b6b'||ready.startupVerified!==true||ready.completedOwnedFixture?.copyReceipt!==f.receipts.originalCopy.path||sourceAfter.unchanged!==true)fail('ORIGINAL_LAUNCH_AND_SOURCE_PROOF_REQUIRED');
 if(execution.exitCode!==0||execution.expired!==false||execution.error!==null||execution.afterInputDrift?.length!==0||execution.remainingOwnedGroup?.length!==0||!Array.isArray(execution.registeredChildrenAfterCleanup)||execution.registeredChildrenAfterCleanup.some(row=>row.current!==null))fail('COMPLETED_UI_CLEANUP_REQUIRED');
 if(outer.exitCode!==0||outer.expired!==false||outer.error!==null||outer.wrapperIdentityAfter!==null||cleanup.browserCreated!==true||cleanup.browserClosed!==true||cleanup.modelRootSubmitted!==false)fail('BROWSER_AND_OUTER_COMPLETED_REQUIRED');
 if(copy.destinationRoot!==f.sourceRoot||copy.sourceRoot!==previous.sourceRoot||previous.keyPath!==f.keyPath||copy.sourceUnchanged!==true||copy.copiedAuthenticationOrPrivateKey!==false||JSON.stringify(copy.copiedOnly)!==JSON.stringify(['db','media','workspaces']))fail('KNOWN_ORIGINAL_KEY_PROVENANCE_REQUIRED');
 if(f.task==='T1338'){
  if(business.state!=='NATIVE_READY_AND_READ_ONLY'||business.allDataUnchanged!==true||business.modelRoots!==0||JSON.stringify(business.before)!==JSON.stringify(business.after))fail('COMPLETED_CONTENT_WITNESS_REQUIRED');
 }else if(business.state!=='PUBLIC_MANUAL_PUBLICATION_NUMERIC_UI_PASS'||business.manualFixture!==true||business.externalPublishing!==false||business.realPlatformMetrics!==false||business.modelRoots!==0||JSON.stringify(business.before)!==JSON.stringify(business.after)||business.before.models.some(rows=>rows.length!==0))fail('COMPLETED_PUBLICATION_WITNESS_REQUIRED');
 return f;
}

export function treeInventory(root){
 if(!fs.existsSync(root))return{present:false,directories:[],files:[]};realOwned(root);const directories=[],files=[];
 function visit(dir){for(const entry of fs.readdirSync(dir,{withFileTypes:true}).sort((a,b)=>a.name.localeCompare(b.name))){const file=path.join(dir,entry.name),relative=path.relative(root,file);if(entry.isSymbolicLink())fail('SOURCE_SYMLINK_REJECTED');if(entry.isDirectory()){directories.push(relative);visit(file);}else if(entry.isFile()){const stat=fs.statSync(file);files.push({path:relative,bytes:stat.size,sha256:fileSha(file)});}else fail('SPECIAL_SOURCE_FILE');}}
 visit(root);return{present:true,directories,files};
}
function sourceInventory(f){return Object.fromEntries(['db','media','workspaces'].map(name=>[name,treeInventory(path.join(f.sourceRoot,name))]));}
function same(a,b){return JSON.stringify(a)===JSON.stringify(b);}
export function copyCompletedOwnedFixture(f,ownedRoot){
 realOwned(ownedRoot);const sourceIdle=assertNoDatabaseProcess(f.sourceRoot),before=sourceInventory(f);if(!before.db.present)fail('SOURCE_DB_REQUIRED');const copied={};
 for(const name of ['db','media','workspaces']){const source=path.join(f.sourceRoot,name),destination=path.join(ownedRoot,name);if(fs.existsSync(destination))fail('NEW_DESTINATION_REQUIRED');if(before[name].present){fs.cpSync(source,destination,{recursive:true,errorOnExist:true,force:false});fs.chmodSync(destination,0o700);}else fs.mkdirSync(destination,{mode:0o700});copied[name]=treeInventory(destination);if(before[name].present&&!same(before[name],copied[name]))fail('COPY_CONTENT_MISMATCH');if(!before[name].present&&(copied[name].files.length||copied[name].directories.length))fail('ABSENT_SOURCE_DEST_NOT_EMPTY');}
 const after=sourceInventory(f);if(!same(before,after))fail('SOURCE_CHANGED_DURING_COPY');
 return{task:f.task,sourceRoot:f.sourceRoot,destinationRoot:ownedRoot,sourceIdle,sourceBefore:before,copied,sourceAfterCopy:after,sourceUnchanged:true,copiedOnly:['db','media','workspaces'],copiedAuthenticationOrPrivateKey:false,modelTaskCreated:false};
}
export function verifyOriginalUnchanged(f,before){const after=sourceInventory(f);return{task:f.task,sourceRoot:f.sourceRoot,sourceAfterUI:after,unchanged:same(before,after)};}
export function fixtureKeyBytes(f){realOwned(f.keyPath);if((fs.statSync(f.keyPath).mode&0o777)!==0o600)fail('KEY_MODE_CHANGED');const encoded=fs.readFileSync(f.keyPath);try{const result=Buffer.from(encoded.toString('utf8').trim(),'base64');if(result.length!==32){result.fill(0);fail('KEY_LENGTH');}return result;}finally{encoded.fill(0);}}

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {spawnSync} from 'node:child_process';
const allowed={T1328:{root:"/Volumes/T7-MacData/CodexBuilds/t1328-final-controlled-lock-ui-20261017/seed-v3",key:"/Volumes/T7-MacData/CodexBuilds/t1328-final-controlled-lock-ui-20261017/seed-v3/private/fixture-application-key"}};
function fail(message){throw Error('COMPLETED_FIXTURE_'+message);}
export function fileSha(file){const h=crypto.createHash('sha256'),fd=fs.openSync(file,'r'),chunk=Buffer.alloc(1024*1024);try{let n;while((n=fs.readSync(fd,chunk,0,chunk.length,null))>0)h.update(chunk.subarray(0,n));}finally{fs.closeSync(fd);chunk.fill(0);}return h.digest('hex');}
function realOwned(file){if(fs.realpathSync(file)!==file||fs.lstatSync(file).isSymbolicLink()||fs.statSync(file).uid!==process.getuid())fail('REAL_OWNED_PATH_REQUIRED');}
function assertNoDatabaseProcess(root){const result=spawnSync('/usr/sbin/lsof',['-t','+D',path.join(root,'db')],{encoding:'utf8',timeout:120000});if(result.error||![0,1].includes(result.status)||result.stdout.trim())fail('SOURCE_DB_IN_USE_OR_UNOBSERVABLE');return{command:'lsof -t +D exact-owned-db',exitCode:result.status,activePids:[]};}
function proof(ref){if(!ref||typeof ref.path!=='string'||typeof ref.sha256!=='string')fail('PROOF_REQUIRED');realOwned(ref.path);if(fileSha(ref.path)!==ref.sha256)fail('PROOF_DRIFT');return JSON.parse(fs.readFileSync(ref.path,'utf8'));}
export function loadCompletedOwnedFixture(manifestPath){
 realOwned(path.resolve(manifestPath));const f=JSON.parse(fs.readFileSync(manifestPath,'utf8')),a=allowed[f.task];
 if(f.schema!=='creatoros-completed-owned-ui-fixture/v1'||!a||f.sourceRoot!==a.root||f.keyPath!==a.key||f.originalAgenticUnknown!==false||f.noConcurrentSourceProcess!==true)fail('EXACT_CLOSED_SEED_V3_REQUIRED');
 realOwned(f.sourceRoot);realOwned(f.keyPath);assertNoDatabaseProcess(f.sourceRoot);if((fs.statSync(f.keyPath).mode&0o777)!==0o600||fs.statSync(f.keyPath).size!==44)fail('ORIGINAL_BASE64_KEY_MODE');
 const handoff=proof(f.receipts.handoff),cleanup=proof(f.receipts.cleanup),execution=proof(f.receipts.execution),outer=proof(f.receipts.outer),index=proof(f.receipts.outputIndex);
 for(const item of index.refs)if(fileSha(item.path)!==item.sha256||fs.statSync(item.path).size!==item.bytes)fail('TERMINAL_INDEX_DRIFT');
 if(handoff.state!=='CONTROLLED_NATURAL_SOURCE_LOCKS_TERMINAL'||handoff.confirmed!==true||handoff.syntheticCLI!==true||handoff.supplierCalls!==0||handoff.noSQLCandidateOrSettledInsertion!==true||handoff.receipts.length!==2||handoff.fixtureApplicationKey.path!==f.keyPath||handoff.fixtureApplicationKey.format!=='base64_ascii'||handoff.fixtureApplicationKey.decodedKeyBytes!==32||handoff.fixtureApplicationKey.degraded!==false)fail('TERMINAL_HANDOFF_REQUIRED');
 if(handoff.tasks.length!==4||handoff.executions.length!==4||handoff.calls.length!==8||handoff.tasks.some(x=>x.status!=='succeeded')||handoff.executions.some(x=>x.status!=='succeeded')||handoff.calls.some(x=>x.status!=='settled'))fail('ALL_REAL_LEDGER_TERMINAL_REQUIRED');
 const [first,second]=handoff.receipts;if(first.projectId!==second.projectId||first.outputId!==second.outputId||first.masterId!==second.masterId||first.versionId===second.versionId||first.source.conversationId===second.source.conversationId||first.source.sourceMessageId===second.source.sourceMessageId||handoff.receipts.some(x=>x.locked.status!=='locked'||x.prediction.status!=='locked'||x.confirmations.length!==1||x.locked.baseline.versionId!==x.versionId))fail('TWO_DISTINCT_LOCKED_SOURCES_REQUIRED');
 if(cleanup.actions.length!==5||cleanup.actions.some(x=>x.state!=='COMPLETED')||cleanup.errors.length!==0)fail('STOP_AND_DISPOSE_COMPLETED_REQUIRED');
 if(execution.exitCode!==0||execution.expired!==false||execution.error!==null||execution.afterInputDrift.length!==0||execution.remainingOwnedGroup.length!==0||execution.registeredChildrenAfterCleanup.length!==14||execution.registeredChildrenAfterCleanup.some(x=>x.actualIdentityAfterCleanup!==null))fail('EXECUTION_CLOSED_REQUIRED');
 if(outer.exitCode!==0||outer.expired!==false||outer.actualIdentityAfter!==null||outer.actions.length!==0)fail('OUTER_CLOSED_REQUIRED');
 for(const name of ['db','media','workspaces'])if(handoff.data[name]!==path.join(f.sourceRoot,name))fail('EXACT_DATA_ROOT_REQUIRED');
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
export function fixtureKeyBytes(f){realOwned(f.keyPath);if((fs.statSync(f.keyPath).mode&0o777)!==0o600)fail('KEY_MODE_CHANGED');const encoded=fs.readFileSync(f.keyPath);try{const value=encoded.toString('ascii');const result=Buffer.from(value,'base64');if(encoded.length!==44||result.length!==32||result.toString('base64')!==value){result.fill(0);fail('KEY_LENGTH');}return result;}finally{encoded.fill(0);}}

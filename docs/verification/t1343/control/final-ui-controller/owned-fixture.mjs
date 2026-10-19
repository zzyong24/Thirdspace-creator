// 仅本轮已关闭、已知key的确定性渲染夹具；原观察器1保持，原源始终不打开。
import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {isDeepStrictEqual} from 'node:util';
import {fileSha, treeInventory} from '../../../t1328/final-integration/runtime/formal-ui-acceptance/prediction-lock-seed/runtime/final-ui-controller/owned-fixture.mjs';
export {fileSha, treeInventory, copyCompletedOwnedFixture, verifyOriginalUnchanged, fixtureKeyBytes} from '../../../t1328/final-integration/runtime/formal-ui-acceptance/prediction-lock-seed/runtime/final-ui-controller/owned-fixture.mjs';

const ROOT='/Volumes/T7-MacData/CodexBuilds/t1343-legacy-bare-render-20261018/green-v1';
const KEY=ROOT+'/private/fixture-application-key';
const TASK='ai-task-46c2b534-28';
function fail(message){throw Error('T1343_CLOSED_RENDER_'+message);}
function exact(condition,message){if(!condition)fail(message);}
function realOwned(file){exact(path.isAbsolute(file)&&fs.realpathSync(file)===file&&!fs.lstatSync(file).isSymbolicLink()&&fs.statSync(file).uid===process.getuid(),'REAL_OWNED_PATH_REQUIRED');}
function proof(ref){exact(ref&&typeof ref.path==='string'&&/^[a-f0-9]{64}$/.test(ref.sha256),'PROOF_REQUIRED');realOwned(ref.path);exact(fileSha(ref.path)===ref.sha256,'PROOF_DRIFT');return JSON.parse(fs.readFileSync(ref.path,'utf8'));}
export function loadCompletedOwnedFixture(manifestPath){
  realOwned(path.resolve(manifestPath));
  const f=JSON.parse(fs.readFileSync(manifestPath,'utf8'));
  exact(f.schema==='creatoros-completed-owned-ui-fixture/v1'&&f.task==='T1343'&&f.sourceRoot===ROOT&&f.keyPath===KEY&&f.originalAgenticUnknown===false&&f.noConcurrentSourceProcess===true,'EXACT_ORIGINAL_RENDER_REQUIRED');
  realOwned(ROOT);realOwned(KEY);
  exact((fs.statSync(KEY).mode&0o777)===0o600&&fs.statSync(KEY).size===44,'ORIGINAL_BASE64_KEY_MODE');
  const idle=spawnSync('/usr/sbin/lsof',['-t','+D',path.join(ROOT,'db')],{encoding:'utf8',timeout:120000});
  exact(!idle.error&&[0,1].includes(idle.status)&&!idle.stdout.trim(),'SOURCE_DATABASE_IN_USE_OR_UNOBSERVABLE');
  const h=proof(f.receipts.handoff),cleanup=proof(f.receipts.cleanup),execution=proof(f.receipts.execution),outer=proof(f.receipts.outer);
  const failure=proof(f.receipts.primaryFailure),latest=proof(f.receipts.renderLatest),intent=proof(f.receipts.createIntent),requests=proof(f.receipts.requests),index=proof(f.receipts.outputIndex);
  for(const item of index.files){realOwned(item.path);exact(fileSha(item.path)===item.sha256&&fs.statSync(item.path).size===item.bytes,'ORIGINAL_OUTPUT_INDEX_DRIFT');}
  exact(h.state==='RENDER_AWAITING_CONFIRMATION_ORIGINAL_RGB_TEST_FAILED'&&h.originalTaskId===TASK&&h.originalSourceStatus==='awaiting_confirmation'&&h.confirmCalled===false&&h.newRenderRootsTotal===2,'PENDING_RENDER_HANDOFF_REQUIRED');
  exact(h.task.id===TASK&&h.task.status==='awaiting_confirmation'&&h.task.errorMessage===null&&h.task.adoptedAssetIds.length===0&&h.task.execType==='video.render'&&isDeepStrictEqual(latest.task,h.task),'EXACT_UNADOPTED_TASK_REQUIRED');
  exact(h.task.manifest.meta.visualReview.status==='skipped'&&h.visualReview.status==='skipped'&&h.publicObservedSupplierCalls===0&&h.privateTotalSupplierCalls==='NOT_EXPOSED','SUPPLIER_EVIDENCE_LIMIT_REQUIRED');
  exact(h.fixtureApplicationKey.path===KEY&&h.fixtureApplicationKey.format==='base64_ascii'&&h.fixtureApplicationKey.fileBytes===44&&h.fixtureApplicationKey.decodedBytes===32&&h.fixtureApplicationKey.mode==='0600','KEY_FORMAT_REQUIRED');
  exact(h.scope.accountId===null&&h.scope.userId===h.task.userId&&h.projectId===h.task.projectId,'SOURCE_SCOPE_REQUIRED');
  exact(intent.id==='execution.tasks.create'&&intent.body.projectId===h.projectId&&intent.body.contentOutputId===h.contentOutputId&&isDeepStrictEqual(intent.body.spec,h.task.spec),'ORIGINAL_OUTPUT_AND_SPEC_BINDING_REQUIRED');
  const creates=requests.filter(r=>r.id==='execution.tasks.create');
  exact(creates.length===1&&isDeepStrictEqual(creates[0].input.body,intent.body)&&isDeepStrictEqual(creates[0].scope,h.scope)&&!requests.some(r=>r.id==='execution.tasks.confirm'),'ORIGINAL_SINGLE_UNCONFIRMED_REQUEST_REQUIRED');
  exact(failure.taskId===TASK&&failure.name==='AssertionError'&&failure.message.startsWith('原蓝/橙几何与背景须在原坐标可见，不能缩成右栏或空舞台:'),'ORIGINAL_RGB_OBSERVER_FAILURE_REQUIRED');
  exact(cleanup.persistence==='DISPOSED'&&cleanup.network.length===0&&cleanup.backendCancelCalled===false&&cleanup.oldTaskNeverResent===true,'ORIGINAL_DISPOSE_REQUIRED');
  exact(execution.exitCode===1&&execution.expired===false&&execution.error===null&&execution.afterInputDrift.length===0&&execution.remainingOwnedGroup.length===0&&execution.registeredChildrenAfterCleanup.length===3&&execution.registeredChildrenAfterCleanup.every(r=>r.actualIdentityAfterCleanup===null),'ORIGINAL_EXECUTION_ONE_AND_CLOSED_REQUIRED');
  exact(outer.exitCode===1&&outer.expired===false&&outer.error===null&&outer.current===null&&outer.cleanup.length===0,'ORIGINAL_OUTER_ONE_AND_CLOSED_REQUIRED');
  for(const name of ['db','media','workspaces'])exact(h.data[name]===path.join(ROOT,name),'EXACT_DATA_ROOT_REQUIRED');
  const closed=proof(h.closedDB),snapshot=proof(h.closedSnapshot);
  exact(closed.closed===true&&closed.exitCode===1&&closed.stdout===''&&closed.inspectedAfterWrapperExit===true,'CLOSED_DATABASE_PROOF_REQUIRED');
  exact(snapshot.state==='CLOSED_SOURCE_FOR_COPY_NOT_REOPENED'&&snapshot.sourceRoot===ROOT&&snapshot.keyContentsReadForThisSnapshot===false,'CLOSED_SNAPSHOT_REQUIRED');
  const actual=['db','media','workspaces'].flatMap(name=>treeInventory(path.join(ROOT,name)).files.map(row=>({...row,path:path.join(ROOT,name,row.path)})));
  const ordered=rows=>rows.toSorted((a,b)=>a.path.localeCompare(b.path));
  exact(isDeepStrictEqual(ordered(actual),ordered(snapshot.files)),'CLOSED_SOURCE_SNAPSHOT_DRIFT');
  exact(fileSha(path.join(ROOT,'workspaces',TASK,'out','final.mp4'))===h.finalSHA256,'ORIGINAL_RENDER_BYTES_DRIFT');
  return f;
}

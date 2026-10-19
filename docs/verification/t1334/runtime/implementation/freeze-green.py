"""只重算精确实现增量；原wrapper仍完整验证整个实际输入闭包。"""
from pathlib import Path
import json,hashlib,datetime
repo=Path(__file__).resolve().parents[5];here=Path(__file__).resolve().parent
base=Path('/Volumes/T7-MacData/CodexBuilds/t1334-tool-visibility-20261017-706cfbe7');phase=base/'green-v1'
previous=base/'red-v3/PRE_RUN_LOCK.json';after=base/'red-v3/run/execution-result.json';actual=json.loads(after.read_text());assert actual['afterInputDrift']==[] and actual['remainingOwnedGroup']==[] and all(v['actualIdentityAfterCleanup'] is None for v in actual['registeredChildrenAfterCleanup'])
lock=json.loads(previous.read_text());rows={v['path']:v for v in lock['files']}
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
def add(p):
 p=Path(p);name=str(p.relative_to(repo)) if p.is_relative_to(repo) else str(p);rows[name]={'path':name,'bytes':p.stat().st_size,'sha256':sha(p)}
for v in json.loads((here/'BASELINE.json').read_text())['files']:
 p=Path(v['path']);old=Path(v['snapshotPath']);assert sha(old)==v['sha256'];add(p);add(old)
assert sha(repo/'frontend/src/server/__module_integration__/agentic-task-tool-visibility.persistence-client.test.ts')=='7eedc2ee6872fd03507803635b7e78ab96f26314cb0ef21d6aadca534034b2d1'
for p in here.iterdir():
 if p.is_file() and p.name not in ['GREEN_READY_INDEX.json']:add(p)
for p in (phase/'checks').iterdir():
 if p.is_file():add(p)
for p in [phase/'WORKER_BINDING.json',base/'worker-green.cjs',base/'worker-green.metafile.json']:add(p)
lock.update(phase='GREEN_V1',recordedAt=datetime.datetime.now(datetime.timezone.utc).isoformat(),files=[rows[k]for k in sorted(rows)],reuseProof={'priorLockPath':str(previous),'priorLockSha256':sha(previous),'priorFullAfterVerificationPath':str(after),'priorFullAfterVerificationSha256':sha(after),'priorFullAfterDrift':[],'exactProductionDelta':['ai-worker/src/execution/codex-agentic-worker-run.ts'],'exactTestDelta':['ai-worker/src/execution/codex-agentic-worker-run.test.ts'],'unmodifiedProductionDependencies':'C/R explicit 0W stable window through this execution','wholeTreeRehashAtDeltaFreeze':False,'wrapperFullBeforeAndAfterVerificationRequired':True})
p=phase/'PRE_RUN_LOCK.json';assert not p.exists();p.write_text(json.dumps(lock,ensure_ascii=False,indent=2)+'\n');print(json.dumps({'path':str(p),'sha256':sha(p),'files':len(lock['files']),'links':len(lock['links']),'inheritedFromActualFullAfter':True}))

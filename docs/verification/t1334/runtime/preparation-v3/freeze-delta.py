"""沿上次完整after核验继承未变字节，仅锁本次测试/标签差分；开跑仍由wrapper全量核。"""
from pathlib import Path
import json,hashlib,datetime
repo=Path(__file__).resolve().parents[5]
here=Path(__file__).resolve().parent
base=Path('/Volumes/T7-MacData/CodexBuilds/t1334-tool-visibility-20261017-706cfbe7')
previous=base/'red-v2/PRE_RUN_LOCK.json';after=base/'red-v2/run/execution-result.json';actual=json.loads(after.read_text());assert actual['afterInputDrift']==[] and actual['remainingOwnedGroup']==[] and all(v['actualIdentityAfterCleanup'] is None for v in actual['registeredChildrenAfterCleanup'])
lock=json.loads(previous.read_text());rows={v['path']:v for v in lock['files']}
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
def add(p):
 p=Path(p);name=str(p.relative_to(repo)) if p.is_relative_to(repo) else str(p);rows[name]={'path':name,'bytes':p.stat().st_size,'sha256':sha(p)}
test=repo/'frontend/src/server/__module_integration__/agentic-task-tool-visibility.persistence-client.test.ts';old=base/'red-v2/source-before-v3'/test.name;assert sha(old)==rows[str(test.relative_to(repo))]['sha256'];add(test)
for p in here.iterdir():
 if p.is_file():add(p)
add(base/'red-v3/WORKER_BINDING.json')
lock.update(phase='RED_V3',recordedAt=datetime.datetime.now(datetime.timezone.utc).isoformat(),files=[rows[k]for k in sorted(rows)],reuseProof={'priorLockPath':str(previous),'priorLockSha256':sha(previous),'priorFullAfterVerificationPath':str(after),'priorFullAfterVerificationSha256':sha(after),'priorFullAfterDrift':[],'unmodifiedProductionDependencies':'C/R explicit 0W stable window through this execution','wholeTreeRehashAtDeltaFreeze':False,'wrapperFullBeforeAndAfterVerificationRequired':True})
p=base/'red-v3/PRE_RUN_LOCK.json';assert not p.exists();p.write_text(json.dumps(lock,ensure_ascii=False,indent=2)+'\n');print(json.dumps({'path':str(p),'sha256':sha(p),'files':len(lock['files']),'links':len(lock['links']),'inheritedFromActualFullAfter':True}))

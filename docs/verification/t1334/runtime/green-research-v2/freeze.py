from pathlib import Path
import json,hashlib,datetime
repo=Path(__file__).resolve().parents[5];here=Path(__file__).resolve().parent;base=Path('/Volumes/T7-MacData/CodexBuilds/t1334-tool-visibility-20261017-706cfbe7');phase=base/'green-research-v2';previous=base/'green-v1/PRE_RUN_LOCK.json';after=base/'green-v1/run/execution-result.json';actual=json.loads(after.read_text());assert actual['afterInputDrift']==[] and actual['remainingOwnedGroup']==[] and all(v['actualIdentityAfterCleanup'] is None for v in actual['registeredChildrenAfterCleanup'])
lock=json.loads(previous.read_text());rows={v['path']:v for v in lock['files']}
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
def add(p):
 name=str(p.relative_to(repo)) if p.is_relative_to(repo) else str(p);rows[name]={'path':name,'bytes':p.stat().st_size,'sha256':sha(p)}
for p in here.iterdir():
 if p.is_file() and p.name!='READY_INDEX.json':add(p)
for p in phase.iterdir():
 if p.is_file() and p.name!='PRE_RUN_LOCK.json':add(p)
delta=json.loads((here/'DEPENDENCY_DELTA.json').read_text());links=lock['links']+[{k:v for k,v in row.items()if k in ['path','target']}for row in delta['links']]
lock.update(phase='GREEN_RESEARCH_V2',recordedAt=datetime.datetime.now(datetime.timezone.utc).isoformat(),files=[rows[k]for k in sorted(rows)],links=links,reuseProof={'priorLockPath':str(previous),'priorLockSha256':sha(previous),'priorFullAfterVerificationPath':str(after),'priorFullAfterVerificationSha256':sha(after),'priorFullAfterDrift':[],'productionAndPublicTestUnchanged':True,'controlledIoShimUnchanged':True,'workerBytesUnchanged':True,'wholeTreeRehashAtDeltaFreeze':False,'wrapperFullBeforeAndAfterVerificationRequired':True,'dependencyDelta':delta['links']})
p=phase/'PRE_RUN_LOCK.json';assert not p.exists();p.write_text(json.dumps(lock,ensure_ascii=False,indent=2)+'\n');print(json.dumps({'path':str(p),'sha256':sha(p),'files':len(lock['files']),'links':len(lock['links'])}))

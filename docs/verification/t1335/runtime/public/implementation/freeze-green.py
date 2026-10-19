from pathlib import Path
import json,hashlib,datetime
here=Path(__file__).resolve().parent;repo=next(p for p in here.parents if(p/'frontend/package.json').is_file()and(p/'backend/package.json').is_file());base=Path('/Volumes/T7-MacData/CodexBuilds/t1335-knowledge-native-binding-20261017-5f1a8e6d');phase=base/'green-v1';previous=base/'red-v1/PRE_RUN_LOCK.json';after=base/'red-v1/run/execution-result.json';actual=json.loads(after.read_text());assert actual['afterInputDrift']==[]and actual['remainingOwnedGroup']==[]and all(v['actualIdentityAfterCleanup']is None for v in actual['registeredChildrenAfterCleanup']);lock=json.loads(previous.read_text());rows={v['path']:v for v in lock['files']}
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
def add(p):
 name=str(p.relative_to(repo))if p.is_relative_to(repo)else str(p);rows[name]={'path':name,'bytes':p.stat().st_size,'sha256':sha(p)}
add(repo/'backend/src/modules/ai/agentic-proposal-staging.service.ts')
for name in ['backend/src/modules/ai/agentic-proposal-staging.service.test.ts','backend/src/modules/ai/execution-codex-agentic-candidate.test.ts']:
 assert name not in rows and name not in lock.get('absentPaths',[])
assert sha(repo/'frontend/src/server/__module_integration__/agentic-knowledge-native-binding.persistence-client.test.ts')=='6807cf390956eb44ffe102100037adb950b2023505c02afc340d82c63a99e4b8'
for p in here.iterdir():
 if p.is_file()and p.name!='GREEN_READY_INDEX.json':add(p)
for p in phase.iterdir():
 if p.is_file()and p.name!='PRE_RUN_LOCK.json':add(p)
binding=json.loads((here/'GREEN_BINDING.json').read_text());lock.update(phase='T1335_PUBLIC_GREEN_V1',recordedAt=datetime.datetime.now(datetime.timezone.utc).isoformat(),files=[rows[k]for k in sorted(rows)],links=lock['links']+binding['links'],reuseProof={'priorLockPath':str(previous),'priorLockSha256':sha(previous),'priorFullAfterVerificationPath':str(after),'priorFullAfterVerificationSha256':sha(after),'priorFullAfterDrift':[],'onlyProductDelta':'backend/src/modules/ai/agentic-proposal-staging.service.ts','publicTestIoRunnerConfigUnchanged':True,'RBackendTestsNotInConsumedClosure':True,'workerBytesUnchanged':True,'wholeTreeRehashAtDeltaFreeze':False,'wrapperFullBeforeAndAfterVerificationRequired':True})
p=phase/'PRE_RUN_LOCK.json';assert not p.exists();p.write_text(json.dumps(lock,ensure_ascii=False,indent=2)+'\n');print(json.dumps({'path':str(p),'sha256':sha(p),'files':len(lock['files']),'links':len(lock['links'])}))

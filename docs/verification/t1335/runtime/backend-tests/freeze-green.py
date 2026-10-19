from pathlib import Path
import json,hashlib,datetime
here=Path(__file__).resolve().parent
repo=next(p for p in here.parents if (p/'backend/package.json').is_file())
base=Path('/Volumes/T7-MacData/CodexBuilds/t1335-backend-boundaries-20261017-8cb8e94d')
def digest(p):
 h=hashlib.sha256()
 with p.open('rb') as f:
  for chunk in iter(lambda:f.read(1024*1024),b''):h.update(chunk)
 return h.hexdigest()
red=base/'red-v1';result_path=red/'run/execution-result.json';result=json.loads(result_path.read_text())
assert result['exitCode']==1 and result['error'] is None and result['afterInputDrift']==[] and result['remainingOwnedGroup']==[]
assert all(r['actualIdentityAfterCleanup'] is None for r in result['registeredChildrenAfterCleanup'])
prior=red/'PRE_RUN_LOCK.json';lock=json.loads(prior.read_text());rows={r['path']:r for r in lock['files']}
changes=[]
for name in ['backend/src/modules/ai/agentic-proposal-staging.service.ts','backend/src/modules/ai/execution-codex-agentic-candidate.test.ts']:
 p=repo/name;before=rows[name];after={'path':name,'bytes':p.stat().st_size,'sha256':digest(p)}
 changes.append({'path':name,'before':before,'after':after});rows[name]=after
own=str(Path(__file__).resolve().relative_to(repo));rows[own]={'path':own,'bytes':Path(__file__).stat().st_size,'sha256':digest(Path(__file__))}
lock.update(phase='T1335_BACKEND_green-v1',recordedAt=datetime.datetime.now(datetime.timezone.utc).isoformat(),files=[rows[k] for k in sorted(rows)],incrementalPreparation={'baselineLock':{'path':str(prior),'sha256':digest(prior)},'baselineActualAfterZero':{'path':str(result_path),'sha256':digest(result_path)},'changes':changes,'addedHelper':own,'fullCurrentPreflightNotYetRun':True,'fullWrapperBeforeAndAfterStillRequired':True,'reason':'Root授权以实际RED after0为未改项基线，仅唯一service修复及已准foreign-evidence真实FK夹具变化；不将增量准备冒当场全树核验。'})
phase=base/'green-v1';phase.mkdir(mode=0o700,exist_ok=False)
out=phase/'PRE_RUN_LOCK.json';out.write_text(json.dumps(lock,ensure_ascii=False,indent=2)+'\n')
print(json.dumps({'path':str(out),'sha256':digest(out),'files':len(rows),'links':len(lock['links']),'delta':changes}))

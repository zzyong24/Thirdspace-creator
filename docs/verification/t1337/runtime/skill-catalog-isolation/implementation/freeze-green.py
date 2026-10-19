from pathlib import Path
import ast,datetime,hashlib,json
here=Path(__file__).resolve().parent;repo=next(p for p in here.parents if (p/'ai-worker/package.json').is_file())
base=Path('/Volumes/T7-MacData/CodexBuilds/t1337-skill-catalog-isolation-20261017-df9381d3');red=base/'red-v1';phase=base/'green-v1'
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
old=json.loads((red/'PRE_RUN_LOCK.json').read_bytes());after=json.loads((red/'run/execution-result.json').read_bytes())
assert after['afterInputDrift']==[] and after['remainingOwnedGroup']==[] and all(r['actualIdentityAfterCleanup']is None for r in after['registeredChildrenAfterCleanup'])
rows={r['path']:r for r in old['files']};links={r['path']:r for r in old['links']}
def add(p):
 name=str(p.relative_to(repo))if p.is_relative_to(repo)else str(p);rows[name]={'path':name,'bytes':p.stat().st_size,'sha256':sha(p)}
stable=json.loads((here/'SOURCE_BINDING.json').read_bytes())
for r in stable['files']:
 p=repo/r['path'];assert p.stat().st_size==r['bytes']and sha(p)==r['sha256'];add(p)
checks=[]
for label in ['collection','worker-type','owned-build','unit']:
 p=base/'unit'/(label+'-RESULT.json');r=json.loads(p.read_bytes());assert r['exitCode']==0;checks.append(r);add(p);add(Path(r['log']))
unit=json.loads((base/'unit/vitest-result.json').read_bytes());assert unit['numFailedTests']==0;add(base/'unit/vitest-result.json')
for p in here.iterdir():
 if p.is_file()and p.name!='READY_INDEX.json':add(p)
for p in phase.iterdir():
 if p.is_file()and p.name!='PRE_RUN_LOCK.json':add(p)
b=json.loads((phase/'WORKER_BINDING.json').read_bytes());a=json.loads((red/'WORKER_BINDING.json').read_bytes())
before={r['path']:r for r in a['actualSourceInputs']};current={r['path']:r for r in b['actualSourceInputs']};changed=[p for p in sorted(set(before)|set(current))if before.get(p)!=current.get(p)]
expected=[str(repo/'ai-worker/src/execution/codex-agentic-worker-run.ts'),str(repo/'ai-worker/src/execution/codex-app-server.ts')];assert changed==expected
for r in b['links']:links[r['path']]=r
for n in ['check.py','freeze-green.py']:ast.parse((here/n).read_text())
(here/'CHECKS.json').write_text(json.dumps({'checks':checks,'unitPassed':unit['numPassedTests'],'unitFailed':0,'workerType':0,'ownedWorkerInputsChanged':changed,'originalPublicTestAndIOUnchanged':True,'frontendTypeInheritedFromRedAssembly':'新publictest未改；当场52.4737498s实际0；本次修改仅worker两源，worker fulltype另10.1725969s实际0','sharedDistWrites':0},ensure_ascii=False,indent=2)+'\n');add(here/'CHECKS.json')
old.update(state='ACTUAL_T1337_GREEN_INPUTS',recordedAt=datetime.datetime.now(datetime.timezone.utc).isoformat(),files=[rows[k]for k in sorted(rows)],links=[links[k]for k in sorted(links)],greenDelta={'priorRedLockSha256':sha(red/'PRE_RUN_LOCK.json'),'priorRedAfterSha256':sha(red/'run/execution-result.json'),'priorRedAfterDrift':[],'productionChanged':expected,'newOwnedWorkerSha256':b['sha256'],'wholeTreeRehashAtDeltaFreeze':False,'wrapperFullBeforeAfterVerificationMandatory':True,'samePublicTestAndIO':True})
p=phase/'PRE_RUN_LOCK.json';assert not p.exists();p.write_text(json.dumps(old,ensure_ascii=False,indent=2)+'\n');print(json.dumps({'path':str(p),'sha256':sha(p),'files':len(rows),'links':len(links),'workerSha256':b['sha256'],'unitPassed':unit['numPassedTests']},ensure_ascii=False))

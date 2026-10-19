from pathlib import Path
import json,hashlib,subprocess,sys,ast
here=Path(__file__).resolve().parent
repo=next(p for p in here.parents if(p/'frontend/package.json').is_file()and(p/'backend/package.json').is_file())
base=Path('/Volumes/T7-MacData/CodexBuilds/t1339-missing-actual-20261017-42fe69d6');phase=base/'green-v1';target=phase/'PRE_RUN_LOCK.json'
assert not target.exists()
# 原RED freezer逐字保持；其原有green分支当场锁当前源/依赖/同RED原件。
subprocess.run([sys.executable,str(here.parent/'preparation/freeze.py'),'green-v1'],cwd=repo,check=True)
lock=json.loads(target.read_text());old=json.loads((base/'red-v1/PRE_RUN_LOCK.json').read_text());rows={x['path']:x for x in lock['files']}
def sha(p):
 h=hashlib.sha256()
 with p.open('rb')as f:
  for chunk in iter(lambda:f.read(1048576),b''):h.update(chunk)
 return h.hexdigest()
def add(p):
 name=str(p.relative_to(repo))if p.is_relative_to(repo)else str(p)
 rows[name]={'path':name,'bytes':p.stat().st_size,'sha256':sha(p)}
for name in ['unit.config.mts','unit-run.py','unit-collect.py','launch.py','freeze-green.py','PLANNED_SERVICE.diff','PLANNED_SERVICE_SOURCE.json','PRODUCT_SOURCE.json','PRODUCT_DIFF.diff','CONCURRENT_PRODUCT_DELTA.json']:
 p=here/name
 if p.suffix=='.py':ast.parse(p.read_text())
 add(p)
for name in ['calibration.service.test.ts','calibration.acceptance.test.ts','calibration.contract.test.ts','calibration.repository.integration.test.ts','default-rubric.test.ts']:
 add(repo/'backend/src/modules/calibration'/name)
add(base/'unit-v1/COLLECTION_RESULT.json');add(base/'unit-v1/collection.log')
for label in ['backend-type','frontend-type','collection']:
 r=json.loads((phase/(label+'-RESULT.json')).read_text());assert r['exitCode']==0;add(phase/(label+'-RESULT.json'));add(phase/(label+'.log'))
# 不把已独审的并发修复冒作B修改；精确并发delta需单独提供原/新SHA与Root授权事实。
delta=[]
for r in old['files']:
 name=r['path']
 if name.split('/')[0]in['backend','frontend','ai-worker','contract','node_modules']and name in rows and rows[name]['sha256']!=r['sha256']:delta.append(name)
concurrent=json.loads((here/'CONCURRENT_PRODUCT_DELTA.json').read_text());expected={'backend/src/modules/calibration/calibration.service.ts'}|{r['path']for r in concurrent['files']}
assert set(delta)==expected,{'actual':delta,'expected':sorted(expected)}
for r in concurrent['files']:assert rows[r['path']]['sha256']==r['currentSha256']
lock.update(files=[rows[k]for k in sorted(rows)],greenProductionDelta=delta,bOwnedProductionDelta=['backend/src/modules/calibration/calibration.service.ts'],concurrentProductDelta=concurrent,unitCount=json.loads((base/'unit-v1/COLLECTION_RESULT.json').read_text())['count'],publicFreshCases=1,completedOriginalHistoryCases=1,redInputsPreserved=True,unitWrapperSharesExactGreenInputs=True)
target.write_text(json.dumps(lock,ensure_ascii=False,indent=2)+'\n');print(json.dumps({'path':str(target),'sha256':sha(target),'files':len(rows),'links':len(lock['links']),'actualProductionDelta':delta},ensure_ascii=False))

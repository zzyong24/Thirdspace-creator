from pathlib import Path
import ast,datetime,hashlib,json,os,re
here=Path(__file__).resolve().parent
repo=next(p for p in here.parents if (p/'frontend/package.json').is_file() and (p/'backend/package.json').is_file())
base=Path('/Volumes/T7-MacData/CodexBuilds/t1337-skill-catalog-isolation-20261017-df9381d3');phase=base/'red-v1'
previous=Path('/Volumes/T7-MacData/CodexBuilds/t1335-knowledge-native-binding-20261017-5f1a8e6d/green-v1/PRE_RUN_LOCK.json')
prior_after=previous.parent/'run/execution-result.json'
old=json.loads(previous.read_bytes());after=json.loads(prior_after.read_bytes())
assert after['afterInputDrift']==[] and after['remainingOwnedGroup']==[]
baseline=json.loads((here/'PRODUCTION_BASELINE.json').read_bytes())
def sha(p):
 h=hashlib.sha256()
 with p.open('rb') as f:
  for chunk in iter(lambda:f.read(1024*1024),b''):h.update(chunk)
 return h.hexdigest()
for row in baseline['files']:
 p=repo/row['path'];assert p.stat().st_size==row['bytes'] and sha(p)==row['sha256']
probe=json.loads((here.parent/'probe/RESULT.json').read_bytes())
assert probe['state']=='ACTUAL_AUTOMATIC_SKILL_CATALOG_FALSE_CONFIRMED'
assert probe['config']['automaticSkillInstructions']=={'type':'boolean','value':False}
assert probe['cleanup']['actualIdentityAfter'] is None and probe['cleanup']['remainingOwnedGroup']==[]
rows={};links={}
old_browser='/Volumes/T7-MacData/CodexBuilds/t1300-final-20261017-7f371055a6ac/candidate/sidecar/frontend/browsers'
new_sidecar=Path('/Volumes/T7-MacData/CodexBuilds/t1300-final-20261017-1334-b8fc27fb53d2/candidate/sidecar')
def relevant(name):
 p=Path(name)
 if p.is_absolute():
  if name.startswith(old_browser+'/'):return Path(name.replace(old_browser,str(new_sidecar/'frontend/browsers'),1))
  if name.startswith('/opt/'):return p
  if p.is_relative_to(repo):return relevant(str(p.relative_to(repo)))
  return None
 if p.parts[0] not in ['backend','frontend','ai-worker','contract','node_modules'] and name not in ['package.json','pnpm-lock.yaml']:return None
 if p.parts[0]!='node_modules' and (re.search(r'\.(test|spec)\.',p.name) or any(x in p.parts for x in ['__module_integration__','__tests__','tests'])):return None
 return repo/p
def add(p):
 name=str(p.relative_to(repo)) if p.is_relative_to(repo) else str(p)
 assert p.name!='session.json' and 'auth.json' not in p.name
 rows[name]={'path':name,'bytes':p.stat().st_size,'sha256':sha(p)}
for row in old['files']:
 p=relevant(row['path'])
 if p is not None:add(p)
for row in old.get('links',[]):
 p=relevant(row['path'])
 if p is not None:
  name=str(p.relative_to(repo)) if p.is_relative_to(repo) else str(p)
  links[name]={'path':name,'target':os.readlink(p)}
for p in (new_sidecar/'lib').rglob('*'):
 if p.is_file():add(p)
for p in here.iterdir():
 if p.is_file() and p.name!='READY_INDEX.json':add(p)
for p in phase.iterdir():
 if p.is_file() and p.name!='PRE_RUN_LOCK.json':add(p)
for p in [repo/'frontend/src/server/__module_integration__/agentic-skill-catalog-isolation.persistence-client.test.ts',repo/'docs/features/t1337-agentic-token-budget-diagnosis.md',here.parent/'probe/RESULT.json',here.parent/'probe/OUTER_RESULT.json',here.parent/'probe/ACTUAL_INPUTS.json']:
 add(p)
b=json.loads((phase/'WORKER_BINDING.json').read_bytes());add(Path(b['nodePath']));add(Path(b['executionWorkerPath']))
for row in b['links']:links[row['path']]=row
for name in ['run.py','freeze.py','check.py']:ast.parse((here/name).read_text())
checks=[]
for label in ['syntax-worker','syntax-cli','collection','frontend-type']:
 r=json.loads((phase/(label+'-RESULT.json')).read_bytes());assert r['exitCode']==0;checks.append(r)
(here/'CHECKS.json').write_text(json.dumps({'state':'OFFLINE_CHECKS_PASS_ZERO_ITS','checks':checks,'pythonAst':'run.py/freeze.py/check.py AST通过','executedIts':0,'productionWrites':0},ensure_ascii=False,indent=2)+'\n');add(here/'CHECKS.json')
lock={'state':'ACTUAL_T1337_RED_INPUTS','recordedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'specSha256':sha(repo/'docs/features/t1337-agentic-token-budget-diagnosis.md'),'files':[rows[k]for k in sorted(rows)],'links':[links[k]for k in sorted(links)],'absentPaths':[],
 'closure':'继承前次完整实际source/deps闭包，排除不消费的旧docs/旧运行/无关test；旧browser清单映射当前同包路径并当场全hash；新增本次test/helpers/phase worker/两依赖链接/当前Node与lib。不是声称测试目录absence冻结。',
 'reuseProof':{'priorLock':str(previous),'priorLockSha256':sha(previous),'priorAfter':str(prior_after),'priorAfterSha256':sha(prior_after),'priorAfterDrift':[],'actualAllRetainedInputsHashedNow':True,'workerSha256':b['sha256'],'workerCopiedFromActual7f1Package':True,'actualWorkerInputs281Unchanged':True},
 'productionBaseline':baseline,'actualFalseProbe':str(here.parent/'probe/RESULT.json'),'runtime':{'phase':str(phase),'supplierModels':0,'cases':['collect','material','research']}}
p=phase/'PRE_RUN_LOCK.json';assert not p.exists();p.write_text(json.dumps(lock,ensure_ascii=False,indent=2)+'\n')
print(json.dumps({'path':str(p),'sha256':sha(p),'files':len(rows),'links':len(links),'checks':'all0','productionWrites':0},ensure_ascii=False))

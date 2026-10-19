from pathlib import Path
import ast,datetime,hashlib,json,os,re,sys
here=Path(__file__).resolve().parent
repo=next(p for p in here.parents if(p/'frontend/package.json').is_file()and(p/'backend/package.json').is_file())
base=Path('/Volumes/T7-MacData/CodexBuilds/t1339-missing-actual-20261017-42fe69d6')
label=sys.argv[1];assert label in ['red-v1','green-v1'];phase=base/label;phase.mkdir(exist_ok=True,mode=0o700)
previous=Path('/Volumes/T7-MacData/CodexBuilds/t1337-skill-catalog-isolation-20261017-df9381d3/green-v1/PRE_RUN_LOCK.json')
prior_after=previous.parent/'run/execution-result.json';old=json.loads(previous.read_text());after=json.loads(prior_after.read_text());assert after['afterInputDrift']==[] and after['remainingOwnedGroup']==[]
def sha(p):
 h=hashlib.sha256()
 with p.open('rb') as f:
  for chunk in iter(lambda:f.read(1024*1024),b''):h.update(chunk)
 return h.hexdigest()
def relevant(name):
 p=Path(name)
 if p.is_absolute():return p if name.startswith('/opt/') else None
 if p.parts[0]not in ['backend','frontend','ai-worker','contract','node_modules']and name not in ['package.json','pnpm-lock.yaml']:return None
 if p.parts[0]!='node_modules'and(re.search(r'\.(test|spec)\.',p.name)or any(x in p.parts for x in ['__module_integration__','__tests__','tests'])):return None
 return repo/p
rows={};links={}
def add(p):
 assert p.name not in ['session.json','auth.json','fixture-application-key']
 name=str(p.relative_to(repo))if p.is_relative_to(repo)else str(p);rows[name]={'path':name,'bytes':p.stat().st_size,'sha256':sha(p)}
for r in old['files']:
 p=relevant(r['path'])
 if p is not None:add(p)
for r in old.get('links',[]):
 p=relevant(r['path'])
 if p is not None:
  name=str(p.relative_to(repo))if p.is_relative_to(repo)else str(p);links[name]={'path':name,'target':os.readlink(p)}
# 本次新增生产文件也纳当场闭包；不冻结别人的测试/absence，不复制依赖或源码。
for folder in ['backend/src','frontend/src','ai-worker/src','contract/src']:
 for p in (repo/folder).rglob('*'):
  if p.is_file()and not p.is_symlink()and relevant(str(p.relative_to(repo)))is not None:add(p)
for p in here.iterdir():
 if p.is_file()and p.name not in ['READY_INDEX.json']:add(p)
for name in ['frontend/src/server/__module_integration__/calibration-missing-actual.persistence-client.test.ts','docs/features/t1339-calibration-missing-actual-deviation-observation.md','docs/verification/t1339/control/OWNED_RUNTIME_AUTHORIZATION.json']:add(repo/name)
for name in ['collection-RESULT.json','frontend-type-RESULT.json']:
 p=phase/name;r=json.loads(p.read_text());assert r['exitCode']==0;add(p)
for name in ['run.py','freeze.py']:ast.parse((here/name).read_text())
service=rows['backend/src/modules/calibration/calibration.service.ts'];baseline=here/'SERVICE_BASELINE.json'
if label=='red-v1':
 assert not baseline.exists();baseline.write_text(json.dumps(service,indent=2)+'\n')
else:
 assert baseline.exists();original=json.loads(baseline.read_text());assert service['sha256']!=original['sha256']
 add(base/'red-v1/FIXTURE.json');add(base/'red-v1/CLEANUP.json');add(base/'red-v1/DOMAIN_FINAL.json');add(base/'red-v1/run/execution-result.json')
add(baseline)
lock={'state':'T1339_ACTUAL_'+label,'recordedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'files':[rows[k]for k in sorted(rows)],'links':[links[k]for k in sorted(links)],'absentPaths':[],'closure':'前次真实source/deps清单当场hash，排除其外盘worker/browser/旧docs/不消费tests；追加当前四src新增生产、本publictest/helpers/Node动态库。不复制SDK/源码/DB，不纳密钥/活动DB。','priorLock':str(previous),'priorLockSha256':sha(previous),'priorAfter':str(prior_after),'priorAfterSha256':sha(prior_after),'actualService':service,'baseline':json.loads(baseline.read_text()),'paidModels':0}
p=phase/'PRE_RUN_LOCK.json';assert not p.exists();p.write_text(json.dumps(lock,ensure_ascii=False,indent=2)+'\n');print(json.dumps({'path':str(p),'sha256':sha(p),'files':len(rows),'links':len(links)},ensure_ascii=False))

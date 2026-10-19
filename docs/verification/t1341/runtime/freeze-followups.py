from pathlib import Path
import json,hashlib,os,sys
runtime=Path(__file__).resolve().parent
repo=next(p for p in runtime.parents if(p/'frontend/package.json').is_file())
base=Path('/Volumes/T7-MacData/CodexBuilds/t1341-asset-real-tags-20261017-b1c02e13')
label=sys.argv[1];assert label in ['protection-backend','protection-frontend','material-1334','material-1335','material-1337']
phase=base/label;phase.mkdir(exist_ok=True,mode=0o700)
prior=base/'green-v1/PRE_RUN_LOCK.json';old=json.loads(prior.read_text())
rows={r['path']:r for r in old['files']};links={r['path']:r for r in old['links']}
def add(p):
 if not p.is_file():return
 name=str(p.relative_to(repo))if p.is_relative_to(repo)else str(p)
 rows[name]={'path':name,'bytes':p.stat().st_size,'sha256':hashlib.sha256(p.read_bytes()).hexdigest()}
folder=runtime/('protection'if label.startswith('protection')else'material-maintenance')
for p in folder.iterdir():
 if p.is_file():add(p)
if label.startswith('material'):
 key=label.split('-')[1]
 tests={'1334':'agentic-task-tool-visibility','1335':'agentic-knowledge-native-binding','1337':'agentic-skill-catalog-isolation'}
 add(repo/('frontend/src/server/__module_integration__/'+tests[key]+'.persistence-client.test.ts'))
 binding=json.loads((phase/'WORKER_BINDING.json').read_text());add(phase/'WORKER_BINDING.json');add(phase/'worker.cjs')
 for k in ['nodePath','chromiumExecutable']:
  if k in binding:add(Path(binding[k]))
 helpers={'1334':repo/'docs/verification/t1334/runtime/diagnostic-research-v3','1335':repo/'docs/verification/t1335/runtime/public/preparation','1337':repo/'docs/verification/t1337/runtime/skill-catalog-isolation/preparation'}
 for p in helpers[key].iterdir():
  if p.is_file()and p.suffix in ['.cjs','.json']:add(p)
else:
 add(repo/'docs/verification/t1328/runtime/implementation/working/final-u08-u10/runner/register-owned.cjs')
 family=label.split('-')[1]
 config=(folder/(family+'.config.mts')).read_text()
 import re
 for name in re.findall(r'"(src/[^" ]+\.(?:test|spec)\.[^" ]+)"',config):add(repo/family/name)
 add(repo/family/'vitest.config.ts')
# 所有继承输入在此只验证、不改其已冻字节；本次追加仅精确测试/helper/固定worker。
for r in rows.values():
 p=Path(r['path']);p=p if p.is_absolute()else repo/p
 assert p.stat().st_size==r['bytes'] and hashlib.sha256(p.read_bytes()).hexdigest()==r['sha256'],str(p)
for r in links.values():
 p=Path(r['path']);p=p if p.is_absolute()else repo/p
 assert os.readlink(p)==r['target'],str(p)
lock={**old,'state':'T1341_'+label,'files':list(rows.values()),'links':list(links.values()),'derivedFrom':str(prior),'derivedFromSha256':hashlib.sha256(prior.read_bytes()).hexdigest(),'selectedCaseFamily':label}
p=phase/'PRE_RUN_LOCK.json';assert not p.exists();p.write_text(json.dumps(lock,ensure_ascii=False,indent=2)+'\n');print(json.dumps({'path':str(p),'sha256':hashlib.sha256(p.read_bytes()).hexdigest(),'files':len(rows),'links':len(links)}))

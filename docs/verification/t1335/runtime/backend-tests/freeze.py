from pathlib import Path
import json,hashlib,datetime,shutil
here=Path(__file__).resolve().parent;repo=next(p for p in here.parents if(p/'backend/package.json').is_file());base=Path('/Volumes/T7-MacData/CodexBuilds/t1335-backend-boundaries-20261017-8cb8e94d')
import sys
label=sys.argv[1];assert label in ['red-v1','green-v1'];phase=base/label;phase.mkdir(mode=0o700,exist_ok=False)
prior=Path('/Volumes/T7-MacData/CodexBuilds/t1335-knowledge-native-binding-20261017-5f1a8e6d/red-v1/PRE_RUN_LOCK.json');original=json.loads(prior.read_text());rows={}
def digest(p):
 h=hashlib.sha256()
 with p.open('rb')as f:
  for chunk in iter(lambda:f.read(1024*1024),b''):h.update(chunk)
 return h.hexdigest()
def add(p):
 name=str(p.relative_to(repo))if p.is_relative_to(repo)else str(p);rows[name]={'path':name,'bytes':p.stat().st_size,'sha256':digest(p)}
for row in original['files']:
 p=Path(row['path']);p=p if p.is_absolute()else repo/p
 try:r=str(p.relative_to(repo))
 except ValueError:r=str(p)
 # 单元服务不消费frontend源码/B公共test/worker或其fixture；保真实SDK文件及backend/contract/worker生产、迁移与模版。
 keep=('/node_modules/'in str(p))or(r.startswith(('backend/','contract/','ai-worker/'))and not any(x in r for x in ['.test.','.spec.','__module_integration__','__tests__']))or r in ['package.json','pnpm-lock.yaml','pnpm-workspace.yaml']
 if keep:add(p)
for n in ['backend/src/modules/ai/agentic-proposal-staging.service.test.ts','backend/src/modules/ai/execution-codex-agentic-candidate.test.ts','backend/src/modules/ai/execution-agentic-candidate.service.test.ts','backend/package.json','backend/vitest.config.ts','backend/tsconfig.json','docs/features/t1335-agentic-knowledge-native-binding-canonical.md','docs/verification/t1335/control/backend-tests/OWNED_EXTERNAL_RUNTIME_AUTHORIZATION.json','docs/verification/t1328/runtime/implementation/working/final-u08-u10/runner/register-owned.cjs']:add(repo/n)
for n in ['run.py','freeze.py','vitest.config.mts']:add(here/n)
add(Path(shutil.which('node')).resolve())
links=[]
for row in original.get('links',[]):
 p=Path(row['path']);p=p if p.is_absolute()else repo/p
 if '/node_modules/'in str(p):links.append(row)
lock={'schema':1,'phase':'T1335_BACKEND_'+label,'recordedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'files':[rows[k]for k in sorted(rows)],'links':links,'absentPaths':[],'externalPaidModels':0,'serviceCombinationNotPublicWorker':True,'sourceDiscoveryReference':{'path':str(prior),'sha256':digest(prior),'filteredToActualBackendConsumerAndSdk':True,'allRetainedFilesRehashedNow':True},'otherPublicTestAndFixtureNotConsumedOrLocked':True}
p=phase/'PRE_RUN_LOCK.json';p.write_text(json.dumps(lock,ensure_ascii=False,indent=2)+'\n');print(json.dumps({'path':str(p),'sha256':digest(p),'files':len(rows),'links':len(links)}))

from pathlib import Path
import subprocess,json,hashlib,sys
runtime=Path(__file__).resolve().parent
repo=runtime.parents[4]
label=sys.argv[1]
assert label in ['red-v1','green-v1']
target=runtime/('INPUT_LOCK_'+label+'.json')
assert not target.exists(),'旧锁不得覆盖'
files=set()
for source in ['backend/src','contract/src','ai-worker/src','frontend/src']:
 for item in subprocess.check_output(['rg','--files',source],cwd=repo,text=True).splitlines():
  if any(part in item for part in ['.test.','.spec.','/__tests__/','/__module_integration__/','/e2e/','/stories/']):continue
  files.add(item)
for p in (repo/'backend/drizzle').rglob('*'):
 if p.is_file() and p.suffix in ['.sql','.json']:files.add(str(p.relative_to(repo)))
for item in ['package.json','pnpm-lock.yaml','pnpm-workspace.yaml','backend/package.json','backend/tsconfig.json','contract/package.json','contract/tsconfig.json','ai-worker/package.json','ai-worker/tsconfig.json','frontend/package.json','frontend/tsconfig.json','docs/features/t1331-pending-script-target-readable-selection.md','frontend/src/server/__module_integration__/script-review-confirmed-current.persistence-client.test.ts']:
 if (repo/item).is_file():files.add(item)
for name in ['ASSEMBLY.md','WORKER_BINDING.json','run.py','freeze.py','vitest.config.ts','register-process.cjs','worker-entry.fixture.cjs']:
 files.add(str((runtime/name).relative_to(repo)))
binding=json.loads((runtime/'WORKER_BINDING.json').read_text());files.add(binding['executionWorkerPath'])
for package in ['vitest','vite','tsx','typescript','@electric-sql/pglite']:
 p=repo/'frontend/node_modules'/package/'package.json'
 if p.is_file():files.add(str(p.resolve()))
rows=[]
for name in sorted(files):
 p=Path(name);p=p if p.is_absolute() else repo/p
 b=p.read_bytes();rows.append({'path':name,'bytes':len(b),'sha256':hashlib.sha256(b).hexdigest()})
link='docs/verification/t1331/runtime/worker/node_modules'
assert (repo/link).is_dir()
value={'schema':'t1331-formal-review-source-lock/v1','label':label,'files':rows,'links':[{'path':link,'target':str((repo/link).readlink())}],'absentPaths':[],'externalPaidModels':0,'workerSourceHead':binding['sourceHead'],'parallelSourceFacts':'含现已实现T1328/T1329/T1332源，worker固定7790/3851，仅model structured分支','excluded':'不消费的其它测试/历史docs原件不纳锁；迁移及所有真实生产源/新it/helpers/config/工具chain声明纳锁'}
target.write_text(json.dumps(value,ensure_ascii=False,indent=2)+'\n')
print(json.dumps({'path':str(target),'files':len(rows),'sha256':hashlib.sha256(target.read_bytes()).hexdigest()}))

"""仅锁实际源/依赖；不执行业务，不复制凭据，不构建。"""
from pathlib import Path
import hashlib,json,os,re,sys,datetime,shutil
here=Path(__file__).resolve().parent
repo=next(p for p in here.parents if (p/'frontend/package.json').is_file() and (p/'backend/package.json').is_file())
base=here.parent;label=sys.argv[1];assert re.fullmatch(r'(red|green)-v[1-9][0-9]*',label)
output=base/('INPUT_LOCK_'+label+'.json');assert not output.exists(),'旧锁不可覆盖'
files={};links={};packages=set();pending=[]
def name(p):
 try:return str(p.relative_to(repo))
 except ValueError:return str(p)
def add(p):
 p=Path(p);assert p.is_file(),str(p)
 h=hashlib.sha256()
 with p.open('rb') as f:
  for chunk in iter(lambda:f.read(1024*1024),b''):h.update(chunk)
 files[name(p)]={'path':name(p),'bytes':p.stat().st_size,'sha256':h.hexdigest()}
def link(p):
 if p.is_symlink():links[name(p)]={'path':name(p),'target':os.readlink(p)}
def package_at(pkg,basepath):
 for parent in [basepath,*basepath.parents]:
  p=parent/'node_modules'/pkg
  if (p/'package.json').is_file():link(p);return p.resolve()
 return None
for root in ['backend/src','backend/drizzle','contract/src','ai-worker/src','frontend/src']:
 for p in (repo/root).rglob('*'):
  if not p.is_file() or p.name=='.DS_Store':continue
  if root.endswith('/src') and (re.search(r'\.(test|spec)\.',p.name) or any(x in p.parts for x in ['__tests__','__module_integration__','e2e','stories'])):continue
  add(p)
for path in ['frontend/src/server/__module_integration__/legacy-work-parent-workspace.persistence-client.test.ts','frontend/src/test/empty-module.ts','docs/features/t1338-legacy-work-page-render-error-diagnosis.md','docs/verification/t1338/control/OWNED_RUNTIME_AUTHORIZATION.json','package.json','pnpm-lock.yaml','pnpm-workspace.yaml']:
 add(repo/path)
for w in ['frontend','backend','contract','ai-worker']:
 for f in ['package.json','tsconfig.json']:add(repo/w/f)
 for pkg in ['@creatoros/backend','@creatoros/contract','@creatoros/ai-worker']:link(repo/w/'node_modules'/pkg)
for p in here.iterdir():
 if p.is_file():add(p)
for f in ['OWNED_RUNTIME.json','ASSEMBLY.md']:add(base/f)
continuation=base/('CONTINUATION_'+label+'.json')
if continuation.is_file():add(continuation)
binding=json.loads((here/'WORKER_BINDING.json').read_text());worker=Path(binding['executionWorkerPath']);add(worker);link(worker.parent/'node_modules')
roots={repo/'frontend':['vitest','vite','typescript','next','react','react-dom','jsdom','@testing-library/react'],repo/'backend':['@electric-sql/pglite','drizzle-orm','zod','pg','ai'],worker.parent:['@openclaw/fs-safe','@playwright/test']}
for origin,pkgs in roots.items():
 for pkg in pkgs:
  resolved=package_at(pkg,origin);assert resolved is not None,(pkg,str(origin));pending.append(resolved)
while pending:
 p=pending.pop()
 if str(p) in packages:continue
 packages.add(str(p));metadata=json.loads((p/'package.json').read_text())
 for leaf in p.rglob('*'):
  if leaf.is_file() and 'node_modules' not in leaf.relative_to(p).parts:add(leaf)
 for pkg in list(metadata.get('dependencies',{}))+[k for k in metadata.get('peerDependencies',{}) if not metadata.get('peerDependenciesMeta',{}).get(k,{}).get('optional')]:
  resolved=package_at(pkg,p)
  if resolved is not None:pending.append(resolved)
node=Path(shutil.which('node')).resolve();add(node)
value={'schema':'t1338-owned-public-inputs/v1','label':label,'recordedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'executed':False,'files':[files[k] for k in sorted(files)],'links':[links[k] for k in sorted(links)],'absentPaths':[],'dependencyPackageRoots':sorted(packages),'meaning':'全部当前非test生产源是审计超集；实际新it/配置/helper/Next+JSDOM+DB+测试及不可变worker静态依赖闭包当场hash。排除不消费的其他test/docs；不声称全文件均被动态执行。','immutableWorker':binding,'paidModels':0}
output.write_text(json.dumps(value,ensure_ascii=False,indent=2)+'\n');print(json.dumps({'path':str(output),'files':len(files),'links':len(links),'packages':len(packages),'sha256':hashlib.sha256(output.read_bytes()).hexdigest()}))

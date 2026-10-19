"""只读实际来源/依赖字节，写本任务输入锁；不安装、不构建、不打开库。"""
from pathlib import Path
import hashlib,json,os,subprocess,sys,datetime,re
runtime=Path(__file__).resolve().parent
repo=runtime.parents[4]
external=Path('/Volumes/T7-MacData/CodexBuilds/t1334-tool-visibility-20261017-706cfbe7/red-v2')
mode=sys.argv[1] if len(sys.argv)>1 else 'PREPARATION'
assert re.fullmatch(r'(?:PREPARATION|(?:RED|GREEN)(?:_[A-Z0-9]+)*)',mode)
files={};links={};packages=set();pending=[]
def relative(p):
 try:return str(Path(p).relative_to(repo))
 except ValueError:return str(p)
def add(p):
 p=Path(p)
 if not p.is_file():return
 name=relative(p);h=hashlib.sha256()
 with p.open('rb') as f:
  for data in iter(lambda:f.read(1024*1024),b''):h.update(data)
 files[name]={'path':name,'bytes':p.stat().st_size,'sha256':h.hexdigest()}
def link(p):
 p=Path(p)
 if p.is_symlink():links[relative(p)]={'path':relative(p),'target':os.readlink(p)}
def find_package(name,base):
 for root in [base,*base.parents]:
  p=root/'node_modules'/name
  if (p/'package.json').is_file():link(p);return p.resolve()
 return None
for root in ['backend/src','backend/drizzle','contract/src','ai-worker/src','frontend/src']:
 for p in (repo/root).rglob('*'):
  if p.is_file() and p.name!='.DS_Store' and not any(x in p.name for x in ['.test.','.spec.']):add(p)
for name in ['pnpm-lock.yaml','package.json','frontend/package.json','backend/package.json','contract/package.json','ai-worker/package.json','frontend/tsconfig.json','backend/tsconfig.json','ai-worker/tsconfig.json','docs/features/t1334-agentic-codex-task-tool-visibility.md']:
 add(repo/name)
for p in runtime.iterdir():
 if p.is_file():add(p)
add(repo/'frontend/src/server/__module_integration__/agentic-task-tool-visibility.persistence-client.test.ts')
add(external/'WORKER_BINDING.json')
# 绑定宿主实际解析的关键SDK/数据库/测试工具及其已安装依赖闭包，不只抄package版本。
roots={'frontend':['vitest','vite','typescript','next','react','react-dom','@types/node'],'backend':['@electric-sql/pglite','drizzle-orm','pg','zod','ai'],'ai-worker':['@earendil-works/pi-ai','ai','zod','@openai/codex','@playwright/test','jsdom','@mozilla/readability','esbuild']}
missing=[]
for workspace,names in roots.items():
 for name in names:
  package=find_package(name,repo/workspace)
  if package:pending.append(package)
  else:missing.append({'package':name,'from':workspace})
codex=find_package('@openai/codex',repo/'ai-worker');assert codex
platform=find_package('@openai/codex-darwin-arm64',codex);assert platform,'NESTED_CODEX_PLATFORM_REQUIRED';pending.append(platform)
assert not missing,missing
while pending:
 package=pending.pop()
 if str(package) in packages:continue
 packages.add(str(package));metadata=json.loads((package/'package.json').read_text())
 for p in package.rglob('*'):
  if p.is_file() and 'node_modules' not in p.relative_to(package).parts:add(p)
 for name in metadata.get('dependencies',{}):
  dependency=find_package(name,package)
  if dependency:pending.append(dependency)
 for name in metadata.get('peerDependencies',{}):
  if metadata.get('peerDependenciesMeta',{}).get(name,{}).get('optional'):continue
  dependency=find_package(name,package)
  if dependency:pending.append(dependency)
for workspace in ['frontend','backend','ai-worker']:
 for name in ['@creatoros/backend','@creatoros/contract','@creatoros/ai-worker']:link(repo/workspace/'node_modules'/name)
for p in (repo/'ai-worker/dist').glob('*.cjs'):add(p)
binding=json.loads((external/'WORKER_BINDING.json').read_text());add(binding['nodePath']);add(binding['executionWorkerPath']);add(binding['chromiumExecutable']);add(external.parent/'worker-red.metafile.json')
for row in binding['actualSourceInputs']:
 p=Path(row['path']);h=hashlib.sha256(p.read_bytes()).hexdigest();assert p.stat().st_size==row['bytes'] and h==row['sha256'],str(p);add(p)
prior=json.loads((repo/'docs/verification/t1315/final-root/runtime/bound-806a42/FINAL_EXECUTION_INPUTS.json').read_text())
for row in prior['files']:
 p=Path(row['path']);add(p);assert files[relative(p)]['sha256']==row['sha256'] and files[relative(p)]['bytes']==row['bytes'],str(p)
for row in prior['links']:link(repo/row['path'])
node=Path(binding['nodePath']);node_lib=node.parent.parent/'lib'/'libnode.141.dylib';assert node_lib.is_file();add(node_lib)
dynamic=subprocess.check_output(['/usr/bin/otool','-L',str(node)],text=True)
for line in dynamic.splitlines()[1:]:
 name=line.strip().split(' (',1)[0]
 if name.startswith('/opt/homebrew/'):
  p=Path(name);link(p);add(p.resolve())
absent=['frontend/runtime/'+name for name in ['intelligence-generation-worker.cjs','execution-worker.cjs','agentic-worker.cjs','intelligence-transcript-worker.cjs','codex-status-worker.cjs']]
assert all(not (repo/name).exists() for name in absent)
result={'schema':'t1334-exact-controlled-inputs-v1','phase':mode,'recordedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'executed':False,'meaning':'真实工作树源库存超集与实际关键SDK/依赖闭包字节锚；不声称全部库存文件都在本次消费，不复制binary入Git','specSha256':hashlib.sha256((repo/'docs/features/t1334-agentic-codex-task-tool-visibility.md').read_bytes()).hexdigest(),'files':[files[k] for k in sorted(files)],'links':[links[k] for k in sorted(links)],'absentPaths':absent,'dependencyPackageRoots':sorted(packages),'nodeDynamicDependencies':dynamic,'externalPaidModels':0}
drift=[]
for row in result['files']:
 p=Path(row['path']);p=p if p.is_absolute() else repo/p;h=hashlib.sha256()
 with p.open('rb') as f:
  for data in iter(lambda:f.read(1024*1024),b''):h.update(data)
 if p.stat().st_size!=row['bytes'] or h.hexdigest()!=row['sha256']:drift.append(row['path'])
assert not drift,drift
out=external/'PRE_RUN_LOCK.json';out.write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n')
print(json.dumps({'path':str(out),'files':len(files),'links':len(links),'dependencyPackages':len(packages),'sha256':hashlib.sha256(out.read_bytes()).hexdigest()}))

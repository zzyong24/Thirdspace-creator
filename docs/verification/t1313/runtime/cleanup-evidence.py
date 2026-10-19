import json,hashlib,subprocess,datetime,tempfile
from pathlib import Path
runtime=Path(__file__).resolve().parent;root=runtime.parents[3]
runs=[]
for p in runtime.glob('*.json'):
 try:j=json.loads(p.read_text())
 except Exception:continue
 if isinstance(j,dict) and 'command' in j and 'pgid' in j:runs.append(j)
groups=sorted(set(j['pgid'] for j in runs));incomplete=[j['label'] for j in runs if 'exitCode' not in j]
ps=subprocess.run(['ps','-axo','pid=,ppid=,pgid=,etime=,command='],capture_output=True,text=True,check=True)
rows=[]
for line in ps.stdout.splitlines():
 parts=line.split(None,4)
 if len(parts)>=5 and int(parts[2]) in groups:rows.append({'pid':int(parts[0]),'ppid':int(parts[1]),'pgid':int(parts[2]),'elapsed':parts[3],'command':parts[4]})
roots=set()
for folder in runtime.iterdir():
 if not folder.is_dir() or folder.name.endswith('-snapshots'):continue
 for p in folder.glob('*-final.json'):
  try:j=json.loads(p.read_text())
  except Exception:continue
  value=j.get('root')
  if isinstance(value,str) and '/t1313-owned-review-' in value:roots.add(value)
checked=[{'path':p,'exists':Path(p).exists()} for p in sorted(roots)]
remaining=sorted({str(p) for directory in {Path('/private/tmp'),Path(tempfile.gettempdir())} for p in directory.glob('t1313-owned-review-*')})
cache=[]
for package in ['contract','ai-worker','backend','frontend','mcp-server']:
 folder=root/package/'node_modules/.vite'
 if folder.exists():
  for p in sorted(folder.rglob('*')):
   if p.is_file():
    b=p.read_bytes();cache.append({'path':str(p.relative_to(root)),'bytes':len(b),'sha256':hashlib.sha256(b).hexdigest(),'mtimeNs':p.stat().st_mtime_ns})
binding=json.loads((root/'docs/verification/t1313/WORKER_BINDING.json').read_text());worker=Path(binding['executionWorkerPath']);b=worker.read_bytes()
result={'checkedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'scope':'仅实际wrapper记录的owned PGID、已记录T1313临时根及精确前缀盘点；不声明全系统临时文件清零','ownedGroups':groups,'incompleteRuns':incomplete,'remainingRecordedGroupProcesses':rows,'recordedTemporaryRoots':checked,'remainingExactPrefixDirectories':remaining,'workerBinding':{'path':str(worker),'bytes':len(b),'sha256':hashlib.sha256(b).hexdigest(),'unchanged':hashlib.sha256(b).hexdigest()==binding['sha256']},'timeoutGateOriginalCacheFootprint':cache,'cacheInterpretation':'原verify命令五包固有当前足迹，未删缓存；非本任务全工作区新建文件因果清单','controlledServerLifecycle':'frontend afterEach实际closeAllConnections+await close；dispatcher.stop+dispose persistence+rm自有根；进程退出后以上PGID查询再次核验'}
(runtime/'RESOURCE_CLEANUP.json').write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n')
print(json.dumps({'groups':len(groups),'incompleteRuns':incomplete,'remainingGroupProcesses':rows,'rootsChecked':len(checked),'remainingRoots':[x for x in checked if x['exists']],'remainingExactPrefix':remaining,'cacheFiles':len(cache),'workerUnchanged':result['workerBinding']['unchanged']},ensure_ascii=False))
if incomplete or rows or any(x['exists'] for x in checked) or remaining:raise SystemExit(1)

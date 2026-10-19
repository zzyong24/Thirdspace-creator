import hashlib,json,subprocess,time
from pathlib import Path
runtime=Path(__file__).resolve().parent
repo=runtime.parents[3]
runs=[]
for path in sorted(runtime.glob('*.json')):
 value=json.loads(path.read_text())
 if isinstance(value,dict) and 'pgid' in value and 'command' in value:runs.append(value)
owned_groups={x['pgid'] for x in runs}
rows=[]
for line in subprocess.check_output(['ps','-axo','pid=,ppid=,pgid='],text=True).splitlines():
 fields=line.split()
 if len(fields)==3:
  pid,ppid,pgid=map(int,fields)
  if pgid in owned_groups:rows.append({'pid':pid,'ppid':ppid,'pgid':pgid})
details=[]
for row in rows:
 details.append(subprocess.check_output(['ps','-o','pid=,ppid=,pgid=,etime=,command=','-p',str(row['pid'])],text=True).strip())
cache=[]
for package in ['contract','ai-worker','backend','frontend','mcp-server']:
 for path in sorted((repo/package/'node_modules/.vite').rglob('*')):
  if path.is_file():
   data=path.read_bytes();cache.append({'path':str(path.relative_to(repo)),'bytes':len(data),'sha256':hashlib.sha256(data).hexdigest(),'mtime':path.stat().st_mtime})
value={'checkedAt':time.time(),'ownedGroups':[{'label':x['label'],'pid':x['pid'],'pgid':x['pgid'],'exitCode':x.get('exitCode')} for x in runs],'survivors':rows,'survivorDetails':details,'ownedTempDirectoriesRemaining':[str(p) for p in Path('/private/tmp').glob('t1311-owned-review-*')],'inherentOriginalTimeoutGateCaches':cache,'limits':'仅核已记录owned进程组及本轮专用临时根前缀；不清理未知目录、不触碰94030/65353及其它agent。缓存为原timeout命令固有派生，未改依赖源码。'}
(runtime/'RESOURCE_CLEANUP.json').write_text(json.dumps(value,ensure_ascii=False,indent=2)+'\n')
print(json.dumps({'ownedGroups':len(runs),'survivors':rows,'remainingTemp':value['ownedTempDirectoriesRemaining'],'cacheFiles':len(cache)},ensure_ascii=False))

from pathlib import Path
import subprocess,os,json,time,hashlib,sys,signal,uuid

runtime=Path(__file__).resolve().parent
repo=runtime.parents[4]
label=sys.argv[1]
case=sys.argv[2]
assert case in ['restore','reserved']
assert label in ['red','green'] or (label.startswith(('red-','green-')) and all(c.isalnum() or c=='-' for c in label))
assert os.environ.get('T1331_REVIEW_APPROVED')=='1','独立装配审未通过，不运行'
phase=label.split('-')[0]
lock=json.loads((runtime/('INPUT_LOCK_'+label+'.json')).read_text())
for row in lock['files']:
 p=Path(row['path']);p=p if p.is_absolute() else repo/p
 b=p.read_bytes();assert len(b)==row['bytes'] and hashlib.sha256(b).hexdigest()==row['sha256'],str(p)
for row in lock.get('links',[]):assert os.readlink(repo/row['path'])==row['target'],row['path']
for name in lock.get('absentPaths',[]):assert not (repo/name).exists(),name
run=runtime/('run-'+label+'-'+case);run.mkdir(exist_ok=False)
assert not (runtime/'cases'/label/case/'START.json').exists(),'旧run不得重发'
(run/'BEFORE_INPUTS.json').write_text(json.dumps(lock,ensure_ascii=False,indent=2)+'\n')
env=os.environ.copy();env.update(T1331_REVIEW_PHASE=phase,T1331_REVIEW_LABEL=label,T1331_REVIEW_CASE=case,T1331_REVIEW_RUN_ID=str(uuid.uuid4()))
cmd=[str(repo/'frontend/node_modules/.bin/vitest'),'run','--testNamePattern=^正式script.review确认当前版本/'+case+'$','--config',str(runtime/'vitest.config.ts'),'--reporter=json','--outputFile='+str(run/'vitest-result.json')]
start=time.monotonic();proc=None;expired=False;error=None;cleanup=[]
def write(name,value):(run/(name+'.json')).write_text(json.dumps(value,ensure_ascii=False,indent=2)+'\n')
def identity(pid):
 p=subprocess.run(['/bin/ps','-p',str(pid),'-o','pgid=,lstart=,comm='],capture_output=True,text=True)
 fields=p.stdout.strip().split(None,1)
 return {'pgid':int(fields[0]),'identity':fields[1]} if p.returncode==0 and len(fields)==2 else None
def wait(seconds):
 try:proc.wait(timeout=seconds)
 except subprocess.TimeoutExpired:pass
def group_rows(pgid):
 result=subprocess.run(['/bin/ps','-axo','pid=,pgid=,lstart=,comm='],capture_output=True,text=True)
 if result.returncode:raise RuntimeError('ProcessInventoryUnavailable')
 return [line.strip() for line in result.stdout.splitlines() if len(line.split())>2 and line.split()[1]==str(pgid)]
def owned_children():
 file=runtime/'cases'/label/case/'owned-processes.ndjson'
 if not file.exists():return []
 rows=[json.loads(line) for line in file.read_text().splitlines() if line]
 assert all(row['runId']==env['T1331_REVIEW_RUN_ID'] for row in rows)
 return rows
def same(row):return identity(row['pid'])=={'pgid':row['pgid'],'identity':row['identity']}
initial=None;remaining=[];registered=[];registered_after=[]
try:
 write('execution-start',{'runId':env['T1331_REVIEW_RUN_ID'],'command':cmd,'cwd':str(repo/'frontend'),'startedAt':time.time(),'outerSeconds':32400,'executionSeconds':31800,'cleanupReserveSeconds':600,'testMs':28800000,'hookMs':180000,'globalMs':30600000,'selectedCase':case,'serialPairOuterSeconds':64800,'retry':0,'externalPaidModels':0,'sharedDistWritten':False})
 with (run/'output.log').open('w') as output:
  proc=subprocess.Popen(cmd,cwd=repo/'frontend',env=env,stdout=output,stderr=subprocess.STDOUT,start_new_session=True)
  initial=identity(proc.pid);write('RUNNER_CHILD',{'pid':proc.pid,'identity':initial})
  if not initial or initial['pgid']!=proc.pid:raise RuntimeError('OwnedProcessIdentityUnavailable')
  try:proc.wait(timeout=31800)
  except subprocess.TimeoutExpired:expired=True
except BaseException as exc:error=type(exc).__name__
finally:
 if proc is not None and proc.poll() is None:
  if initial and identity(proc.pid)==initial:
   os.killpg(proc.pid,signal.SIGTERM);cleanup.append('TERM_OWNED_PGID');wait(120)
  else:error=error or 'RunnerIdentityChanged'
 if proc is not None and proc.poll() is None and initial and identity(proc.pid)==initial:
  os.killpg(proc.pid,signal.SIGKILL);cleanup.append('KILL_OWNED_PGID');wait(120)
 try:
  registered=owned_children()
  for row in registered:
   if same(row):os.kill(row['pid'],signal.SIGTERM);cleanup.append({'pid':row['pid'],'action':'TERM_IDENTITY_MATCHED_FORK'});error=error or 'HostCleanupLeftChild'
  until=time.monotonic()+120
  while time.monotonic()<until and any(same(row) for row in registered):time.sleep(.5)
  for row in registered:
   if same(row):os.kill(row['pid'],signal.SIGKILL);cleanup.append({'pid':row['pid'],'action':'KILL_IDENTITY_MATCHED_FORK'})
  until=time.monotonic()+120
  while time.monotonic()<until and any(same(row) for row in registered):time.sleep(.5)
  registered_after=[{**row,'actualIdentityAfterCleanup':identity(row['pid']),'identityMatchesAfterCleanup':same(row)} for row in registered]
  if any(row['identityMatchesAfterCleanup'] for row in registered_after):error=error or 'OwnedRegisteredChildRemains'
 except BaseException as exc:error=error or type(exc).__name__
 try:
  if proc is not None and initial:remaining=group_rows(initial['pgid'])
  if remaining:error=error or 'OwnedProcessRemains'
 except BaseException as exc:error=error or type(exc).__name__
 drift=[]
 for row in lock['files']:
  p=Path(row['path']);p=p if p.is_absolute() else repo/p
  try:
   b=p.read_bytes()
   if len(b)!=row['bytes'] or hashlib.sha256(b).hexdigest()!=row['sha256']:drift.append(row['path'])
  except OSError:drift.append(row['path'])
 for row in lock.get('links',[]):
  try:
   if os.readlink(repo/row['path'])!=row['target']:drift.append('link:'+row['path'])
  except OSError:drift.append('link:'+row['path'])
 for name in lock.get('absentPaths',[]):
  if (repo/name).exists():drift.append('expectedAbsent:'+name)
 write('execution-result',{'exitCode':proc.returncode if proc is not None else None,'expired':expired,'error':error,'elapsedSeconds':time.monotonic()-start,'cleanup':cleanup,'registeredChildrenAfterCleanup':registered_after,'remainingOwnedGroup':remaining,'afterInputDrift':drift,'externalPaidModels':0,'dataDir':str(runtime/'cases'/label/case/'db'),'originalTaskNotResubmitted':True})
code=proc.returncode if proc is not None else None
sys.exit(code if code is not None and error is None and not expired and not drift else 1)

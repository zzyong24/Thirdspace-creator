from pathlib import Path
import subprocess,os,json,time,hashlib,sys,signal,uuid

runtime=Path(__file__).resolve().parent
repo=next(p for p in runtime.parents if (p/'frontend/package.json').is_file() and (p/'backend/package.json').is_file())
external=Path('/Volumes/T7-MacData/CodexBuilds/t1341-asset-real-tags-20261017-b1c02e13')
label=sys.argv[1]
assert label in ['material-1334','material-1335','material-1337']
assert os.environ.get('T1341_PUBLIC_APPROVED')=='1','独立装配审未通过，不运行'
phase=external/label
lock=json.loads((phase/'PRE_RUN_LOCK.json').read_text())
before_hash_deadline=time.monotonic()+300
for row in lock['files']:
 p=Path(row['path']);p=p if p.is_absolute() else repo/p
 assert time.monotonic()<before_hash_deadline,'PreflightHashBudgetExpired'
 h=hashlib.sha256()
 with p.open('rb') as f:
  for chunk in iter(lambda:f.read(1024*1024),b''):h.update(chunk)
 assert p.stat().st_size==row['bytes'] and h.hexdigest()==row['sha256'],str(p)
for row in lock.get('links',[]):assert os.readlink(repo/row['path'])==row['target'],row['path']
for name in lock.get('absentPaths',[]):assert not (repo/name).exists(),name
run=phase/'run';run.mkdir(exist_ok=False)
assert not (phase/'execution-start.json').exists(),'旧run不得重发'
(run/'BEFORE_INPUTS.json').write_text(json.dumps(lock,ensure_ascii=False,indent=2)+'\n')
binding=json.loads((phase/'WORKER_BINDING.json').read_text())
runner_tmp=phase/'runner-tmp';runner_tmp.mkdir(mode=0o700)
env=os.environ.copy();env.update(TMPDIR=str(runner_tmp),TMP=str(runner_tmp),TEMP=str(runner_tmp),T1341_PHASE_ROOT=str(phase),T1341_RUN_ID=str(uuid.uuid4()),T1341_PHASE=label)
env.update(T1341_MAINTENANCE='1',T1334_PHASE_ROOT=str(phase),T1334_RUN_ID=env['T1341_RUN_ID'],T1334_CASES='material',T1334_CHROMIUM_EXECUTABLE=binding['chromiumExecutable'])
cmd=[binding['nodePath'],str(repo/'frontend/node_modules/vitest/vitest.mjs'),'run','--config',str(runtime/('vitest-'+label.split('-')[1]+'.config.mts')),'--reporter=json','--outputFile='+str(run/'vitest-result.json')]
execution_seconds=34200
outer_seconds=36600
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
 file=phase/'CHILDREN.ndjson'
 if not file.exists():return []
 rows=[json.loads(line) for line in file.read_text().splitlines() if line]
 assert all(row['runId']==env['T1341_RUN_ID'] for row in rows)
 return rows
def same(row):return identity(row['pid'])=={'pgid':row['pgid'],'identity':row['identity']}
initial=None;remaining=[];registered=[];registered_after=[]
try:
 write('execution-start',{'runId':env['T1341_RUN_ID'],'command':cmd,'cwd':str(repo/'frontend'),'startedAt':time.time(),'outerSeconds':outer_seconds,'executionSeconds':execution_seconds,'cleanupReserveSeconds':600,'testMs':28800000,'hookMs':180000,'retry':0,'externalPaidModels':0,'sharedDistWritten':False})
 with (run/'output.log').open('w') as output:
  proc=subprocess.Popen(cmd,cwd=repo/'frontend',env=env,stdout=output,stderr=subprocess.STDOUT,start_new_session=True)
  initial=identity(proc.pid);write('RUNNER_CHILD',{'pid':proc.pid,'identity':initial})
  if not initial or initial['pgid']!=proc.pid:raise RuntimeError('OwnedProcessIdentityUnavailable')
  try:proc.wait(timeout=execution_seconds)
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
 after_hash_deadline=time.monotonic()+300
 for row in lock['files']:
  if time.monotonic()>=after_hash_deadline:drift.append('AFTER_HASH_BUDGET_EXPIRED_INCOMPLETE');break
  p=Path(row['path']);p=p if p.is_absolute() else repo/p
  try:
   h=hashlib.sha256()
   with p.open('rb') as f:
    for chunk in iter(lambda:f.read(1024*1024),b''):h.update(chunk)
   if p.stat().st_size!=row['bytes'] or h.hexdigest()!=row['sha256']:drift.append(row['path'])
  except OSError:drift.append(row['path'])
 for row in lock.get('links',[]):
  try:
   if os.readlink(repo/row['path'])!=row['target']:drift.append('link:'+row['path'])
  except OSError:drift.append('link:'+row['path'])
 for name in lock.get('absentPaths',[]):
  if (repo/name).exists():drift.append('expectedAbsent:'+name)
 write('execution-result',{'exitCode':proc.returncode if proc is not None else None,'expired':expired,'error':error,'elapsedSeconds':time.monotonic()-start,'cleanup':cleanup,'registeredChildrenAfterCleanup':registered_after,'remainingOwnedGroup':remaining,'afterInputDrift':drift,'externalPaidModels':0,'dataDir':str(phase/'cases'), 'budgetCalculation':'单material原it28800s/原root1800s/maxTokens100000；global30600s，child34200s，before+afterhash各300s+cleanup600s+setup/report1200s=36600s外层；三个串行总outer117600s，不混用新public3600s帽子','originalTaskNotResubmitted':True})
code=proc.returncode if proc is not None else None
sys.exit(code if code is not None and error is None and not expired and not drift else 1)

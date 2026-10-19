"""最终公共driver外层。当前仅可 --collect；执行另需新runtime写权与最终binding。"""
from pathlib import Path
import os,sys,json,subprocess,signal,time,hashlib
root=(Path(__file__).resolve().parent/'../../../../../t1315/final-root').resolve()
repo=root.parents[3]
def digest(data):return hashlib.sha256(data).hexdigest()
def drift(lock):
 rows=[]
 for row in lock['files']:
  p=Path(row['path']);p=p if p.is_absolute() else repo/p
  try:
   data=p.read_bytes()
   if len(data)!=row['bytes'] or digest(data)!=row['sha256']:rows.append(row['path'])
  except OSError:rows.append(row['path'])
 for row in lock.get('links',[]):
  try:
   if os.readlink(repo/row['path'])!=row['target']:rows.append('link:'+row['path'])
  except OSError:rows.append('link:'+row['path'])
 for name in lock.get('absentPaths',[]):
  if (repo/name).exists():rows.append('expectedAbsent:'+name)
 return rows
def identity(pid):
 r=subprocess.run(['/bin/ps','-p',str(pid),'-o','pgid=,lstart=,comm='],capture_output=True,text=True)
 parts=r.stdout.strip().split(None,1)
 return {'pgid':int(parts[0]),'identity':parts[1]} if r.returncode==0 and len(parts)==2 else None
def group_rows(pgid):
 r=subprocess.run(['/bin/ps','-axo','pid=,pgid=,lstart=,comm='],capture_output=True,text=True)
 if r.returncode:raise RuntimeError('ProcessInventoryUnavailable')
 return [line.strip() for line in r.stdout.splitlines() if len(line.split())>2 and line.split()[1]==str(pgid)]
def main():
 if sys.argv[1:]==['--collect']:
  print(json.dumps({'state':'NOT_RUN_WRAPPER_COLLECTION_ONLY','caseCount':3,'u35Execution':'DELEGATED_TO_R_NOT_SUBMITTED_HERE','coverageSeconds':1800+7200+3*(1800+1800+1800)+(1800+28800+1800)+600,'outerSeconds':86400,'minimumPositiveSeconds':120,'sessionRead':False,'networkRequests':0,'modelSubmissions':0}));return 0
 assert sys.argv[1:]==['--execute'],'EXPLICIT_EXECUTION_MODE_REQUIRED'
 assert os.environ.get('T1315_FINAL_EXECUTION_APPROVED')=='1','ROOT_EXECUTION_AND_RUNTIME_WRITE_SCOPE_REQUIRED'
 file=Path(os.environ['T1315_FINAL_BINDING']);assert file.is_absolute();b=json.loads(file.read_text())
 assert b['mode']=='EXECUTION' and b['executionAuthorized'] is True
 proof=b['executionInputLock'];lock_bytes=Path(proof['path']).read_bytes();assert digest(lock_bytes)==proof['sha256'];lock=json.loads(lock_bytes)
 assert lock['state']=='FINAL_EXECUTION_INPUTS' and lock['confirmed'] is True
 assert lock['sourceHead']==b['finalCandidateBinding']['sourceHead'] and lock['packageSha256']==b['finalCandidateBinding']['packageSha256']
 assert not drift(lock),'PRE_START_INPUT_DRIFT_NO_SUBMISSION'
 run=Path(b['outputDirectory']).resolve();assert run.is_relative_to(root/'runtime');run.mkdir(parents=True,exist_ok=False)
 node=Path(b['runtime']['nodePath']);assert node.is_absolute() and node.is_file()
 assert any((Path(r['path']) if Path(r['path']).is_absolute() else repo/r['path']).resolve()==node.resolve() for r in lock['files']),'NODE_MUST_BE_IN_FINAL_LOCK'
 command=[str(node),str(Path(__file__).with_name('cases.cjs')),'--execute'];start=time.monotonic();proc=None;initial=None;error=None;expired=False;cleanup=[];registered=[];registered_after=[];remaining_group=[]
 def write(name,value):(run/(name+'.json')).write_text(json.dumps(value,ensure_ascii=False,indent=2)+'\n')
 def wait(seconds):
  try:proc.wait(timeout=seconds)
  except subprocess.TimeoutExpired:pass
 def same(row):return identity(row['pid'])=={'pgid':row['pgid'],'identity':row['identity']}
 try:
  write('OUTER_START',{'runId':b['runId'],'command':command,'cwd':str(repo),'computedCoverageSeconds':58200,'outerSeconds':86400,'executionSeconds':85800,'cleanupReserveSeconds':600,'perAgenticOriginalSeconds':1800,'u35OriginalSeconds':28800,'u35Execution':'DELEGATED_TO_R_NOT_SUBMITTED_HERE_ORIGINAL_LONG_OUTER_RETAINED','retry':0,'serviceOwnedBy':'C_FINAL_CANDIDATE_NOT_KILLED_BY_THIS_DRIVER'})
  with (run/'output.log').open('w') as output:
   proc=subprocess.Popen(command,cwd=repo,env=os.environ.copy(),stdout=output,stderr=subprocess.STDOUT,start_new_session=True)
   initial=identity(proc.pid);write('RUNNER_CHILD',{'pid':proc.pid,'actualIdentity':initial})
   if not initial or initial['pgid']!=proc.pid:raise RuntimeError('OwnedRunnerIdentityUnavailable')
   try:proc.wait(timeout=85800)
   except subprocess.TimeoutExpired:expired=True
 except BaseException as exc:error=type(exc).__name__
 finally:
  if proc is not None and proc.poll() is None:
   if initial and identity(proc.pid)==initial:os.killpg(proc.pid,signal.SIGTERM);cleanup.append('TERM_OWNED_DRIVER_GROUP');wait(120)
   else:error=error or 'OwnedRunnerIdentityChanged'
  if proc is not None and proc.poll() is None and initial and identity(proc.pid)==initial:os.killpg(proc.pid,signal.SIGKILL);cleanup.append('KILL_OWNED_DRIVER_GROUP');wait(120)
  try:
   registered_file=run/'owned-processes.ndjson'
   if registered_file.exists():registered=[json.loads(line) for line in registered_file.read_text().splitlines() if line]
   assert all(r['runId']==b['runId'] for r in registered)
   for row in registered:
    if same(row):os.kill(row['pid'],signal.SIGTERM);cleanup.append({'pid':row['pid'],'action':'TERM_IDENTITY_MATCHED_REGISTERED_DRIVER_FORK'});error=error or 'DriverCleanupLeftRegisteredChild'
   until=time.monotonic()+120
   while time.monotonic()<until and any(same(r) for r in registered):time.sleep(.5)
   for row in registered:
    if same(row):os.kill(row['pid'],signal.SIGKILL);cleanup.append({'pid':row['pid'],'action':'KILL_IDENTITY_MATCHED_REGISTERED_DRIVER_FORK'})
   until=time.monotonic()+120
   while time.monotonic()<until and any(same(r) for r in registered):time.sleep(.5)
   registered_after=[{**row,'actualIdentityAfterCleanup':identity(row['pid']),'identityMatchesAfterCleanup':same(row)} for row in registered]
   if any(r['identityMatchesAfterCleanup'] for r in registered_after):error=error or 'OwnedRegisteredChildRemains'
   if proc is not None and initial:remaining_group=group_rows(initial['pgid'])
   if remaining_group:error=error or 'OwnedDriverGroupRemains'
  except BaseException as exc:error=error or type(exc).__name__
  after=drift(lock);write('OUTER_RESULT',{'exitCode':proc.returncode if proc else None,'expired':expired,'error':error,'elapsedSeconds':time.monotonic()-start,'cleanup':cleanup,'registeredChildrenAfterCleanup':registered_after,'remainingOwnedGroup':remaining_group,'afterInputDrift':after,'noTaskCancelRetryResume':True,'candidateServiceStopped':False,'databaseOpenedByFixture':False,'modelsActuallyUsed':'ONLY_REAL_PUBLIC_CALL_RECEIPTS_CAN_ESTABLISH_COUNT'})
 return proc.returncode if proc is not None and error is None and not expired and not after else 1
if __name__=='__main__':sys.exit(main())

"""独立进程watchdog，覆盖wrapper完整前/后hash、执行与清理；不改任务deadline。"""
from pathlib import Path
import os,sys,json,time,signal,subprocess
runtime=Path(__file__).resolve().parent.parent
assert os.environ.get('T1338_FINAL_UI_APPROVED')=='1'
b=json.loads(Path(os.environ['T1338_FINAL_UI_BINDING']).read_text());external=Path(b['outputDirectory']).parent
label=b['runId'];case=b['caseId'];wrapper=runtime/'runner/run.py'
execution=34200
hash_setup_reserve=1800;cleanup_reserve=600;outer_seconds=execution+hash_setup_reserve+cleanup_reserve
root=external;root.mkdir(parents=True,exist_ok=True)
output=root/('outer-'+label+'-'+case);output.mkdir(exist_ok=False)
run=Path(b['outputDirectory'])
def identity(pid):
 p=subprocess.run(['/bin/ps','-p',str(pid),'-o','pgid=,lstart=,comm='],capture_output=True,text=True);parts=p.stdout.strip().split(None,1)
 return {'pgid':int(parts[0]),'identity':parts[1]}if p.returncode==0 and len(parts)==2 else None
def write(name,value):(output/(name+'.json')).write_text(json.dumps(value,ensure_ascii=False,indent=2)+'\n')
def terminate(signum,frame):raise KeyboardInterrupt('OUTER_TERMINATION')
signal.signal(signal.SIGTERM,terminate)
signal.signal(signal.SIGINT,terminate)
start=time.monotonic();proc=None;initial=None;expired=False;actions=[];failure=None
try:
 command=[sys.executable,str(wrapper),'--execute']
 with (output/'output.log').open('w') as log:
  proc=subprocess.Popen(command,stdout=log,stderr=subprocess.STDOUT,start_new_session=True);initial=identity(proc.pid)
  if initial is None or initial['pgid']!=proc.pid:raise RuntimeError('OUTER_INITIAL_IDENTITY_MISSING')
  write('START',{'command':command,'pid':proc.pid,'initial':initial,'executionSeconds':execution,'hashSetupReserveSeconds':hash_setup_reserve,'cleanupReserveSeconds':cleanup_reserve,'outerSeconds':outer_seconds})
  try:proc.wait(timeout=execution+hash_setup_reserve)
  except subprocess.TimeoutExpired:
   expired=True
   if identity(proc.pid)==initial:os.killpg(proc.pid,signal.SIGTERM);actions.append('TERM_IDENTITY_MATCHED_WRAPPER')
   try:proc.wait(timeout=max(1,outer_seconds-(time.monotonic()-start)))
   except subprocess.TimeoutExpired:pass
except BaseException as e:failure=type(e).__name__
finally:
 if proc is not None and proc.poll() is None:
  # wrapper已给完整600s清理；只处理原登记Vitest PGID，不猜其它任务或PID。
  child=run/'RUNNER_CHILD.json'
  if child.is_file():
   row=json.loads(child.read_text());current=identity(row['pid'])
   if row.get('identity') and current==row['identity'] and current['pgid']==row['pid']:
    os.killpg(row['pid'],signal.SIGKILL);actions.append('KILL_EXACT_ORIGINAL_VITEST_GROUP')
  if initial and identity(proc.pid)==initial:os.killpg(proc.pid,signal.SIGKILL);actions.append('KILL_EXACT_ORIGINAL_WRAPPER_GROUP')
  try:proc.wait(timeout=120)
  except subprocess.TimeoutExpired:failure=failure or 'WRAPPER_REMAINS'
 actual=identity(proc.pid) if proc is not None else None
 write('RESULT',{'exitCode':proc.returncode if proc else None,'expired':expired,'error':failure,'elapsedSeconds':time.monotonic()-start,'actions':actions,'wrapperIdentityAfter':actual,'businessResubmitted':False,'outerSeconds':outer_seconds})
code=proc.returncode if proc else None
sys.exit(code if code is not None and not expired and failure is None and actual is None else 1)

"""独立24小时外层：保留原较长预算；不续内层原任务，不重发。"""
from pathlib import Path
import os,sys,json,time,signal,subprocess,datetime,uuid
here=Path(__file__).resolve().parent
assert len(sys.argv)==3
task=sys.argv[1];p=Path(sys.argv[2]).resolve();b=json.loads(p.read_text());assert b['state']=='EXECUTION_AUTHORIZED' and b['maximumModelRoots']==0 and task in ['T-1324','T-1330']
run_id=datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%dT%H%M%SZ')+'-'+uuid.uuid4().hex
out=Path(b['externalRoot'])/'media-outer'/task/run_id;out.mkdir(parents=True,exist_ok=False,mode=0o700)
env=os.environ.copy();env.update(C_MEDIA_FINAL_OUTER_ACTIVE='1',C_MEDIA_FINAL_RUN_ID=run_id)
def identity(pid):
 r=subprocess.run(['/bin/ps','-p',str(pid),'-o','pgid=,lstart=,comm='],capture_output=True,text=True);v=r.stdout.strip().split(None,1);return {'pgid':int(v[0]),'identity':v[1]}if r.returncode==0 and len(v)==2 else None
def save(name,v):(out/(name+'.json')).write_text(json.dumps(v,ensure_ascii=False,indent=2)+'\n')
def term(signum,frame):raise KeyboardInterrupt('OUTER_TERMINATION')
signal.signal(signal.SIGTERM,term);signal.signal(signal.SIGINT,term)
proc=None;initial=None;expired=False;error=None;actions=[];start=time.monotonic();outer=86400
try:
 command=[sys.executable,str(here/'command.py'),'--inner',task,str(p)]
 with (out/'command.log').open('w')as log:
  proc=subprocess.Popen(command,env=env,stdout=log,stderr=subprocess.STDOUT,start_new_session=True);initial=identity(proc.pid);assert initial and initial['pgid']==proc.pid
  save('START',{'taskId':task,'runId':run_id,'command':command,'pid':proc.pid,'initial':initial,'outerSeconds':outer,'innerSeconds':34200,'startupReserveSeconds':1200,'stopReserveSeconds':600,'hashReserveSeconds':1800,'cleanupReserveSeconds':600,'commandWaitSeconds':36000,'requiredFullSerialSeconds':40200})
  try:proc.wait(timeout=outer-600)
  except subprocess.TimeoutExpired:
   expired=True
   if identity(proc.pid)==initial:os.killpg(proc.pid,signal.SIGTERM);actions.append('TERM_EXACT_COMMAND_GROUP')
   try:proc.wait(timeout=max(1,outer-(time.monotonic()-start)-120))
   except subprocess.TimeoutExpired:pass
except BaseException as e:error=type(e).__name__
finally:
 if proc is not None and proc.poll()is None and initial and identity(proc.pid)==initial:
  os.killpg(proc.pid,signal.SIGKILL);actions.append('KILL_EXACT_GROUP_AFTER_RESERVE')
  try:proc.wait(timeout=max(1,min(120,outer-(time.monotonic()-start))))
  except subprocess.TimeoutExpired:error=error or 'COMMAND_REMAINS'
 current=identity(proc.pid)if proc else None;save('RESULT',{'taskId':task,'runId':run_id,'exitCode':proc.returncode if proc else None,'error':error,'expired':expired,'elapsedSeconds':time.monotonic()-start,'commandIdentityAfter':current,'actions':actions,'outerSeconds':outer,'controllerStopOwnedBy':'C；不把本group退出冒共享服务已停'})
sys.exit(proc.returncode if proc and proc.returncode is not None and error is None and not expired and current is None else 1)

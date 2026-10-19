"""实际独立43200秒监督：全部C启动/旅程/停止/前后hash与清理，非记录值。"""
from pathlib import Path
import os,sys,json,time,signal,subprocess,datetime,uuid
here=Path(__file__).resolve().parent;assert len(sys.argv)==3;task=sys.argv[1];bootstrap_path=Path(sys.argv[2]).resolve();b=json.loads(bootstrap_path.read_text());assert b['state']=='EXECUTION_AUTHORIZED' and b['maximumModelRoots']==0
run_id=datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%dT%H%M%SZ')+'-'+uuid.uuid4().hex
external=Path(b['externalRoot']);assert str(external)=='/Volumes/T7-MacData/CodexBuilds/t1300-final-ui-candidates-three-root-20261017';out=external/'formal-outer'/task/run_id;out.mkdir(parents=True,exist_ok=False,mode=0o700)
startup=3*1200;stop=3*600;hash_reserve=1800;cleanup=600;inner=34200;execution=startup+stop+hash_reserve+cleanup+inner;outer=43200;assert execution==42000 and outer>=execution+600
env=os.environ.copy();env.update(C_FIVE_FORMAL_OUTER_ACTIVE='1',C_FIVE_FORMAL_RUN_ID=run_id)
def identity(pid):
 p=subprocess.run(['/bin/ps','-p',str(pid),'-o','pgid=,lstart=,comm='],capture_output=True,text=True);v=p.stdout.strip().split(None,1);return {'pgid':int(v[0]),'identity':v[1]}if p.returncode==0 and len(v)==2 else None
def save(name,x):(out/(name+'.json')).write_text(json.dumps(x,ensure_ascii=False,indent=2)+'\n')
def term(signum,frame):raise KeyboardInterrupt('OUTER_TERMINATION')
signal.signal(signal.SIGTERM,term);signal.signal(signal.SIGINT,term)
proc=None;initial=None;expired=False;error=None;actions=[];start=time.monotonic()
try:
 command=[sys.executable,str(here/'command.py'),'--inner',task,str(bootstrap_path)]
 with (out/'command.log').open('w')as log:
  proc=subprocess.Popen(command,env=env,stdout=log,stderr=subprocess.STDOUT,start_new_session=True);initial=identity(proc.pid);assert initial and initial['pgid']==proc.pid;save('START',{'taskId':task,'runId':run_id,'command':command,'pid':proc.pid,'initial':initial,'executionSeconds':execution,'outerSeconds':outer,'components':{'inner':inner,'maxThreeStartup':startup,'maxThreeStop':stop,'hash':hash_reserve,'cleanup':cleanup}})
  try:proc.wait(timeout=execution+600)
  except subprocess.TimeoutExpired:
   expired=True
   if identity(proc.pid)==initial:os.killpg(proc.pid,signal.SIGTERM);actions.append('TERM_EXACT_COMMAND_GROUP')
   try:proc.wait(timeout=max(1,outer-(time.monotonic()-start)-120))
   except subprocess.TimeoutExpired:pass
except BaseException as e:error=type(e).__name__
finally:
 if proc is not None and proc.poll() is None and initial and identity(proc.pid)==initial:
  os.killpg(proc.pid,signal.SIGKILL);actions.append('KILL_EXACT_COMMAND_GROUP_AFTER_RESERVE')
  try:proc.wait(timeout=max(1,min(120,outer-(time.monotonic()-start))))
  except subprocess.TimeoutExpired:error=error or 'COMMAND_REMAINS'
 current=identity(proc.pid)if proc else None;save('RESULT',{'taskId':task,'runId':run_id,'exitCode':proc.returncode if proc else None,'error':error,'expired':expired,'elapsedSeconds':time.monotonic()-start,'commandIdentityAfter':current,'actions':actions,'outerSeconds':outer,'controllerCleanupEvidence':'COMMAND_RESULT.stops及C原stop receipts，不以本group退出冒所有detached服务已退'})
sys.exit(proc.returncode if proc and proc.returncode is not None and error is None and not expired and current is None else 1)

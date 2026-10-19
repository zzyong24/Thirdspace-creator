"""原媒体86400独立监督；单C恢复启动+原36000观察+stop/hash/cleanup共40200。"""
from pathlib import Path
import os,sys,json,time,signal,subprocess,datetime,uuid
here=Path(__file__).resolve().parent;assert len(sys.argv)==3;task=sys.argv[1];p=Path(sys.argv[2]).resolve();b=json.loads(p.read_text());assert b['state']=='EXECUTION_AUTHORIZED'and b['maximumModelRoots']==0 and task=='T-1343'
run_id=datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%dT%H%M%SZ')+'-'+uuid.uuid4().hex
external=Path(b['externalRoot']);assert str(external)=='/Volumes/T7-MacData/CodexBuilds/t1343-legacy-bare-render-20261018';out=external/'final-ui/outer'/task/run_id;out.mkdir(parents=True,exist_ok=False,mode=0o700)
env=os.environ.copy();env.update(C_MEDIA_FINAL_OUTER_ACTIVE='1',C_MEDIA_FINAL_RUN_ID=run_id)
def identity(pid):
 r=subprocess.run(['/bin/ps','-p',str(pid),'-o','pgid=,lstart=,comm='],capture_output=True,text=True,timeout=120);v=r.stdout.strip().split(None,1);return{'pgid':int(v[0]),'identity':v[1]}if r.returncode==0 and len(v)==2 else None
def save(name,v):(out/(name+'.json')).write_text(json.dumps(v,ensure_ascii=False,indent=2)+'\n')
def term(signum,frame):raise KeyboardInterrupt('OUTER_TERMINATION')
signal.signal(signal.SIGTERM,term);signal.signal(signal.SIGINT,term)
proc=None;initial=None;actual=None;expired=False;error=None;actions=[];start=time.monotonic();outer=86400;execution=1200+36000+600+1800+600;assert execution==40200
try:
 command=[sys.executable,str(here/'command.py'),'--inner',task,str(p)]
 with(out/'command.log').open('w')as log:
  proc=subprocess.Popen(command,env=env,stdout=log,stderr=subprocess.STDOUT,start_new_session=True);initial=identity(proc.pid);assert initial and initial['pgid']==proc.pid
  save('START',{'taskId':task,'runId':run_id,'command':command,'pid':proc.pid,'initial':initial,'outerSeconds':outer,'executionSeconds':execution,'innerSeconds':34200,'startupReserveSeconds':1200,'stopReserveSeconds':600,'hashReserveSeconds':1800,'cleanupReserveSeconds':600,'commandWaitSeconds':36000,'maximumRenderRoots':0})
  try:proc.wait(timeout=execution)
  except subprocess.TimeoutExpired:expired=True
except BaseException as e:error=type(e).__name__
finally:
 if proc is not None and proc.poll()is None:
  # 同一仍存活的Popen：保初始launcher、刷新exec后的实际tuple；让原finally stop有清理机会。
  actual=identity(proc.pid)
  if actual and actual['pgid']==proc.pid:
   os.killpg(proc.pid,signal.SIGINT);actions.append('INT_SAME_LIVE_OWNED_POPEN_GROUP_FOR_FINALLY')
   try:proc.wait(timeout=600)
   except subprocess.TimeoutExpired:
    if identity(proc.pid)==actual:os.killpg(proc.pid,signal.SIGKILL);actions.append('KILL_SAME_IDENTITY_AFTER_FINALLY_RESERVE');proc.wait(timeout=120)
  else:error=error or'OWNED_IDENTITY_UNAVAILABLE_NO_SIGNAL'
 current=identity(proc.pid)if proc else None;save('RESULT',{'taskId':task,'runId':run_id,'exitCode':proc.returncode if proc else None,'error':error,'expired':expired,'elapsedSeconds':time.monotonic()-start,'initialIdentity':initial,'actualBeforeStop':actual,'commandIdentityAfter':current,'actions':actions,'outerSeconds':outer,'requiredFullSerialSeconds':execution,'controllerStopOwnedBy':'COMMAND_RESULT.stops与C实际STOPPED/sourceAfterUnchanged/PID门；group退出不冒controller已退'})
sys.exit(proc.returncode if proc and proc.returncode is not None and error is None and not expired and current is None else 1)

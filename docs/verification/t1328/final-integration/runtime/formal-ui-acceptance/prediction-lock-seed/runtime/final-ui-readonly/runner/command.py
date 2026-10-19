"""前瞻allowlist入口：固定binding参数，每次新目录，strict仅只读原实体。"""
from pathlib import Path
import os,sys,json,subprocess,hashlib,datetime,uuid,time,signal
here=Path(__file__).resolve().parent
repo=next(p for p in here.parents if(p/'frontend/package.json').is_file())
assert len(sys.argv)==2,'EXACT_ACTUAL_BINDING_REQUIRED'
binding_file=Path(sys.argv[1]).resolve()
b=json.loads(binding_file.read_text())
assert b['schema']=='t1328-final-ui/v1' and b['state']=='EXECUTION_AUTHORIZED'
assert b['maximumModelRoots']==0 and b['maximumBusinessWrites']==0
head=subprocess.check_output(['git','rev-parse','HEAD'],cwd=repo,text=True).strip()
assert head==b['controlHead'],'CURRENT_CONTROL_HEAD_REQUIRED'
def sha(p):return hashlib.sha256(Path(p).read_bytes()).hexdigest()
assert b['commandSha256']==sha(__file__),'FIXED_COMMAND_DRIFT'
assert b['runnerSha256']=={name:sha(here/name)for name in ['observe.cjs','run.py','PLAN.json','INPUT_LOCK.json']},'REVIEWED_RUNNER_DRIFT'
raw=Path(b['contract']['path']).read_text();assert sha(b['contract']['path'])==b['contract']['sha256']
import re
contract=json.loads(re.search(r'```frontend-journey-contract\s*\n([\s\S]*?)\n```',raw)[1])
assert contract['task_id']=='T-1328' and contract['schema']=='frontend-journey-contract/v2'
watched=contract['watched_paths']+[str((here/name).relative_to(repo))for name in ['observe.cjs','run.py','command.py','PLAN.json','INPUT_LOCK.json','READY_INDEX.json']]
dirty=subprocess.check_output(['git','status','--porcelain','--',*watched],cwd=repo,text=True)
assert not dirty,'WATCHED_PATHS_MUST_BE_COMMITTED_AND_CLEAN'
run_id=datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%dT%H%M%SZ')+'-'+uuid.uuid4().hex
out=here/'runs'/run_id;out.mkdir(parents=True,exist_ok=False,mode=0o700)
def save(name,value):(out/(name+'.json')).write_text(json.dumps(value,ensure_ascii=False,indent=2)+'\n')
def identity(pid):
 r=subprocess.run(['/bin/ps','-p',str(pid),'-o','pgid=,lstart=,comm='],capture_output=True,text=True,timeout=120)
 return r.stdout.strip()if r.returncode==0 else None
env=os.environ.copy();env.update(T1328_FINAL_UI_APPROVED='1',T1328_FINAL_UI_BINDING=str(binding_file),T1328_FINAL_UI_OUTPUT=str(out),T1328_FINAL_UI_RUN_ID=run_id)
cmd=[sys.executable,str(here/'run.py'),'--execute'];start=time.monotonic();p=None;initial=None;expired=False;actions=[];error=None
save('COMMAND_START',{'command':cmd,'binding':{'path':str(binding_file),'sha256':sha(binding_file)},'runId':run_id,'controlHead':head,'watchedClean':True,'watchedPaths':watched,'outerSeconds':8400,'fallbackSeconds':600,'maxModelRoots':0,'maxBusinessWrites':0})
try:
 p=subprocess.Popen(cmd,cwd=repo,env=env,start_new_session=True);initial=identity(p.pid);assert initial
 save('OUTER_RUNNING',{'pid':p.pid,'identity':initial,'startedAt':time.time(),'budgetSeconds':9600})
 try:p.wait(timeout=8400)
 except subprocess.TimeoutExpired:
  expired=True
  if identity(p.pid)==initial:p.send_signal(signal.SIGTERM);actions.append('TERM_IDENTITY_MATCHED_WRAPPER_FOR_FINALLY')
  try:p.wait(timeout=600)
  except subprocess.TimeoutExpired:
   if identity(p.pid)==initial:p.kill();actions.append('KILL_IDENTITY_MATCHED_WRAPPER_AFTER_RESERVE')
   p.wait(timeout=120)
except BaseException as exc:error=type(exc).__name__
finally:
 current=identity(p.pid)if p else None
 if current and current==initial:
  p.send_signal(signal.SIGTERM);actions.append('TERM_AFTER_COMMAND_EXCEPTION')
  try:p.wait(timeout=120)
  except subprocess.TimeoutExpired:
   if identity(p.pid)==initial:p.kill();p.wait(timeout=120);actions.append('KILL_AFTER_COMMAND_EXCEPTION')
 current=identity(p.pid)if p else None
 save('OUTER_RESULT',{'pid':p.pid if p else None,'initialIdentity':initial,'current':current,'exitCode':p.returncode if p else None,'expired':expired,'error':error,'actions':actions,'elapsedSeconds':time.monotonic()-start,'budgetSeconds':9600,'taskResult':str(out/'TASK_RESULT.json'),'visibleCopy':str(out/'VISIBLE_COPY.json'),'wrapperCleanup':str(out/'EXECUTION_RESULT.json'),'modelRoots':0,'inputEntitiesReusedReadOnly':True})
 print(json.dumps({'task_id':'T-1328','outputDirectory':str(out),'exitCode':p.returncode if p else None,'outerResult':str(out/'OUTER_RESULT.json'),'taskResult':str(out/'TASK_RESULT.json'),'visibleCopy':str(out/'VISIBLE_COPY.json')},ensure_ascii=False))
code=p.returncode if p else None
sys.exit(code if code is not None and error is None and not expired and current is None else 1)

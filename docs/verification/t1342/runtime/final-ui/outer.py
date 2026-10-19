"""前瞻allowlist入口：固定binding参数，每次新目录，strict仅只读原实体。"""
from pathlib import Path
import os,sys,json,subprocess,hashlib,datetime,uuid,time,signal
here=Path(__file__).resolve().parent
repo=next(p for p in here.parents if(p/'frontend/package.json').is_file())
assert len(sys.argv)==4
binding_file=Path(sys.argv[1]).resolve();out=Path(sys.argv[2]).resolve();run_id=sys.argv[3]
b=json.loads(binding_file.read_text());plan=json.loads((here/'PLAN.json').read_text())
head=subprocess.check_output(['git','rev-parse','HEAD'],cwd=repo,text=True).strip();assert head==b['controlHead']
assert out.is_relative_to(Path(b['externalRoot'])) and out.is_dir()
def sha(p):return hashlib.sha256(Path(p).read_bytes()).hexdigest()
def save(name,value):(out/(name+'.json')).write_text(json.dumps(value,ensure_ascii=False,indent=2)+'\n')
def identity(pid):
 r=subprocess.run(['/bin/ps','-p',str(pid),'-o','pgid=,lstart=,comm='],capture_output=True,text=True,timeout=120)
 return r.stdout.strip()if r.returncode==0 else None
env=os.environ.copy();env.update(T1342_FINAL_UI_APPROVED='1',T1342_FINAL_UI_BINDING=str(binding_file),T1342_FINAL_UI_OUTPUT=str(out),T1342_FINAL_UI_RUN_ID=run_id)
cmd=[sys.executable,str(here/'run.py'),'--execute'];start=time.monotonic();p=None;initial=None;expired=False;actions=[];error=None
save('COMMAND_START',{'command':cmd,'binding':{'path':str(binding_file),'sha256':sha(binding_file)},'runId':run_id,'controlHead':head,'watchedCleanValidatedByCommand':True,'outerSeconds':plan['budgets']['outerSeconds'],'fallbackSeconds':600,'maxModelRoots':0,'maxBusinessWrites':0})
try:
 p=subprocess.Popen(cmd,cwd=repo,env=env,start_new_session=True);initial=identity(p.pid);assert initial
 save('OUTER_RUNNING',{'pid':p.pid,'identity':initial,'startedAt':time.time(),'budgetSeconds':plan['budgets']['independentOuterWithFallbackSeconds']})
 try:p.wait(timeout=plan['budgets']['outerSeconds'])
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
 save('OUTER_RESULT',{'pid':p.pid if p else None,'initialIdentity':initial,'current':current,'exitCode':p.returncode if p else None,'expired':expired,'error':error,'actions':actions,'elapsedSeconds':time.monotonic()-start,'budgetSeconds':plan['budgets']['independentOuterWithFallbackSeconds'],'taskResult':str(out/'TASK_RESULT.json'),'visibleCopy':str(out/'VISIBLE_COPY.json'),'wrapperCleanup':str(out/'EXECUTION_RESULT.json'),'modelRoots':0,'inputEntitiesReusedReadOnly':True})
 print(json.dumps({'task_id':'T-1342','outputDirectory':str(out),'exitCode':p.returncode if p else None,'outerResult':str(out/'OUTER_RESULT.json'),'taskResult':str(out/'TASK_RESULT.json'),'visibleCopy':str(out/'VISIBLE_COPY.json')},ensure_ascii=False))
code=p.returncode if p else None
sys.exit(code if code is not None and error is None and not expired and current is None else 1)

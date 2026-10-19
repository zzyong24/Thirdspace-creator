from pathlib import Path
import subprocess, os, json, signal, time, sys, hashlib

root=Path(__file__).resolve().parent
if '--collect' in sys.argv:
 print(json.dumps({'execution':False,'rootSubmissions':0,'preparedFiles':['run.cjs','metrics.cjs','tabs.cjs'],'outerSeconds':32400,'executionSeconds':31800,'cleanupSeconds':600}));sys.exit(0)
assert os.environ.get('T1300_PERFORMANCE_EXCLUSIVE')=='1'
binding=Path(os.environ['T1300_FINAL_PERFORMANCE_BINDING']);assert binding.is_absolute()
b=json.loads(binding.read_text());out=Path(b['outputDirectory']).resolve();assert out.is_relative_to(root/'runs')
out.mkdir(parents=True,exist_ok=False)
node=Path(b['nodePath']);assert node.is_absolute() and node.is_file()
def save(name,value):(out/(name+'.json')).write_text(json.dumps(value,ensure_ascii=False,indent=2)+'\n')
def identity(pid):
 r=subprocess.run(['/bin/ps','-p',str(pid),'-o','pgid=,lstart=,comm='],capture_output=True,text=True)
 v=r.stdout.strip().split(None,1)
 return {'pgid':int(v[0]),'identity':v[1]} if r.returncode==0 and len(v)==2 else None
def same(row):return identity(row['pid'])=={'pgid':row['pgid'],'identity':row['identity']}
for name,expected in b['runnerSha256'].items():
 assert name in ['run.cjs','metrics.cjs','tabs.cjs','run.py']
 assert hashlib.sha256((root/name).read_bytes()).hexdigest()==expected
assert set(b['runnerSha256'])=={'run.cjs','metrics.cjs','tabs.cjs','run.py'}
proc=None;expired=False;error=None;actions=[];remaining=[];started=time.monotonic()
try:
 with (out/'output.log').open('w') as log:
  proc=subprocess.Popen([str(node),str(root/'run.cjs')],cwd=root,stdout=log,stderr=subprocess.STDOUT,start_new_session=True)
  owned=identity(proc.pid);assert owned and owned['pgid']==proc.pid
  save('RUNNER_CHILD',{'pid':proc.pid,**owned})
  save('EXECUTION_START',{'outerSeconds':32400,'executionSeconds':31800,'cleanupReserveSeconds':600,'paidRootMaximum':1,'originalTaskNeverCancelled':True})
  try:proc.wait(timeout=31800)
  except subprocess.TimeoutExpired:expired=True
except BaseException as exc:error=type(exc).__name__
finally:
 # 先正常TERM让finally关闭浏览器，再只处理本run登记、且PID/启动身份仍相同的子树。
 if proc is not None and proc.poll() is None:
  try:os.killpg(proc.pid,signal.SIGTERM);actions.append({'pid':proc.pid,'action':'RUNNER_TERM'})
  except ProcessLookupError:pass
  try:proc.wait(timeout=120)
  except subprocess.TimeoutExpired:pass
 try:
  f=out/'OWNED_CHILDREN.ndjson';rows=[json.loads(v) for v in f.read_text().splitlines()] if f.exists() else []
  assert all(v['runId']==b['runId'] for v in rows)
  for v in rows:
   if same(v):
    if v['pgid']==v['pid']:os.killpg(v['pgid'],signal.SIGTERM)
    else:os.kill(v['pid'],signal.SIGTERM)
    actions.append({'pid':v['pid'],'action':'OWNED_IDENTITY_TERM'})
  end=time.monotonic()+120
  while time.monotonic()<end and any(same(v) for v in rows):time.sleep(.5)
  for v in rows:
   if same(v):
    if v['pgid']==v['pid']:os.killpg(v['pgid'],signal.SIGKILL)
    else:os.kill(v['pid'],signal.SIGKILL)
    actions.append({'pid':v['pid'],'action':'OWNED_IDENTITY_KILL'})
  remaining=[{**v,'current':identity(v['pid']),'identityMatches':same(v)} for v in rows]
  if any(v['identityMatches'] for v in remaining):error=error or 'OwnedChildrenRemain'
 except BaseException as exc:error=error or type(exc).__name__
 if proc is not None and proc.poll() is None:
  try:os.killpg(proc.pid,signal.SIGKILL)
  except ProcessLookupError:pass
  try:proc.wait(timeout=120)
  except subprocess.TimeoutExpired:error=error or 'RunnerRemains'
 save('EXECUTION_RESULT',{'exitCode':proc.returncode if proc else None,'expired':expired,'error':error,'elapsedSeconds':time.monotonic()-started,'cleanup':actions,'remaining':remaining,'originalTaskNotCancelled':True,'maximumRootSubmissions':1})
sys.exit(proc.returncode if proc is not None and proc.returncode is not None and not expired and error is None else 1)

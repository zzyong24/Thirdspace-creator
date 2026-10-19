"""只监督已审fixture controller启动；ready后保持同一controller，显式stop才结束。"""
from pathlib import Path
import os,sys,json,hashlib,subprocess,time,threading,signal
here=Path(__file__).resolve().parent
assert os.environ.get('C_FINAL_0953_CONTROLLER_APPROVED')=='1'
binding,config,output=map(Path,sys.argv[1:4]);assert all(p.is_absolute()for p in [binding,config,output]);assert output.is_relative_to(Path('/Volumes/T7-MacData/CodexBuilds/t1300-final-ui-candidates-three-root-20261017/services'));launch=json.loads(config.read_text());manifest=config
output.mkdir(parents=True,exist_ok=False);b=json.loads(binding.read_text());assert b['sourceHead']=='0953f10e077f82debfbfc2fa6a336182eaa2b1a5'
def write(n,x):(output/(n+'.json')).write_text(json.dumps(x,ensure_ascii=False,indent=2)+'\n')
def identity(pid):
 p=subprocess.run(['/bin/ps','-p',str(pid),'-o','pgid=,lstart=,comm='],capture_output=True,text=True);s=p.stdout.strip().split(None,1)
 return {'pgid':int(s[0]),'identity':s[1]}if p.returncode==0 and len(s)==2 else None
node=os.environ.get('T1338_CONTROLLER_NODE','/opt/homebrew/bin/node');cmd=[node,launch['controllerPath'],'--launch',str(binding)]+launch['extraArguments'];assert hashlib.sha256(Path(launch['controllerPath']).read_bytes()).hexdigest()==launch['controllerSha256']
proc=None;initial=None;child=None;ready={};found=threading.Event();error=None;expired=False;actions=[];start=time.monotonic()
def interrupted(signum,frame):raise KeyboardInterrupt('CONTROLLER_SUPERVISOR_STOP')
signal.signal(signal.SIGTERM,interrupted);signal.signal(signal.SIGINT,interrupted)
def discover_child():
 for directory in Path(b['artifactRoot']).glob('t1300-candidate-*'):
  session=directory/'session.json'
  if not session.is_file():continue
  data=json.loads(session.read_text())
  if data.get('controllerPid')!=proc.pid or data.get('candidateBinding')!=str(binding):continue
  pid=data['childPid'];parent=subprocess.run(['/bin/ps','-p',str(pid),'-o','ppid='],capture_output=True,text=True)
  actual=identity(pid)
  if parent.returncode==0 and parent.stdout.strip()==str(proc.pid)and actual and actual['pgid']==pid:return{'pid':pid,'initial':actual}
 return None
def stop():
 if proc and proc.poll()is None:
  try:proc.stdin.write(b'stop\n');proc.stdin.flush()
  except (BrokenPipeError,OSError):pass
try:
 proc=subprocess.Popen(cmd,stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.STDOUT,start_new_session=True);initial=identity(proc.pid);assert initial and initial['pgid']==proc.pid
 write('START',{'command':cmd,'pid':proc.pid,'identity':initial,'startupWatchdogSeconds':1200,'startupIncludesFixtureAndOriginalCandidateChecks':True,'modelRoots':0})
 def read():
  with (output/'stdout-safe.ndjson').open('w')as log:
   for raw in iter(proc.stdout.readline,b''):
    log.write(json.dumps({'bytes':len(raw),'sha256':hashlib.sha256(raw).hexdigest()})+'\n');log.flush()
    try:value=json.loads(raw)
    except (ValueError,UnicodeDecodeError):continue
    if value.get('schema')=='t1300-candidate-ready/v1':ready.update(value);found.set()
 reader=threading.Thread(target=read,daemon=True);reader.start()
 deadline=time.monotonic()+1200
 while not found.wait(.25)and proc.poll()is None and time.monotonic()<deadline:
  if child is None:child=discover_child()
 if not found.is_set():expired=time.monotonic()>=deadline;raise RuntimeError('FIXTURE_CONTROLLER_NOT_READY')
 child=child or discover_child();assert child and child['pid']==ready['pid'];assert child['initial']and child['initial']['pgid']==child['pid'];write('READY',{'readyReceipt':str(Path(ready['evidenceRoot'])/'ready.json'),'controllerPid':proc.pid,'sidecar':child,'originalFixtureManifest':str(manifest),'sourceHead':ready['sourceHead']});print(json.dumps({'state':'FIXTURE_READY','receipt':str(output/'READY.json'),'baseURL':ready['baseURL']}),flush=True)
 def input_commands():
  for line in sys.stdin:
   if line.strip()=='stop':stop();return
 threading.Thread(target=input_commands,daemon=True).start()
 signal.signal(signal.SIGTERM,lambda *_:stop());signal.signal(signal.SIGINT,lambda *_:stop())
 proc.wait();reader.join(timeout=5)
except BaseException as exc:error=type(exc).__name__
finally:
 if proc and proc.poll()is None:
  stop()
  try:proc.wait(timeout=120)
  except subprocess.TimeoutExpired:pass
 for row in ([child]if child else[])+([{'pid':proc.pid,'initial':initial}]if proc else[]):
  if row['initial']and identity(row['pid'])==row['initial']:
   os.killpg(row['pid'],signal.SIGTERM);actions.append({'pid':row['pid'],'action':'TERM_EXACT_OWNED_GROUP'})
   end=time.monotonic()+120
   while identity(row['pid'])==row['initial']and time.monotonic()<end:time.sleep(.5)
   if identity(row['pid'])==row['initial']:os.killpg(row['pid'],signal.SIGKILL);actions.append({'pid':row['pid'],'action':'KILL_EXACT_OWNED_GROUP'});time.sleep(.5)
 if proc:
  try:proc.wait(timeout=120)
  except subprocess.TimeoutExpired:error=error or'CONTROLLER_REMAINS'
 remaining=[{'pid':row['pid'],'current':identity(row['pid'])}for row in ([child]if child else[])+([{'pid':proc.pid,'initial':initial}]if proc else[])];write('RESULT',{'exitCode':proc.returncode if proc else None,'expired':expired,'error':error,'elapsedSeconds':time.monotonic()-start,'actions':actions,'remaining':remaining,'sourceAfterUiReceipt':str(Path(ready['evidenceRoot'])/'fixture-source-after-ui.json')if ready else None,'originalFixtureNotOpened':True})
sys.exit(proc.returncode if proc and proc.returncode is not None and not expired and not error and all(r['current']is None for r in remaining)else 1)

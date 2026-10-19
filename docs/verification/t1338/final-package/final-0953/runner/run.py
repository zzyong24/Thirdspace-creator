from pathlib import Path
import subprocess,os,json,hashlib,sys,signal,time,threading
here=Path(__file__).resolve().parent
root=here.parent
repo=next(p for p in here.parents if (p/'frontend/package.json').is_file())
registrar=repo/'docs/verification/t1328/runtime/implementation/working/final-u08-u10/runner/register-owned.cjs'
if '--collect' in sys.argv:
 print(json.dumps({'state':'NOT_RUN','cases':['legacy','calibration','content-fixture','content-ui'],'maximumUserModelRootsPerCase':0,'maximumUserModelRootsAllCases':0,'browserStarts':0,'modelSubmissions':0,'executionSecondsPerCase':31800,'outerSecondsPerCase':34200,'cleanupSeconds':600}));sys.exit(0)
assert sys.argv[1:]==['--execute'],'EXPLICIT_EXECUTE_REQUIRED'
assert os.environ.get('T1338_FINAL_UI_APPROVED')=='1','FINAL_BINDING_AND_INDEPENDENT_EXECUTION_REVIEW_REQUIRED'
binding=Path(os.environ['T1338_FINAL_UI_BINDING']);assert binding.is_absolute();b=json.loads(binding.read_text());template=json.loads((root/'preparation/BINDING_TEMPLATE.json').read_text())
assert b['caseId'] in template['caseOrder'] and b['mode']=='EXECUTION' and b['executionAuthorized'] is True and b['runtimeOutputAuthorized'] is True
assert b['budgets']==template['budgets'] and b['maximumUserModelRootsPerCase']==0
outer_started=time.monotonic();outer_deadline=outer_started+34200
out=Path(b['outputDirectory']).resolve();assert out.is_relative_to(root/'runtime');out.mkdir(parents=True,exist_ok=False)
def save(name,value):(out/(name+'.json')).write_text(json.dumps(value,ensure_ascii=False,indent=2)+'\n')
def digest(p):
 h=hashlib.sha256()
 with p.open('rb') as f:
  for chunk in iter(lambda:f.read(4*1024*1024),b''):h.update(chunk)
 return h.hexdigest()
inputs=[p for p in here.iterdir() if p.is_file()]+[root/'preparation/BINDING_TEMPLATE.json',root/'preparation/NOT_RUN.md',binding,registrar]
rows=[{'path':str(p),'bytes':p.stat().st_size,'sha256':digest(p)} for p in inputs]
save('BEFORE_INPUTS',{'items':rows,'case':b['caseId'],'externalRegistrarIsReadOnly':True})
assert b['runnerSha256']=={p.name:digest(p) for p in here.iterdir() if p.is_file()}
assert b['registrarSha256']==digest(registrar)
lock_path=Path(b['inputLock']['path']);assert digest(lock_path)==b['inputLock']['sha256'];lock=json.loads(lock_path.read_text());assert lock['confirmed'] is True and lock['state']=='FINAL_EXECUTION_INPUTS';assert lock['sourceHead']==b['candidate']['sourceHead'] and lock['packageSha256']==b['candidate']['packageSha256']
def lock_drift():
 changed=[]
 for row in lock['files']:
  if time.monotonic()>=outer_deadline-120:return ['OUTER_DEADLINE_HASH_INCOMPLETE']
  p=Path(row['path']);p=p if p.is_absolute() else repo/p
  if not p.is_file() or p.stat().st_size!=row['bytes'] or digest(p)!=row['sha256']:changed.append(row['path'])
 for row in lock.get('links',[]):
  p=Path(row['path']);p=p if p.is_absolute() else repo/p
  if not p.is_symlink() or os.readlink(p)!=row['target']:changed.append('link:'+row['path'])
 for name in lock.get('absentPaths',[]):
  p=Path(name);p=p if p.is_absolute() else repo/p
  if p.exists():changed.append('absent:'+name)
 return changed
assert not lock_drift(),'PRE_START_INPUT_DRIFT_NO_SUBMISSION'
def identity(pid):
 r=subprocess.run(['/bin/ps','-p',str(pid),'-o','pgid=,lstart=,comm='],capture_output=True,text=True);v=r.stdout.strip().split(None,1)
 return {'pgid':int(v[0]),'identity':v[1]} if r.returncode==0 and len(v)==2 else None
def same(row):return row.get('identity') is not None and identity(row['pid'])=={'pgid':row['pgid'],'identity':row['identity']}
def group_rows(pgid):
 r=subprocess.run(['/bin/ps','-axo','pid=,pgid=,lstart=,comm='],capture_output=True,text=True)
 if r.returncode:raise RuntimeError('ProcessInventoryUnavailable')
 return [line.strip() for line in r.stdout.splitlines() if len(line.split())>2 and line.split()[1]==str(pgid)]
env=os.environ.copy();assert not env.get('NODE_OPTIONS'),'EXISTING_NODE_OPTIONS_REQUIRE_REVIEW'
assert Path(b['runtime']['browserRoot']).is_dir(),'ACTUAL_BUNDLED_BROWSER_ROOT_REQUIRED'
env['PLAYWRIGHT_BROWSERS_PATH']=b['runtime']['browserRoot']
tmp=Path(b['candidate']['ownedRoot'])/'tmp'/('final-ui-'+b['runId']);tmp.mkdir(parents=True,exist_ok=False,mode=0o700)
for key in ['TMPDIR','TMP','TEMP']:env[key]=str(tmp)
env.update(NODE_OPTIONS='--require='+str(registrar),C_FINAL_CONTENT_OUT=str(out),C_FINAL_CONTENT_RUN_ID=b['runId'])
def terminate(signum,frame):raise KeyboardInterrupt('OUTER_TERMINATION')
signal.signal(signal.SIGTERM,terminate)
proc=None;initial=None;expired=False;error=None;actions=[];remaining=[];group=[];start=time.monotonic()
try:
 assert outer_deadline-time.monotonic()>=30600+600,'INSUFFICIENT_GLOBAL_PLUS_CLEANUP_BUDGET_NO_SUBMISSION'
 test_root=Path(b['runtime']['frontendPackageJson']).parent
 cmd=[b['runtime']['nodePath'],str(test_root/'node_modules/@playwright/test/cli.js'),'test','--config',str(here/'playwright.config.cjs')]
 save('EXECUTION_START',{'command':cmd,'outerSeconds':34200,'executionSeconds':31800,'cleanupReserveSeconds':600,'testMs':28800000,'globalMs':30600000,'at':time.time(),'maximumUserModelRootsPerCase':0})
 with (out/'stdout-safe.ndjson').open('w') as log:
  proc=subprocess.Popen(cmd,cwd=repo/'frontend',env=env,stdout=subprocess.PIPE,stderr=subprocess.STDOUT,start_new_session=True)
  initial=identity(proc.pid);assert initial and initial['pgid']==proc.pid;save('RUNNER_CHILD',{'pid':proc.pid,'identity':initial})
  def consume():
   for raw in iter(proc.stdout.readline,b''):
    line=raw.decode('utf8','replace').strip();row={'bytes':len(raw),'sha256':hashlib.sha256(raw).hexdigest()}
    if len(line)<100 and any(s in line for s in ['Running 1 test','1 passed','1 failed']):row['summary']=line
    log.write(json.dumps(row)+'\n');log.flush()
  reader=threading.Thread(target=consume,daemon=True);reader.start()
  try:proc.wait(timeout=min(31800,max(1,outer_deadline-time.monotonic()-600)))
  except subprocess.TimeoutExpired:expired=True
  if not expired:reader.join(timeout=5)
except BaseException as exc:error=type(exc).__name__
finally:
 if proc is not None and proc.poll() is None:
  if initial and identity(proc.pid)==initial:
   os.killpg(proc.pid,signal.SIGTERM);actions.append('TERM_IDENTITY_MATCHED_RUNNER_GROUP')
   try:proc.wait(timeout=120)
   except subprocess.TimeoutExpired:pass
  else:error=error or 'RunnerIdentityChanged'
 try:
  f=out/'OWNED_CHILDREN.ndjson';registered=[json.loads(v) for v in f.read_text().splitlines()] if f.exists() else [];assert all(row['runId']==b['runId'] for row in registered)
  registered=list({(row['pid'],row.get('identity')):row for row in registered}.values())
  for row in registered:
   if same(row):os.kill(row['pid'],signal.SIGTERM);actions.append({'pid':row['pid'],'action':'TERM_IDENTITY_MATCHED_CHILD'})
  end=time.monotonic()+120
  while time.monotonic()<end and any(same(row) for row in registered):time.sleep(.5)
  for row in registered:
   if same(row):os.kill(row['pid'],signal.SIGKILL);actions.append({'pid':row['pid'],'action':'KILL_IDENTITY_MATCHED_CHILD'})
  end=time.monotonic()+120
  while time.monotonic()<end and any(same(row) for row in registered):time.sleep(.5)
  remaining=[{**row,'current':identity(row['pid']),'identityMatches':same(row)} for row in registered]
  if any(row['identityMatches'] for row in remaining):error=error or 'OwnedRegisteredChildrenRemain'
 except BaseException as exc:error=error or type(exc).__name__
 if proc is not None and proc.poll() is None and initial and identity(proc.pid)==initial:
  os.killpg(proc.pid,signal.SIGKILL);actions.append('KILL_IDENTITY_MATCHED_RUNNER_GROUP')
  try:proc.wait(timeout=120)
  except subprocess.TimeoutExpired:error=error or 'RunnerRemains'
 try:
  if initial:group=group_rows(initial['pgid'])
  if group:error=error or 'OwnedProcessGroupRemains'
 except BaseException as exc:error=error or type(exc).__name__
 drift=[]
 for row in rows:
  try:
   p=Path(row['path'])
   if p.stat().st_size!=row['bytes'] or digest(p)!=row['sha256']:drift.append(row['path'])
  except OSError:drift.append(row['path'])
 drift.extend(lock_drift())
 save('EXECUTION_RESULT',{'caseId':b['caseId'],'exitCode':proc.returncode if proc else None,'expired':expired,'error':error,'elapsedSeconds':time.monotonic()-start,'cleanup':actions,'registeredChildrenAfterCleanup':remaining,'remainingOwnedGroup':group,'afterInputDrift':drift,'maximumUserModelRootsPerCase':0,'oldTaskNeverResent':True,'backendTasksCancelledByRunner':False})
sys.exit(proc.returncode if proc and proc.returncode is not None and not expired and error is None and not drift else 1)

import pathlib,json,sys,hashlib,os,subprocess,time,signal,datetime
HERE=pathlib.Path(__file__).resolve().parent
PLAN=HERE/'PLAN.json'
assert hashlib.sha256(PLAN.read_bytes()).hexdigest()=='135cf70fb798992506c1644766c1b35d3c058b0e40fcd42f0f27ce350dc04d5c'
b=json.loads(PLAN.read_text());label=sys.argv[1];row=next(v for v in b['commands']if v['id']==label)
assert os.environ.get('T1292_ORIGINAL_COMMAND_DIAGNOSTIC_APPROVED')=='1'
ROOT=pathlib.Path(b['plannedOwnedRoot']);ROOT.mkdir(mode=0o700,exist_ok=True);assert not ROOT.is_symlink();assert ROOT.resolve().parent==pathlib.Path('/Volumes/T7-MacData/CodexBuilds').resolve();assert ROOT.stat().st_mode&511==448
out=ROOT/label;out.mkdir(mode=0o700);tmp=out/'tmp';tmp.mkdir(mode=0o700)
src=pathlib.Path(b['sourceRoot']);head=subprocess.check_output(['git','rev-parse','HEAD'],cwd=src,text=True).strip();assert head==b['sourceHead'];before=subprocess.check_output(['git','status','--porcelain=v1'],cwd=src,text=True);assert not before
# 只记录源绑定与安全env存在性；不记录完整env/连接串/凭据。
files={}
for raw in ['orchestrator/process/reconcile.config.json','frontend/vitest.config.ts','backend/vitest.config.ts','ai-worker/vitest.config.ts','frontend/package.json','backend/package.json','ai-worker/package.json','pnpm-lock.yaml']:
 p=src/raw
 if p.exists():files[raw]={'bytes':p.stat().st_size,'sha256':hashlib.sha256(p.read_bytes()).hexdigest()}
def save(name,value):
 (out/(name+'.json')).write_text(json.dumps(value,ensure_ascii=False,indent=2)+'\n')
def ps(pid):
 p=subprocess.run(['ps','-p',str(pid),'-o','pgid=,lstart=,comm='],capture_output=True,text=True)
 return p.stdout.strip()or None
def members(pgid):
 lines=subprocess.run(['ps','-axo','pid=,ppid=,pgid=,lstart=,comm='],capture_output=True,text=True).stdout.splitlines();return[l.strip()for l in lines if len(l.strip().split(None,3))>=4 and l.strip().split(None,3)[2]==str(pgid)]
started=time.monotonic();env=os.environ.copy();env.update({'TMPDIR':str(tmp),'TMP':str(tmp),'TEMP':str(tmp)})
expired=False;error=None;p=None;identity=None;code=None;remaining=[]
save('START',{'label':label,'startedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'command':row['command'],'shell':'/bin/bash','cwd':str(src),'sourceHead':head,'sourceStatusBefore':before,'inputFiles':files,'budgets':{'outerSeconds':row['commandOuterSeconds'],'cleanupSeconds':row['cleanupSeconds']},'originalInnerArgumentsAndRetriesUntouched':True,'TMPDIR':str(tmp),'pgPresence':{k:bool(env.get(k))for k in ['CREATOROS_TEST_POSTGRES_URL','CREATOROS_ISOLATED_PG_URL']},'taskOrModelRequestByObserver':False})
try:
 with open(out/'output.log','xb')as f:
  p=subprocess.Popen(row['command'],shell=True,executable='/bin/bash',cwd=src,env=env,stdout=f,stderr=subprocess.STDOUT,start_new_session=True);identity=ps(p.pid);save('PID',{'pid':p.pid,'pgid':p.pid,'identity':identity})
  try:code=p.wait(timeout=row['commandOuterSeconds'])
  except subprocess.TimeoutExpired:expired=True;os.killpg(p.pid,signal.SIGTERM)
except BaseException as e:error={'name':type(e).__name__,'messageSha256':hashlib.sha256(str(e).encode()).hexdigest()}
finally:
 if p:
  end=time.monotonic()+row['cleanupSeconds'];termEnd=end-2
  def bounded_wait(deadline):
   global code,error
   left=deadline-time.monotonic()
   if left<=0:return False
   try:code=p.wait(timeout=left);return True
   except subprocess.TimeoutExpired:return False
  if p.poll()is None:
   try:os.killpg(p.pid,signal.SIGTERM)
   except ProcessLookupError:pass
   if not bounded_wait(termEnd):
    try:os.killpg(p.pid,signal.SIGKILL)
    except ProcessLookupError:pass
    if not bounded_wait(end):error={'name':'CleanupDeadlineExceeded','message':'owned parent not reaped within shared cleanup deadline'}
  else:bounded_wait(end)
  remaining=members(p.pid)
  if remaining:
   # 只本次登记PGID；同120s窗保留最后2秒给KILL与实际退出观察。
   try:os.killpg(p.pid,signal.SIGTERM)
   except ProcessLookupError:pass
   while time.monotonic()<termEnd and members(p.pid):time.sleep(min(.2,max(0,termEnd-time.monotonic())))
   remaining=members(p.pid)
   if remaining:
    try:os.killpg(p.pid,signal.SIGKILL)
    except ProcessLookupError:pass
    while time.monotonic()<end and members(p.pid):time.sleep(min(.2,max(0,end-time.monotonic())))
    remaining=members(p.pid)
   if p.poll()is None:bounded_wait(end)
 after=subprocess.check_output(['git','status','--porcelain=v1'],cwd=src,text=True);drift=[]
 for raw,r in files.items():
  q=src/raw
  if not q.exists()or q.stat().st_size!=r['bytes']or hashlib.sha256(q.read_bytes()).hexdigest()!=r['sha256']:drift.append(raw)
 result={'label':label,'endedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'command':row['command'],'exitCode':code,'expired':expired,'error':error,'elapsedSeconds':time.monotonic()-started,'pidReaped':bool(p and p.poll()is not None),'pidCurrent':ps(p.pid)if p else None,'remainingOwnedGroup':remaining,'sourceStatusAfter':after,'boundInputDrift':drift,'sourceTrackedBytesUnchanged':not after and not drift,'stdoutStderrPath':str(out/'output.log'),'originalFailurePreserved':True,'notFullFeatureAcceptance':True}
 save('RESULT',result);pointer={'path':str(out/'RESULT.json'),'bytes':(out/'RESULT.json').stat().st_size,'sha256':hashlib.sha256((out/'RESULT.json').read_bytes()).hexdigest(),'logPath':str(out/'output.log'),'logBytes':(out/'output.log').stat().st_size,'logSha256':hashlib.sha256((out/'output.log').read_bytes()).hexdigest()};(HERE/(label+'-POINTER.json')).write_text(json.dumps(pointer,ensure_ascii=False,indent=2)+'\n');print(json.dumps(result,ensure_ascii=False));sys.exit(0 if code==0 and not expired and not error and not remaining and not after and not drift else 1)

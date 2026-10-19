import hashlib,json,os,pathlib,signal,subprocess,tempfile,time,shutil
from environment import make_env
repo=pathlib.Path(__file__).resolve().parents[4];source=pathlib.Path(__file__).resolve().parent
# 新拓扑须新cycle真实receipt；旧6f8114/e8916回执不能代替。当前未授权时不启动任何探针/夹具。
review=os.environ.get('T1369_EXECUTION_REVIEW_ID');approved=os.environ.get('T1369_APPROVED_SPEC_SHA256')
if not review or not approved or approved=='6f8114cc1f5fbc686abed00a695c4f2ffb8b33d389e47f964cf45d38d36078cb':raise RuntimeError('NEW_TOPOLOGY_REVIEW_RECEIPT_REQUIRED')
if len(approved)!=64 or any(c not in '0123456789abcdef' for c in approved):raise RuntimeError('INVALID_APPROVED_SPEC_SHA256')
out=source.parent/'production-attempt04';out.mkdir()
root=pathlib.Path(tempfile.mkdtemp(prefix='creatoros-t1369-production-')).resolve();control=pathlib.Path(tempfile.mkdtemp(prefix='c1369-',dir='/private/tmp')).resolve()
for p in [root,control]:os.chmod(p,0o700);assert p.stat().st_uid==os.getuid() and not p.is_symlink()
ports=[41387,41388,41389]
for port in ports:
 p=subprocess.run(['lsof','-nP','-t',f'-iTCP:{port}','-sTCP:LISTEN'],capture_output=True,text=True)
 if p.stdout.strip():raise RuntimeError('PRODUCTION_PORT_NOT_FREE')
if shutil.disk_usage(repo).free<8*1024**3:raise RuntimeError('PRODUCTION_ENTRY_FREE_DISK_LT_8GIB')
home=pathlib.Path.home();profile=out/'loopback.sb';quote=lambda s:json.dumps(str(s))
profile.write_text('(version 1) (allow default) (deny network*) (allow network-bind network-inbound (local ip "localhost:*")) (allow network-outbound (remote ip "localhost:*")) '+''.join('(deny file-read* file-write* (subpath '+quote(home/path)+')) ' for path in ['Library/Application Support','Library/Keychains'])+'\n')
env=make_env(root,control,out);started=time.monotonic();started_unix=time.time();env['T1369_POLICY_FILE']=str(profile);env['T1369_GLOBAL_DEADLINE_UNIX_MS']=str(int((started_unix+18840)*1000))
policy=['/usr/bin/sandbox-exec','-f',str(profile)];command=['node',str(source/'server.mjs')]
files=['frontend/tests/e2e/t1369-dashboard-filter-sidebar-navigation.spec.ts','frontend/playwright.t1369.production.config.ts','docs/verification/t1369/production/server.mjs','docs/verification/t1369/production/run.py','docs/verification/t1369/production/preflight.mjs','docs/verification/t1369/production/environment.py']
record={'startedAtUnix':started_unix,'outerSeconds':18840,'cleanupBudgetSeconds':720,'outerHandoffMarginSeconds':120,'command':command,'fixtureRoot':str(root),'controlRoot':str(control),'ports':ports,'policySha256':hashlib.sha256(profile.read_bytes()).hexdigest(),'sources':{f:hashlib.sha256((repo/f).read_bytes()).hexdigest() for f in files},'approvedSpecSha256':approved,'proposalSha256':'f846415eb6ebdc4d96e42c15e5310adc4e3d56c13247fb82c239df875393f1de','review':review,'entryFreeBytes':shutil.disk_usage(repo).free,'cacheDeleted':False,'fixtureOutsideOsSandbox':True,'productBuildNextBrowserInsideOriginalSandbox':True}
(out/'COMMAND_SAFE.json').write_text(json.dumps(record,ensure_ascii=False,indent=2)+'\n')
for f in files:shutil.copyfile(repo/f,out/(pathlib.Path(f).name+'.executed-source'))
result={'outerTimeout':False,'resourceLimit':False};process=None
try:
 with (out/'preflight.log').open('xb') as stream:
  os.chmod(out/'preflight.log',0o600);pre=subprocess.run(policy+['node',str(source/'preflight.mjs')],cwd=repo,env=env,stdout=stream,stderr=subprocess.STDOUT,timeout=360)
 result['preflightExitCode']=pre.returncode
 if pre.returncode:raise RuntimeError('SANDBOX_PREFLIGHT_FAILED_STOP')
 print(json.dumps({'phase':'sandbox-preflight-complete','exitCode':0}),flush=True)
 with (out/'runner.log').open('xb') as stream:
  os.chmod(out/'runner.log',0o600);process=subprocess.Popen(command,cwd=repo,env=env,stdout=stream,stderr=subprocess.STDOUT,start_new_session=True);result['ownedOrchestratorPid']=process.pid
  samples=[]
  while process.poll() is None:
   free=shutil.disk_usage(repo).free;samples.append({'at':time.time(),'freeBytes':free});(out/'RESOURCE_SAMPLES_SAFE.json').write_text(json.dumps(samples,indent=2)+'\n')
   if free<3*1024**3:result['resourceLimit']=True;break
   # 工作截止预留720s真实清理+120s进程交接，独立外层不在18840到期后再续预算。
   if time.monotonic()-started>=18840-840:result['outerTimeout']=True;break
   time.sleep(5)
  if process.poll() is None:
   os.killpg(process.pid,signal.SIGTERM)
   try:process.wait(timeout=max(1,18840-(time.monotonic()-started)))
   except subprocess.TimeoutExpired:result['ownedCleanupState']='UNKNOWN';os.killpg(process.pid,signal.SIGKILL);result['orchestratorKilledAtOriginalOuterDeadline']=True
  result['exitCode']=process.returncode if process.poll() is not None else 1
except Exception as error:result['driverError']=str(error);result['exitCode']=1
finally:
 result['durationSeconds']=time.monotonic()-started;result['endedAtUnix']=time.time();listeners={}
 for port in ports:listeners[str(port)]=subprocess.run(['lsof','-nP','-t',f'-iTCP:{port}','-sTCP:LISTEN'],capture_output=True,text=True).stdout.split()
 result['ownedPortListenersAfter']=listeners
 if any(listeners.values()):result['ownedCleanupState']='UNKNOWN';result['exitCode']=1
 (out/'execution.json').write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n');print(json.dumps(result,ensure_ascii=False),flush=True)
raise SystemExit(result['exitCode'] if not result['outerTimeout'] and not result['resourceLimit'] else 1)

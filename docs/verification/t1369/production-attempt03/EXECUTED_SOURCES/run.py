import hashlib,json,os,pathlib,signal,subprocess,tempfile,time,shutil
from environment import make_env
repo=pathlib.Path(__file__).resolve().parents[4];source=pathlib.Path(__file__).resolve().parent;out=source.parent/'production-attempt03'
state=json.loads((out/'BOOTSTRAP_STATE_SAFE.json').read_text());probe=json.loads((out/'TSX_LOADER_PROBE_SAFE.json').read_text());assert probe['state']=='PASS'
root=pathlib.Path(state['fixtureRoot']);control=pathlib.Path(state['controlRoot']);assert not list(root.iterdir()) and root.stat().st_uid==os.getuid() and control.stat().st_uid==os.getuid() and control.parent==pathlib.Path('/private/tmp')
assert time.time()-state['probeStartedAtUnix']<480
ports=[41387,41388,41389]
for port in ports:
 p=subprocess.run(['lsof','-nP','-t',f'-iTCP:{port}','-sTCP:LISTEN'],capture_output=True,text=True)
 if p.stdout.strip():raise RuntimeError('PRODUCTION_PORT_NOT_FREE')
if shutil.disk_usage(repo).free<8*1024**3:raise RuntimeError('PRODUCTION_ENTRY_FREE_DISK_LT_8GIB')
profile=source/'loopback.sb';assert hashlib.sha256(profile.read_bytes()).hexdigest()==state['policySha256']
env=make_env(root,control,out);assert hashlib.sha256(json.dumps(env,sort_keys=True).encode()).hexdigest()==probe['sameEnvironmentSha256']
policy=['/usr/bin/sandbox-exec','-f',str(profile)]
command=['pnpm','--dir','frontend','exec','playwright','test','--config=playwright.t1369.production.config.ts','--project=t1369-normal','--workers=1','--retries=0']
files=['frontend/tests/e2e/t1369-dashboard-filter-sidebar-navigation.spec.ts','frontend/playwright.t1369.production.config.ts','docs/verification/t1369/production/server.mjs','docs/verification/t1369/production/run.py','docs/verification/t1369/production/preflight.mjs','docs/verification/t1369/production/environment.py','docs/verification/t1369/production/bootstrap_probe.py','docs/verification/t1369/production/loader-probe.mts']
started=time.monotonic();record={'startedAtUnix':time.time(),'outerSeconds':18300,'command':command,'fixtureRoot':str(root),'controlRoot':str(control),'ports':ports,'policySha256':hashlib.sha256(profile.read_bytes()).hexdigest(),'sources':{f:hashlib.sha256((repo/f).read_bytes()).hexdigest() for f in files},'approvedSpecSha256':'6f8114cc1f5fbc686abed00a695c4f2ffb8b33d389e47f964cf45d38d36078cb','proposalSha256':'c74d22eb0366e98fe9a0cdebfaac3292ae46c5b057438c01dcfed727b3a66729','review':'e8916b9b3f96','entryFreeBytes':shutil.disk_usage(repo).free,'cacheDeleted':False}
(out/'COMMAND_SAFE.json').write_text(json.dumps(record,ensure_ascii=False,indent=2)+'\n')
result={'outerTimeout':False,'resourceLimit':False};process=None
try:
 with (out/'preflight.log').open('xb') as stream:
  os.chmod(out/'preflight.log',0o600);pre=subprocess.run(policy+['node',str(source/'preflight.mjs')],cwd=repo,env=env,stdout=stream,stderr=subprocess.STDOUT,timeout=360)
 result['preflightExitCode']=pre.returncode
 if pre.returncode:raise RuntimeError('SANDBOX_PREFLIGHT_FAILED_STOP')
 print(json.dumps({'phase':'sandbox-preflight-complete','exitCode':0}),flush=True)
 with (out/'runner.log').open('xb') as stream:
  os.chmod(out/'runner.log',0o600);process=subprocess.Popen(policy+command,cwd=repo,env=env,stdout=stream,stderr=subprocess.STDOUT,start_new_session=True);result['ownedRunnerPid']=process.pid
  samples=[]
  while process.poll() is None:
   free=shutil.disk_usage(repo).free;samples.append({'at':time.time(),'freeBytes':free});(out/'RESOURCE_SAMPLES_SAFE.json').write_text(json.dumps(samples,indent=2)+'\n')
   if free<3*1024**3:result['resourceLimit']=True;break
   if time.monotonic()-started>=18300 or time.time()-state['probeStartedAtUnix']>=18780:result['outerTimeout']=True;break
   time.sleep(5)
  if process.poll() is None:
   os.killpg(process.pid,signal.SIGTERM)
   try:process.wait(timeout=240)
   except subprocess.TimeoutExpired:result['ownedCleanupEscalated']=True;os.killpg(process.pid,signal.SIGKILL);process.wait(timeout=120)
  result['exitCode']=process.returncode
except Exception as error:result['driverError']=str(error);result['exitCode']=1
finally:
 result['durationSeconds']=time.monotonic()-started;result['endedAtUnix']=time.time();listeners={}
 for port in ports:
  p=subprocess.run(['lsof','-nP','-t',f'-iTCP:{port}','-sTCP:LISTEN'],capture_output=True,text=True);listeners[str(port)]=p.stdout.split()
 result['ownedPortListenersAfter']=listeners;(out/'execution.json').write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n');print(json.dumps(result,ensure_ascii=False),flush=True)
raise SystemExit(result['exitCode'] if not result['outerTimeout'] and not result['resourceLimit'] else 1)

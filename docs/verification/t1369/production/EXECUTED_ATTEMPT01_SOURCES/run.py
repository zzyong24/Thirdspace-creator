import hashlib,json,os,pathlib,signal,subprocess,tempfile,time,shutil
repo=pathlib.Path(__file__).resolve().parents[4];out=pathlib.Path(__file__).resolve().parent
root=pathlib.Path(tempfile.mkdtemp(prefix='creatoros-t1369-production-')).resolve();os.chmod(root,0o700)
ports=[41387,41388,41389]
for port in ports:
 p=subprocess.run(['lsof','-nP','-t',f'-iTCP:{port}','-sTCP:LISTEN'],capture_output=True,text=True)
 if p.stdout.strip():raise RuntimeError('PRODUCTION_PORT_NOT_FREE')
if shutil.disk_usage(repo).free<8*1024**3:raise RuntimeError('PRODUCTION_ENTRY_FREE_DISK_LT_8GIB')
home=pathlib.Path.home();profile=out/'loopback.sb'
quote=lambda s:json.dumps(str(s))
profile.write_text('(version 1) (allow default) (deny network*) (allow network-bind network-inbound (local ip "localhost:*")) (allow network-outbound (remote ip "localhost:*")) '+''.join('(deny file-read* file-write* (subpath '+quote(home/path)+')) ' for path in ['Library/Application Support','Library/Keychains'])+'\n')
# 不继承业务/安装凭证；已核标准本树无.env，所有可写业务根指本轮私有root。
env={k:os.environ[k] for k in ['PATH','LANG','LC_ALL','TERM'] if k in os.environ};env.update(TMPDIR=str(root)+'/',NO_PROXY='127.0.0.1,localhost',no_proxy='127.0.0.1,localhost',NEXT_TELEMETRY_DISABLED='1',CI='1',T1369_ATTEMPT='production',T1369_DIAGNOSTIC_MODE='production',T1356_FIXTURE_ROOT=str(root),T1356_APP_PORT=str(ports[0]),T1356_PG_PORT=str(ports[1]),T1356_HOST_PORT=str(ports[2]),CREATOROS_DB_DIR=str(root/'db'),CREATOROS_WORKSPACES_ROOT=str(root/'workspaces'))
# preflight不使用fixture root作临时写入，宿主要求首次启动目录全空。
control=pathlib.Path(tempfile.mkdtemp(prefix='creatoros-t1369-production-control-')).resolve();os.chmod(control,0o700);env['TMPDIR']=str(control)+'/'
policy=['/usr/bin/sandbox-exec','-f',str(profile)]
command=['pnpm','--dir','frontend','exec','playwright','test','--config=playwright.t1369.production.config.ts','--project=t1369-normal','--workers=1','--retries=0']
files=['frontend/tests/e2e/t1369-dashboard-filter-sidebar-navigation.spec.ts','frontend/playwright.t1369.production.config.ts','docs/verification/t1369/production/server.mjs','docs/verification/t1369/production/run.py','docs/verification/t1369/production/preflight.mjs']
started=time.monotonic();record={'startedAtUnix':time.time(),'outerSeconds':18300,'command':command,'fixtureRoot':str(root),'controlRoot':str(control),'ports':ports,'policySha256':hashlib.sha256(profile.read_bytes()).hexdigest(),'sources':{f:hashlib.sha256((repo/f).read_bytes()).hexdigest() for f in files},'approvedSpecSha256':'6f8114cc1f5fbc686abed00a695c4f2ffb8b33d389e47f964cf45d38d36078cb','proposalSha256':'c74d22eb0366e98fe9a0cdebfaac3292ae46c5b057438c01dcfed727b3a66729','review':'e8916b9b3f96','entryFreeBytes':shutil.disk_usage(repo).free,'cacheDeleted':False}
(out/'COMMAND_SAFE.json').write_text(json.dumps(record,ensure_ascii=False,indent=2)+'\n')
result={'outerTimeout':False,'resourceLimit':False};process=None
try:
 with (out/'preflight.log').open('xb') as stream:
  os.chmod(out/'preflight.log',0o600);pre=subprocess.run(policy+['node',str(out/'preflight.mjs')],cwd=repo,env=env,stdout=stream,stderr=subprocess.STDOUT,timeout=360)
 result['preflightExitCode']=pre.returncode
 if pre.returncode:raise RuntimeError('SANDBOX_PREFLIGHT_FAILED_STOP')
 print(json.dumps({'phase':'sandbox-preflight-complete','exitCode':0}),flush=True)
 with (out/'runner.log').open('xb') as stream:
  os.chmod(out/'runner.log',0o600);process=subprocess.Popen(policy+command,cwd=repo,env=env,stdout=stream,stderr=subprocess.STDOUT,start_new_session=True);result['ownedRunnerPid']=process.pid
  samples=[]
  while process.poll() is None:
   free=shutil.disk_usage(repo).free;samples.append({'at':time.time(),'freeBytes':free});(out/'RESOURCE_SAMPLES_SAFE.json').write_text(json.dumps(samples,indent=2)+'\n')
   if free<3*1024**3:result['resourceLimit']=True;break
   if time.monotonic()-started>=18300:result['outerTimeout']=True;break
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

import hashlib,json,os,pathlib,signal,subprocess,tempfile,time
root=pathlib.Path(__file__).resolve().parents[4]
out=pathlib.Path(__file__).resolve().parent
private=tempfile.mkdtemp(prefix='creatoros-t1369-supplement-')
os.chmod(private,0o700)
command=['pnpm','--dir','frontend','exec','playwright','test','--config=playwright.t1369.config.ts','--project=t1369-normal','--workers=1','--retries=0']
env=os.environ.copy();env.update(T1369_ATTEMPT='response-supplement03',T1369_DIAGNOSTIC_MODE='response',T1356_FIXTURE_ROOT=private,T1356_APP_PORT='41377',T1356_PG_PORT='41378',T1356_HOST_PORT='41379')
proof={'command':command,'mode':'response','project':'t1369-normal','wrapperDeadlineSeconds':10620,'privateRoot':private,'specSha256':hashlib.sha256((root/'frontend/tests/e2e/t1369-dashboard-filter-sidebar-navigation.spec.ts').read_bytes()).hexdigest(),'configSha256':hashlib.sha256((root/'frontend/playwright.t1369.config.ts').read_bytes()).hexdigest(),'approvedSpecSha256':'152fccf53a18e74bd0fe544f7ed424fa804f5cd323358a0c3ea40f37ec59327a','review':'3f5c80979bef','startedAt':time.time()}
(out/'COMMAND_SAFE.json').write_text(json.dumps(proof,ensure_ascii=False,indent=2)+'\n')
start=time.monotonic();result={'diagnostic':'DEC-136903 supplement of previously unexecuted controlled chain','outerTimeout':False}
log=os.open(out/'runner.log',os.O_CREAT|os.O_EXCL|os.O_WRONLY,0o600)
with os.fdopen(log,'wb') as stream:
 process=subprocess.Popen(command,cwd=root,env=env,stdout=stream,stderr=subprocess.STDOUT,start_new_session=True)
 result['ownedPid']=process.pid
 try:result['exitCode']=process.wait(timeout=10620)
 except subprocess.TimeoutExpired:
  result['outerTimeout']=True;os.killpg(process.pid,signal.SIGTERM)
  try:result['exitCode']=process.wait(timeout=240)
  except subprocess.TimeoutExpired:os.killpg(process.pid,signal.SIGKILL);result['exitCode']=process.wait(timeout=120);result['ownedCleanupEscalated']=True
result['durationSeconds']=time.monotonic()-start;result['endedAt']=time.time()
(out/'execution.json').write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n')
print(json.dumps(result,ensure_ascii=False),flush=True)
raise SystemExit(result['exitCode'])

import hashlib,json,os,pathlib,signal,subprocess,tempfile,time
from environment import make_env
repo=pathlib.Path(__file__).resolve().parents[4];source=pathlib.Path(__file__).resolve().parent;out=source.parent/'production-attempt02';out.mkdir()
root=pathlib.Path(tempfile.mkdtemp(prefix='creatoros-t1369-production-')).resolve();control=pathlib.Path(tempfile.mkdtemp(prefix='c1369-',dir='/private/tmp')).resolve()
for p in [root,control]:os.chmod(p,0o700);assert p.stat().st_uid==os.getuid() and not p.is_symlink()
profile=source/'loopback.sb';env=make_env(root,control,out);start=time.monotonic();state={'fixtureRoot':str(root),'controlRoot':str(control),'probeStartedAtUnix':time.time(),'combinedOuterSeconds':18780,'probeOuterSeconds':480,'probeInnerSeconds':120,'productionOuterSeconds':18300,'policySha256':hashlib.sha256(profile.read_bytes()).hexdigest()};(out/'BOOTSTRAP_STATE_SAFE.json').write_text(json.dumps(state,indent=2)+'\n')
command=['/usr/bin/sandbox-exec','-f',str(profile),'pnpm','--dir','backend','exec','tsx','-e',"console.log('T1369_OWNED_TSX_IPC_OK')"]
result={'phase':'same-env-sandbox-tsx-ipc-probe','innerTimeout':False,'state':'UNKNOWN'}
log=control/'tsx-ipc-probe.log'
with log.open('xb') as stream:
 os.chmod(log,0o600);p=subprocess.Popen(command,cwd=repo,env=env,stdout=stream,stderr=subprocess.STDOUT,start_new_session=True)
 try:p.wait(timeout=120)
 except subprocess.TimeoutExpired:
  result['innerTimeout']=True;os.killpg(p.pid,signal.SIGTERM)
  try:p.wait(timeout=120)
  except subprocess.TimeoutExpired:os.killpg(p.pid,signal.SIGKILL);p.wait(timeout=120);result['cleanupEscalated']=True
 result['exitCode']=p.returncode
body=log.read_bytes();result.update(elapsedMs=round((time.monotonic()-start)*1000,3),rawPath=str(log),rawBytes=len(body),rawSha256=hashlib.sha256(body).hexdigest(),controlRootMode=oct(control.stat().st_mode&0o777),controlRootUidMatches=control.stat().st_uid==os.getuid(),policySha256=state['policySha256'],sameEnvironmentSha256=hashlib.sha256(json.dumps(env,sort_keys=True).encode()).hexdigest(),expectedMarkerPresent=b'T1369_OWNED_TSX_IPC_OK' in body)
result['state']='PASS' if result['exitCode']==0 and result['expectedMarkerPresent'] and not result['innerTimeout'] else 'FAIL';(out/'TSX_IPC_PROBE_SAFE.json').write_text(json.dumps(result,indent=2)+'\n');print(json.dumps(result),flush=True)
raise SystemExit(0 if result['state']=='PASS' else 1)

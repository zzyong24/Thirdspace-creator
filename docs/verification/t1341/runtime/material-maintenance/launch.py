from pathlib import Path
import subprocess,os,signal,time,json,hashlib,sys
repo=next(p for p in Path(__file__).resolve().parents if (p/'frontend/package.json').is_file())
assert(repo/'frontend/package.json').is_file()
label=sys.argv[1];assert label in ['material-1334','material-1335','material-1337']
phase=Path('/Volumes/T7-MacData/CodexBuilds/t1341-asset-real-tags-20261017-b1c02e13')/label
result=phase/'OUTER_WATCHDOG.json';assert not result.exists()
command=[sys.executable,str(repo/'docs/verification/t1341/runtime/material-maintenance/run.py'),label]
env=os.environ.copy();env['T1341_PUBLIC_APPROVED']='1'
start=time.monotonic();ownsha=hashlib.sha256(Path(__file__).read_bytes()).hexdigest()
def identity(pid):
 r=subprocess.run(['/bin/ps','-p',str(pid),'-o','pgid=,lstart=,comm='],capture_output=True,text=True,timeout=120)
 return r.stdout.strip()if r.returncode==0 else None
p=subprocess.Popen(command,cwd=repo,env=env,start_new_session=True)
initial=identity(p.pid);expired=False;actions=[]
result.write_text(json.dumps({'state':'RUNNING','pid':p.pid,'initialIdentity':initial,'command':command,'totalBudgetSeconds':36600,'cleanupReserveSeconds':600,'watchdogOuterSeconds':37200,'startedAt':time.time(),'launcherSha256':ownsha},indent=2)+'\n')
try:p.wait(timeout=36600)
except subprocess.TimeoutExpired:
 expired=True
 if identity(p.pid)==initial:p.send_signal(signal.SIGINT);actions.append('SIGINT_IDENTITY_MATCHED_WRAPPER_FOR_FINALLY')
 try:p.wait(timeout=600)
 except subprocess.TimeoutExpired:
  if identity(p.pid)==initial:p.kill();actions.append('KILL_IDENTITY_MATCHED_WRAPPER_AFTER_RESERVE')
  p.wait(timeout=120)
actual=identity(p.pid)
result.write_text(json.dumps({'state':'FINISHED','pid':p.pid,'initialIdentity':initial,'actualIdentityAfter':actual,'command':command,'totalBudgetSeconds':36600,'cleanupReserveSeconds':600,'watchdogOuterSeconds':37200,'expired':expired,'actions':actions,'exitCode':p.returncode,'elapsedSeconds':time.monotonic()-start,'launcherSha256':ownsha,'launcherBytesUnchanged':hashlib.sha256(Path(__file__).read_bytes()).hexdigest()==ownsha,'workerCleanupAuthoritativeAt':str(phase/'run/execution-result.json')},indent=2)+'\n')
sys.exit(p.returncode if not expired and actual is None else 1)

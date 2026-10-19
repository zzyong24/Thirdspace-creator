from pathlib import Path
import subprocess,os,signal,time,json,hashlib,sys
repo=Path(__file__).resolve().parents[5]
assert(repo/'frontend/package.json').is_file()
label=sys.argv[1];assert label in ['green-v1','unit-v1']
phase=Path('/Volumes/T7-MacData/CodexBuilds/t1339-missing-actual-20261017-42fe69d6')/label
limit=12480 if label=='green-v1' else json.loads((phase/'COLLECTION_RESULT.json').read_text())['count']*540+4800
result=phase/'OUTER_WATCHDOG.json';assert not result.exists()
command=[sys.executable,str(repo/('docs/verification/t1339/runtime/preparation/run.py' if label=='green-v1' else 'docs/verification/t1339/runtime/implementation/unit-run.py')),label]
env=os.environ.copy();env['T1339_PUBLIC_APPROVED' if label=='green-v1' else 'T1339_UNIT_APPROVED']='1'
if label=='unit-v1':env['T1339_UNIT_COUNT']=str(json.loads((phase/'COLLECTION_RESULT.json').read_text())['count'])
start=time.monotonic();ownsha=hashlib.sha256(Path(__file__).read_bytes()).hexdigest()
def identity(pid):
 r=subprocess.run(['/bin/ps','-p',str(pid),'-o','pgid=,lstart=,comm='],capture_output=True,text=True,timeout=120)
 return r.stdout.strip()if r.returncode==0 else None
p=subprocess.Popen(command,cwd=repo,env=env,start_new_session=True)
initial=identity(p.pid);expired=False;actions=[]
result.write_text(json.dumps({'state':'RUNNING','pid':p.pid,'initialIdentity':initial,'command':command,'totalBudgetSeconds':limit,'cleanupReserveSeconds':600,'watchdogOuterSeconds':limit+720,'startedAt':time.time(),'launcherSha256':ownsha},indent=2)+'\n')
try:p.wait(timeout=limit)
except subprocess.TimeoutExpired:
 expired=True
 if identity(p.pid)==initial:p.send_signal(signal.SIGINT);actions.append('SIGINT_IDENTITY_MATCHED_WRAPPER_FOR_FINALLY')
 try:p.wait(timeout=600)
 except subprocess.TimeoutExpired:
  if identity(p.pid)==initial:p.kill();actions.append('KILL_IDENTITY_MATCHED_WRAPPER_AFTER_RESERVE')
  p.wait(timeout=120)
actual=identity(p.pid)
result.write_text(json.dumps({'state':'FINISHED','pid':p.pid,'initialIdentity':initial,'actualIdentityAfter':actual,'command':command,'totalBudgetSeconds':limit,'cleanupReserveSeconds':600,'watchdogOuterSeconds':limit+720,'expired':expired,'actions':actions,'exitCode':p.returncode,'elapsedSeconds':time.monotonic()-start,'launcherSha256':ownsha,'launcherBytesUnchanged':hashlib.sha256(Path(__file__).read_bytes()).hexdigest()==ownsha,'workerCleanupAuthoritativeAt':str(phase/'run/execution-result.json')},indent=2)+'\n')
sys.exit(p.returncode if not expired and actual is None else 1)

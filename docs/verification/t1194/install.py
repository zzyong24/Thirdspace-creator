import os,json,hashlib,subprocess,time,shutil,plistlib
from pathlib import Path
from datetime import datetime,timezone
n=Path(__file__).parent;w=Path('/Users/zyongzhu/.codex/worktrees/t1062-client-integration/Thirdspace-creator')
proof=json.loads((n.parent/'t1191-offline-package-inspection.json').read_text());inventory=json.loads((n/'inventory.json').read_text())
source=w/'frontend/src-tauri/target/release-fast/bundle/macos/CreatorOS.app';target=Path('/Applications/CreatorOS.app');staging=Path('/Applications/.CreatorOS.app.installing-t1194-'+str(os.getpid()))
def sha(p):
 h=hashlib.sha256()
 with p.open('rb') as f:
  while c:=f.read(1048576):h.update(c)
 return h.hexdigest()
def info(p):return plistlib.loads((p/'Contents/Info.plist').read_bytes())
def pids():
 result=[];exe=str(target/'Contents/MacOS/CreatorOS')
 for line in subprocess.check_output(['ps','-axo','pid=,command='],text=True).splitlines():
  v=line.strip().split(None,1)
  if len(v)==2 and (v[1]==exe or v[1].startswith(exe+' ')):result.append(int(v[0]))
 return result
def run(args,budget=1200):
 t=time.monotonic();r=subprocess.run(args,capture_output=True,text=True,timeout=budget)
 rec={'argv':args,'exitCode':r.returncode,'elapsedSeconds':time.monotonic()-t,'stdout':r.stdout,'stderr':r.stderr};commands.append(rec)
 print(json.dumps({'command':args[0],'exitCode':r.returncode,'elapsedSeconds':round(rec['elapsedSeconds'],3)}),flush=True)
 assert r.returncode==0,rec
 return r
started=datetime.now(timezone.utc).isoformat();commands=[]
assert proof['artifactSha256']=='d91079d6542407a6f5c3232f35cd815cfaff259c51fa9e40e5ccf030eb10a1d1'
assert sha(Path(proof['artifactPath']))==proof['artifactSha256']
assert proof['hdiutilVerify']['exitCode']==0 and proof['codesignVerification']['exitCode']==0
assert source.is_dir() and not source.is_symlink() and target.is_dir() and not target.is_symlink() and not staging.exists()
assert info(source)['CFBundleIdentifier']==info(target)['CFBundleIdentifier']=='cloud.aitongban.creatoros'
assert info(source)['CFBundleShortVersionString']=='1.2.0'
assert sha(source/'Contents/MacOS/CreatorOS')==proof['shellSha256'] and sha(source/'Contents/Resources/sidecar.tar.gz')==proof['runtimeTarSha256']
old=next(x for x in inventory['items'] if x['path']==str(target));assert sha(target/'Contents/MacOS/CreatorOS')==old['Contents/MacOS/CreatorOSSha256']
assert sha(target/'Contents/Resources/sidecar.tar.gz')==old['Contents/Resources/sidecar.tar.gzSha256']
original=pids();print(json.dumps({'stage':'stage-current-verified-app','originalNativePids':original,'noBackup':True}),flush=True)
run(['ditto',str(source),str(staging)])
assert info(staging)==info(source)
assert sha(staging/'Contents/MacOS/CreatorOS')==proof['shellSha256'] and sha(staging/'Contents/Resources/sidecar.tar.gz')==proof['runtimeTarSha256']
run(['codesign','--verify','--deep','--strict','--verbose=2',str(staging)])
if pids():
 run(['osascript','-e','tell application "/Applications/CreatorOS.app" to quit'])
 end=time.monotonic()+1200
 while pids() and time.monotonic()<end:time.sleep(.5)
 assert not pids(),'客户端未温和退出，未替换'
assert not pids()
shutil.rmtree(target);os.replace(staging,target)
assert sha(target/'Contents/MacOS/CreatorOS')==proof['shellSha256'] and sha(target/'Contents/Resources/sidecar.tar.gz')==proof['runtimeTarSha256']
run(['codesign','--verify','--deep','--strict','--verbose=2',str(target)])
stdout=n/'native.stdout.log';stderr=n/'native.stderr.log'
for p in [stdout,stderr]:
 assert not p.exists();p.touch(mode=0o600)
launch=datetime.now(timezone.utc).isoformat()
run(['open','--stdout',str(stdout),'--stderr',str(stderr),str(target)])
end=time.monotonic()+1200
while not pids() and time.monotonic()<end:time.sleep(.5)
assert pids(),'没有实际安装版进程'
r={'startedAt':started,'launchedAt':launch,'finishedAt':datetime.now(timezone.utc).isoformat(),'sourceHead':proof['head'],'artifactSha256':proof['artifactSha256'],'target':str(target),'version':info(target)['CFBundleShortVersionString'],'shellSha256':proof['shellSha256'],'runtimeTarSha256':proof['runtimeTarSha256'],'oldShellSha256':old['Contents/MacOS/CreatorOSSha256'],'oldRuntimeTarSha256':old['Contents/Resources/sidecar.tar.gzSha256'],'originalNativePids':original,'newNativePids':pids(),'noBackup':True,'forceKill':False,'commands':commands,'boundary':'只签替换安装与真实进程；服务和主页面加载另核'}
p=n/'installation.json';assert not p.exists();p.write_text(json.dumps(r,ensure_ascii=False,indent=2)+'\n');p.chmod(0o600)
print(json.dumps({k:v for k,v in r.items() if k!='commands'},ensure_ascii=False),flush=True)

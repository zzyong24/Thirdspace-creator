import json,subprocess,time,shutil,re,hashlib
from pathlib import Path
from datetime import datetime,timezone
n=Path(__file__).parent;installation=json.loads((n/'installation.json').read_text());cli=shutil.which('creatoros') or str(Path.home()/'.local/bin/creatoros');assert Path(cli).is_file()
started=datetime.now(timezone.utc).isoformat();records=[]
for tag,args in [('status-v2',['status']),('access-v2',['access','status'])]:
 tick=time.monotonic();r=subprocess.run([cli,*args],capture_output=True,text=True,timeout=600)
 p=n/(tag+'.log');assert not p.exists();p.write_text(r.stdout+r.stderr);p.chmod(0o600)
 d=json.loads(r.stdout);assert r.returncode==0 and d.get('ok') is True
 records.append({'argv':[cli,*args],'exitCode':r.returncode,'elapsedSeconds':time.monotonic()-tick,'logSha256':hashlib.sha256(p.read_bytes()).hexdigest(),'log':str(p)})
 if tag=='status-v2':status=d
assert status.get('connected') is True and status.get('mode')=='installed'
assert str(status.get('pid'))==str(installation['processId']),'公开status必须绑定本轮原生客户端PID'
assert status.get('productId')=='creatoros' and status.get('packageId')=='cloud.aitongban.creatoros'
pid=status['pid'];native=subprocess.check_output(['ps','-p',str(pid),'-o','pid=,ppid=,command='],text=True).strip()
assert native.endswith('/Applications/CreatorOS.app/Contents/MacOS/CreatorOS')
lines=[]
for name in ['native.stderr.log','native.stdout.log']:
 p=n/name;lines.extend(p.read_text(errors='replace').splitlines())
# 仅HTTP服务的首页加载，不把tauri://localhost启动页事件当成首页。
main=[l for l in lines if re.search(r'MAIN_PAGE_LOAD_FINISHED http://(?:127\.0\.0\.1|localhost):\d+/(?:\s|$)',l)]
assert main,'未观测实际HTTP首页加载'
port=int(re.search(r':(\d+)/',main[-1]).group(1))
children=subprocess.run(['pgrep','-P',str(pid)],capture_output=True,text=True);service=[]
for child in children.stdout.split():
 ps=subprocess.check_output(['ps','-p',child,'-o','pid=,ppid=,command='],text=True).strip()
 sock=subprocess.run(['lsof','-nP','-a','-p',child,'-iTCP','-sTCP:LISTEN'],capture_output=True,text=True)
 if f'127.0.0.1:{port} (LISTEN)' in sock.stdout:
  parts=ps.split(None,2);assert int(parts[1])==pid
  service.append({'pid':int(child),'ppid':pid,'command':parts[2],'listenPort':port})
assert service,'实际HTTP端口不是本轮客户端子进程'
root=Path.home()/'Library/Application Support/cloud.aitongban.creatoros/runtime/1.2.0/sidecar'
stamp=(root/'.tarball-stamp').read_text().strip();assert stamp=='sha256:'+installation['runtimeTarSha256']
markers=[l for l in lines if any(k in l for k in ['SIDECAR_STARTUP_VERIFIED','MAIN_PAGE_LOAD_FINISHED http','CHANNEL_RUNTIME_DIGEST_MISMATCH','[client-config]','taskType=scheduled.intelligence.sync status=failed'])]
result={'startedAt':started,'finishedAt':datetime.now(timezone.utc).isoformat(),'sourceHead':installation['sourceHead'],'connected':True,'access':status.get('access'),'nativePid':pid,'nativeCommand':native,'serviceProcesses':service,'mainPageLoadRecords':main,'installedRuntimeStamp':stamp,'cliRecords':records,'startupMarkers':markers,'explicitNewModelCalls':0,'explicitBusinessWrites':0,'boundary':'真实安装版主进程、直属HTTP监听、公开健康与HTTP首页完成事件；非屏幕眼验或全功能验收。原首探针PID误解失败完整保留。'}
p=n/'startup-v2.json';assert not p.exists();p.write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n');p.chmod(0o600)
print(json.dumps({'connected':True,'nativePid':pid,'serviceProcesses':service,'httpHomeLoaded':True,'runtimeStampMatches':True,'startupMarkers':markers},ensure_ascii=False),flush=True)

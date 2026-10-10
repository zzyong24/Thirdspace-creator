import json,time,subprocess,shutil,re
from pathlib import Path
from datetime import datetime,timezone
n=Path(__file__).parent;installation=json.loads((n/'installation.json').read_text());cli=shutil.which('creatoros') or str(Path.home()/'.local/bin/creatoros')
assert Path(cli).is_file();started=datetime.now(timezone.utc).isoformat();tick=time.monotonic();deadline=tick+1800;records=[]
def call(tag,args):
 remain=deadline-time.monotonic();assert remain>0
 t=time.monotonic();r=subprocess.run([cli,*args],capture_output=True,text=True,timeout=min(600,remain))
 log=n/(tag+'.log');assert not log.exists();log.write_text(r.stdout+r.stderr);log.chmod(0o600)
 try:p=json.loads(r.stdout)
 except ValueError:p={}
 rec={'tag':tag,'argv':[cli,*args],'exitCode':r.returncode,'elapsedSeconds':time.monotonic()-t,'ok':p.get('ok'),'log':str(log)};records.append(rec)
 return r,p
for tag,args in [('version',['--version']),('help',['help'])]:
 r,p=call(tag,args);assert r.returncode==0 and p.get('ok') is True,tag
 if tag=='help':assert p.get('usage','').startswith('creatoros ')
attempt=0;healthy=None
while time.monotonic()<deadline-360:
 attempt+=1;r,p=call('status-'+str(attempt),['status'])
 if r.returncode==0 and p.get('ok') is True and p.get('connected') is True:
  healthy=p;break
 print(json.dumps({'stage':'waiting-service','attempt':attempt,'exitCode':r.returncode,'errorCode':p.get('error',{}).get('code') if isinstance(p.get('error'),dict) else p.get('code')}),flush=True)
 time.sleep(3)
assert healthy,'安装版本地服务未就绪'
for tag,args in [('access',['access','status']),('operations',['operations','list'])]:
 r,p=call(tag,args);assert r.returncode==0 and p.get('ok') is True,tag
exe=str(Path(installation['target'])/'Contents/MacOS/CreatorOS');native=[]
for line in subprocess.check_output(['ps','-axo','pid=,ppid=,command='],text=True).splitlines():
 v=line.strip().split(None,2)
 if len(v)==3 and (v[2]==exe or v[2].startswith(exe+' ')):native.append({'pid':int(v[0]),'ppid':int(v[1]),'command':v[2]})
assert native and any(p['pid'] in installation['newNativePids'] for p in native),'未发现本轮安装客户端'
service_pid=healthy.get('pid');service=[]
if service_pid:
 raw=subprocess.run(['ps','-p',str(service_pid),'-o','pid=,ppid=,command='],text=True,capture_output=True)
 for line in raw.stdout.splitlines():
  v=line.strip().split(None,2)
  if len(v)==3:service.append({'pid':int(v[0]),'ppid':int(v[1]),'command':v[2]})
 assert service and service[0]['ppid'] in [x['pid'] for x in native],('服务不是本轮原生客户端子进程',service)
lines=[]
while time.monotonic()<deadline:
 lines=[]
 for name in ['native.stderr.log','native.stdout.log']:
  p=n/name
  if p.exists():lines.extend(p.read_text(errors='replace').splitlines())
 main=[l for l in lines if 'MAIN_PAGE_LOAD_FINISHED' in l]
 if main:break
 time.sleep(2)
assert main,'未取得本轮原生首页加载完成记录，不能代签界面加载'
assert not any('sidecar 启动前退出' in l or 'CreatorOS 启动超时' in l for l in lines)
r={'startedAt':started,'finishedAt':datetime.now(timezone.utc).isoformat(),'elapsedSeconds':time.monotonic()-tick,'sourceHead':installation['sourceHead'],'nativeProcesses':native,'serviceProcesses':service,'connected':True,'productId':healthy.get('productId'),'packageId':healthy.get('packageId'),'servicePid':service_pid,'statusAttempts':attempt,'mainPageLoadRecords':main,'cliRecords':records,'explicitNewModelCalls':0,'explicitBusinessWrites':0,'boundary':'真实安装App进程、直属本地服务健康及原生WebView首页完成事件；不是屏幕眼验或全功能PASS'}
p=n/'startup.json';assert not p.exists();p.write_text(json.dumps(r,ensure_ascii=False,indent=2)+'\n');p.chmod(0o600)
print(json.dumps({k:v for k,v in r.items() if k not in ['cliRecords','nativeProcesses','serviceProcesses']},ensure_ascii=False),flush=True)

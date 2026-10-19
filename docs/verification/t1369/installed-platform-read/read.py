import hashlib,json,os,pathlib,subprocess,sys,tempfile,time
out=pathlib.Path(__file__).resolve().parent
label=sys.argv[1];assert label in ['describe','all','douyin','wechatVideo']
state=out/'PRIVATE_ROOT_SAFE.json'
if state.exists():private=pathlib.Path(json.loads(state.read_text())['privateRoot'])
else:
 private=pathlib.Path(tempfile.mkdtemp(prefix='creatoros-t1369-platform-read-')).resolve();os.chmod(private,0o700);state.write_text(json.dumps({'privateRoot':str(private)})+'\n')
assert private.stat().st_uid==os.getuid() and not private.stat().st_mode&0o077
exe='/Users/zyongzhu/.local/bin/creatoros';env=os.environ.copy()
for key in ['CREATOROS_BASE_URL','CREATOROS_EMAIL','CREATOROS_PASSWORD','CREATOROS_HANDSHAKE_TOKEN','CREATOROS_CLI_ACCESS_TOKEN']:env.pop(key,None)
command=[exe,'operations','describe','pages.groupOverview.get'];payload=None;query=None;group=None
if label!='describe':
 descriptor=json.loads((private/'describe.json').read_text());assert descriptor['ok'] and descriptor['effect']=='read' and descriptor['method']=='GET' and descriptor['idempotency']=='not_applicable' and descriptor['confirmation']=='none'
 previous=json.loads((out.parent/'INSTALLED_PUBLIC_READ_TIMING_SAFE.json').read_text());group=json.loads(pathlib.Path(previous['reads'][0]['rawPath']).read_text())['groupId'];assert hashlib.sha256(group.encode()).hexdigest()==previous['reads'][0]['groupIdSha256']
 query={'startDate':'2026-09-20','endDate':'2026-10-19'}
 if label!='all':query['platform']=label
 payload=json.dumps({'params':{'groupId':group},'query':query}).encode();command=[exe,'call','pages.groupOverview.get','--group',group,'--input','-']
raw=private/(label+'.json');stderr=private/(label+'.stderr');started=time.time();mono=time.monotonic();result={'label':label,'startedAtUnix':started,'commandOuterSeconds':8520,'cliNormalObservationMs':8280000,'boundary':'公开CLI正常安装身份机制；未读取连接凭据；无apply/idempotency-key/collect/model/site；含CLI启动/本机传输/服务到完整JSON解析，不冒服务单阶段。'}
(out/(label+'-STARTED_SAFE.json')).write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n')
with raw.open('xb') as stdout,stderr.open('xb') as err:
 os.chmod(raw,0o600);os.chmod(stderr,0o600)
 p=subprocess.Popen(command,stdin=subprocess.PIPE if payload else subprocess.DEVNULL,stdout=stdout,stderr=err,env=env)
 try:p.communicate(input=payload,timeout=8520);result['exitCode']=p.returncode
 except subprocess.TimeoutExpired:
  result['status']='outer_timeout';p.terminate()
  try:p.wait(timeout=120)
  except subprocess.TimeoutExpired:p.kill();p.wait(timeout=120)
  result['exitCode']=p.returncode
try:
 d=json.loads(raw.read_bytes());result.update(status='parsed',ok=d.get('ok'))
 if label=='describe':result.update(operation=d.get('operation'),effect=d.get('effect'),method=d.get('method'),idempotency=d.get('idempotency'),confirmation=d.get('confirmation'))
 else:
  w=(d.get('data') or {}).get('workspace') or {};collected=w.get('collected') or {};result.update(groupIdSha256=hashlib.sha256(group.encode()).hexdigest(),requestQuery=query,scopeMatches=d.get('groupId')==group and w.get('groupId')==group and w.get('platform')==(None if label=='all' else label) and w.get('accountId') is None and w.get('startDate')==query['startDate'] and w.get('endDate')==query['endDate'],workspaceStatus=w.get('status'),catalog={k:collected.get(k) for k in ['state','catalogWorkCount','unattributableWorkCount','deduplicatedWorkCount']},metricKnown=[{k:m.get(k) for k in ['platform','metricKey','scope','knownCount','eligibleCount']} for m in collected.get('metrics',[])],workspaceCounts={k:w.get(k) for k in ['totalAccounts','collectedAccounts','contentCount','publicationCount']},metaKeys=list((d.get('meta') or {}).keys()),errorCode=(d.get('error') or {}).get('code'))
except Exception as error:result['parseErrorType']=type(error).__name__
result.update(completeParseDurationMs=round((time.monotonic()-mono)*1000,3),endedAtUnix=time.time(),rawPath=str(raw),rawBytes=raw.stat().st_size,rawSha256=hashlib.sha256(raw.read_bytes()).hexdigest(),stderrBytes=stderr.stat().st_size)
(out/(label+'-SAFE.json')).write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n');print(json.dumps(result,ensure_ascii=False),flush=True)
if result.get('exitCode')!=0 or not result.get('ok'):raise SystemExit(1)

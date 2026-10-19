"""仅本轮已关闭checkpoint→全新owned服务；每命令独立副本，不操作用户App。"""
from pathlib import Path
import os,sys,json,hashlib,subprocess,time,signal,uuid
HERE=Path(__file__).resolve().parent
BASE=Path('/Volumes/T7-MacData/CodexBuilds/t1343-legacy-bare-render-20261018/final-ui')
SOURCE='74b03effa508e793712de3be738c0b518ed7117b'
def read(p):return json.loads(Path(p).read_text())
def save(p,v):
 p=Path(p);p.parent.mkdir(parents=True,exist_ok=True,mode=0o700);temp=p.with_name(p.name+'.tmp-'+uuid.uuid4().hex);temp.write_text(json.dumps(v,ensure_ascii=False,indent=2)+'\n');os.chmod(temp,0o600);os.replace(temp,p)
def sha(p):
 h=hashlib.sha256()
 with Path(p).open('rb')as f:
  for b in iter(lambda:f.read(4194304),b''):h.update(b)
 return h.hexdigest()
def ref(p):return{'path':str(p),'sha256':sha(p)}
def proof(r):assert Path(r['path']).is_absolute()and sha(r['path'])==r['sha256'];return read(r['path'])
def owned(p):
 p=Path(p);assert p.is_absolute()and str(p).startswith(str(BASE/'services')+'/');return p
def identity(pid):
 r=subprocess.run(['/bin/ps','-p',str(pid),'-o','pgid=,lstart=,comm='],capture_output=True,text=True,timeout=120)
 return r.stdout.strip()if r.returncode==0 else None
def stop(file):
 r=read(file);assert r['schema']=='creatoros-candidate-lifecycle/v1';owned(r['outputDirectory']);deadline=time.monotonic()+590
 fifo=Path(r['controlFifo']);assert fifo.parent==Path(r['outputDirectory']);actual=identity(r['supervisorPid'])
 if actual==r['supervisorIdentity']:
  fd=os.open(fifo,os.O_WRONLY|os.O_NONBLOCK)
  try:os.write(fd,b'stop\n')
  finally:os.close(fd)
 result_path=Path(r['supervisorOutput'])/'RESULT.json'
 while not result_path.exists()and time.monotonic()<deadline:time.sleep(.25)
 assert result_path.exists(),'SUPERVISOR_STOP_RECEIPT_MISSING';result=read(result_path);assert result['error']is None and not result['expired'];assert result['exitCode']in [0,143];assert len(result['remaining'])>=2 and all(x['current']is None for x in result['remaining'])
 after=Path(result['sourceAfterUiReceipt']);assert read(after)['unchanged']is True
 value={'state':'STOPPED','schema':'creatoros-candidate-lifecycle-stop/v1','sourceAfterUnchanged':True,'sourceAfter':ref(after),'remaining':result['remaining'],'supervisorResult':ref(result_path),'exitCode':result['exitCode'],'flushAsserted':False};save(r['stopReceiptPath'],value);print(json.dumps(ref(Path(r['stopReceiptPath']))))
def launch(file):
 i=read(file);assert i['schema']=='creatoros-candidate-lifecycle-intent/v1';phase=i['phase'];assert phase=='bare-render';assert i['taskId']=='T-1343';fixture=proof(i['fixture']);assert fixture['schema']=='creatoros-completed-owned-ui-fixture/v1'and fixture['task']=='T1343'and fixture['state']=='CLOSED_RENDER_CANDIDATE_AWAITING_UI_CONFIRMATION'
 b=proof(i['candidateTemplate']);assert b['sourceHead']==SOURCE;assert i['maximumModelRoots']==0
 out=owned(i['outputDirectory']);out.mkdir(parents=True,exist_ok=False,mode=0o700);receipt=Path(i['receiptPath']);assert receipt.parent==out and not receipt.exists();artifact=out/'candidate';artifact.mkdir(mode=0o700);evidence=artifact/'acceptance';evidence.mkdir(mode=0o700)
 controller=HERE/'completed-fixture-controller.mjs';helper=HERE/'owned-fixture.mjs';assert sha(helper)=='c0683ca8977ed4ba63d02e10ec45194dfe5a0236f3ab31400166e54636a0090b';assert sha(controller)=='be930bfc86be8743de0a37d771c8300a170b3c1bc4f055ec02b1d0496a564dc9'
 b.update(artifactRoot=str(artifact),evidenceRoot=str(evidence),driverFiles=[ref(controller),ref(helper),ref(Path('/Users/zyongzhu/Workbase/Thirdspace-creator/docs/verification/t1328/final-integration/runtime/formal-ui-acceptance/prediction-lock-seed/runtime/final-ui-controller/owned-fixture.mjs'))]);binding=evidence/'candidate-binding.json';save(binding,b);manifest=out/'fixture.json';save(manifest,fixture);config=out/'controller-config.json';save(config,{'controllerPath':str(controller),'controllerSha256':sha(controller),'extraArguments':['--completed-owned-fixture',str(manifest)]})
 fifo=out/'control.fifo';os.mkfifo(fifo,0o600);fd=os.open(fifo,os.O_RDWR|os.O_NONBLOCK);os.set_blocking(fd,True);superout=out/'supervisor';supervisor=HERE/'lifecycle-supervisor.py';env=dict(os.environ,C_T1343_CONTROLLER_APPROVED='1');log=(out/'supervisor-safe.log').open('xb')
 p=subprocess.Popen([sys.executable,str(supervisor),str(binding),str(config),str(superout)],stdin=fd,stdout=log,stderr=subprocess.STDOUT,start_new_session=True,env=env);os.close(fd);log.close();ident=identity(p.pid);assert ident
 r={'schema':'creatoros-candidate-lifecycle/v1','state':'STARTING','phase':phase,'fixture':i['fixture'],'candidateBinding':ref(binding),'outputDirectory':str(out),'controlFifo':str(fifo),'supervisorPid':p.pid,'supervisorIdentity':ident,'supervisorOutput':str(superout),'stopReceiptPath':str(out/'STOPPED.json')};save(receipt,r)
 try:
  until=time.monotonic()+1140
  while not(superout/'READY.json').exists()and p.poll()is None and time.monotonic()<until:time.sleep(.25)
  assert(superout/'READY.json').exists(),'CHECKPOINT_SERVICE_NOT_READY';ready_path=Path(read(superout/'READY.json')['readyReceipt']);ready=read(ready_path);assert ready['completedOwnedFixture']['sourceRoot']==fixture['sourceRoot'];assert p.poll()is None;stable_identity=identity(p.pid);assert stable_identity;r.update(state='READY',supervisorInitialIdentity=ident,supervisorIdentity=stable_identity,ready=ref(ready_path),sourceCopyProof=ref(Path(ready['completedOwnedFixture']['copyReceipt'])),sessionPath=ready['sessionPath'],baseURL=ready['baseURL']);save(receipt,r);print(json.dumps(ref(receipt)))
 except BaseException:
  # Popen仍持有同一未退出子进程时，保启动身份并读取exec后真实Python身份；不按旧launcher comm误跳过本owned stop。
  if p.poll()is None:
   actual=identity(p.pid)
   if actual:r.update(supervisorInitialIdentity=ident,supervisorIdentity=actual);save(receipt,r)
  try:stop(receipt)
  except BaseException as e:save(out/'FAILED_START_CLEANUP.json',{'name':type(e).__name__,'error':str(e),'initialReceipt':str(receipt),'remainingSupervisorIdentity':identity(p.pid)})
  raise
assert len(sys.argv)==3
if sys.argv[1]=='launch':launch(sys.argv[2])
elif sys.argv[1]=='stop':stop(sys.argv[2])
else:raise RuntimeError('EXACT_LAUNCH_OR_STOP_REQUIRED')

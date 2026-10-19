"""仅本轮已关闭checkpoint→全新owned服务；每命令独立副本，不操作用户App。"""
from pathlib import Path
import os,sys,json,hashlib,subprocess,time,signal,uuid
HERE=Path(__file__).resolve().parent
BASE=Path('/Volumes/T7-MacData/CodexBuilds/t1300-final-ui-candidates-three-root-20261017')
SOURCE='0953f10e077f82debfbfc2fa6a336182eaa2b1a5'
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
 i=read(file);assert i['schema']=='creatoros-candidate-lifecycle-intent/v1';phase=i['phase'];assert phase in ['joint1','joint2','editor1'];assert i['taskId']in ['T-1302','T-1303','T-1304','T-1305','T-1308'];cp=proof(i['checkpoint']);assert cp['schema']=='creatoros-candidate-checkpoint/v1'and cp['state']=='CLOSED_TERMINAL_UNADOPTED_SOURCE'and cp['phase']==phase
 b=proof(i['candidateTemplate']);assert b['sourceHead']==SOURCE;assert i['maximumModelRoots']==0
 out=owned(i['outputDirectory']);out.mkdir(parents=True,exist_ok=False,mode=0o700);receipt=Path(i['receiptPath']);assert receipt.parent==out and not receipt.exists();artifact=out/'candidate';artifact.mkdir(mode=0o700);evidence=artifact/'acceptance';evidence.mkdir(mode=0o700)
 controller=HERE/'checkpoint-fixture-controller.mjs';helper=HERE/'checkpoint-owned-fixture.mjs';assert sha(helper)=='ae9c4ad1d8bc9f68b93299e75436141c8f6e6e0ca9ca86bc29c8d787dfa8bbb1';assert sha(controller)=='21775b6c8ddade41e8b962f26ddf41377d5fdc8cb366aa8405f0449ec91e6c85'
 b.update(artifactRoot=str(artifact),evidenceRoot=str(evidence),driverFiles=[ref(controller),ref(helper)]);binding=evidence/'candidate-binding.json';save(binding,b);manifest=out/'fixture.json';save(manifest,{'schema':'creatoros-three-root-checkpoint-fixture/v1','checkpoint':i['checkpoint']});config=out/'controller-config.json';save(config,{'controllerPath':str(controller),'controllerSha256':sha(controller),'extraArguments':['--completed-owned-fixture',str(manifest)]})
 fifo=out/'control.fifo';os.mkfifo(fifo,0o600);fd=os.open(fifo,os.O_RDWR|os.O_NONBLOCK);os.set_blocking(fd,True);superout=out/'supervisor';supervisor=HERE/'lifecycle-supervisor.py';env=dict(os.environ,C_FINAL_0953_CONTROLLER_APPROVED='1');log=(out/'supervisor-safe.log').open('xb')
 p=subprocess.Popen([sys.executable,str(supervisor),str(binding),str(config),str(superout)],stdin=fd,stdout=log,stderr=subprocess.STDOUT,start_new_session=True,env=env);os.close(fd);log.close();ident=identity(p.pid);assert ident
 r={'schema':'creatoros-candidate-lifecycle/v1','state':'STARTING','phase':phase,'checkpoint':i['checkpoint'],'candidateBinding':ref(binding),'outputDirectory':str(out),'controlFifo':str(fifo),'supervisorPid':p.pid,'supervisorIdentity':ident,'supervisorOutput':str(superout),'stopReceiptPath':str(out/'STOPPED.json')};save(receipt,r)
 try:
  until=time.monotonic()+1140
  while not(superout/'READY.json').exists()and p.poll()is None and time.monotonic()<until:time.sleep(.25)
  assert(superout/'READY.json').exists(),'CHECKPOINT_SERVICE_NOT_READY';ready_path=Path(read(superout/'READY.json')['readyReceipt']);ready=read(ready_path);assert ready['completedOwnedFixture']['sourceRoot']==cp['checkpointRoot'];assert p.poll()is None;stable_identity=identity(p.pid);assert stable_identity;r.update(state='READY',supervisorInitialIdentity=ident,supervisorIdentity=stable_identity,ready=ref(ready_path),sourceCopyProof=ref(Path(ready['completedOwnedFixture']['copyReceipt'])),sessionPath=ready['sessionPath'],baseURL=ready['baseURL']);save(receipt,r);print(json.dumps(ref(receipt)))
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

"""稳定任务入口；每次经C受支持lifecycle加载新副本，禁止复用已写库/发模型。"""
from pathlib import Path
import os,sys,json,hashlib,subprocess,uuid,datetime,time,signal
here=Path(__file__).resolve().parent;repo=next(p for p in here.parents if (p/'frontend/package.json').is_file())
def stop_signal(signum,frame):raise KeyboardInterrupt('FORMAL_OUTER_TERMINATION')
signal.signal(signal.SIGTERM,stop_signal);signal.signal(signal.SIGINT,stop_signal)
TASKS={'T-1302':['joint1','editor1'],'T-1303':['joint1','joint2','editor1'],'T-1304':['joint1','editor1'],'T-1305':['joint1','editor1'],'T-1308':['editor1']}
def sha(p):
 h=hashlib.sha256()
 with Path(p).open('rb') as f:
  for x in iter(lambda:f.read(4194304),b''):h.update(x)
 return h.hexdigest()
def proof(ref):
 p=Path(ref['path']);assert p.is_absolute() and sha(p)==ref['sha256'];return json.loads(p.read_text())
def save(p,value):p.parent.mkdir(parents=True,exist_ok=True,mode=0o700);p.write_text(json.dumps(value,ensure_ascii=False,indent=2)+'\n');p.chmod(0o600)
def main():
 assert len(sys.argv)==4 and sys.argv[1]=='--inner','USE_INDEPENDENT_OUTER'
 task=sys.argv[2];bootstrap_path=Path(sys.argv[3]).resolve();bootstrap=json.loads(bootstrap_path.read_text());assert task in TASKS
 assert os.environ.get('C_FIVE_FORMAL_OUTER_ACTIVE')=='1';assert bootstrap['schema']=='creatoros-five-formal-bootstrap/v1' and bootstrap['state']=='EXECUTION_AUTHORIZED'
 head=subprocess.check_output(['git','rev-parse','HEAD'],cwd=repo,text=True).strip();assert head==bootstrap['controlHead']
 assert bootstrap['runnerSha256']=={p.name:sha(p)for p in here.iterdir()if p.is_file()};assert bootstrap['maximumModelRoots']==0
 adapter=bootstrap['lifecycleAdapter'];assert adapter['state']=='ACTUAL_HELPER_APPROVED';assert sha(adapter['helper']['path'])==adapter['helper']['sha256'];assert Path(adapter['pythonPath']).is_absolute()
 external=Path(bootstrap['externalRoot']).resolve();assert str(external)=='/Volumes/T7-MacData/CodexBuilds/t1300-final-ui-candidates-three-root-20261017';assert external.stat().st_mode&0o777==0o700
 run_id=os.environ['C_FIVE_FORMAL_RUN_ID'];run=external/'formal-runs'/task/run_id;run.mkdir(parents=True,exist_ok=False,mode=0o700);save(run/'COMMAND_START.json',{'taskId':task,'runId':run_id,'controlHead':head,'modelRootsAllowed':0,'checkpoints':TASKS[task],'perControllerStartupSeconds':1200,'perControllerStopSeconds':600,'innerSeconds':34200,'hashReserveSeconds':1800,'cleanupReserveSeconds':600,'actualIndependentOuterSeconds':43200})
 b=json.loads(json.dumps(bootstrap['tasks'][task]));services={};launched=[];requested=[];stops=[];error=None;code=1
 try:
  for phase in TASKS[task]:
   checkpoint=bootstrap['checkpoints'][phase];cp=proof(checkpoint);assert cp['phase']==phase and cp['state']=='CLOSED_TERMINAL_UNADOPTED_SOURCE'
   request=run/(phase+'-launch-intent.json');intent={**adapter['launchIntentTemplate'],'taskId':task,'runId':run_id+'-'+phase,'phase':phase,'checkpoint':checkpoint,'outputDirectory':str(external/'services/formal'/task/(run_id+'-'+phase)),'receiptPath':str(external/'services/formal'/task/(run_id+'-'+phase)/'LAUNCH.json')}
   save(request,intent);requested.append(Path(intent['receiptPath']));save(run/'REQUESTED_LAUNCHES.json',[str(p)for p in requested])
   command=[adapter['pythonPath'],adapter['helper']['path'],'launch',str(request)]
   result=subprocess.run(command,capture_output=True,text=True,timeout=1200)
   save(run/(phase+'-LAUNCH_RESULT.json'),{'command':command,'exitCode':result.returncode,'stdoutBytes':len(result.stdout.encode()),'stdoutSHA256':hashlib.sha256(result.stdout.encode()).hexdigest(),'stderrBytes':len(result.stderr.encode()),'stderrSHA256':hashlib.sha256(result.stderr.encode()).hexdigest()})
   assert result.returncode==0,'SUPPORTED_LIFECYCLE_LAUNCH_FAILED'
   receipt_path=Path(intent['receiptPath']);receipt=json.loads(receipt_path.read_text());launch_ref={'path':str(receipt_path),'sha256':sha(receipt_path)};launched.append(launch_ref)
   assert receipt['state']=='READY';assert receipt['phase']==phase;assert receipt['checkpoint']==checkpoint
   actual_ready=proof(receipt['ready']);assert actual_ready['completedOwnedFixture']['sourceRoot']==cp['checkpointRoot'];assert actual_ready['sourceHead']==bootstrap['sourceHead'];assert actual_ready['ownedRoot']!=cp['checkpointRoot']
   services[phase]={'checkpoint':checkpoint,'candidateBinding':receipt['candidateBinding'],'ready':receipt['ready'],'candidate':{k:actual_ready[k]for k in ['sourceHead','baseURL','ownedRoot','sessionPath']},'scope':bootstrap['scope'],'launchReceipt':launch_ref,'sourceCopyProof':receipt['sourceCopyProof']}
  b.update(schema='creatoros-five-candidate-formal/v1',state='EXECUTION_AUTHORIZED',executionAuthorized=True,runtimeOutputAuthorized=True,mode='EXECUTION',taskId=task,caseId=task,maximumModelRoots=0,maximumUserModelRootsPerCase=0,controlHead=head,sourceHead=bootstrap['sourceHead'],packageSha256=bootstrap['packageSha256'],services=services,externalRoot=str(external),fixtureApplicationKeyPath=bootstrap['fixtureApplicationKeyPath'],runtime=bootstrap['runtime'],runId=run_id,outputDirectory=str(run/'journey'),temporaryRoot=str(run/'temporary'),absoluteDeadlineAt=(datetime.datetime.now(datetime.timezone.utc)+datetime.timedelta(seconds=30600)).isoformat(),runnerSha256=bootstrap['runnerSha256'],bootstrap={'path':str(bootstrap_path),'sha256':sha(bootstrap_path)})
  b['dynamicRefs']=[ref for service in services.values()for ref in [service['candidateBinding'],service['ready'],service['launchReceipt'],service['sourceCopyProof']]]
  binding=run/'ACTUAL_BINDING.json';save(binding,b);env=os.environ.copy();env.update(C_FIVE_FORMAL_APPROVED='1',C_FIVE_FORMAL_BINDING=str(binding));result=subprocess.run([sys.executable,str(here/'run.py'),'--execute'],cwd=repo,env=env,timeout=34200);code=result.returncode
 except BaseException as e:error={'name':type(e).__name__,'message':str(e)}
 finally:
  for receipt_path in requested:
   if receipt_path.is_file() and not any(row['path']==str(receipt_path)for row in launched):launched.append({'path':str(receipt_path),'sha256':sha(receipt_path)})
  for launch in reversed(launched):
   try:
    result=subprocess.run([adapter['pythonPath'],adapter['helper']['path'],'stop',launch['path']],capture_output=True,text=True,timeout=600)
    raw=proof(launch);stop_path=Path(raw['stopReceiptPath']);stop=json.loads(stop_path.read_text());assert result.returncode==0 and stop['state']=='STOPPED';assert stop['sourceAfterUnchanged'] is True;assert stop['remaining'] and all(row['current'] is None for row in stop['remaining']);stops.append({'launch':launch,'stop':{'path':str(stop_path),'sha256':sha(stop_path)},'exitCode':result.returncode})
   except BaseException as e:stops.append({'launch':launch,'error':{'name':type(e).__name__,'message':str(e)}});error=error or {'name':'LifecycleCleanupFailed','message':str(e)}
  after_head=subprocess.check_output(['git','rev-parse','HEAD'],cwd=repo,text=True).strip();assert after_head==head
  receipt={'taskId':task,'controlHead':head,'bundleHead':bootstrap['sourceHead'],'runId':run_id,'outputDirectory':str(run/'journey'),'exitCode':code if error is None else 1,'error':error,'launched':launched,'stops':stops,'taskResult':str(run/'journey/TASK_RESULT.json'),'visibleCopy':str(run/'journey/VISIBLE_COPY.json'),'executionResult':str(run/'journey/EXECUTION_RESULT.json'),'modelRootsAllowed':0,'previousOutputOverwritten':False,'sourceKeyBytesRead':False}
  save(run/'COMMAND_RESULT.json',receipt);latest=Path(bootstrap['latestDirectory'])/(task+'.json');save(latest,{'latestReceipt':str(run/'COMMAND_RESULT.json'),'sha256':sha(run/'COMMAND_RESULT.json'),'exitCode':receipt['exitCode']});print(json.dumps(receipt,ensure_ascii=False))
 return receipt['exitCode']
if __name__=='__main__':
 if len(sys.argv)==3:
  task=sys.argv[1];assert task in TASKS;bootstrap=Path(sys.argv[2]).resolve();sys.exit(subprocess.run([sys.executable,str(here/'outer.py'),task,str(bootstrap)]).returncode)
 sys.exit(main())

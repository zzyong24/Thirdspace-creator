"""稳定T1343入口：C既有lifecycle每UUID恢复新副本，原产物0render/0model续验。"""
from pathlib import Path
import os,sys,json,hashlib,subprocess,datetime,signal
here=Path(__file__).resolve().parent;repo=next(p for p in here.parents if(p/'frontend/package.json').is_file())
def sha(p):
 h=hashlib.sha256()
 with Path(p).open('rb')as f:
  for x in iter(lambda:f.read(4194304),b''):h.update(x)
 return h.hexdigest()
def proof(ref):
 p=Path(ref['path']);assert p.is_absolute()and sha(p)==ref['sha256'];return json.loads(p.read_text())
def ref(p):return{'path':str(p),'sha256':sha(p)}
def save(p,v):p.parent.mkdir(parents=True,exist_ok=True,mode=0o700);p.write_text(json.dumps(v,ensure_ascii=False,indent=2)+'\n');p.chmod(0o600)
def term(signum,frame):raise KeyboardInterrupt('FORMAL_OUTER_TERMINATION')
signal.signal(signal.SIGTERM,term);signal.signal(signal.SIGINT,term)
def main():
 assert len(sys.argv)==4 and sys.argv[1]=='--inner';task=sys.argv[2];p=Path(sys.argv[3]).resolve();boot=json.loads(p.read_text());assert task=='T-1343';assert os.environ.get('C_MEDIA_FINAL_OUTER_ACTIVE')=='1';assert boot['schema']=='creatoros-media-final-bootstrap/v1'and boot['state']=='EXECUTION_AUTHORIZED'and boot['maximumModelRoots']==0
 head=subprocess.check_output(['git','rev-parse','HEAD'],cwd=repo,text=True).strip();assert head==boot['controlHead'];assert boot['runnerSha256']=={q.name:sha(q)for q in here.iterdir()if q.is_file()}
 origin=proof(boot['sourceProof']);handoff=proof(origin['refs']['handoff']);assert origin['taskId']=='ai-task-46c2b534-28'and origin['newRenderRootsAllowed']==0;assert handoff['confirmCalled']is False and handoff['originalSourceStatus']=='awaiting_confirmation';assert boot['originalAbsoluteDeadlineAt']==origin['originalAbsoluteDeadlineAt']
 adapter=boot['lifecycleAdapter'];assert adapter['state']=='ACTUAL_HELPER_APPROVED';assert Path(adapter['path']).is_absolute()and sha(adapter['path'])==adapter['sha256'];assert Path(adapter['pythonPath']).is_absolute();fixture=proof(adapter['launchIntentTemplate']['fixture']);assert fixture['sourceRoot']==origin['sourceRoot']
 external=Path(boot['externalRoot']).resolve();assert str(external)=='/Volumes/T7-MacData/CodexBuilds/t1343-legacy-bare-render-20261018';assert external.stat().st_mode&0o777==0o700
 run_id=os.environ['C_MEDIA_FINAL_RUN_ID'];run=external/'final-ui/runs'/run_id;run.mkdir(parents=True,exist_ok=False,mode=0o700);save(run/'COMMAND_START.json',{'taskId':task,'runId':run_id,'controlHead':head,'maximumRenderRoots':0,'maximumModelRoots':0,'startupSeconds':1200,'commandSeconds':36000,'stopSeconds':600,'hashSeconds':1800,'cleanupSeconds':600,'requiredSerialSeconds':40200,'independentOuterSeconds':86400})
 launched=[];requested=[];stops=[];error=None;code=1
 try:
  service=external/'final-ui/services'/run_id;request=run/'bare-render-launch-intent.json';intent={**adapter['launchIntentTemplate'],'schema':'creatoros-candidate-lifecycle-intent/v1','taskId':task,'runId':run_id,'phase':'bare-render','maximumModelRoots':0,'outputDirectory':str(service),'receiptPath':str(service/'LAUNCH.json')};save(request,intent);requested.append(Path(intent['receiptPath']));save(run/'REQUESTED_LAUNCHES.json',[str(q)for q in requested])
  cmd=[adapter['pythonPath'],adapter['path'],'launch',str(request)];r=subprocess.run(cmd,capture_output=True,text=True,timeout=1200);save(run/'LAUNCH_RESULT.json',{'command':cmd,'exitCode':r.returncode,'stdoutBytes':len(r.stdout.encode()),'stdoutSHA256':hashlib.sha256(r.stdout.encode()).hexdigest(),'stderrBytes':len(r.stderr.encode()),'stderrSHA256':hashlib.sha256(r.stderr.encode()).hexdigest()});assert r.returncode==0,'SUPPORTED_LIFECYCLE_LAUNCH_FAILED'
  receipt_path=Path(intent['receiptPath']);receipt=json.loads(receipt_path.read_text());launch=ref(receipt_path);launched.append(launch);assert receipt['state']=='READY'and receipt['phase']=='bare-render';ready=proof(receipt['ready']);candidate=proof(receipt['candidateBinding']);copy=proof(receipt['sourceCopyProof']);assert ready['sourceHead']==boot['sourceHead'];assert ready['completedOwnedFixture']['sourceRoot']==origin['sourceRoot'];assert ready['ownedRoot']!=origin['sourceRoot'];assert copy['sourceRoot']==origin['sourceRoot']and copy['destinationRoot']==ready['ownedRoot'];assert copy['sourceUnchanged']is True;assert copy['sourceBefore']==copy['sourceAfterCopy']==copy['copied'];assert copy['copiedOnly']==['db','media','workspaces'];assert copy['copiedAuthenticationOrPrivateKey']is False and copy['modelTaskCreated']is False
  shared={k:ready[k]for k in ['sourceHead','baseURL','ownedRoot','sessionPath']};shared.update(state='T1343_CLOSED_AWAITING_RESTORE_READY',actorId=handoff['scope']['userId'],groupId=handoff['scope']['groupId'],ready=receipt['ready'],candidateBinding=receipt['candidateBinding'],sourceCopyProof=receipt['sourceCopyProof'],launchReceipt=launch);shared_path=run/'ACTUAL_SHARED.json';save(shared_path,shared)
  original_deadline=datetime.datetime.fromisoformat(origin['originalAbsoluteDeadlineAt'].replace('Z','+00:00'));now=datetime.datetime.now(datetime.timezone.utc);assert(original_deadline-now).total_seconds()>=120,'ORIGINAL_OBSERVER_DEADLINE_EXHAUSTED_NO_CONFIRM';deadline=min(original_deadline,now+datetime.timedelta(seconds=30600));b=json.loads(json.dumps(boot['tasks'][task]));b.update(schema='creatoros-media-final-task/v1',state='EXECUTION_AUTHORIZED',mode='EXECUTION',executionAuthorized=True,runtimeOutputAuthorized=True,taskId=task,caseId=task,maximumModelRoots=0,maximumRenderRoots=0,maximumUserModelRootsPerCase=0,controlHead=head,sourceHead=boot['sourceHead'],packageSha256=boot['packageSha256'],scope=handoff['scope'],mediaShared=ref(shared_path),runtime=boot['runtime'],inputLock=boot['inputLock'],externalRoot=str(external),outputDirectory=str(run/'journey'),temporaryRoot=str(run/'temporary'),runId=run_id,absoluteDeadlineAt=deadline.isoformat(),originalAbsoluteDeadlineAt=origin['originalAbsoluteDeadlineAt'],sourceProof=boot['sourceProof'],runnerSha256=boot['runnerSha256'],registrarSha256=boot['registrarSha256'],independentOuterSeconds=86400)
  b['dynamicRefs']=[b['mediaShared'],receipt['ready'],receipt['candidateBinding'],receipt['sourceCopyProof'],launch,b['contract'],boot['sourceProof'],*origin['refs'].values()];binding=run/'ACTUAL_BINDING.json';save(binding,b);env=os.environ.copy();env.update(C_MEDIA_FINAL_APPROVED='1',C_MEDIA_FINAL_BINDING=str(binding));r=subprocess.run([sys.executable,str(here/'run.py'),'--execute'],cwd=repo,env=env,timeout=36000);code=r.returncode
 except BaseException as e:error={'name':type(e).__name__,'message':str(e)}
 finally:
  for receipt_path in requested:
   if receipt_path.is_file()and not any(x['path']==str(receipt_path)for x in launched):launched.append(ref(receipt_path))
  for launch in reversed(launched):
   try:
    r=subprocess.run([adapter['pythonPath'],adapter['path'],'stop',launch['path']],capture_output=True,text=True,timeout=600);raw=proof(launch);stop_path=Path(raw['stopReceiptPath']);stop=json.loads(stop_path.read_text());assert r.returncode==0 and stop['state']=='STOPPED'and stop['sourceAfterUnchanged']is True;assert stop['remaining']and all(x['current']is None for x in stop['remaining']);stops.append({'launch':launch,'stop':ref(stop_path),'exitCode':r.returncode})
   except BaseException as e:stops.append({'launch':launch,'error':{'name':type(e).__name__,'message':str(e)}});error=error or{'name':'LifecycleCleanupFailed','message':str(e)}
  assert subprocess.check_output(['git','rev-parse','HEAD'],cwd=repo,text=True).strip()==head
  value={'taskId':task,'runId':run_id,'controlHead':head,'bundleHead':boot['sourceHead'],'outputDirectory':str(run/'journey'),'exitCode':code if error is None else 1,'error':error,'launched':launched,'stops':stops,'taskResult':str(run/'journey/TASK_RESULT.json'),'visibleCopy':str(run/'journey/VISIBLE_COPY.json'),'executionResult':str(run/'journey/EXECUTION_RESULT.json'),'maximumRenderRoots':0,'maximumModelRoots':0,'originalSourceStillAwaiting':True,'sameOriginalTaskId':origin['taskId'],'originalRGBFailurePreserved':True,'sourceKeyBytesReadByRunner':False};save(run/'COMMAND_RESULT.json',value);save(Path(boot['latestDirectory'])/(task+'.json'),{'latestReceipt':str(run/'COMMAND_RESULT.json'),'sha256':sha(run/'COMMAND_RESULT.json'),'exitCode':value['exitCode']});print(json.dumps(value,ensure_ascii=False))
 return value['exitCode']
if __name__=='__main__':
 if len(sys.argv)==3:sys.exit(subprocess.run([sys.executable,str(here/'outer.py'),*sys.argv[1:]]).returncode)
 sys.exit(main())

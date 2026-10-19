"""稳定0模型媒体命令：每次新UUID，1324仅1确定性render；无未知根自动重发。"""
from pathlib import Path
import os,sys,json,hashlib,subprocess,uuid,datetime
here=Path(__file__).resolve().parent
repo=next(p for p in here.parents if (p/'frontend/package.json').is_file())
def sha(p):
 h=hashlib.sha256()
 with Path(p).open('rb') as f:
  for data in iter(lambda:f.read(4194304),b''):h.update(data)
 return h.hexdigest()
def save(p,v):p.parent.mkdir(parents=True,exist_ok=True,mode=0o700);p.write_text(json.dumps(v,ensure_ascii=False,indent=2)+'\n');p.chmod(0o600)
def main():
 assert len(sys.argv)==4 and sys.argv[1]=='--inner';task=sys.argv[2];p=Path(sys.argv[3]).resolve();boot=json.loads(p.read_text());assert task=='T-1330';assert os.environ.get('C_MEDIA_FINAL_OUTER_ACTIVE')=='1'
 assert boot['schema']=='creatoros-media-final-bootstrap/v1' and boot['state']=='EXECUTION_AUTHORIZED' and boot['maximumModelRoots']==0
 head=subprocess.check_output(['git','rev-parse','HEAD'],cwd=repo,text=True).strip();assert head==boot['controlHead'];assert boot['runnerSha256']=={q.name:sha(q)for q in here.iterdir()if q.is_file()}
 shared=json.loads(Path(boot['mediaShared']['path']).read_text());assert sha(boot['mediaShared']['path'])==boot['mediaShared']['sha256'];assert shared['sourceHead']==boot['sourceHead'];assert shared['routing']['revision']==0
 run_id=os.environ['C_MEDIA_FINAL_RUN_ID'];external=Path(boot['externalRoot']).resolve();assert external.is_dir() and external.stat().st_mode&0o777==0o700
 run=external/'media-runs'/task/run_id;run.mkdir(parents=True,exist_ok=False,mode=0o700);b=json.loads(json.dumps(boot['tasks'][task]));group=shared['groups']['render'if task=='T-1324'else'image']
 b.update(schema='creatoros-media-final-task/v1',state='EXECUTION_AUTHORIZED',mode='EXECUTION',executionAuthorized=True,runtimeOutputAuthorized=True,taskId=task,caseId=task,maximumModelRoots=0,maximumUserModelRootsPerCase=0,controlHead=head,sourceHead=boot['sourceHead'],packageSha256=boot['packageSha256'],scope={'userId':shared['actorId'],'groupId':group['id'],'accountId':None},mediaShared=boot['mediaShared'],runtime=boot['runtime'],inputLock=boot['inputLock'],externalRoot=str(external),outputDirectory=str(run/'journey'),temporaryRoot=str(run/'temporary'),runId=run_id,absoluteDeadlineAt=(datetime.datetime.now(datetime.timezone.utc)+datetime.timedelta(seconds=30600)).isoformat(),runnerSha256=boot['runnerSha256'],registrarSha256=boot['registrarSha256'],independentOuterSeconds=86400)
 b['dynamicRefs']=[boot['mediaShared'],shared['ready'],shared['candidateBinding'],b['contract']];binding=run/'ACTUAL_BINDING.json';save(binding,b);env=os.environ.copy();env.update(C_MEDIA_FINAL_APPROVED='1',C_MEDIA_FINAL_BINDING=str(binding))
 r=subprocess.run([sys.executable,str(here/'run.py'),'--execute'],cwd=repo,env=env,timeout=36000)
 assert subprocess.check_output(['git','rev-parse','HEAD'],cwd=repo,text=True).strip()==head
 result={'taskId':task,'runId':run_id,'controlHead':head,'bundleHead':boot['sourceHead'],'exitCode':r.returncode,'outputDirectory':str(run/'journey'),'executionResult':str(run/'journey/EXECUTION_RESULT.json'),'taskResult':str(run/'journey/TASK_RESULT.json'),'visibleCopy':str(run/'journey/VISIBLE_COPY.json'),'modelsAllowed':0,'deterministicRenderRootsMaximum':1 if task=='T-1324'else 0,'unknownResubmission':False,'controllerOwnedBy':'C;本命令不关闭共享媒体服务'};save(run/'COMMAND_RESULT.json',result);save(Path(boot['latestDirectory'])/(task+'.json'),{'latestReceipt':str(run/'COMMAND_RESULT.json'),'sha256':sha(run/'COMMAND_RESULT.json'),'exitCode':r.returncode});print(json.dumps(result,ensure_ascii=False));return r.returncode
if __name__=='__main__':
 if len(sys.argv)==3:sys.exit(subprocess.run([sys.executable,str(here/'outer.py'),*sys.argv[1:]]).returncode)
 sys.exit(main())

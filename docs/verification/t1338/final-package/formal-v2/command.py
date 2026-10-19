"""稳定allowlist入口；每次独立真实旅程输出，可由taskctl重复执行。"""
from pathlib import Path
import os,sys,json,subprocess,hashlib,datetime,uuid
root=Path(__file__).resolve().parent
repo=next(p for p in root.parents if (p/'frontend/package.json').is_file())
assert len(sys.argv)==3,'TASK_AND_SUPPORTED_BOOTSTRAP_REQUIRED'
task=sys.argv[1]
assert task in ['T-1307','T-1340','T-1338','T-1339']
bootstrap_file=Path(sys.argv[2]).resolve()
bootstrap=json.loads(bootstrap_file.read_text())
assert bootstrap['schema']=='t1338-formal-ui-bootstrap/v1' and bootstrap['state']=='EXECUTION_AUTHORIZED'
head=subprocess.check_output(['git','rev-parse','HEAD'],cwd=repo,text=True).strip()
assert head==bootstrap['controlHead'],'CONTROL_HEAD_DRIFT'
def sha(file):return hashlib.sha256(Path(file).read_bytes()).hexdigest()
assert bootstrap['commandSha256']==sha(__file__),'COMMAND_SOURCE_DRIFT'
b=json.loads(json.dumps(bootstrap['tasks'][task]))
assert b['candidate']['sourceHead']=='13dd66ceb3b296461b54f544b78aab3a08058b6b'
assert b['runnerSha256']=={p.name:sha(p)for p in(root/'runner').iterdir()if p.is_file()},'REVIEWED_RUNNER_DRIFT'
run_id=datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%dT%H%M%SZ')+'-'+uuid.uuid4().hex
folder=root/'runtime'/'runs'/task
folder.mkdir(parents=True,exist_ok=True)
b.update(schema='t1338-final-ui/v1',state='EXECUTION_AUTHORIZED',mode='EXECUTION',executionAuthorized=True,runtimeOutputAuthorized=True,maximumModelRoots=0,maximumUserModelRootsPerCase=0,taskId=task,controlHead=head,runId=run_id,outputDirectory=str(folder/run_id),absoluteDeadlineAt=(datetime.datetime.now(datetime.timezone.utc)+datetime.timedelta(hours=8,minutes=30)).isoformat(),bootstrap={'path':str(bootstrap_file),'sha256':sha(bootstrap_file)})
binding=folder/(run_id+'-binding.json')
binding.write_text(json.dumps(b,ensure_ascii=False,indent=2)+'\n')
env=os.environ.copy()
env.update(T1338_FINAL_UI_APPROVED='1',T1338_FINAL_UI_BINDING=str(binding))
result=subprocess.run([sys.executable,str(root/'runner/outer.py')],cwd=repo,env=env)
output=Path(b['outputDirectory'])
receipt={'taskId':task,'controlHead':head,'bundleHead':b['candidate']['sourceHead'],'runId':run_id,'exitCode':result.returncode,'outputDirectory':str(output),'taskResult':str(output/'TASK_RESULT.json'),'visibleCopy':str(output/'VISIBLE_COPY.json'),'executionResult':str(output/'EXECUTION_RESULT.json'),'outerResult':str(folder/('outer-'+run_id+'-'+b['caseId'])/'RESULT.json'),'modelRootsSubmitted':0,'previousOutputOverwritten':False}
receipt_file=folder/(run_id+'-command-result.json')
receipt_file.write_text(json.dumps(receipt,ensure_ascii=False,indent=2)+'\n')
latest=root/'runtime'/'LATEST'
latest.mkdir(parents=True,exist_ok=True)
(latest/(task+'.json')).write_text(json.dumps({'latestReceipt':str(receipt_file),'sha256':sha(receipt_file),'exitCode':result.returncode},indent=2)+'\n')
print(json.dumps(receipt,ensure_ascii=False))
sys.exit(result.returncode)

"""固定可重复0模型UI入口；C唯一供实际已就绪闭合fixture服务；每次新UUID。"""
from pathlib import Path
import json,sys,os,subprocess,hashlib,datetime,uuid,re
here=Path(__file__).resolve().parent
repo=next(p for p in here.parents if(p/'frontend/package.json').is_file())
assert len(sys.argv)==3 and sys.argv[1]=='T-1342'
p=Path(sys.argv[2]).resolve();b=json.loads(p.read_text());plan=json.loads((here/'PLAN.json').read_text())
assert b['schema']=='t1342-final-ui/v1' and b['state']=='EXECUTION_AUTHORIZED'
assert b['maximumModelRoots']==b['maximumBusinessWrites']==0
assert b['externalRoot']==plan['externalRoot']=='/Volumes/T7-MacData/CodexBuilds/t1342-script-minimum-20261018/ui-runs'
head=subprocess.check_output(['git','rev-parse','HEAD'],cwd=repo,text=True).strip();assert head==b['controlHead']
def sha(p):return hashlib.sha256(Path(p).read_bytes()).hexdigest()
def proof(ref):
 assert Path(ref['path']).is_absolute() and sha(ref['path'])==ref['sha256']
 return json.loads(Path(ref['path']).read_text())
candidate=proof(b['candidateBinding']);ready=proof(b['ready']);proof(b['fixtureCopy']);lock=proof(b['inputLock'])
assert lock['state']=='FINAL_UI_INPUTS' and lock['confirmed'] is True
for key in ['sourceHead','packageSha256']:
 assert candidate[key]==b['candidate'][key]==lock[key]
for key in ['sourceHead','baseURL','ownedRoot','sessionPath']:assert ready[key]==b['candidate'][key]
assert ready.get('completedOwnedFixture',{}).get('sourceRoot') and ready['completedOwnedFixture']['sourceRoot']!=ready['ownedRoot']
names=['PLAN.json','binding.cjs','observe.cjs','command.py','run.py','outer.py']
assert b['runnerSha256']=={name:sha(here/name)for name in names}
assert sha(b['contract']['path'])==b['contract']['sha256']==plan['contractSha256']
contract=json.loads(re.search(r'```frontend-journey-contract\s*\n([\s\S]*?)\n```',Path(b['contract']['path']).read_text())[1]);assert contract['task_id']=='T-1342'
assert [x['id']for x in contract['required_checks']]==plan['checkIds'];assert contract['required_conditions']==plan['conditions'];assert contract['viewports']==plan['viewports']
assert not subprocess.check_output(['git','status','--porcelain','--',*contract['watched_paths']],cwd=repo,text=True),'WATCHED_PATHS_MUST_BE_COMMITTED_CLEAN'
base=Path(b['externalRoot']);assert base.is_absolute() and base.resolve()==base and base.stat().st_mode&0o777==0o700
run_id=datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%dT%H%M%SZ')+'-'+uuid.uuid4().hex
out=base/run_id;out.mkdir(parents=True,exist_ok=False,mode=0o700)
with(out/'COMMAND_BINDING.json').open('x')as h:json.dump({'taskId':'T-1342','runId':run_id,'actualBinding':{'path':str(p),'sha256':sha(p)},'controlHead':head,'newOutput':str(out),'modelRootsAllowed':0,'businessWritesAllowed':0},h,ensure_ascii=False,indent=2)
code=subprocess.call([sys.executable,str(here/'outer.py'),str(p),str(out),run_id],cwd=repo)
print(json.dumps({'task_id':'T-1342','outputDirectory':str(out),'exitCode':code,'taskResult':str(out/'TASK_RESULT.json'),'visibleCopy':str(out/'VISIBLE_COPY.json')},ensure_ascii=False));sys.exit(code)

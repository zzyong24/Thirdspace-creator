"""仅调用安装版公开 CLI，CAS 临时切 text official，保存原状态并恢复。"""
import json,subprocess,time,shutil
from pathlib import Path
OUT=Path(__file__).resolve().parent/'official-probe';OUT.mkdir(exist_ok=True)
CLI=shutil.which('creatoros');GROUP='grp_legacy_acct-ae1a8346-9';KEY='t1411-installed-auth-parity-probe-20261025-1'
sequence=max([int(p.name.split('-')[0]) for p in OUT.glob('[0-9]*.json')],default=0)
def run(args,label):
 global sequence
 sequence+=1;start=time.monotonic()
 p=subprocess.run([CLI,*args],capture_output=True,text=True,timeout=600)
 value=json.loads(p.stdout)
 (OUT/f'{sequence:03d}-{label}.json').write_text(json.dumps({'args':args,'exitCode':p.returncode,'elapsedSeconds':time.monotonic()-start,'response':value},ensure_ascii=False,indent=2)+'\n')
 return value

def call(op,payload,label,key=None,impact=None,scoped=True):
 desc=run(['operations','describe',op],label+'-describe');assert desc.get('ok'),desc
 args=['call',op,'--input',json.dumps(payload,ensure_ascii=False)]
 if scoped:args+=['--group',GROUP]
 if key:args+=['--apply','--idempotency-key',key]
 if impact:args+=['--confirm-impact',impact]
 return run(args,label)
assert run(['status'],'status').get('connected')
assert run(['access','status'],'access').get('ok')
assert run(['operations','list'],'operations').get('ok')
group=call('accountGroups.get',{'params':{'groupId':GROUP}},'group');assert group.get('ok') and group['data']['name']=='月明水清深'
stateFile=OUT/'routing-state.json'
initial=call('settings.modelRouting.get',{},'initial-route',scoped=False);assert initial.get('ok')
if stateFile.exists():
 state=json.loads(stateFile.read_text());assert initial['data']['choices']==state['choices'] and initial['data']['revision']==state['revision'],'路由已有并发变化，停止'
else:
 state={'original':initial['data']['choices'],'choices':initial['data']['choices'],'revision':initial['data']['revision']};stateFile.write_text(json.dumps(state,ensure_ascii=False,indent=2)+'\n')
def setChoices(choices,label):
 live=call('settings.modelRouting.get',{},label+'-precheck',scoped=False);assert live.get('ok') and live['data']['choices']==state['choices'] and live['data']['revision']==state['revision'],'路由并发变化，拒绝覆盖'
 if choices==state['choices']:return
 result=call('settings.modelRouting.put',{'body':{'schemaVersion':1,'choices':choices,'expectedRevision':state['revision']}},label+'-write',key=KEY+'-route-'+str(state['revision']),scoped=False);assert result.get('ok'),result
 read=call('settings.modelRouting.get',{},label+'-readback',scoped=False);assert read.get('ok') and read['data']['choices']==choices
 state.update(choices=choices,revision=read['data']['revision']);stateFile.write_text(json.dumps(state,ensure_ascii=False,indent=2)+'\n')
try:
 setChoices({**state['choices'],'text':'official'},'official')
 result=call('settings.models.test',{'params':{'capability':'default'}},'probe',key=KEY,impact=GROUP)
 (OUT/'probe-result.json').write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n')
 print(json.dumps({'phase':'probe','ok':result.get('ok'),'data':result.get('data'),'error':result.get('error')},ensure_ascii=False),flush=True)
finally:
 setChoices(state['original'],'restore')
 print(json.dumps({'phase':'restored','text':state['choices']['text'],'revision':state['revision']},ensure_ascii=False),flush=True)
for op,query,label in [('workbench.tasks.inspect',{'afterSequence':0,'limit':10},'inspect'),('workbench.tasks.events',{'afterSequence':0,'limit':128},'events')]:
 result=call(op,{'params':{'taskId':'execution-task-5e73167d-402'},'query':query},label)
 assert result.get('ok'),result
 print(json.dumps({'phase':label,'ok':True,'taskId':'execution-task-5e73167d-402'},ensure_ascii=False),flush=True)

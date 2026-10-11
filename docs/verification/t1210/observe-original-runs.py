import subprocess,json,time,datetime
from pathlib import Path
n=Path(__file__).resolve().parent;cli='/Users/zyongzhu/.local/bin/creatoros';groups=[('thirdspace','grp_legacy_acct-b944fd09-473','acct-b944fd09-473','job-b944fd09-474','exec_90e4dc58-d3ee-4b9f-8a8d-5a91afdaf729','run-5efd8bb4-530f-42d1-8830-6f3bb379f195'),('moonlit','grp_legacy_acct-ae1a8346-9','acct-ae1a8346-9','job-ae1a8346-11','exec_14478623-987f-42d8-b2c6-e072e6a4e8a8','run-4f1bbadf-5506-4090-ae34-12a727fb60ac')];history=[];begin=time.monotonic()
def call(op,g,a,body,path):
 r=subprocess.run([cli,'call',op,'--group',g,'--account',a,'--input',json.dumps(body)],capture_output=True,text=True,timeout=600);path.write_text(r.stdout+r.stderr);path.chmod(0o600);d=json.loads(r.stdout);assert r.returncode==0 and d.get('ok') is True;return d['data']
for i in range(14):
 rows=[]
 for label,g,a,job,execution,run in groups:
  ex=call('execution.tasks.get',g,a,{'params':{'taskId':execution}},n/f'installed-original-{label}-execution-{i}.json')
  runs=call('jobRuns.listByJob',g,a,{'params':{'jobId':job},'query':{'pageSize':10}},n/f'installed-original-{label}-runs-{i}.json');original=next(x for x in runs if x['id']==run)
  rows.append({'group':label,'executionId':execution,'runId':run,'executionStatus':ex['status'],'attempt':ex['attempt'],'heartbeatAt':ex['heartbeatAt'],'errorCode':ex['errorCode'],'errorMessage':ex['errorMessage'],'runStatus':original['status'],'runError':original.get('error'),'progress':original.get('progress'),'itemsNew':original['itemsNew'],'itemsUpdated':original['itemsUpdated'],'finishedAt':original.get('finishedAt')})
 record={'observedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'elapsedSeconds':round(time.monotonic()-begin,2),'rows':rows};history.append(record);(n/'installed-original-observations.json').write_text(json.dumps(history,ensure_ascii=False,indent=2)+'\n');print(json.dumps(record,ensure_ascii=False),flush=True)
 if all(x['executionStatus'] in ['succeeded','failed','blocked','unknown_result','waiting_user','cancelled','paused'] for x in rows):break
 time.sleep(45)

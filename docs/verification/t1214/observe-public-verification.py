import subprocess,json,time,datetime
from pathlib import Path
n=Path(__file__).resolve().parent;cli='/Users/zyongzhu/.local/bin/creatoros';intent=json.loads((n/'public-submit-intent.json').read_text());rd=json.loads((n/'public-submit-readback.json').read_text());assert len(rd['newRuns'])==1;run=rd['newRuns'][0];first=json.loads((n/'public-ai-first.json').read_text());execution=first['ai']['executionTaskId'];assert execution
history=[];begin=time.monotonic()
def call(op,body):
 r=subprocess.run([cli,'call',op,'--group',intent['groupId'],'--account',intent['accountId'],'--input',json.dumps(body)],capture_output=True,text=True,timeout=600);d=json.loads(r.stdout);assert r.returncode==0 and d.get('ok') is True,{'op':op,'code':(d.get('error') or {}).get('code')};return d['data']
while time.monotonic()-begin<1200:
 rows=call('jobRuns.listByJob',{'params':{'jobId':intent['jobId']},'query':{'page':1,'pageSize':100}});selected=[x for x in rows if x['id']==run['id']];assert len(selected)==1;r=selected[0];assert r['jobId']==intent['jobId'] and r['aiTaskId']==run['aiTaskId']
 a=call('ai.tasks.get',{'params':{'taskId':run['aiTaskId']}});assert a['id']==run['aiTaskId'] and a['groupId']==intent['groupId'] and a['executionTaskId']==execution
 e=call('execution.tasks.get',{'params':{'taskId':execution}});assert e['id']==execution
 progress=r.get('progress');error=r.get('error') or ''
 record={'observedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'elapsedSeconds':round(time.monotonic()-begin,2),'groupId':intent['groupId'],'accountId':intent['accountId'],'jobId':intent['jobId'],'runId':run['id'],'aiTaskId':run['aiTaskId'],'executionId':execution,'runStatus':r['status'],'aiStatus':a['status'],'executionStatus':e['status'],'attempt':e.get('attempt'),'heartbeatAt':e.get('heartbeatAt'),'errorCode':e.get('errorCode'),'itemsNew':r['itemsNew'],'itemsUpdated':r['itemsUpdated'],'finishedAt':r.get('finishedAt'),'progress':({k:progress.get(k) for k in ['stage','processed','total','updatedAt']} if progress else None),'hasRunError':bool(error),'modalPointerIntercept':('intercepts pointer events' in error and 'modal' in error),'postsClickTimeout':('locator.click: Timeout' in error and '投稿作品' in error)}
 history.append(record);(n/'public-run-observations.json').write_text(json.dumps(history,ensure_ascii=False,indent=2)+'\n');print(json.dumps(record,ensure_ascii=False),flush=True)
 if r['status']!='running' and e['status'] in ['succeeded','failed','blocked','unknown_result','waiting_user','cancelled','paused']:break
 time.sleep(20)
else:print('有限观察结束，保留原任务ID和真实状态；不取消或重发。',flush=True)

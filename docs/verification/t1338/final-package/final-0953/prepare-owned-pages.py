"""仅新已审owned副本：显式自然中文标签与真实空项目前置；0模型。"""
from pathlib import Path
import os,sys,json,subprocess,hashlib,datetime,uuid,urllib.request,urllib.error,signal,time
root=Path(__file__).resolve().parent
parent=root.parent
assert sys.argv[1] in ['T1338','T1339']
task=sys.argv[1]
ready_path=Path(sys.argv[2]).resolve()
output=Path(sys.argv[3]).resolve()
assert output.is_relative_to(root/'runtime')
if '--inner' not in sys.argv:
    output.mkdir(parents=True,exist_ok=False,mode=0o700)
    started=time.monotonic()
    process=subprocess.Popen([sys.executable,__file__,task,str(ready_path),str(output),'--inner'],start_new_session=True,stdout=subprocess.PIPE,stderr=subprocess.STDOUT)
    identity=subprocess.check_output(['ps','-p',str(process.pid),'-o','pgid=,lstart=,comm='],text=True).strip()
    assert identity.split()[0]==str(process.pid)
    expired=False
    interrupted=False
    def terminate(signum,frame):raise KeyboardInterrupt('PREPARATION_SUPERVISOR_STOP')
    signal.signal(signal.SIGTERM,terminate)
    signal.signal(signal.SIGINT,terminate)
    try:
        raw=process.communicate(timeout=4800)[0]
    except (subprocess.TimeoutExpired,KeyboardInterrupt) as failure:
        interrupted=isinstance(failure,KeyboardInterrupt)
        expired=isinstance(failure,subprocess.TimeoutExpired)
        current=subprocess.run(['ps','-p',str(process.pid),'-o','pgid=,lstart=,comm='],capture_output=True,text=True).stdout.strip()
        if current==identity:os.killpg(process.pid,signal.SIGTERM)
        try:raw=process.communicate(timeout=300)[0]
        except subprocess.TimeoutExpired:
            current=subprocess.run(['ps','-p',str(process.pid),'-o','pgid=,lstart=,comm='],capture_output=True,text=True).stdout.strip()
            if current==identity:os.killpg(process.pid,signal.SIGKILL)
            raw=process.communicate(timeout=120)[0]
    current=subprocess.run(['ps','-p',str(process.pid),'-o','pgid=,lstart=,comm='],capture_output=True,text=True).stdout.strip()
    record={'exitCode':process.returncode,'expired':expired,'interrupted':interrupted,'initialIdentity':identity,'actualIdentityAfter':current or None,'elapsedSeconds':time.monotonic()-started,'executionSeconds':4800,'outerSeconds':5400,'stdoutBytes':len(raw),'stdoutSHA':hashlib.sha256(raw).hexdigest(),'maximumDispatchRequests':24,'requestSeconds':180,'modelRoots':0}
    (output/'OUTER_RESULT.json').write_text(json.dumps(record,ensure_ascii=False,indent=2)+'\n')
    print(json.dumps({'task':task,'exitCode':process.returncode,'expired':expired,'outputDirectory':str(output)}))
    sys.exit(process.returncode if not expired and not interrupted and not current else 1)
ready=json.loads(ready_path.read_text())
assert ready['sourceHead']=='0953f10e077f82debfbfc2fa6a336182eaa2b1a5'and ready['startupVerified']is True
handoff=json.loads((parent/'CLOSED_WITNESS_HANDOFF.json').read_text())
closed=next(row for row in handoff['closedCopies']if row['task']==task.lower())
assert ready['completedOwnedFixture']['sourceRoot']==closed['actualCompletedOwnedRoot']
session_file=Path(ready['sessionPath'])
assert session_file.stat().st_mode&0o777==0o600
session=json.loads(session_file.read_text())
assert session['baseURL']==ready['baseURL']and session['ownedRoot']==ready['ownedRoot']
assert ready['baseURL'].startswith('http://127.0.0.1:')
audit=[]
def save(name,value):
    raw=json.dumps(value,ensure_ascii=False,indent=2)+'\n'
    assert session['handshake']not in raw
    (output/(name+'.json')).write_text(raw)
def call(operation,input,scope):
    assert len(audit)<24
    row={'id':operation,'input':input,'scope':scope};audit.append(row);save('API_AUDIT',audit)
    headers={'content-type':'application/json','x-creatoros-handshake':session['handshake']}
    if scope.get('groupId'):headers['x-group-id']=scope['groupId']
    if scope.get('accountId'):headers['x-account-id']=scope['accountId']
    request=urllib.request.Request(ready['baseURL']+'/api/v1/dispatch',data=json.dumps({'id':operation,'input':input}).encode(),headers=headers,method='POST')
    try:
        with urllib.request.urlopen(request,timeout=180)as response:body=json.load(response);row['httpStatus']=response.status
        row['data']=body['data'];save('API_AUDIT',audit);return body['data']
    except urllib.error.HTTPError as error:
        row['httpStatus']=error.code;row['error']=json.loads(error.read());save('API_AUDIT',audit);raise
try:
    if task=='T1338':
        witness=handoff['legacy'];scope=witness['scope'];account_scope={'userId':scope['userId'],'accountId':witness['accountId']};project_id=witness['projectId'];group_id=scope['groupId']
        desired_project='原有作品与审核记录';desired_group='原有创作账号组'
    else:
        fixture=json.loads(Path('/Volumes/T7-MacData/CodexBuilds/t1339-missing-actual-20261017-42fe69d6/green-v1/FIXTURE.json').read_text())
        family=next(x for x in fixture['families']if x['name']=='partial');scope=family['ctx'];account_scope=None;project_id=family['project']['id'];group_id=scope['groupId']
        desired_project='人工内容对照：尚无发布记录';desired_group='尚无发布的人工对照'
    def model_state():return {'ai':call('ai.tasks.list',{'query':{'page':1,'pageSize':100}},scope),'execution':call('execution.tasks.list',{'query':{'page':1,'pageSize':100}},scope)}
    before_models=model_state()
    group=call('accountGroups.get',{'params':{'groupId':group_id}},scope)
    project=call('projects.get',{'params':{'projectId':project_id}},scope)
    before={'group':group,'project':project,'models':before_models}
    if task=='T1338':before['report']=call('workReviews.get',{'params':{'reportId':witness['reportId']}},scope)
    else:before['overview']=call('calibration.overview',{},scope)
    save('BEFORE_PREPARATION',before)
    if group['name']!=desired_group:group=call('accountGroups.update',{'params':{'groupId':group_id},'body':{'name':desired_group,'expectedVersion':group['version']}},scope)
    if project['title']!=desired_project:project=call('projects.patch',{'params':{'projectId':project_id},'body':{'title':desired_project}},scope)
    empty_project=None
    if task=='T1338':empty_project=call('projects.create',{'body':{'title':'等待第一份作品的项目','brief':'人工验收空组合入口；仅演示真实下一步，不发模型、不提交组合。'}},account_scope)
    after_models=model_state();assert after_models==before_models
    if task=='T1338':assert call('workReviews.get',{'params':{'reportId':witness['reportId']}},scope)==before['report']
    else:assert call('calibration.overview',{},scope)==before['overview']
    save('PREPARED_INPUTS',{'state':'PREPARED_FOR_FORWARD_FORMAL_UI','task':task,'candidateReady':str(ready_path),'candidateOwnedRoot':ready['ownedRoot'],'group':group,'project':project,'emptyWorkProject':empty_project,'modelsBefore':before_models,'modelsAfter':after_models,'originalSourceAfterUiVerification':'PENDING_CONTROLLER_CLOSE','reportOrOverviewObservedUnchanged':True,'contentVersionWriteOperationsSent':0,'newModels':0,'userVisibleNamesOnlyAndExplicitEmptyProject':True,'UIJourneyNotExecuted':True})
except BaseException as error:
    save('PRIMARY_FAILURE',{'name':type(error).__name__,'message':str(error),'noAutomaticRetry':True})
    raise

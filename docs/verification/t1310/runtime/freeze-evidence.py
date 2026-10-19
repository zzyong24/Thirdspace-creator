import pathlib,json,hashlib,subprocess,re
root=pathlib.Path.cwd();runtime=root/'docs/verification/t1310/runtime'
def read(p):return json.loads(pathlib.Path(p).read_text())
def save(n,x): (runtime/n).write_text(json.dumps(x,ensure_ascii=False,indent=2)+'\n')
def sha(b):return hashlib.sha256(b).hexdigest()
lock=read(root/'docs/verification/t1310/INPUT_LOCK.json');checks=[]
for x in lock['files']:
 b=(root/x['path']).read_bytes();checks.append({**x,'actualBytes':len(b),'actualSha256':sha(b),'match':len(b)==x['bytes'] and sha(b)==x['sha256']})
binding=read(root/'docs/verification/t1310/WORKER_BINDING.json');b=pathlib.Path(binding['executionWorkerPath']).read_bytes()
save('FINAL_INPUT_VERIFICATION.json',{'head':subprocess.check_output(['git','rev-parse','HEAD'],text=True).strip(),'trackedDiff':subprocess.check_output(['git','diff','--stat'],text=True),'all33Match':all(x['match'] for x in checks),'files':checks,'worker':{'path':binding['executionWorkerPath'],'bytes':len(b),'sha256':sha(b),'match':sha(b)==binding['sha256']},'controlHashes':{str(p.relative_to(root)):sha(p.read_bytes()) for p in [root/'docs/features/t1310-topic-chat-completion-conflict-diagnosis.md',root/'docs/verification/t1310/INPUT_LOCK.json',root/'docs/verification/t1310/MODULE_SCOPE.json',root/'docs/verification/t1310/control/TASK_PACKET.md',root/'docs/verification/t1310/control/DIAGNOSIS_HANDOFF.json']}})
selected=[runtime/'cases/attempt03/codex-group-normal']+list((runtime/'cases/attempt05').iterdir())+[p for p in (runtime/'cases/attempt06').iterdir() if p.name.startswith('codex-')]+list((runtime/'cases/attempt08').iterdir())
rows=[];recover=[]
for d in sorted(selected):
 r=read(d/'result.json');ss=read(d/'snapshots.json');final=next(s for s in ss if s['label']=='final');tools=[]
 for c in final['calls']:
  if c['kind']=='tool' and c['resultText']:
   v=json.loads(c['resultText'])['output'];tools.append({'callId':c['id'],'status':v['status'],'sideEffect':v['sideEffect'],'items':len(v.get('data',{}).get('items',[]))})
 rows.append({**r,'evidence':str(d.relative_to(root)),'lastErrorCode':final['task']['lastErrorCode'],'lastErrorMessage':final['task']['lastErrorMessage'],'callStates':[{'id':c['id'],'kind':c['kind'],'status':c['status'],'totalTokens':c['totalTokens'],'parentCallId':c['parentCallId']} for c in final['calls']],'toolOutcomes':tools,'cleanup':read(d/'cleanup.json')})
 if r['kind'].startswith('recovery-'):
  before=ss[0];after=next(x for x in ss if x['label']=='after-native-read-recovery');rpc=[json.loads(l) for l in (d/'native-rpc.ndjson').read_text().splitlines()];ports=read(d/'ports.json');state=read(d/'rpc-state.json');roots=[i for i,v in state['threads'].items() if v['root']];children=[i for i,v in state['threads'].items() if not v['root']];bc=next(c for c in before['calls'] if c['kind']=='model');rootcall=next(c for c in before['calls'] if c['kind']=='external_agent')
  bind=[]
  for data in [{'callId':rootcall['id'],'threadId':roots[0],'turnId':state['threads'][roots[0]]['turn']['id']},{'callId':bc['id'],'threadId':children[0]},{'callId':bc['id'],'turnId':state['threads'][children[0]]['turn']['id']}]:
   digest=sha(json.dumps(data,separators=(',',':')).encode());bind.append({'data':data,'sha256':digest,'actualBindPortHashMatches':any(x['port']=='bindCodexCall' and x['phase']=='invoke' and x['inputHash']==digest for x in ports)})
  recover.append({'case':r['id'],'evidence':str(d.relative_to(root)),'beforeChild':{'id':bc['id'],'status':bc['status'],'providerResult':bc['providerResult'],'totalTokens':bc['totalTokens'],'usage':bc['usage']},'afterChild':next(c for c in after['calls'] if c['id']==bc['id']),'callIdsUnchanged':[c['id'] for c in before['calls']]==[c['id'] for c in after['calls']],'operationKeysUnchanged':[c['operationKey'] for c in before['calls']]==[c['operationKey'] for c in after['calls']],'fenceChanged':before['task']['fenceToken']!=after['task']['fenceToken'],'attemptBefore':before['task']['attempt'],'attemptAfter':after['task']['attempt'],'nativeReads':[x for x in rpc if x['method']=='fixture-read-original-turn'],'totalTurnStarts':sum(x['method']=='turn/start' for x in rpc),'bindingProofByCapturedHash':bind,'finalStatus':after['task']['status']})
save('CASE_MATRIX.json',{'selectedCaseCount':len(rows),'caseRows':rows,'additionalObservation':'cases/attempt07/codex-group-missing-usage/one-normal-observation.json','assertionsAreDiagnosticNotFeaturePass':True})
save('RECOVERY_PROOF.json',recover)
runs=[]
for d in sorted((runtime/'runs').iterdir()):
 if not d.is_dir():continue
 log=(d/'output.log').read_text();runs.append({'name':d.name,**read(d/'execution-result.json'),'testSummary':next((l.strip() for l in reversed(log.splitlines()) if re.match(r'\s*Tests\s',l)),None),'hasInputSnapshot':(d/'inputs').exists()})
save('RUN_SUMMARY.json',runs)
print(json.dumps({'selected':len(rows),'all33Match':all(x['match'] for x in checks),'bindingProofAllMatch':all(y['actualBindPortHashMatches'] for x in recover for y in x['bindingProofByCapturedHash']),'runs':runs},ensure_ascii=False,indent=2))

import pathlib,subprocess,time,json,os,signal
repo=pathlib.Path(__file__).resolve().parents[6];out=pathlib.Path(__file__).resolve().parent
results=[]
for label,cmd in [('pmem-sync',['node','orchestrator/process/pmem.mjs','sync']),('reconcile',['node','orchestrator/process/reconcile.mjs'])]:
 start=time.monotonic();budget=28800
 (out/(label+'-start.json')).write_text(json.dumps({'command':cmd,'outerBudgetSeconds':budget,'startedAt':time.time(),'policy':'原标准本地命令；无真实供应商模型执行/无批量complete'},ensure_ascii=False,indent=2)+'\n')
 with (out/(label+'.log')).open('w') as log:
  p=subprocess.Popen(cmd,cwd=repo,stdout=log,stderr=subprocess.STDOUT,start_new_session=True)
  try:code=p.wait(timeout=budget);expired=False
  except subprocess.TimeoutExpired:os.killpg(p.pid,signal.SIGTERM);code=p.wait(timeout=120);expired=True
 result={'label':label,'command':cmd,'exitCode':code,'expired':expired,'durationSeconds':time.monotonic()-start};results.append(result)
 (out/(label+'-result.json')).write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n');print(json.dumps(result),flush=True)
(out/'RESULT.json').write_text(json.dumps(results,ensure_ascii=False,indent=2)+'\n')

from pathlib import Path
import subprocess,json,os,hashlib
out=Path('docs/verification/t208')
original170=['src/modules/ai-runtime/asset-business-execution.service.test.ts','src/modules/ai-runtime/chat-assembly.test.ts','src/modules/ai-runtime/signal-quality.test.ts','src/modules/ai-runtime/transcribe-runner.test.ts','src/modules/execution/asset-worker-runtime.integration.test.ts']
related=['src/modules/execution/transcribe-postprocess.integration.test.ts','src/modules/execution/execution-transcribe-postprocess.service.test.ts','src/modules/execution/execution-transcribe-preparation.service.test.ts','src/modules/execution/execution-transcribe-audio.service.test.ts','src/modules/execution/execution-call-ledger.service.test.ts','src/modules/execution/execution-worker-outcome.service.test.ts','src/modules/execution/model-worker-dispatcher.test.ts','src/modules/execution/worker-supervisor.test.ts','src/modules/execution/transcribe-stage-error.test.ts','src/modules/execution/radar-model-result-unknown.repro.test.ts']
freeze=json.loads((out/'final-source-freeze.json').read_text())['frozen_source_sha256']
def check_source():
 assert all(hashlib.sha256(Path(f).read_bytes()).hexdigest()==h for f,h in freeze.items()),'运行中源码漂移，停止'
def run(name,args,test=False):
 name='final-'+name
 check_source()
 if test:args=['pnpm','--dir','backend','exec','vitest','run']+args+['--maxWorkers=1','--retry=0','--reporter=json','--outputFile='+str((out/(name+'.json')).resolve())]
 meta={'argv':args,'node':subprocess.check_output(['node','--version'],text=True).strip(),'source_sha256':freeze,'timeout_override':False,'maxWorkers':1 if test else None,'retry':0 if test else None}
 (out/(name+'-invocation.json')).write_text(json.dumps(meta,ensure_ascii=False,indent=2)+'\n');os.chmod(out/(name+'-invocation.json'),0o600)
 with (out/(name+'.log')).open('w') as log:
  os.chmod(out/(name+'.log'),0o600);r=subprocess.run(args,stdout=log,stderr=subprocess.STDOUT)
 check_source();result={'exit_code':r.returncode,'log_sha256':hashlib.sha256((out/(name+'.log')).read_bytes()).hexdigest()}
 if test and (out/(name+'.json')).exists():
  j=json.loads((out/(name+'.json')).read_text());cases=[a for tr in j['testResults']for a in tr['assertionResults']];old=[a for a in cases if not a['title'].startswith('T208 ')];added=[a for a in cases if a['title'].startswith('T208 ')];result.update({'total':len(cases),'original':{s:sum(a['status']==s for a in old)for s in ['passed','failed','pending','skipped']},'additional':{s:sum(a['status']==s for a in added)for s in ['passed','failed','pending','skipped']},'failed_titles':[a['title']for a in cases if a['status']=='failed']});os.chmod(out/(name+'.json'),0o600)
 (out/(name+'-exit.json')).write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n');os.chmod(out/(name+'-exit.json'),0o600);print(name,json.dumps(result,ensure_ascii=False),flush=True)
run('original30',['src/modules/ai-runtime/transcribe-runner.test.ts'],True)
run('original170',original170,True)
run('related',related,True)
run('backend-typecheck',['pnpm','--dir','backend','run','typecheck'])
run('boundary',['node','orchestrator/process/boundary-scan.mjs'])
stats=Path('orchestrator/.lessons-stats.json');existed=stats.exists();before=stats.read_bytes() if existed else None
try:
 run('reconcile',['node','orchestrator/process/reconcile.mjs'])
 after=stats.read_bytes() if stats.exists() else None
 (out/'final-reconcile-telemetry-generated.json').write_text(json.dumps({'before_existed':existed,'before_sha256':hashlib.sha256(before).hexdigest()if before else None,'after_sha256':hashlib.sha256(after).hexdigest()if after else None,'recovery_authorization':'Root 本轮精确telemetry缓存保护，finding/status/receipt不修改'},ensure_ascii=False,indent=2)+'\n');os.chmod(out/'final-reconcile-telemetry-generated.json',0o600)
finally:
 if existed:stats.write_bytes(before)
 elif stats.exists():stats.unlink()
 assert (stats.read_bytes()==before)if existed else not stats.exists()
print('原reconcile及telemetry保护已结束',flush=True)

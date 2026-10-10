from pathlib import Path
import json,hashlib,subprocess,os
out=Path('docs/verification/t210');freeze=json.loads((out/'source-freeze-first.json').read_text())['frozen_source_sha256']
def check():
 assert all(hashlib.sha256(Path(f).read_bytes()).hexdigest()==h for f,h in freeze.items()),'源码冻结漂移，停止'
def run(name,args,test=False):
 check()
 if test:args=['pnpm','--filter','@creatoros/backend','exec','vitest','run']+args+['--maxWorkers=1','--retry=0','--reporter=json','--outputFile='+str((out/(name+'.json')).resolve())]
 p=out/(name+'-invocation.json');p.write_text(json.dumps({'canonical_task':'T-1074','source_task':'Growth/T-210','argv':args,'node':subprocess.check_output(['node','--version'],text=True).strip(),'pnpm':subprocess.check_output(['pnpm','--version'],text=True).strip(),'timeout_override':False,'maxWorkers':1 if test else None,'retry':0 if test else None,'source_sha256':freeze},ensure_ascii=False,indent=2)+'\n');os.chmod(p,0o600)
 with (out/(name+'.log')).open('w')as log:
  os.chmod(out/(name+'.log'),0o600);r=subprocess.run(args,stdout=log,stderr=subprocess.STDOUT)
 check();result={'exit_code':r.returncode,'log_sha256':hashlib.sha256((out/(name+'.log')).read_bytes()).hexdigest()}
 if test:
  p=out/(name+'.json');os.chmod(p,0o600);j=json.loads(p.read_text());cases=[a for tr in j['testResults']for a in tr['assertionResults']];groups={'original':[a for a in cases if not a['title'].startswith(('T208 ','T210 '))],'T208_additional':[a for a in cases if a['title'].startswith('T208 ')],'T1074_GrowthT210_additional':[a for a in cases if a['title'].startswith('T210 ')]};result.update({'total':len(cases),'groups':{g:{s:sum(a['status']==s for a in group)for s in ['passed','failed','pending','skipped']}for g,group in groups.items()},'failed_titles':[a['title']for a in cases if a['status']=='failed']})
 p=out/(name+'-exit.json');p.write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n');os.chmod(p,0o600);print(name,json.dumps(result,ensure_ascii=False),flush=True)
run('runner36',['src/modules/ai-runtime/transcribe-runner.test.ts'],True)
run('original170',['src/modules/ai-runtime/asset-business-execution.service.test.ts','src/modules/ai-runtime/chat-assembly.test.ts','src/modules/ai-runtime/signal-quality.test.ts','src/modules/ai-runtime/transcribe-runner.test.ts','src/modules/execution/asset-worker-runtime.integration.test.ts'],True)
run('backend-typecheck',['pnpm','--filter','@creatoros/backend','typecheck'])

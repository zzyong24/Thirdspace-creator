from pathlib import Path
import hashlib,json,os,subprocess,sys,time
here=Path(__file__).resolve().parent;repo=next(p for p in here.parents if (p/'ai-worker/package.json').is_file());base=Path('/Volumes/T7-MacData/CodexBuilds/t1337-skill-catalog-isolation-20261017-df9381d3');out=base/'unit';out.mkdir(mode=0o700,exist_ok=True)
red=json.loads((base/'red-v1/WORKER_BINDING.json').read_bytes());node=red['nodePath'];label=sys.argv[1];env=os.environ.copy();(out/'tmp').mkdir(mode=0o700,exist_ok=True);env.update(TMPDIR=str(out/'tmp'),TMP=str(out/'tmp'),TEMP=str(out/'tmp'))
vitest=[node,str(repo/'ai-worker/node_modules/vitest/vitest.mjs')]
commands={'collection':(vitest+['list','--config',str(here/'vitest.config.mts'),'--json'],600),'worker-type':([node,str(repo/'ai-worker/node_modules/typescript/bin/tsc'),'--noEmit','--pretty','false','--incremental','false','-p',str(repo/'ai-worker/tsconfig.json')],900),'owned-build':([node,str(here/'build-owned-worker.mjs')],1800)}
if label=='unit':
 count=len(json.loads((out/'collection.log').read_bytes()));assert count>0
 # 每项180秒test+保守180秒beforeEach；另600秒启动/报告、600秒清理余量。
 commands[label]=(vitest+['run','--config',str(here/'vitest.config.mts'),'--reporter=json','--outputFile='+str(out/'vitest-result.json')],count*360+1200)
cmd,budget=commands[label];log=out/(label+'.log');start=time.monotonic()
with log.open('wb')as f:v=subprocess.run(cmd,cwd=repo,env=env,stdout=f,stderr=subprocess.STDOUT,timeout=budget)
r={'label':label,'command':cmd,'cwd':str(repo),'budgetSeconds':budget,'exitCode':v.returncode,'elapsedSeconds':time.monotonic()-start,'log':str(log),'logSha256':hashlib.sha256(log.read_bytes()).hexdigest(),'supplierModels':0,'sharedDistWrites':0}
(out/(label+'-RESULT.json')).write_text(json.dumps(r,ensure_ascii=False,indent=2)+'\n');print(json.dumps(r,ensure_ascii=False));sys.exit(v.returncode)

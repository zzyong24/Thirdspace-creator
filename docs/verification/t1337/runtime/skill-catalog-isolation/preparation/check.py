from pathlib import Path
import ast,hashlib,json,os,subprocess,sys,time
here=Path(__file__).resolve().parent
repo=next(p for p in here.parents if (p/'frontend/package.json').is_file() and (p/'backend/package.json').is_file())
phase=Path('/Volumes/T7-MacData/CodexBuilds/t1337-skill-catalog-isolation-20261017-df9381d3/red-v1')
b=json.loads((phase/'WORKER_BINDING.json').read_bytes());node=b['nodePath'];label=sys.argv[1]
env=os.environ.copy();env.update(T1334_PHASE_ROOT=str(phase),T1334_CASES='collect,material,research',TMPDIR=str(phase/'check-tmp'),TMP=str(phase/'check-tmp'),TEMP=str(phase/'check-tmp'))
(phase/'check-tmp').mkdir(mode=0o700,exist_ok=True)
commands={
 'collection':([node,str(repo/'frontend/node_modules/vitest/vitest.mjs'),'list','--config',str(here/'vitest.config.mts')],600),
 'frontend-type':([node,str(repo/'frontend/node_modules/typescript/bin/tsc'),'--noEmit','--pretty','false','--incremental','false','-p',str(repo/'frontend/tsconfig.json')],900),
 'syntax-worker':([node,'--check',str(here/'worker-entry.fixture.cjs')],120),
 'syntax-cli':([node,'--check',str(here/'codex-cli.fixture.cjs')],120),
}
command,limit=commands[label];log=phase/(label+'.log');start=time.monotonic()
with log.open('wb') as f:v=subprocess.run(command,cwd=repo/'frontend',env=env,stdout=f,stderr=subprocess.STDOUT,timeout=limit)
r={'label':label,'command':command,'cwd':str(repo/'frontend'),'budgetSeconds':limit,'exitCode':v.returncode,'elapsedSeconds':time.monotonic()-start,'log':str(log),'logSha256':hashlib.sha256(log.read_bytes()).hexdigest(),'executedIts':0,'models':0,'rpcCalls':0}
(phase/(label+'-RESULT.json')).write_text(json.dumps(r,ensure_ascii=False,indent=2)+'\n');print(json.dumps(r,ensure_ascii=False));sys.exit(v.returncode)

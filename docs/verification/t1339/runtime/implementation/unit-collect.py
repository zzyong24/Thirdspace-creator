from pathlib import Path
import subprocess,os,time,json,hashlib,re,sys
here=Path(__file__).resolve().parent
repo=next(p for p in here.parents if(p/'backend/package.json').is_file()and(p/'frontend/package.json').is_file())
phase=Path('/Volumes/T7-MacData/CodexBuilds/t1339-missing-actual-20261017-42fe69d6/unit-v1');phase.mkdir(mode=0o700,exist_ok=True)
assert not(phase/'COLLECTION_RESULT.json').exists()
cmd=['/opt/homebrew/Cellar/node/25.9.0_2/bin/node',str(repo/'backend/node_modules/vitest/vitest.mjs'),'list','--config',str(here/'unit.config.mts')]
env=os.environ.copy();env.update(TMPDIR=str(phase),TMP=str(phase),TEMP=str(phase),NO_COLOR='1',FORCE_COLOR='0')
start=time.monotonic()
with(phase/'collection.log').open('wb')as out:r=subprocess.run(cmd,cwd=repo/'backend',env=env,stdout=out,stderr=subprocess.STDOUT,timeout=600)
text=re.sub(r'\x1b\[[0-9;]*m','',(phase/'collection.log').read_text());tests=[line for line in text.splitlines()if'.test.ts > 'in line]
result={'command':cmd,'cwd':str(repo/'backend'),'exitCode':r.returncode,'count':len(tests),'tests':tests,'elapsedSeconds':time.monotonic()-start,'budgetSeconds':600,'executedIts':0,'logSha256':hashlib.sha256((phase/'collection.log').read_bytes()).hexdigest(),'executionBudgetSeconds':len(tests)*540+600,'wrapperTotalSeconds':len(tests)*540+4800,'independentOuterWithCleanupReapSeconds':len(tests)*540+5520}
(phase/'COLLECTION_RESULT.json').write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n');print(json.dumps({k:v for k,v in result.items()if k!='tests'},ensure_ascii=False));sys.exit(r.returncode if tests else 1)
